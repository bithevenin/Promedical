import { Component, OnInit, signal, computed } from '@angular/core';
import { ThemeService } from '../../services/theme.service';
import { AuthService } from '../../services/auth.service';
import { FinancialService } from '../../services/financial.service';
import { AppointmentService } from '../../services/appointment.service';
import { ConfigService } from '../../services/config.service';
import { EmailService } from '../../services/email.service';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import * as jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { getLocalDateString } from '../../utils/format.utils';
import { Transaccion, Cita, FacturaSeguro } from '../../models';

@Component({
  selector: 'app-cierre-turno',
  templateUrl: './cierre-turno.page.html',
  styleUrls: ['./cierre-turno.page.scss'],
  standalone: false,
})
export class CierreTurnoPage implements OnInit {
  currentProfile = signal<any>(null);
  fechaReporte = signal<string>(getLocalDateString());
  
  allTransactions = signal<Transaccion[]>([]);
  allCitas = signal<Cita[]>([]);
  allFacturas = signal<FacturaSeguro[]>([]);

  transacciones = computed(() => {
    const selectedDate = this.fechaReporte();
    return this.allTransactions()
      .filter(t => t.fecha === selectedDate)
      .map(t => ({
        id: t.id,
        fecha: t.fecha,
        concepto: t.concepto,
        paciente: t.paciente,
        tipo: t.categoria === 'Ingreso' ? 'ingreso' : 'gasto',
        monto: t.monto
      }));
  });

  totalIngresos = computed(() => this.transacciones().filter(t => t.tipo === 'ingreso').reduce((acc, t) => acc + t.monto, 0));
  totalGastos = computed(() => this.transacciones().filter(t => t.tipo === 'gasto').reduce((acc, t) => acc + t.monto, 0));
  balanceNeto = computed(() => this.totalIngresos() - this.totalGastos());

  navigationItems = computed(() => {
    const base: { icon: string; label: string; route: string; active?: boolean }[] = [
      { icon: 'home-outline', label: 'Inicio', route: '/main' },
      { icon: 'grid-outline', label: 'Panel', route: '/dashboard' },
      { icon: 'calendar-outline', label: 'Citas', route: '/citas' }
    ];

    if (this.currentProfile()?.rol === 'doctor' || this.currentProfile()?.rol === 'admin') {
      base.push({ icon: 'people-outline', label: 'Pacientes', route: '/pacientes' });
      base.push({ icon: 'medical-outline', label: 'Consulta', route: '/consulta' });
      base.push({ icon: 'wallet-outline', label: 'Contabilidad', route: '/contabilidad' });
      base.push({ icon: 'settings-outline', label: 'Ajustes', route: '/configuracion' });
    }

    if (this.currentProfile()?.rol === 'secretaria' || this.currentProfile()?.rol === 'admin' || this.currentProfile()?.rol === 'doctor') {
      base.push({ icon: 'lock-closed-outline', label: 'Turno', active: true, route: '/cierre-turno' });
    }

    return base;
  });

  constructor(
    public themeService: ThemeService,
    private authService: AuthService,
    private financialService: FinancialService,
    private appointmentService: AppointmentService,
    private configService: ConfigService,
    private emailService: EmailService,
    private toastCtrl: ToastController,
    private router: Router
  ) {}

  ngOnInit() {
    this.authService.profile$.subscribe(p => this.currentProfile.set(p));
    this.financialService.transactions$.subscribe(data => this.allTransactions.set(data));
    this.appointmentService.appointments$.subscribe(data => this.allCitas.set(data));
    this.financialService.facturasSeguro$.subscribe(data => this.allFacturas.set(data));
  }

  // Se ejecuta CADA VEZ que se entra a la página (no solo la primera vez)
  ionViewWillEnter() {
    this.financialService.refreshTransactions();
    this.financialService.refreshFacturasSeguro();
  }

  formatMonto(monto: number): string {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP'
    }).format(monto);
  }

  async cerrarTurno() {
    // Generar datos para el reporte
    const selectedDate = this.fechaReporte();
    const config = this.configService.getConfig();
    const adminEmail = config.email || this.currentProfile()?.email || 'admin@promedical.com';

    const citasHoy = this.allCitas().filter(c => c.fecha === selectedDate);
    const facturasHoy = this.allFacturas().filter(f => f.fecha === selectedDate);
    
    let totalPacientes = citasHoy.length; // o contar transacciones de ingreso
    let deudaAseguradoras = 0;
    
    const resumenSeguros: { [key: string]: { cantidad: number; monto: number } } = {};
    
    facturasHoy.forEach(f => {
      deudaAseguradoras += f.monto;
      if (!resumenSeguros[f.seguro]) {
        resumenSeguros[f.seguro] = { cantidad: 0, monto: 0 };
      }
      resumenSeguros[f.seguro].cantidad++;
      resumenSeguros[f.seguro].monto += f.monto;
    });

    const detalleSeguros = Object.keys(resumenSeguros).map(key => ({
      seguro: key,
      cantidad: resumenSeguros[key].cantidad,
      monto: resumenSeguros[key].monto
    }));

    const segurosUsados = facturasHoy.length;

    // Enviar el correo
    this.emailService.sendCierreTurnoReport({
      toEmail: adminEmail,
      fecha: selectedDate,
      totalIngresos: this.totalIngresos(),
      totalGastos: this.totalGastos(),
      balanceNeto: this.balanceNeto(),
      totalPacientes: totalPacientes,
      segurosUsados: segurosUsados,
      deudaAseguradoras: deudaAseguradoras,
      detalleSeguros: detalleSeguros
    }).subscribe();

    // Exportar pdf también localmente
    this.exportarPDF();
    
    const toast = await this.toastCtrl.create({
      message: 'Cierre de turno enviado al correo del administrador y PDF descargado.',
      duration: 3500,
      position: 'top',
      color: 'success',
      icon: 'mail-outline'
    });
    await toast.present();
  }

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/auth/login'], { replaceUrl: true });
  }

  exportarPDF() {
    const doc = new jsPDF.jsPDF();
    doc.text('Reporte de Cierre de Turno', 14, 15);
    doc.setFontSize(10);
    doc.text(`Fecha: ${this.fechaReporte()}`, 14, 22);
    doc.text(`Balance Neto: ${this.formatMonto(this.balanceNeto())}`, 14, 28);
    
    const tableData = this.transacciones().map(t => [
      t.fecha, 
      t.concepto, 
      t.paciente || 'N/A', 
      t.tipo.toUpperCase(),
      this.formatMonto(t.monto)
    ]);
    
    autoTable(doc, {
      head: [['Fecha', 'Concepto', 'Paciente', 'Tipo', 'Monto']],
      body: tableData,
      startY: 35,
    });
    
    doc.save(`cierre_turno_${this.fechaReporte()}.pdf`);
  }

  exportarExcel() {
    const dataToExport = this.transacciones().map(t => ({
      Fecha: t.fecha,
      Concepto: t.concepto,
      Paciente: t.paciente || 'N/A',
      Tipo: t.tipo.toUpperCase(),
      Monto: t.monto
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cierre Turno");
    
    XLSX.writeFile(wb, `cierre_turno_${this.fechaReporte()}.xlsx`);
  }
}
