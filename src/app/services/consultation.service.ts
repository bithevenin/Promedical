import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface Consulta {
  cedula: string;
  fecha: string;
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

  constructor(private supabaseService: SupabaseService) {
    this.refreshConsultas();
  }

  async refreshConsultas() {
    try {
      const { data, error } = await this.supabase.from('consultas').select('*');
      if (error) throw error;
      
      if (data) {
        const consultas: Consulta[] = data.map((c: any) => ({
          cedula: c.paciente_cedula,
          fecha: c.fecha,
          diagnostico: c.diagnostico,
          receta: c.receta
        }));
        this.consultationsSubject.next(consultas);
      }
    } catch (error) {
      console.error('Error fetching consultations:', error);
    }
  }

  getPatientHistory(cedula: string): Consulta[] {
    return this.consultationsSubject.value.filter(h => h.cedula === cedula);
  }

  async saveConsultation(consulta: Consulta) {
    try {
      const { error } = await this.supabase.from('consultas').insert({
        paciente_cedula: consulta.cedula,
        fecha: consulta.fecha,
        diagnostico: consulta.diagnostico,
        receta: consulta.receta
      });
      if (error) throw error;
      await this.refreshConsultas();
    } catch (error) {
      console.error('Error saving consultation:', error);
      throw error;
    }
  }

  async importConsultations(consultas: Consulta[]) {
    try {
      const { error } = await this.supabase
        .from('consultas')
        .insert(consultas.map(c => ({
          paciente_cedula: c.cedula,
          fecha: c.fecha,
          diagnostico: c.diagnostico,
          receta: c.receta
        })));
      if (error) throw error;
      await this.refreshConsultas();
      return null;
    } catch (error) {
      console.error('Error importing consultations:', error);
      return error;
    }
  }

  async getAllConsultations(): Promise<Consulta[]> {
    try {
      const { data, error } = await this.supabase
        .from('consultas')
        .select('*')
        .order('fecha', { ascending: false });
      if (error) throw error;
      
      return data.map((c: any) => ({
        cedula: c.paciente_cedula,
        fecha: c.fecha,
        diagnostico: c.diagnostico,
        receta: c.receta
      }));
    } catch (error) {
      console.error('Error getting all consultations:', error);
      return [];
    }
  }
}
