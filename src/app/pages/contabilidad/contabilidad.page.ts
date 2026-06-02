import { Component, OnInit, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { FinancialService, Transaccion, ReportePagoSeguro } from '../../services/financial.service';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-contabilidad',
  templateUrl: './contabilidad.page.html',
  styleUrls: ['./contabilidad.page.scss'],
  standalone: false,
})
export class ContabilidadPage implements OnInit {

  transactions = signal<Transaccion[]>([]);
  resumenSeguros = signal<{ seguro: string; totalPendiente: number; totalFacturas: number }[]>([]);
  reportes = signal<ReportePagoSeguro[]>([]);
  currentProfile = signal<any>(null);

  navigationItems = computed(() => {
    const base: any[] = [
      { icon: 'home-outline', label: 'Inicio', route: '/main' },
      { icon: 'grid-outline', label: 'Panel', route: '/dashboard' },
      { icon: 'calendar-outline', label: 'Citas', route: '/citas' },
      { icon: 'people-outline', label: 'Pacientes', route: '/pacientes' }
    ];

    if (this.currentProfile()?.rol === 'doctor' || this.currentProfile()?.rol === 'admin') {
      base.push({ icon: 'medical-outline', label: 'Consulta', route: '/consulta' });
      base.push({ icon: 'wallet-outline', label: 'Contabilidad', active: true, route: '/contabilidad' });
      base.push({ icon: 'settings-outline', label: 'Ajustes', route: '/configuracion' });
    }

    return base;
  });

  startDate = signal<string>('');
  endDate = signal<string>('');


  // Modales
  showIngresoModal = false;
  showEgresoModal = false;

  // Formularios
  nuevoIngreso = {
    concepto: '',
    monto: 0,
    paciente: ''
  };

  nuevoEgreso = {
    concepto: '',
    monto: 0,
    categoria: 'Operativo' // Operativo, Suministros, Mantenimiento, Otros
  };

  categoriasEgreso = [
    'Operativo',
    'Suministros',
    'Mantenimiento',
    'Servicios',
    'Alquiler',
    'Salarios',
    'Otros'
  ];

  filteredTransactions = computed(() => {
    const start = this.startDate();
    const end = this.endDate();
    const data = this.transactions();

    if (!start && !end) return data;

    return data.filter(t => {
      const fecha = t.fecha; // Ya normalizadas a YYYY-MM-DD
      if (start && fecha < start) return false;
      if (end && fecha > end) return false;
      return true;
    });
  });

  filteredReportes = computed(() => {
    const start = this.startDate();
    const end = this.endDate();
    const data = this.reportes();

    if (!start && !end) return data;

    // Reportes tienen 'mes' (YYYY-MM) o 'fechaEnvio' (YYYY-MM-DD)
    // Usaremos fechaEnvio para el filtro de rango exacto
    return data.filter(r => {
      const fecha = r.fechaEnvio;
      if (start && fecha < start) return false;
      if (end && fecha > end) return false;
      return true;
    });
  });

  ingresosCopagos = computed(() =>
    this.filteredTransactions()
      .filter(t => t.categoria === 'Ingreso')
      .reduce((sum, t) => sum + t.monto, 0)
  );

  totalGastos = computed(() =>
    this.filteredTransactions()
      .filter(t => t.categoria === 'Gasto')
      .reduce((sum, t) => sum + t.monto, 0)
  );

  totalSegurosRecibido = computed(() =>
    this.filteredReportes().reduce((acc, r) => acc + (r.montoRecibido || 0), 0)
  );

  ingresosTotalesUnificados = computed(() =>
    this.ingresosCopagos() + this.totalSegurosRecibido()
  );

  balanceNeto = computed(() => this.ingresosTotalesUnificados() - this.totalGastos());

  totalSegurosPendiente = computed(() =>
    this.filteredReportes().reduce((acc, r) => acc + (r.montoEnviado - (r.montoRecibido || 0)), 0)
  );


  constructor(
    private financialService: FinancialService,
    private router: Router,
    private authService: AuthService,
    public themeService: ThemeService
  ) { }

  ngOnInit() {
    this.financialService.transactions$.subscribe(data => {
      this.transactions.set(data.slice().reverse()); // Mostrar más recientes primero
    });

    // Cargar resumen de seguros
    this.financialService.facturasSeguro$.subscribe(() => {
      this.resumenSeguros.set(this.financialService.getResumenSeguros());
    });

    this.financialService.reportesPagosSeguro$.subscribe(data => {
      this.reportes.set(data);
    });

    this.authService.profile$.subscribe(p => this.currentProfile.set(p));
  }

  verReporteSeguros() {
    this.router.navigate(['/contabilidad/seguros']);
  }

  // --- Modal Ingreso ---
  abrirModalIngreso() {
    this.nuevoIngreso = { concepto: '', monto: 0, paciente: '' };
    this.showIngresoModal = true;
  }

  cerrarModalIngreso() {
    this.showIngresoModal = false;
  }

  guardarIngreso() {
    if (this.nuevoIngreso.concepto && this.nuevoIngreso.monto > 0) {
      const transaccion: Transaccion = {
        id: Date.now(),
        fecha: new Date().toISOString().split('T')[0],
        concepto: this.nuevoIngreso.concepto,
        categoria: 'Ingreso',
        monto: this.nuevoIngreso.monto,
        paciente: this.nuevoIngreso.paciente || undefined
      };

      this.financialService.agregarTransaccion(transaccion);
      this.cerrarModalIngreso();
    }
  }

  // --- Modal Egreso ---
  abrirModalEgreso() {
    this.nuevoEgreso = { concepto: '', monto: 0, categoria: 'Operativo' };
    this.showEgresoModal = true;
  }

  cerrarModalEgreso() {
    this.showEgresoModal = false;
  }

  guardarEgreso() {
    if (this.nuevoEgreso.concepto && this.nuevoEgreso.monto > 0) {
      const transaccion: Transaccion = {
        id: Date.now(),
        fecha: new Date().toISOString().split('T')[0],
        concepto: `${this.nuevoEgreso.categoria}: ${this.nuevoEgreso.concepto}`,
        categoria: 'Gasto',
        monto: this.nuevoEgreso.monto
      };

      this.financialService.agregarTransaccion(transaccion);
      this.cerrarModalEgreso();
    }
  }

  limpiarFiltros() {
    this.startDate.set('');
    this.endDate.set('');
  }

  async logout() {

    await this.authService.signOut();
    this.router.navigate(['/auth/login']);
  }

  // --- Exportación PDF ---
  exportarPDF() {
    const doc = new jsPDF();
    const transactions = this.filteredTransactions();
    const start = this.startDate();
    const end = this.endDate();
    const fecha = new Date().toLocaleDateString();

    // Título
    doc.setFontSize(18);
    doc.setTextColor(40, 40, 40);
    doc.text('Reporte de Transacciones', 14, 22);

    // Subtítulo (Fechas de filtro)
    doc.setFontSize(12);
    doc.setTextColor(100);
    let subtitulo = 'Periodo: Todas las transacciones';
    if (start && end) {
      subtitulo = `Periodo: ${start} hasta ${end}`;
    } else if (start) {
      subtitulo = `Desde: ${start}`;
    } else if (end) {
      subtitulo = `Hasta: ${end}`;
    }
    doc.text(subtitulo, 14, 30);
    doc.text(`Generado: ${fecha}`, 14, 36);

    // Tabla
    const tableData = transactions.map(t => [
      t.fecha,
      t.concepto,
      t.categoria,
      `${t.categoria === 'Ingreso' ? '+' : '-'}${t.monto.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}`
    ]);

    autoTable(doc, {
      startY: 45,
      head: [['Fecha', 'Concepto', 'Categoría', 'Monto']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 10,
        cellPadding: 4
      }
    });

    // Guardar
    const fileName = `Transacciones_${fecha.replace(/\//g, '-')}.pdf`;
    doc.save(fileName);
  }

  // --- Exportación Excel ---
  exportarExcel() {
    const transactions = this.filteredTransactions();
    const start = this.startDate();
    const end = this.endDate();
    const fecha = new Date().toLocaleDateString();

    // Preparar datos para Excel
    const wsData = [
      ['REPORTE DE TRANSACCIONES'],
      [start && end ? `Periodo: ${start} - ${end}` : 'Periodo: Todos'],
      [`Generado: ${fecha}`],
      [],
      ['Fecha', 'Concepto', 'Categoría', 'Monto'],
      ...transactions.map(t => [
        t.fecha,
        t.concepto,
        t.categoria,
        t.monto
      ])
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Ajustar anchos de columna
    ws['!cols'] = [
      { wch: 15 }, // Fecha
      { wch: 40 }, // Concepto
      { wch: 15 }, // Categoría
      { wch: 15 }  // Monto
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Transacciones');

    const fileName = `Transacciones_${fecha.replace(/\//g, '-')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }
}


