import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { LoadingController, ModalController } from '@ionic/angular';
import { ErrorModalComponent } from '../components/error-modal/error-modal.component';

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
    private modalCtrl: ModalController,
    private route: ActivatedRoute
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit() {
    this.route.queryParams.subscribe(async params => {
      if (params['authWarning']) {
        const modal = await this.modalCtrl.create({
          component: ErrorModalComponent,
          componentProps: {
            title: 'Sesión Expirada',
            message: 'Su sesión ha expirado o no ha iniciado sesión. Por favor ingrese sus credenciales nuevamente.',
            type: 'warning'
          },
          cssClass: 'auto-height-modal',
          backdropDismiss: false
        });
        await modal.present();
      }
    });
  }

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
      let message = 'Correo o contraseña incorrectos. Por favor verifique sus datos.';
      
      // Intentar identificar si es un error de red o algo más, pero mantener el mensaje de credenciales genérico
      if (error.message && error.message.includes('network')) {
        message = 'Error de conexión. Por favor verifique su internet.';
      }

      const modal = await this.modalCtrl.create({
        component: ErrorModalComponent,
        componentProps: {
          title: 'Error de Acceso',
          message: message,
          type: 'error'
        },
        cssClass: 'auto-height-modal',
        backdropDismiss: false
      });
      await modal.present();
    } finally {
      loading.dismiss();
    }
  }
}
