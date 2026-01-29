import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { Router } from '@angular/router';

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
export class DashboardPage {

  navigationItems = signal<NavItem[]>([
    { icon: 'home-outline', label: 'Inicio', route: '/main' },
    { icon: 'grid-outline', label: 'Panel', active: true, route: '/dashboard' },
    { icon: 'calendar-outline', label: 'Citas', route: '/citas' },
    { icon: 'people-outline', label: 'Pacientes', route: '/pacientes' },
    { icon: 'medical-outline', label: 'Consulta', route: '/consulta' },
    { icon: 'wallet-outline', label: 'Contabilidad', route: '/contabilidad' }
  ]);

  stats = signal<StatCard[]>([
    { title: 'Pacientes Totales', value: '1,284', trend: '+12%', isPositive: true, icon: 'people', colorClass: 'blue' },
    { title: 'Consultas Hoy', value: '42', trend: '+5%', isPositive: true, icon: 'medical', colorClass: 'indigo' },
    { title: 'Ingresos Mensuales', value: '$12,450', trend: '-2%', isPositive: false, icon: 'wallet', colorClass: 'green' },
    { title: 'Satisfacción', value: '98%', trend: '+18%', isPositive: true, icon: 'star', colorClass: 'orange' }
  ]);

  recentActivity = signal([
    { id: 1, user: 'Maria Garcia', action: 'Consulta General', time: '10:30 AM', avatar: 'https://i.pravatar.cc/150?u=1' },
    { id: 2, user: 'Juan Pérez', action: 'Laboratorio', time: '11:15 AM', avatar: 'https://i.pravatar.cc/150?u=2' },
    { id: 3, user: 'Roberto Diaz', action: 'Urgencias', time: '12:00 PM', avatar: 'https://i.pravatar.cc/150?u=3' }
  ]);

  constructor(private router: Router) { }

  navigateTo(route: string): void {
    this.router.navigate([route]);
  }
}