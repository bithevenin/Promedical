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
              const targetId = payload.old?.id || payload.old?.filters?.id;
              const updated = currentList.filter(item => item.id !== targetId);
              this.consultationsSubject.next(updated);
              if (targetId) {
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
      if (navigator.onLine) {
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
      }
    } catch (error) {
      console.warn('Network issue, fetching consultations from offline storage:', error);
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
      if (navigator.onLine) {
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
      }
    } catch (error) {
      console.error('Error cargando historial remoto:', error);
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

      if (navigator.onLine) {
        const { error } = await this.supabase.from('consultas').insert(dbData);
        if (error) throw error;
      } else {
        await this.offlineService.addToQueue('consultas', 'insert', dbData);
      }
    } catch (error) {
      console.warn('Error saving consultation, queueing write:', error);
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

      // 3. Insertar por lotes a Supabase
      if (navigator.onLine) {
        const BATCH_SIZE = 500;
        for (let i = 0; i < dbPayloads.length; i += BATCH_SIZE) {
          const batch = dbPayloads.slice(i, i + BATCH_SIZE);
          const { error } = await this.supabase.from('consultas').upsert(batch);
          if (error) throw error;
        }
      } else {
        for (const payload of dbPayloads) {
          await this.offlineService.addToQueue('consultas', 'insert', payload);
        }
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
}
