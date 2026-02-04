import { Component, OnInit, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CitasService, Transaccion, ReportePagoSeguro } from '../../services/citas.service';
import { AuthService } from '../../services/auth.service';

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
    private citasService: CitasService,
    private router: Router,
    private authService: AuthService
  ) { }

  ngOnInit() {
    this.citasService.transactions$.subscribe(data => {
      this.transactions.set(data.slice().reverse()); // Mostrar más recientes primero
    });

    // Cargar resumen de seguros
    this.citasService.facturasSeguro$.subscribe(() => {
      this.resumenSeguros.set(this.citasService.getResumenSeguros());
    });

    this.citasService.reportesPagosSeguro$.subscribe(data => {
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

      this.citasService.agregarTransaccion(transaccion);
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

      this.citasService.agregarTransaccion(transaccion);
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
}


