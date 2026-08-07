import { Component, OnInit } from '@angular/core';
import { ConfigService, ConfiguracionDoctor } from '../../services/config.service';
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
    });
  }

}
