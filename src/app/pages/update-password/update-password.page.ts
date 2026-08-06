import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { ToastController, LoadingController } from '@ionic/angular';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from 'src/app/services/supabase.service';

@Component({
  selector: 'app-update-password',
  templateUrl: './update-password.page.html',
  styleUrls: ['./update-password.page.scss'],
  standalone: false
})
export class UpdatePasswordPage implements OnInit {
  updatePasswordForm: FormGroup;
  isLoading = false;
  message = '';
  msgType: 'success' | 'error' = 'success';
  private supabase: SupabaseClient;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private toastController: ToastController,
    private supabaseService: SupabaseService
  ) {
    this.supabase = this.supabaseService.client;

    this.updatePasswordForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.checkPasswords });
  }

  checkPasswords(group: FormGroup) {
    const pass = group.get('password')?.value;
    const confirmPass = group.get('confirmPassword')?.value;
    return pass === confirmPass ? null : { mismatch: true };
  }

  async ngOnInit() {
    // Verificar si hay sesión activa (usuario logueado por el magic link de recuperación)
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) {
      // Si no hay sesión, verificamos si hay hash en la URL que indique recuperación
      // Si no, no deberían estar aquí, a menos que Supabase aún no haya procesado el hash (Angular carga rápido).
      // Damos un pequeño margen o simplemente esperamos.
      
      // En muchos casos, al redirigir, Supabase Auth Listener en AppComponent/AuthService ya ha capturado la sesión.
      // Si llegamos aquí sin sesión, puede ser acceso directo invalido.
        console.warn('No active session found on update-password init');
    }
  }

  async onUpdatePassword() {
    if (this.updatePasswordForm.valid) {
      this.isLoading = true;
      this.message = '';
      const newPassword = this.updatePasswordForm.get('password')?.value;

      try {
        const { data, error } = await this.supabase.auth.updateUser({
          password: newPassword
        });

        if (error) throw error;

        this.msgType = 'success';
        this.message = '¡Contraseña actualizada correctamente!';
        this.presentToast('Contraseña actualizada', 'success');

        // Redirigir al dashboard o login
        setTimeout(() => {
          this.router.navigate(['/main']);
        }, 2000);

      } catch (error) {
        console.error('Error updating password:', error);
        this.msgType = 'error';
        const errMsg = error instanceof Error ? error.message : String(error);
        this.message = errMsg || 'Error al actualizar contraseña';
        this.presentToast(this.message, 'danger');
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
