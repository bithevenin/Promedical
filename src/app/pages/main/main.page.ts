import { Component, OnInit, signal, computed } from '@angular/core';
import { ConfigService } from '../../services/config.service';
import { ConfiguracionDoctor, UserProfile } from '../../models';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-main',
  templateUrl: './main.page.html',
  styleUrls: ['./main.page.scss'],
  standalone: false,
})
export class MainPage implements OnInit {
  config: ConfiguracionDoctor | null = null;
  profile: any = null;
  currentProfile = signal<UserProfile | null>(null);

  navigationItems = computed(() => {
    const base: { icon: string; label: string; route: string; active?: boolean }[] = [];
    return base;
  });

  constructor(
      private configService: ConfigService,
      private authService: AuthService,
      public themeService: ThemeService
  ) { }

  ngOnInit() {
    this.configService.config$.subscribe(config => {
      this.config = config;
    });
    
    this.authService.profile$.subscribe(p => {
      this.profile = p;
      this.currentProfile.set(p as UserProfile);
    });
  }

}
