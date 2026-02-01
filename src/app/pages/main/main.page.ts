import { Component, OnInit } from '@angular/core';
import { CitasService, ConfiguracionDoctor } from '../../services/citas.service';
import { AuthService } from '../../services/auth.service';

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
      private citasService: CitasService,
      private authService: AuthService
  ) { }

  ngOnInit() {
    this.citasService.config$.subscribe(config => {
      this.config = config;
    });
    
    this.authService.profile$.subscribe(p => {
        this.profile = p;
    });
  }

}
