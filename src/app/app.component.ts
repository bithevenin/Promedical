import { Component, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './services/supabase.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  constructor(
    private router: Router,
    private ngZone: NgZone,
    private supabaseService: SupabaseService
  ) {
    this.initializeApp();
  }

  initializeApp() {
    this.supabaseService.client.auth.onAuthStateChange((event: any, session: any) => {
      console.log('Auth Event:', event);
      
      if (event === 'PASSWORD_RECOVERY') {
        this.ngZone.run(() => {
          this.router.navigate(['/update-password']);
        });
      }
    });

    // Remove Splash Screen with a slight delay for better UX
    setTimeout(() => {
      const splash = document.getElementById('app-splash');
      if (splash) {
        splash.classList.add('splash-fade-out');
        setTimeout(() => {
          splash.remove();
        }, 600); // Wait for transition to finish
      }
    }, 2000); // Show splash for at least 2 seconds
  }
}
