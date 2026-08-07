import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ContabilidadPageRoutingModule } from './contabilidad-routing.module';

import { ContabilidadPage } from './contabilidad.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ContabilidadPageRoutingModule
  ],
  declarations: [ContabilidadPage]
})
export class ContabilidadPageModule {}
