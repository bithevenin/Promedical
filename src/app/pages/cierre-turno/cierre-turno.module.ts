import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CierreTurnoPageRoutingModule } from './cierre-turno-routing.module';

import { CierreTurnoPage } from './cierre-turno.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    CierreTurnoPageRoutingModule
  ],
  declarations: [CierreTurnoPage]
})
export class CierreTurnoPageModule {}
