import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { SegurosArsPageRoutingModule } from './seguros-ars-routing.module';
import { SegurosArsPage } from './seguros-ars.page';

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        IonicModule,
        SegurosArsPageRoutingModule
    ],
    declarations: [SegurosArsPage]
})
export class SegurosArsPageModule { }
