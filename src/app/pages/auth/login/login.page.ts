import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { ModalController } from '@ionic/angular';
import { ErrorModalComponent } from '../components/error-modal/error-modal.component';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false
})
export class LoginPage implements OnInit {
  loginForm: FormGroup;
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
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
        try {
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
        } catch {}
      }
    });
  }

  async onLogin() {
    if (this.loginForm.invalid || this.isLoading) return;

    this.isLoading = true;

    try {
      const { email, password } = this.loginForm.value;
      await this.authService.signIn(email, password);
      this.router.navigate(['/main']);
    } catch (error: any) {
      let message = error?.message || 'Correo o contraseña incorrectos. Por favor verifique sus datos.';
      
      try {
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
      } catch {
        alert(message);
      }
    } finally {
      this.isLoading = false;
    }
  }
}
