import { Component, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  private supabase: SupabaseClient;

  constructor(
    private router: Router,
    private ngZone: NgZone
  ) {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    this.initializeApp();
  }

  initializeApp() {
    this.supabase.auth.onAuthStateChange((event, session) => {
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
