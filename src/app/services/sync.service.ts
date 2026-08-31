import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { SupabaseService } from './supabase.service';
import { OfflineService } from './offline.service';
import { NotificationService } from './notification.service';
import { PatientService } from './patient.service';
import { AppointmentService } from './appointment.service';
import { ConsultationService } from './consultation.service';
import { FinancialService } from './financial.service';
import { ConfigService } from './config.service';

export interface SyncProgress {
  isSyncing: boolean;
  type: 'download' | 'upload' | 'bidirectional' | 'idle';
  statusText: string;
  progress: number; // 0 - 100
  lastSyncTime: string | null;
  error: string | null;
  stats?: {
    pacientes: number;
    consultas: number;
    citas: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class SyncService {
  private cloudSupabase: SupabaseClient;
  private syncState = new BehaviorSubject<SyncProgress>({
    isSyncing: false,
    type: 'idle',
    statusText: '',
    progress: 0,
    lastSyncTime: localStorage.getItem('promedical_last_cloud_sync'),
    error: null
  });

  syncState$ = this.syncState.asObservable();

  private tablesConfig: Array<{ name: string; conflictKey: string; label: string }> = [
    { name: 'configuracion_doctor', conflictKey: 'id', label: 'Configuración del Doctor' },
    { name: 'tarifas_seguro', conflictKey: 'seguro', label: 'Tarifas de Seguros' },
    { name: 'usuarios', conflictKey: 'id', label: 'Usuarios y Perfiles' },
    { name: 'pacientes', conflictKey: 'cedula', label: 'Pacientes y Expedientes' },
    { name: 'consultas', conflictKey: 'id', label: 'Consultas e Historial Clínico' },
    { name: 'citas', conflictKey: 'id', label: 'Citas y Turnos' },
    { name: 'signos_vitales', conflictKey: 'id', label: 'Signos Vitales' },
    { name: 'transacciones', conflictKey: 'id', label: 'Transacciones y Cobros' },
    { name: 'facturas_seguro', conflictKey: 'id', label: 'Facturas de Seguro' },
    { name: 'reportes_pagos_seguro', conflictKey: 'id', label: 'Reportes de Pago' }
  ];

  constructor(
    private supabaseService: SupabaseService,
    private offlineService: OfflineService,
    private notificationService: NotificationService,
    private patientService: PatientService,
    private appointmentService: AppointmentService,
    private consultationService: ConsultationService,
    private financialService: FinancialService,
    private configService: ConfigService
  ) {
    this.cloudSupabase = createClient(
      environment.supabaseUrl,
      environment.supabaseKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );
  }

  get currentSyncState(): SyncProgress {
    return this.syncState.value;
  }

  /**
   * 📥 DESCARGAR TODOS LOS DATOS DE LA NUBE A LOCAL (Servidor SQLite)
   * Descarga la totalidad de las tablas de Supabase en una sola operación por lotes.
   */
  async downloadAllFromCloud(): Promise<boolean> {
    if (this.syncState.value.isSyncing) return false;

    if (!navigator.onLine) {
      this.notificationService.showError('Sin Conexión a Internet', 'Se requiere acceso a internet para descargar los datos de Supabase.');
      return false;
    }

    this.updateState({
      isSyncing: true,
      type: 'download',
      statusText: 'Conectando con Supabase para descargar base de datos completa...',
      progress: 2,
      error: null
    });

    const localClient = this.supabaseService.client;
    let totalDownloaded = 0;
    const countStats = { pacientes: 0, consultas: 0, citas: 0 };

    try {
      const stepWeight = 95 / this.tablesConfig.length;

      for (let tIdx = 0; tIdx < this.tablesConfig.length; tIdx++) {
        const { name, conflictKey, label } = this.tablesConfig[tIdx];
        let offset = 0;
        const batchSize = 1000;
        let hasMore = true;
        let tableDownloadedCount = 0;

        while (hasMore) {
          const currentProgress = Math.min(98, Math.round(2 + (tIdx * stepWeight) + (offset > 0 ? (stepWeight / 2) : 0)));
          this.updateState({
            isSyncing: true,
            type: 'download',
            statusText: `Descargando ${label}... (${tableDownloadedCount} descargados)`,
            progress: currentProgress
          });

          const { data, error } = await this.cloudSupabase
            .from(name)
            .select('*')
            .range(offset, offset + batchSize - 1);

          if (error) {
            console.warn(`[Sync Download] Error fetching table ${name} from Supabase:`, error);
            hasMore = false;
            break;
          }

          if (!data || data.length === 0) {
            hasMore = false;
            break;
          }

          // Guardar el lote en SQLite Local
          try {
            await localClient.from(name).upsert(data, { onConflict: conflictKey });
          } catch (localSaveErr) {
            console.error(`[Sync Download] Error saving batch to local db on ${name}:`, localSaveErr);
          }

          // Guardar también en IndexedDB local
          try {
            if (['citas', 'pacientes', 'consultas', 'transacciones', 'facturas_seguro', 'configuracion_doctor', 'tarifas_seguro', 'signos_vitales'].includes(name)) {
              await this.offlineService.saveLocalDataBulk(name, data);
            }
          } catch {
            // ignore indexeddb cache errors
          }

          tableDownloadedCount += data.length;
          totalDownloaded += data.length;

          if (name === 'pacientes') countStats.pacientes = tableDownloadedCount;
          if (name === 'consultas') countStats.consultas = tableDownloadedCount;
          if (name === 'citas') countStats.citas = tableDownloadedCount;

          if (data.length < batchSize) {
            hasMore = false;
          } else {
            offset += batchSize;
          }
        }
      }

      // 🔄 Recargar todos los servicios en memoria para que las vistas se actualicen al instante
      await Promise.all([
        this.patientService.refreshPatients(),
        this.appointmentService.refreshAppointments(),
        this.consultationService.refreshConsultas(),
        this.financialService.refreshAll(),
        this.configService.refreshConfig()
      ]);

      // 📡 Notificar a todas las terminales conectadas en la red LAN para que recarguen sus datos
      await this.supabaseService.broadcastReload();

      const nowStr = new Date().toLocaleString();
      localStorage.setItem('promedical_last_cloud_sync', nowStr);

      this.updateState({
        isSyncing: false,
        type: 'idle',
        statusText: `¡Descarga completa! (${totalDownloaded} registros en local)`,
        progress: 100,
        lastSyncTime: nowStr,
        error: null,
        stats: countStats
      });

      this.notificationService.showSuccess(
        'Descarga Local Completada',
        `¡Se descargaron ${totalDownloaded} registros de la nube a tu base de datos local!`
      );

      return true;
    } catch (err: any) {
      console.error('[Sync Download] Error general:', err);
      const errMsg = err?.message || 'Error al descargar datos de la nube';
      this.updateState({
        isSyncing: false,
        type: 'idle',
        statusText: 'Error en la descarga',
        progress: 0,
        error: errMsg
      });
      this.notificationService.showError('Error de Descarga', errMsg);
      return false;
    }
  }

  /**
   * 📤 SUBIR TODOS LOS DATOS LOCALES A LA NUBE (Fin de Jornada Laboral)
   * Toma todos los registros de la base de datos local SQLite y los sube a Supabase.
   */
  async uploadAllToCloud(): Promise<boolean> {
    if (this.syncState.value.isSyncing) return false;

    if (!navigator.onLine) {
      this.notificationService.showError('Sin Conexión a Internet', 'Se requiere acceso a internet para subir los datos a Supabase.');
      return false;
    }

    this.updateState({
      isSyncing: true,
      type: 'upload',
      statusText: 'Preparando datos locales para respaldar en Supabase...',
      progress: 2,
      error: null
    });

    const localClient = this.supabaseService.client;
    let totalUploaded = 0;

    try {
      const stepWeight = 95 / this.tablesConfig.length;

      for (let tIdx = 0; tIdx < this.tablesConfig.length; tIdx++) {
        const { name, conflictKey, label } = this.tablesConfig[tIdx];
        const currentProgress = Math.min(98, Math.round(2 + (tIdx * stepWeight)));

        this.updateState({
          isSyncing: true,
          type: 'upload',
          statusText: `Subiendo ${label} a la nube...`,
          progress: currentProgress
        });

        const { data: localRows, error: localErr } = await localClient.from(name).select('*');
        if (!localErr && localRows && localRows.length > 0) {
          // Subir en bloques de 500 para estabilidad
          const chunkSize = 500;
          for (let i = 0; i < localRows.length; i += chunkSize) {
            const chunk = localRows.slice(i, i + chunkSize);
            const { error: uploadErr } = await this.cloudSupabase.from(name).upsert(chunk, { onConflict: conflictKey });
            if (uploadErr) {
              console.warn(`[Sync Upload] Error subiendo chunk en ${name}:`, uploadErr);
            } else {
              totalUploaded += chunk.length;
            }
          }
        }
      }

      const nowStr = new Date().toLocaleString();
      localStorage.setItem('promedical_last_cloud_sync', nowStr);

      this.updateState({
        isSyncing: false,
        type: 'idle',
        statusText: `¡Subida completa! (${totalUploaded} registros respaldados en la nube)`,
        progress: 100,
        lastSyncTime: nowStr,
        error: null
      });

      this.notificationService.showSuccess(
        'Respaldo en la Nube Exitoso',
        `¡Se subieron y respaldaron ${totalUploaded} registros en Supabase!`
      );

      return true;
    } catch (err: any) {
      console.error('[Sync Upload] Error general:', err);
      const errMsg = err?.message || 'Error al subir datos a la nube';
      this.updateState({
        isSyncing: false,
        type: 'idle',
        statusText: 'Error en la subida',
        progress: 0,
        error: errMsg
      });
      this.notificationService.showError('Error de Subida', errMsg);
      return false;
    }
  }

  /**
   * Sincronización Bidireccional
   */
  async syncWithCloud(): Promise<boolean> {
    const uploaded = await this.uploadAllToCloud();
    if (!uploaded) return false;
    return await this.downloadAllFromCloud();
  }

  private updateState(partial: Partial<SyncProgress>) {
    this.syncState.next({
      ...this.syncState.value,
      ...partial
    });
  }
}
