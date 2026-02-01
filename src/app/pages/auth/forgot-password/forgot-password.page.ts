import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from 'src/app/services/auth.service';
import { ToastController } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
  standalone: false,
  encapsulation: ViewEncapsulation.None
})
export class ForgotPasswordPage implements OnInit {
  resetForm: FormGroup;
  isLoading = false;
  message = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private toastController: ToastController,
    private router: Router
  ) {
    this.resetForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  ngOnInit() { }

  async onReset() {
    if (this.resetForm.valid) {
      this.isLoading = true;
      this.message = '';
      const email = this.resetForm.value.email;

      try {
        await this.authService.resetPassword(email);
        this.message = 'Se ha enviado un enlace de recuperación a tu correo.';
        this.presentToast('Enlace enviado. Revisa tu correo.', 'success');
        
        // Opcional: Redirigir al login después de un tiempo
        setTimeout(() => {
          this.router.navigate(['/auth/login']);
        }, 5000);

      } catch (error: any) {
        console.error('Error reset password:', error);
        this.presentToast(error.message || 'Error al enviar enlace', 'danger');
      } finally {
        this.isLoading = false;
      }
    }
  }

  async presentToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}
