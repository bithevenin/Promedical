import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { OfflineService } from './offline.service';

export interface Consulta {
  id?: string;
  cedula: string;
  fecha: string; // YYYY-MM-DD
  diagnostico: string;
  receta: string;
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
  }

  private setupRealtimeSubscription() {
    this.supabase
      .channel('consultas-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'consultas' },
        (payload: any) => {
          console.log('🔔 Realtime update on consultas:', payload);
          this.ngZone.run(async () => {
            await this.refreshConsultas();
          });
        }
      )
      .subscribe();
  }

  async refreshConsultas() {
    try {
      if (navigator.onLine) {
        const { data, error } = await this.supabase.from('consultas').select('*');
        if (error) throw error;
        
        if (data) {
          await this.offlineService.clearStore('consultas');
          const consultas: Consulta[] = data.map((c: any) => ({
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

    const local = await this.offlineService.getLocalData('consultas');
    this.consultationsSubject.next(local);
  }

  getPatientHistory(cedula: string): Consulta[] {
    return this.consultationsSubject.value.filter(h => h.cedula === cedula);
  }

  async saveConsultation(consulta: Consulta) {
    // Generate temporary UUID if not provided
    const localConsulta = {
      ...consulta,
      id: consulta.id || crypto.randomUUID()
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
      for (const c of consultas) {
        await this.saveConsultation(c);
      }
      return null;
    } catch (error) {
      console.error('Error importing consultations:', error);
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
