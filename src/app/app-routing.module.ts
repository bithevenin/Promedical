import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { RoleGuard } from './guards/role.guard';
import { AutoLoginGuard } from './guards/auto-login.guard';

const routes: Routes = [
  {
    path: 'update-password',
    loadChildren: () => import('./pages/update-password/update-password.module').then(m => m.UpdatePasswordPageModule)
  },
  {
    path: 'auth',
    loadChildren: () => import('./pages/auth/auth.module').then(m => m.AuthModule),
    canActivate: [AutoLoginGuard]
  },
  {
    path: 'main',
    loadChildren: () => import('./pages/main/main.module').then(m => m.MainPageModule),
    canActivate: [AuthGuard]
  },
  {
    path: 'dashboard',
    loadChildren: () => import('./pages/dashboard/dashboard.module').then(m => m.DashboardPageModule),
    canActivate: [AuthGuard]
  },
  {
    path: 'citas',
    loadChildren: () => import('./pages/citas/citas.module').then(m => m.CitasPageModule),
    canActivate: [AuthGuard]
  },
  {
    path: 'consulta',
    loadChildren: () => import('./pages/consulta/consulta.module').then(m => m.ConsultaPageModule),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['doctor', 'admin'] }
  },
  {
    path: 'pacientes',
    loadChildren: () => import('./pages/pacientes/pacientes.module').then(m => m.PacientesPageModule),
    canActivate: [AuthGuard]
  },
  {
    path: 'contabilidad',
    loadChildren: () => import('./pages/contabilidad/contabilidad.module').then(m => m.ContabilidadPageModule),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['doctor', 'admin'] }
  },
  {
    path: 'configuracion',
    loadChildren: () => import('./pages/configuracion/configuracion.module').then(m => m.ConfiguracionPageModule),
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['doctor', 'admin'] }
  },
  {
    path: '',
    redirectTo: 'auth/login',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: 'auth/login'
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      preloadingStrategy: PreloadAllModules
    })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
