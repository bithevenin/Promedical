import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';

import { LoginPage } from './login/login.page';
import { ForgotPasswordPage } from './forgot-password/forgot-password.page';

const routes: Routes = [
  {
    path: 'login',
    component: LoginPage
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    RouterModule.forChild(routes)
  ],
  declarations: [LoginPage, ForgotPasswordPage]
})
export class AuthModule { }
