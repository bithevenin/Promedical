import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { OfflineService } from './offline.service';
import { Consulta } from '../models';

interface DbConsulta {
  id: string;
  paciente_cedula: string;
  fecha: string;
  diagnostico?: string;
  receta?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ConsultationService {
  private supabase = this.supabaseService.client;
  private consultationsSubject = new BehaviorSubject<Consulta[]>([]);
  consultations$ = this.consultationsSubject.asObservable();

  constructor(
    private supabaseService: SupabaseService,
    private offlineService: OfflineService,
    private ngZone: NgZone
  ) {
    this.refreshConsultas();
    this.setupRealtimeSubscription();
    this.setupAutoSync();
  }

  private setupAutoSync() {
    // Los listeners de focus/visibilitychange se eliminaron porque disparan
    // refreshConsultas() completo con petición HTTP cada vez que el usuario
    // cambia de ventana — esto causaba lentitud innecesaria.
    // La sincronización ahora ocurre solo vía WebSocket realtime.
  }


  private setupRealtimeSubscription() {
    this.supabase
      .channel('consultas-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'consultas' },
        (payload: any) => {
          this.ngZone.run(async () => {
            if (payload.eventType === 'RELOAD_ALL') {
              await this.refreshConsultas();
              return;
            }

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE' || payload.eventType === 'UPSERT') {
              const c = payload.new;
              if (!c || !c.id) {
                await this.refreshConsultas();
                return;
              }

              const consulta: Consulta = {
                id: c.id,
                cedula: c.paciente_cedula,
                fecha: c.fecha,
                diagnostico: c.diagnostico || '',
                receta: c.receta || ''
              };
              const currentList = this.consultationsSubject.value;
              const index = currentList.findIndex(item => item.id === consulta.id);
              let updated = [...currentList];
              if (index >= 0) updated[index] = { ...updated[index], ...consulta };
              else updated.push(consulta);
              this.consultationsSubject.next(updated);
              await this.offlineService.saveLocalData('consultas', consulta);
            } else if (payload.eventType === 'DELETE') {
              const currentList = this.consultationsSubject.value;
              const targetId = payload.old?.id || payload.old?.filters?.id || payload.new?.id || payload.filters?.id;
              if (targetId) {
                const updated = currentList.filter(item => String(item.id) !== String(targetId));
                this.consultationsSubject.next(updated);
                await this.offlineService.deleteLocalData('consultas', targetId);
              }
            }
          });
        }
      )
      .subscribe();
  }

  async refreshConsultas() {
    try {
      const { data, error } = await this.supabase
        .from('consultas')
        .select('*')
        .order('fecha', { ascending: false })
        .limit(200);
      if (error) throw error;

      if (data) {
        const consultas: Consulta[] = data.map((c: DbConsulta) => ({
          id: c.id,
          cedula: c.paciente_cedula,
          fecha: c.fecha,
          diagnostico: c.diagnostico || '',
          receta: c.receta || ''
        }));

        this.consultationsSubject.next(consultas);
        this.offlineService.saveLocalDataBulk('consultas', consultas).catch(() => {});
        return;
      }
    } catch (error) {
      console.warn('[ConsultationService] Network issue, fetching consultations from offline storage:', error);
    }

    const local = await this.offlineService.getLocalData<Consulta>('consultas');
    this.consultationsSubject.next(local);
  }

  getPatientHistory(cedula: string): Consulta[] {
    return this.consultationsSubject.value.filter(h => h.cedula === cedula);
  }

  async cargarHistorialPaciente(cedula: string): Promise<Consulta[]> {
    if (!cedula) return [];

    // 1. Instantáneo desde memoria RAM (0ms)
    const inMemory = this.getPatientHistory(cedula);
    if (inMemory.length > 0) {
      return inMemory;
    }

    // 2. Consulta rápida local / online
    try {
      const { data, error } = await this.supabase
        .from('consultas')
        .select('*')
        .eq('paciente_cedula', cedula)
        .order('fecha', { ascending: false });
      if (error) throw error;

      if (data && data.length > 0) {
        const consultas: Consulta[] = data.map((c: DbConsulta) => ({
          id: c.id,
          cedula: c.paciente_cedula,
          fecha: c.fecha,
          diagnostico: c.diagnostico || '',
          receta: c.receta || ''
        }));

        // Combinar con las existentes en memoria sin duplicar
        const current = this.consultationsSubject.value.filter(h => h.cedula !== cedula);
        this.consultationsSubject.next([...consultas, ...current]);
        this.offlineService.saveLocalDataBulk('consultas', consultas).catch(() => {});

        return consultas;
      }
    } catch (error) {
      console.error('[ConsultationService] Error cargando historial remoto/LAN:', error);
    }

    // Fallback local
    const local = await this.offlineService.getLocalData<Consulta>('consultas');
    return local.filter(h => h.cedula === cedula);
  }

  async saveConsultation(consulta: Consulta) {
    // Generate temporary UUID safely
    const generateId = () => {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };

    const localConsulta = {
      ...consulta,
      id: consulta.id || generateId()
    };

    try {
      // 1. Save locally + optimistic update (sin refreshConsultas para evitar race condition)
      await this.offlineService.saveLocalData('consultas', localConsulta);
      const currentConsultas = this.consultationsSubject.getValue();
      const idxC = currentConsultas.findIndex(c => c.id === localConsulta.id);
      if (idxC >= 0) currentConsultas[idxC] = localConsulta;
      else currentConsultas.unshift(localConsulta);
      this.consultationsSubject.next([...currentConsultas]);

      // 2. Prepare payload
      const dbData = {
        id: localConsulta.id,
        paciente_cedula: consulta.cedula,
        fecha: consulta.fecha,
        diagnostico: consulta.diagnostico,
        receta: consulta.receta
      };

      const { error } = await this.supabase.from('consultas').insert(dbData);
      if (error) throw error;
    } catch (error) {
      console.warn('[ConsultationService] Error saving consultation online/LAN, queueing write:', error);
      const dbData = {
        id: localConsulta.id,
        paciente_cedula: consulta.cedula,
        fecha: consulta.fecha,
        diagnostico: consulta.diagnostico,
        receta: consulta.receta
      };
      await this.offlineService.addToQueue('consultas', 'insert', dbData);
    }
  }

  async importConsultations(consultas: Consulta[]) {
    try {
      const generateId = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      };

      const fullConsultas = consultas.map(c => ({
        ...c,
        id: c.id || generateId()
      }));

      // 1. Guardado masivo local en IndexedDB (una sola transacción)
      await this.offlineService.saveLocalDataBulk('consultas', fullConsultas);

      // 2. Preparar payload de base de datos
      const dbPayloads = fullConsultas.map(c => ({
        id: c.id,
        paciente_cedula: c.cedula,
        fecha: c.fecha,
        diagnostico: c.diagnostico,
        receta: c.receta
      }));

      // 3. Insertar por lotes a Supabase / LAN
      try {
        const BATCH_SIZE = 500;
        const batches = [];
        for (let i = 0; i < dbPayloads.length; i += BATCH_SIZE) {
          batches.push(dbPayloads.slice(i, i + BATCH_SIZE));
        }
        await Promise.all(batches.map(async batch => {
          const { error } = await this.supabase.from('consultas').upsert(batch);
          if (error) throw error;
        }));
      } catch (upsertErr) {
        console.warn('[ConsultationService] Error upserting consultations online/LAN, queuing:', upsertErr);
        await Promise.all(dbPayloads.map(payload =>
          this.offlineService.addToQueue('consultas', 'insert', payload)
        ));
      }

      // 4. Actualizar BehaviorSubject en memoria una sola vez
      const current = this.consultationsSubject.getValue();
      const consultationsMap = new Map<string, Consulta>();
      for (const c of current) {
        if (c.id) consultationsMap.set(c.id, c);
      }
      for (const c of fullConsultas) {
        if (c.id) consultationsMap.set(c.id, c);
      }
      this.consultationsSubject.next(Array.from(consultationsMap.values()));

      return null;
    } catch (error) {
      console.error('Error importing consultations in bulk:', error);
      return error;
    }
  }

  async getAllConsultations(): Promise<Consulta[]> {
    try {
      await this.refreshConsultas();
      return this.consultationsSubject.value;
    } catch (error) {
      console.error('Error getting all consultations:', error);
      return this.consultationsSubject.value;
    }
  }

  async deleteConsultation(consultaOrId: Consulta | string) {
    const id = typeof consultaOrId === 'string' ? consultaOrId : consultaOrId.id;
    const cedula = typeof consultaOrId === 'object' ? consultaOrId.cedula : undefined;
    const fecha = typeof consultaOrId === 'object' ? consultaOrId.fecha : undefined;

    // 1. Optimistic update en memoria
    const currentList = this.consultationsSubject.getValue();
    const updated = currentList.filter(c => {
      if (id && c.id) return c.id !== id;
      if (cedula && fecha) return !(c.cedula === cedula && c.fecha === fecha);
      return true;
    });
    this.consultationsSubject.next(updated);

    // 2. Eliminar de IndexedDB local
    if (id) {
      this.offlineService.deleteLocalData('consultas', id).catch(() => {});
    }

    // 3. Eliminar de Supabase / LAN
    try {
      if (id) {
        const { error } = await this.supabase.from('consultas').delete().eq('id', id);
        if (error) throw error;
      } else if (cedula && fecha) {
        const { error } = await this.supabase.from('consultas').delete().eq('paciente_cedula', cedula).eq('fecha', fecha);
        if (error) throw error;
      }
    } catch (error) {
      console.warn('[ConsultationService] Error deleting consultation online/LAN, queueing offline delete:', error);
      if (id) {
        await this.offlineService.addToQueue('consultas', 'delete', { id }, 'id', id);
      }
    }
  }
}
