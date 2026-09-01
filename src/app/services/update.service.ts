import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { NotificationService } from './notification.service';

export interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  releaseDate?: string;
  releaseNotes?: string;
  percent?: number;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UpdateService {
  private updateStatusSubject = new BehaviorSubject<UpdateStatus>({
    status: 'idle',
    message: 'Listo'
  });
  updateStatus$ = this.updateStatusSubject.asObservable();

  appVersion = '1.0.0';

  constructor(
    private ngZone: NgZone,
    private notificationService: NotificationService
  ) {
    this.init();
  }

  private async init() {
    if (typeof window !== 'undefined') {
      const electronApi = (window as any).electronAPI;
      if (electronApi) {
        try {
          if (electronApi.getAppVersion) {
            this.appVersion = await electronApi.getAppVersion();
          }

          electronApi.onUpdateStatus((status: UpdateStatus) => {
            this.ngZone.run(() => {
              this.updateStatusSubject.next(status);

              if (status.status === 'available') {
                this.notificationService.showInfo(
                  'Actualización Disponible',
                  `Versión v${status.version} disponible en el repositorio. Haz clic en actualizar para descargar.`
                );
              } else if (status.status === 'downloaded') {
                this.notificationService.showSuccess(
                  'Actualización Lista',
                  `La versión v${status.version} se ha descargado con éxito. Reinicia el sistema para aplicar.`
                );
              } else if (status.status === 'not-available') {
                this.notificationService.showSuccess(
                  'Sistema al Día',
                  'Estás ejecutando la versión más reciente del sistema.'
                );
              } else if (status.status === 'error') {
                this.notificationService.showError(
                  'Comprobación de Versión',
                  status.message || 'No se pudo conectar con el servidor de versiones.'
                );
              }
            });
          });
        } catch (e) {
          console.warn('[UpdateService] Init error:', e);
        }
      }
    }
  }

  async checkForUpdates(): Promise<void> {
    if (typeof window !== 'undefined') {
      const electronApi = (window as any).electronAPI;
      if (electronApi?.checkForUpdates) {
        this.updateStatusSubject.next({
          status: 'checking',
          message: 'Buscando nuevas versiones en el repositorio...'
        });
        try {
          const res = await electronApi.checkForUpdates();
          if (!res.success) {
            this.updateStatusSubject.next({
              status: 'error',
              message: res.error || 'Error al buscar actualizaciones'
            });
          }
        } catch (e: any) {
          this.updateStatusSubject.next({
            status: 'error',
            message: e.message || 'Error de conexión'
          });
        }
      } else {
        this.notificationService.showInfo('Modo Web', 'Las actualizaciones automáticas están disponibles en la versión de escritorio.');
      }
    }
  }

  async forceUpdate(): Promise<void> {
    this.checkForUpdates();
    // Suscribirse temporalmente al estado hasta que deje de ser 'checking'
    const sub = this.updateStatus$.subscribe((statusObj) => {
      if (statusObj.status === 'available') {
        sub.unsubscribe();
        this.downloadUpdate();
      } else if (statusObj.status === 'downloaded') {
        sub.unsubscribe();
        this.installUpdate();
      } else if (statusObj.status === 'not-available' || statusObj.status === 'error') {
        sub.unsubscribe();
      }
    });
  }

  async downloadUpdate(): Promise<void> {
    if (typeof window !== 'undefined') {
      const electronApi = (window as any).electronAPI;
      if (electronApi?.downloadUpdate) {
        this.updateStatusSubject.next({
          status: 'downloading',
          percent: 0,
          message: 'Iniciando descarga de actualización...'
        });
        await electronApi.downloadUpdate();
      }
    }
  }

  installUpdate(): void {
    if (typeof window !== 'undefined') {
      const electronApi = (window as any).electronAPI;
      if (electronApi?.installUpdate) {
        electronApi.installUpdate();
      }
    }
  }
}
