import { Component, ChangeDetectionStrategy, signal, OnInit, computed } from '@angular/core';
import { Router } from '@angular/router';
import { AppointmentService } from '../../services/appointment.service';
import { PatientService } from '../../services/patient.service';
import { FinancialService } from '../../services/financial.service';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { formatMonto, getLocalDateString } from '../../utils/format.utils';
import { Paciente, Transaccion, UserProfile, Cita } from '../../models';

interface NavItem {
  icon: string;
  label: string;
  active?: boolean;
  route?: string;
}

interface StatCard {
  title: string;
  value: string;
  trend: string;
  isPositive: boolean;
  icon: string;
  colorClass: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardPage implements OnInit {

  navigationItems = computed<NavItem[]>(() => {
    const base = [
      { icon: 'home-outline', label: 'Inicio', route: '/main' },
      { icon: 'grid-outline', label: 'Panel', active: true, route: '/dashboard' },
      { icon: 'calendar-outline', label: 'Citas', route: '/citas' },
      { icon: 'people-outline', label: 'Pacientes', route: '/pacientes' }
    ];

    if (this.currentProfile()?.rol === 'doctor' || this.currentProfile()?.rol === 'admin') {
      base.push({ icon: 'medical-outline', label: 'Consulta', route: '/consulta' });
      base.push({ icon: 'wallet-outline', label: 'Contabilidad', route: '/contabilidad' });
      base.push({ icon: 'settings-outline', label: 'Ajustes', route: '/configuracion' });
    }

    if (this.currentProfile()?.rol === 'secretaria' || this.currentProfile()?.rol === 'admin' || this.currentProfile()?.rol === 'doctor') {      base.push({ icon: 'lock-closed-outline', label: 'Turno', route: '/cierre-turno' });    }    return base;
  });

  allCitas = signal<Cita[]>([]);
  allPatients = signal<Paciente[]>([]);
  allTransactions = signal<Transaccion[]>([]);
  currentProfile = signal<UserProfile | null>(null);

  selectedDate = signal<string>(getLocalDateString());

  stats = computed<StatCard[]>(() => {
    const selectedDateStr = this.selectedDate();
    
    // Parse selected date carefully to avoid timezone shifts
    let selectedDateObj: Date;
    if (selectedDateStr.includes('-')) {
      const [y, m, d] = selectedDateStr.split('-');
      selectedDateObj = new Date(Number(y), Number(m) - 1, Number(d));
    } else {
      selectedDateObj = new Date(selectedDateStr);
    }
    
    const today = getLocalDateString();

    const citasHoy = this.allCitas().filter(c => c.fecha === today).length;
    const pacientesTotales = this.allPatients().length;

    const mesActual = new Date().getMonth();
    const añoActual = new Date().getFullYear();
    
    // Pagos diarios (ingresos) del dia seleccionado
    const ingresosDia = this.allTransactions()
      .filter(t => {
        let dateObj: Date;
        if (t.fecha.includes('-')) {
          const [y, m, d] = t.fecha.split('-');
          dateObj = new Date(Number(y), Number(m) - 1, Number(d));
        } else if (t.fecha.includes('/')) {
          const parts = t.fecha.split('/');
          if (parts[0].length === 4) {
            dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          } else {
            const p0 = Number(parts[0]);
            const p1 = Number(parts[1]);
            const p2 = Number(parts[2]);
            if (p0 > 12) {
              dateObj = new Date(p2, p1 - 1, p0);
            } else if (p1 > 12) {
              dateObj = new Date(p2, p0 - 1, p1);
            } else {
              dateObj = new Date(p2, p1 - 1, p0);
            }
          }
        } else {
          dateObj = new Date(t.fecha);
        }
        return t.categoria === 'Ingreso' && 
               !isNaN(dateObj.getTime()) && 
               dateObj.getDate() === selectedDateObj.getDate() &&
               dateObj.getMonth() === selectedDateObj.getMonth() && 
               dateObj.getFullYear() === selectedDateObj.getFullYear();
      })
      .reduce((sum, t) => sum + t.monto, 0);

    const ingresosMes = this.allTransactions()
      .filter(t => {
        let dateObj: Date;
        if (t.fecha.includes('-')) {
          const [y, m, d] = t.fecha.split('-');
          dateObj = new Date(Number(y), Number(m) - 1, Number(d));
        } else if (t.fecha.includes('/')) {
          const parts = t.fecha.split('/');
          if (parts[0].length === 4) {
            dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          } else {
            const p0 = Number(parts[0]);
            const p1 = Number(parts[1]);
            const p2 = Number(parts[2]);
            if (p0 > 12) {
              dateObj = new Date(p2, p1 - 1, p0);
            } else if (p1 > 12) {
              dateObj = new Date(p2, p0 - 1, p1);
            } else {
              dateObj = new Date(p2, p1 - 1, p0);
            }
          }
        } else {
          dateObj = new Date(t.fecha);
        }
        return t.categoria === 'Ingreso' && 
               !isNaN(dateObj.getTime()) && 
               dateObj.getMonth() === mesActual && 
               dateObj.getFullYear() === añoActual;
      })
      .reduce((sum, t) => sum + t.monto, 0);

    const citasEsperaHoy = this.allCitas().filter(c => c.estado === 'espera' && c.fecha === today).length;

    const carts: StatCard[] = [
      { title: 'Pacientes Totales', value: pacientesTotales.toString(), trend: '+3%', isPositive: true, icon: 'people', colorClass: 'blue' },
      { title: 'Consultas Hoy', value: citasHoy.toString(), trend: '+5%', isPositive: true, icon: 'medical', colorClass: 'indigo' }
    ];

    if (this.currentProfile()?.rol === 'doctor' || this.currentProfile()?.rol === 'admin') {
      carts.push({ title: 'Ingresos Mensuales', value: formatMonto(ingresosMes), trend: '+12%', isPositive: true, icon: 'wallet', colorClass: 'green' });
      carts.push({ title: 'Ingresos Diarios', value: formatMonto(ingresosDia), trend: 'Hoy', isPositive: true, icon: 'cash', colorClass: 'emerald' });
    } else {
      carts.push({ title: 'Consultas Pendientes', value: citasEsperaHoy.toString(), trend: '0%', isPositive: true, icon: 'calendar', colorClass: 'green' });
    }

    carts.push({ title: 'Citas en Espera', value: citasEsperaHoy.toString(), trend: '0%', isPositive: true, icon: 'time', colorClass: 'orange' });

    return carts;
  });

  recentActivity = computed(() => {
    return this.allCitas()
      .filter(c => c.estado === 'espera')
      .slice(0, 5)
      .map(c => ({
        id: c.turno,
        user: c.nombre,
        sexo: c.sexo,
        action: c.seguro,
        time: c.hora,
        avatar: `https://i.pravatar.cc/150?u=${c.cedula}`
      }));
  });

  constructor(
    private router: Router,
    private appointmentService: AppointmentService,
    private patientService: PatientService,
    private financialService: FinancialService,
    private authService: AuthService,
    public themeService: ThemeService
  ) { }

  ngOnInit() {
    this.appointmentService.appointments$.subscribe(data => this.allCitas.set(data));
    this.patientService.patients$.subscribe(data => this.allPatients.set(data));
    this.financialService.transactions$.subscribe(data => this.allTransactions.set(data));
    this.authService.profile$.subscribe(p => this.currentProfile.set(p));
  }

  navigateTo(route: string) {
    this.router.navigate([route]);
  }

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/auth/login']);
  }
}