import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-error-modal',
  templateUrl: './error-modal.component.html',
  styleUrls: ['./error-modal.component.scss'],
  standalone: false
})
export class ErrorModalComponent implements OnInit {
  @Input() title: string = 'Error';
  @Input() message: string = 'Ha ocurrido un error inesperado.';
  @Input() type: 'error' | 'warning' | 'success' = 'error';

  constructor(private modalCtrl: ModalController) { }

  ngOnInit() {}

  dismiss() {
    this.modalCtrl.dismiss();
  }
}
