import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { SegurosArsPage } from './seguros-ars.page';

const routes: Routes = [
    {
        path: '',
        component: SegurosArsPage
    }
];

@NgModule({
    imports: [RouterModule.forChild(routes)],
    exports: [RouterModule],
})
export class SegurosArsPageRoutingModule { }
