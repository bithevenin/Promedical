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
    // Polling removido para evitar el consumo excesivo de la cuota (egress) de Supabase
    /* setInterval(() => {
      if (navigator.onLine) {
        this.refreshConsultas();
      }
    }, 15000); */

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        if (navigator.onLine) this.refreshConsultas();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          this.refreshConsultas();
        }
      });
    }
  }

  private setupRealtimeSubscription() {
    this.supabase
      .channel('consultas-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'consultas' },
        (payload: any) => {
          this.ngZone.run(async () => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const c = payload.new;
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
              if (index >= 0) updated[index] = consulta;
              else updated.push(consulta);
              this.consultationsSubject.next(updated);
              await this.offlineService.saveLocalData('consultas', consulta);
            } else if (payload.eventType === 'DELETE') {
              const currentList = this.consultationsSubject.value;
              const updated = currentList.filter(item => item.id !== payload.old.id);
              this.consultationsSubject.next(updated);
              await this.offlineService.deleteLocalData('consultas', payload.old.id);
            }
          });
        }
      )
      .subscribe();
  }

  async refreshConsultas() {
    try {
      if (navigator.onLine) {
        // Limitamos a 50 para evitar descargas masivas y bloqueos en IndexedDB
        const { data, error } = await this.supabase
          .from('consultas')
          .select('*')
          .order('fecha', { ascending: false })
          .limit(50);
        if (error) throw error;
        
        if (data) {
          const consultas: Consulta[] = data.map((c: DbConsulta) => ({
            id: c.id,
            cedula: c.paciente_cedula,
            fecha: c.fecha,
            diagnostico: c.diagnostico || '',
            receta: c.receta || ''
          }));

          for (const c of consultas) {
            await this.offlineService.saveLocalData('consultas', c);
          }
          this.consultationsSubject.next(consultas);
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
    try {
      if (navigator.onLine) {
        const { data, error } = await this.supabase
          .from('consultas')
          .select('*')
          .eq('paciente_cedula', cedula)
          .order('fecha', { ascending: false });
        if (error) throw error;

        if (data) {
          const consultas: Consulta[] = data.map((c: DbConsulta) => ({
            id: c.id,
            cedula: c.paciente_cedula,
            fecha: c.fecha,
            diagnostico: c.diagnostico || '',
            receta: c.receta || ''
          }));

          // Guardar localmente
          for (const c of consultas) {
            await this.offlineService.saveLocalData('consultas', c);
          }

          // Combinar con las existentes en memoria sin duplicar
          const current = this.consultationsSubject.value.filter(h => h.cedula !== cedula);
          this.consultationsSubject.next([...consultas, ...current]);

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
      // 1. Save locally
      await this.offlineService.saveLocalData('consultas', localConsulta);
      await this.refreshConsultas();

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
