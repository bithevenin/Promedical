import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { OfflineService } from '../../services/offline.service';

@Component({
  selector: 'app-main-layout',
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss']
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  userName = 'Dr. Garcia';

  /** Estado de la conexión con Supabase (para el indicador persistente) */
  supabaseOnline = true;

  /** Controla la visibilidad del modal de advertencia offline */
  showOfflineModal = false;
  offlineEntityName = '';

  private subs = new Subscription();

  constructor(private offlineService: OfflineService) {}

  ngOnInit() {
    // Indicador persistente: actualiza el punto verde/rojo en el header
    this.subs.add(
      this.offlineService.supabaseReachable$.subscribe(reachable => {
        this.supabaseOnline = reachable;
      })
    );

    // Modal de advertencia: se abre cuando se guarda algo en la cola offline
    this.subs.add(
      this.offlineService.offlineSave$.subscribe(entityName => {
        this.offlineEntityName = entityName;
        this.showOfflineModal = true;
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  cerrarModalOffline() {
    this.showOfflineModal = false;
  }
}
