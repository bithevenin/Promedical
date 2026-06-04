import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { PatientService } from './patient.service';
import { OfflineService } from './offline.service';

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
    private patientService: PatientService,
    private offlineService: OfflineService
  ) {
    this.refreshAppointments();
  }

  async refreshAppointments() {
    try {
      if (navigator.onLine) {
        const { data, error } = await this.supabase.from('citas').select('*');
        if (error) throw error;

        if (data) {
          await this.offlineService.clearStore('citas');
          const appointments: Cita[] = data.map((c: any) => ({
            id: c.id,
            turno: Number(c.turno),
            nombre: c.nombre,
            cedula: c.cedula,
            edad: c.fecha_nacimiento ? this.patientService.calcularEdad(c.fecha_nacimiento) : c.edad,
            fecha_nacimiento: c.fecha_nacimiento,
            seguro: c.seguro || 'Particular',
            sexo: c.sexo,
            fecha: c.fecha,
            estado: c.estado,
            hora: c.hora,
            altura: c.altura || '',
            peso: c.peso || '',
            profesion: c.profesion || '',
            instruccionCobro: c.instruccion_cobro || 'cobrar',
            montoCobrado: c.monto_cobrado || 0,
            carnetSeguro: c.carnet_seguro || '',
            telefono: c.telefono || ''
          }));

          for (const app of appointments) {
            await this.offlineService.saveLocalData('citas', app);
          }
          this.appointmentsSubject.next(appointments);
          return;
        }
      }
    } catch (error) {
      console.warn('Network issue, fetching appointments from offline storage:', error);
    }

    const local = await this.offlineService.getLocalData('citas');
    this.appointmentsSubject.next(local);
  }

  getAppointments() {
    return this.appointmentsSubject.value;
  }

  async addAppointment(cita: Cita) {
    // Generate a temporary negative ID if not defined, to ensure IndexedDB has a key
    const localCita = {
      ...cita,
      id: cita.id || Math.floor(Math.random() * -100000)
    };

    try {
      // 1. Save locally
      await this.offlineService.saveLocalData('citas', localCita);

      // 2. Prepare database payload
      const dbData = {
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
      };

      if (navigator.onLine) {
        const { error } = await this.supabase.from('citas').insert([dbData]);
        if (error) throw error;
      } else {
        await this.offlineService.addToQueue('citas', 'insert', dbData);
      }
    } catch (error) {
      console.warn('Error saving appointment, queueing write:', error);
      const dbData = {
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
      };
      await this.offlineService.addToQueue('citas', 'insert', dbData);
    } finally {
      await this.refreshAppointments();
    }
  }

  async updateAppointmentStatus(turno: number, estado: Cita['estado'], extraData?: Partial<Cita>) {
    try {
      const today = extraData?.fecha || new Date().toISOString().split('T')[0];

      // 1. Update locally in IndexedDB first
      const local = await this.offlineService.getLocalData('citas');
      const target = local.find(c => c.turno === turno && c.fecha === today);
      if (target) {
        target.estado = estado;
        if (extraData) {
          Object.assign(target, extraData);
        }
        await this.offlineService.saveLocalData('citas', target);
      }

      // 2. Prepare payload for Supabase
      const updateData: any = { estado };
      if (extraData) {
        Object.keys(extraData).forEach(key => {
          const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
          updateData[snakeKey] = (extraData as any)[key];
        });
      }

      if (navigator.onLine) {
        if (target && target.id && target.id > 0) {
          const { error } = await this.supabase.from('citas').update(updateData).eq('id', target.id);
          if (error) throw error;
        } else {
          const { error } = await this.supabase.from('citas').update(updateData).eq('turno', turno).eq('fecha', today);
          if (error) throw error;
        }
      } else {
        if (target && target.id && target.id > 0) {
          await this.offlineService.addToQueue('citas', 'update', updateData, 'id', target.id);
        } else {
          await this.offlineService.addToQueue('citas', 'update', updateData, 'turno', turno);
        }
      }
    } catch (error) {
      console.warn('Error updating appointment online, queueing write:', error);
      const today = extraData?.fecha || new Date().toISOString().split('T')[0];
      const updateData: any = { estado };
      if (extraData) {
        Object.keys(extraData).forEach(key => {
          const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
          updateData[snakeKey] = (extraData as any)[key];
        });
      }
      await this.offlineService.addToQueue('citas', 'update', updateData, 'turno', turno);
    } finally {
      await this.refreshAppointments();
    }
  }
}
