import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { PatientService } from './patient.service';

export interface Cita {
  id?: number;
  turno: number;
  nombre: string;
  cedula: string;
  edad: number;
  fecha_nacimiento?: string;
  seguro: string;
  sexo: 'M' | 'F';
  fecha: string; // YYYY-MM-DD
  estado: 'espera' | 'consulta' | 'por_pagar' | 'atendido';
  hora: string;
  altura?: string;
  peso?: string;
  profesion?: string;
  instruccionCobro?: 'cobrar' | 'seguro' | 'gratis';
  montoCobrado?: number;
  carnetSeguro?: string;
  telefono?: string;
  signosVitales?: any;
  antecedentesPersonales?: string;
  antecedentesFamiliares?: string;
  alergias?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AppointmentService {
  private supabase = this.supabaseService.client;
  private appointmentsSubject = new BehaviorSubject<Cita[]>([]);
  appointments$ = this.appointmentsSubject.asObservable();

  constructor(
    private supabaseService: SupabaseService,
    private patientService: PatientService
  ) {
    this.refreshAppointments();
  }

  async refreshAppointments() {
    try {
      const { data, error } = await this.supabase.from('citas').select('*');
      if (error) throw error;

      if (data) {
        const appointments: Cita[] = data.map((c: any) => ({
          id: c.id,
          turno: Number(c.turno),
          nombre: c.nombre,
          cedula: c.cedula,
          edad: c.fecha_nacimiento ? this.patientService.calcularEdad(c.fecha_nacimiento) : c.edad,
          fecha_nacimiento: c.fecha_nacimiento,
          seguro: c.seguro,
          sexo: c.sexo,
          fecha: c.fecha,
          estado: c.estado,
          hora: c.hora,
          altura: c.altura,
          peso: c.peso,
          profesion: c.profesion,
          instruccionCobro: c.instruccion_cobro,
          montoCobrado: c.monto_cobrado,
          carnetSeguro: c.carnet_seguro,
          telefono: c.telefono
        }));
        this.appointmentsSubject.next(appointments);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
    }
  }

  getAppointments() {
    return this.appointmentsSubject.value;
  }

  async addAppointment(cita: Cita) {
    try {
      const { error } = await this.supabase.from('citas').insert([{
        turno: cita.turno,
        nombre: cita.nombre,
        cedula: cita.cedula,
        edad: cita.edad,
        fecha_nacimiento: cita.fecha_nacimiento,
        seguro: cita.seguro,
        sexo: cita.sexo,
        fecha: cita.fecha,
        estado: cita.estado,
        hora: cita.hora,
        altura: cita.altura,
        peso: cita.peso,
        profesion: cita.profesion,
        instruccion_cobro: cita.instruccionCobro,
        monto_cobrado: cita.montoCobrado,
        carnet_seguro: cita.carnetSeguro,
        telefono: cita.telefono
      }]);
      if (error) throw error;
      await this.refreshAppointments();
    } catch (error) {
      console.error('Error adding appointment:', error);
      throw error;
    }
  }

  async updateAppointmentStatus(turno: number, estado: Cita['estado'], extraData?: Partial<Cita>) {
    try {
      const updateData: any = { estado };
      const today = extraData?.fecha || new Date().toISOString().split('T')[0];

      if (extraData) {
        Object.keys(extraData).forEach(key => {
          const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
          updateData[snakeKey] = (extraData as any)[key];
        });
      }

      const { error } = await this.supabase.from('citas').update(updateData).eq('turno', turno).eq('fecha', today);
      if (error) throw error;
      await this.refreshAppointments();
    } catch (error) {
      console.error('Error updating appointment status:', error);
      throw error;
    }
  }
}
