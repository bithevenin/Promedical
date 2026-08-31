import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { PatientService } from './patient.service';
import { OfflineService } from './offline.service';
import { getLocalDateString } from '../utils/format.utils';
import { Cita } from '../models';

interface DbCita {
  id: number;
  turno: number;
  nombre: string;
  cedula: string;
  edad: number;
  fecha_nacimiento?: string;
  seguro?: string;
  sexo: 'M' | 'F';
  fecha: string;
  estado: 'espera' | 'consulta' | 'por_pagar' | 'atendido';
  hora: string;
  altura?: string;
  peso?: string;
  profesion?: string;
  instruccion_cobro?: 'cobrar' | 'seguro' | 'gratis';
  monto_cobrado?: number;
  carnet_seguro?: string;
  telefono?: string;
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
    private offlineService: OfflineService,
    private ngZone: NgZone
  ) {
    this.refreshAppointments();
    this.setupRealtimeSubscription();
    this.setupAutoSync();
  }

  private setupAutoSync() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (navigator.onLine) this.refreshAppointments();
      });
      // Evitamos re-cargar en focus para no generar peticiones innecesarias
    }
  }

  private setupRealtimeSubscription() {
    this.supabase
      .channel('citas-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'citas' },
        (payload: any) => {
          this.ngZone.run(() => {
            if (payload.eventType === 'RELOAD_ALL') {
              this.refreshAppointments();
              return;
            }

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE' || payload.eventType === 'UPSERT') {
              const c = payload.new;
              if (!c || c.turno === undefined || c.turno === null) {
                this.refreshAppointments();
                return;
              }

              const newCita: Cita = {
                id: c.id,
                turno: Number(c.turno),
                nombre: c.nombre || '',
                cedula: c.cedula || '',
                edad: c.fecha_nacimiento ? this.patientService.calcularEdad(c.fecha_nacimiento) : (c.edad || 0),
                fecha_nacimiento: c.fecha_nacimiento,
                seguro: c.seguro || 'Particular',
                sexo: c.sexo || 'M',
                fecha: c.fecha,
                estado: c.estado || 'espera',
                hora: c.hora || '',
                altura: c.altura || '',
                peso: c.peso || '',
                profesion: c.profesion || '',
                instruccionCobro: c.instruccion_cobro || 'cobrar',
                montoCobrado: c.monto_cobrado || 0,
                carnetSeguro: c.carnet_seguro || '',
                telefono: c.telefono || ''
              };

              const currentList = this.appointmentsSubject.value;
              const index = currentList.findIndex(item =>
                (newCita.id && item.id === newCita.id) ||
                (item.turno === newCita.turno && item.fecha === newCita.fecha)
              );

              const updated = [...currentList];
              if (index >= 0) {
                updated[index] = { ...updated[index], ...newCita };
              } else {
                updated.push(newCita);
              }
              this.appointmentsSubject.next(updated);
              // No-blocking: guardar en IndexedDB sin bloquear el UI
              this.offlineService.saveLocalData('citas', newCita).catch(() => {});

            } else if (payload.eventType === 'DELETE') {
              const currentList = this.appointmentsSubject.value;
              // El servidor ahora envía record = filters en DELETE → está en payload.new
              const targetId = payload.new?.id || payload.old?.id || payload.filters?.id;
              const targetTurno = payload.new?.turno || payload.old?.turno || payload.filters?.turno;
              const updated = currentList.filter(item => {
                if (targetId) return String(item.id) !== String(targetId);
                if (targetTurno) return String(item.turno) !== String(targetTurno);
                return true;
              });
              this.appointmentsSubject.next(updated);
              if (targetId) {
                this.offlineService.deleteLocalData('citas', targetId).catch(() => {});
              }
            }
          });
        }
      )
      .subscribe();
  }

  async refreshAppointments() {
    try {
      if (navigator.onLine) {
        const { data, error } = await this.supabase.from('citas').select('*');
        if (error) throw error;

        if (data) {
          const appointments: Cita[] = data.map((c: DbCita) => ({
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

          this.appointmentsSubject.next(appointments);
          this.offlineService.saveLocalDataBulk('citas', appointments).catch(() => {});
          return;
        }
      }
    } catch (error) {
      console.warn('Network issue, fetching appointments from offline storage:', error);
    }

    const local = await this.offlineService.getLocalData<Cita>('citas');
    this.appointmentsSubject.next(local);
  }

  getAppointments() {
    return this.appointmentsSubject.value;
  }

  async addAppointment(cita: Cita) {
    const localCita = {
      ...cita,
      id: cita.id || Math.floor(Math.random() * -100000)
    };

    // 1. Actualización optimista en memoria INSTANTÁNEA (0ms)
    const currentList = [...this.appointmentsSubject.value];
    const existingIndex = currentList.findIndex(c => c.turno === localCita.turno && c.fecha === localCita.fecha);
    if (existingIndex === -1) {
      currentList.push(localCita);
    } else {
      currentList[existingIndex] = localCita;
    }
    this.appointmentsSubject.next(currentList);
    this.offlineService.saveLocalData('citas', localCita).catch(() => {});

    try {
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
    }
  }

  async updateAppointmentStatus(turno: number, estado: Cita['estado'], extraData?: Partial<Cita>) {
    const today = extraData?.fecha || getLocalDateString();

    // 1. Actualización optimista en memoria INSTANTÁNEA (0ms)
    const current = [...this.appointmentsSubject.value];
    const target = current.find((c: Cita) => c.turno === turno && c.fecha === today) || current.find((c: Cita) => c.turno === turno);
    if (target) {
      target.estado = estado;
      if (extraData) {
        Object.assign(target, extraData);
      }
      this.appointmentsSubject.next(current);
      this.offlineService.saveLocalData('citas', target).catch(() => {});
    }

    try {
      const updateData: Record<string, unknown> = { estado };
      if (extraData) {
        Object.keys(extraData).forEach(key => {
          const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
          updateData[snakeKey] = extraData[key as keyof Cita];
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
      const updateData: Record<string, unknown> = { estado };
      if (extraData) {
        Object.keys(extraData).forEach(key => {
          const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
          updateData[snakeKey] = extraData[key as keyof Cita];
        });
      }
      await this.offlineService.addToQueue('citas', 'update', updateData, 'turno', turno);
    }
  }
}
