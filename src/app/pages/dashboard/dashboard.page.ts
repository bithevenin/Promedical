import { Component, ChangeDetectionStrategy, signal, OnInit, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CitasService, Cita } from '../../services/citas.service';
import { AuthService } from '../../services/auth.service';

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

  navigationItems = signal<NavItem[]>([
    { icon: 'home-outline', label: 'Inicio', route: '/main' },
    { icon: 'grid-outline', label: 'Panel', active: true, route: '/dashboard' },
    { icon: 'calendar-outline', label: 'Citas', route: '/citas' },
    { icon: 'people-outline', label: 'Pacientes', route: '/pacientes' },
    { icon: 'medical-outline', label: 'Consulta', route: '/consulta' },
    { icon: 'wallet-outline', label: 'Contabilidad', route: '/contabilidad' }
  ]);

  allCitas = signal<Cita[]>([]);
  allPatients = signal<any[]>([]);
  allTransactions = signal<any[]>([]);
  currentProfile = signal<any>(null);

  stats = computed<StatCard[]>(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localDate = new Date(now.getTime() - (offset * 60 * 1000));
    const today = localDate.toISOString().split('T')[0];

    const citasHoy = this.allCitas().filter(c => c.fecha === today).length;
    const pacientesTotales = this.allPatients().length;

    const mesActual = new Date().getMonth();
    const añoActual = new Date().getFullYear();
    const ingresosMes = this.allTransactions()
      .filter(t => {
        // Manejar formato YYYY-MM-DD de Supabase o DD/MM/YYYY antiguo
        let m, y;
        if (t.fecha.includes('-')) {
          [y, m] = t.fecha.split('-');
        } else {
          [, m, y] = t.fecha.split('/');
        }
        return t.categoria === 'Ingreso' && (Number(m) - 1) === mesActual && Number(y) === añoActual;
      })
      .reduce((sum, t) => sum + t.monto, 0);

    const citasEsperaHoy = this.allCitas().filter(c => c.estado === 'espera' && c.fecha === today).length;

    return [
      { title: 'Pacientes Totales', value: pacientesTotales.toString(), trend: '+3%', isPositive: true, icon: 'people', colorClass: 'blue' },
      { title: 'Consultas Hoy', value: citasHoy.toString(), trend: '+5%', isPositive: true, icon: 'medical', colorClass: 'indigo' },
      { title: 'Ingresos Mensuales', value: `$${ingresosMes.toLocaleString()}`, trend: '+12%', isPositive: true, icon: 'wallet', colorClass: 'green' },
      { title: 'Citas en Espera', value: citasEsperaHoy.toString(), trend: '0%', isPositive: true, icon: 'time', colorClass: 'orange' }
    ];
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
    private citasService: CitasService,
    private authService: AuthService
  ) { }

  ngOnInit() {
    this.citasService.appointments$.subscribe(data => this.allCitas.set(data));
    this.citasService.patients$.subscribe(data => this.allPatients.set(data));
    this.citasService.transactions$.subscribe(data => this.allTransactions.set(data));
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