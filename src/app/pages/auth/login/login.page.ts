import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { LoadingController, ToastController } from '@ionic/angular';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false
})
export class LoginPage implements OnInit {
  loginForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  ngOnInit() {}

  async onLogin() {
    if (this.loginForm.invalid) return;

    const loading = await this.loadingCtrl.create({
      message: 'Iniciando sesión...',
      spinner: 'circles'
    });
    await loading.present();

    try {
      const { email, password } = this.loginForm.value;
      await this.authService.signIn(email, password);
      this.router.navigate(['/main']);
    } catch (error: any) {
      const toast = await this.toastCtrl.create({
        message: 'Error: ' + (error.message || 'Credenciales inválidas'),
        duration: 3000,
        color: 'danger',
        position: 'bottom'
      });
      toast.present();
    } finally {
      loading.dismiss();
    }
  }
}
