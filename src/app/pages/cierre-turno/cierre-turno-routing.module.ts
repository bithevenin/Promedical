import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { CierreTurnoPage } from './cierre-turno.page';

const routes: Routes = [
  {
    path: '',
    component: CierreTurnoPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class CierreTurnoPageRoutingModule {}
