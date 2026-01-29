import { Component, OnInit } from '@angular/core';
import { CitasService, ConfiguracionDoctor } from '../../services/citas.service';

@Component({
  selector: 'app-main',
  templateUrl: './main.page.html',
  styleUrls: ['./main.page.scss'],
  standalone: false,
})
export class MainPage implements OnInit {
  config: ConfiguracionDoctor | null = null;

  constructor(private citasService: CitasService) { }

  ngOnInit() {
    this.citasService.config$.subscribe(config => {
      this.config = config;
    });
  }

}
