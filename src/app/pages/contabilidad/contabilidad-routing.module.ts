import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ContabilidadPage } from './contabilidad.page';

const routes: Routes = [
  {
    path: '',
    component: ContabilidadPage
  },
  {
    path: 'seguros',
    loadChildren: () => import('./seguros-ars/seguros-ars.module').then(m => m.SegurosArsPageModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ContabilidadPageRoutingModule { }

