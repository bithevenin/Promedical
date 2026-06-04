import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { OfflineService } from './offline.service';
import { environment } from '../../environments/environment';

export interface SignoVital {
  fecha: string;
  presionArterial: string;
  frecuenciaCardiaca: number;
  temperatura: number;
  peso: number;
  talla: number;
  imc: number;
}

export interface Paciente {
  cedula: string;
  nombre: string;
  edad: number;
  fecha_nacimiento?: string;
  profesion: string;
  seguro: string;
  sexo: 'M' | 'F';
  telefono?: string;
  email?: string;
  altura?: string;
  peso?: string;
  carnetSeguro?: string;
  antecedentesPersonales?: string;
  antecedentesFamiliares?: string;
  alergias?: string;
  tipo_sangre?: string;
  fotoUrl?: string;
  direccion?: string;
  signosVitales?: SignoVital[];
}

@Injectable({
  providedIn: 'root'
})
export class PatientService {
  private supabase = this.supabaseService.client;
  private patientsSubject = new BehaviorSubject<Paciente[]>([]);
  patients$ = this.patientsSubject.asObservable();

  constructor(
    private supabaseService: SupabaseService,
    private offlineService: OfflineService
  ) {
    this.refreshPatients();
  }

  async refreshPatients() {
    try {
      if (navigator.onLine) {
        const { data, error } = await this.supabase.from('pacientes').select('*, signos_vitales(*)');
        if (error) throw error;

        if (data) {
          await this.offlineService.clearStore('pacientes');
          const patients: Paciente[] = data.map((p: any) => ({
            cedula: p.cedula,
            nombre: p.nombre,
            edad: p.fecha_nacimiento ? this.calcularEdad(p.fecha_nacimiento) : p.edad,
            fecha_nacimiento: p.fecha_nacimiento,
            profesion: p.profesion || '',
            seguro: p.seguro || 'Particular',
            sexo: p.sexo,
            telefono: p.telefono || '',
            email: p.email || '',
            altura: p.altura || '',
            peso: p.peso || '',
            carnetSeguro: p.carnet_seguro || '',
            antecedentesPersonales: p.antecedentes_personales || '',
            antecedentesFamiliares: p.antecedentes_familiares || '',
            alergias: p.alergias || '',
            tipo_sangre: p.tipo_sangre || '',
            fotoUrl: p.foto_url || '',
            direccion: p.direccion || '',
            signosVitales: (p.signos_vitales || []).map((sv: any) => ({
              fecha: sv.fecha,
              presionArterial: sv.presion_arterial,
              frecuenciaCardiaca: sv.frecuencia_cardiaca,
              temperatura: sv.temperatura,
              peso: sv.peso,
              talla: sv.talla,
              imc: sv.imc
            }))
          }));

          for (const patient of patients) {
            await this.offlineService.saveLocalData('pacientes', patient);
          }
          this.patientsSubject.next(patients);
          return;
        }
      }
    } catch (error) {
      console.warn('Network issue, fetching patients from offline storage:', error);
    }

    const local = await this.offlineService.getLocalData('pacientes');
    this.patientsSubject.next(local);
  }

  getPatients(): Paciente[] {
    return this.patientsSubject.value;
  }

  async savePatient(paciente: Paciente) {
    try {
      // 1. Save locally first
      const fullPatient = {
        ...paciente,
        edad: paciente.fecha_nacimiento ? this.calcularEdad(paciente.fecha_nacimiento) : paciente.edad
      };
      await this.offlineService.saveLocalData('pacientes', fullPatient);
      this.refreshPatients();

      // 2. Prepare payload for Supabase
      const dbData = {
        cedula: paciente.cedula,
        nombre: paciente.nombre,
        edad: fullPatient.edad,
        fecha_nacimiento: paciente.fecha_nacimiento,
        profesion: paciente.profesion,
        seguro: paciente.seguro,
        sexo: paciente.sexo,
        telefono: paciente.telefono,
        email: paciente.email,
        altura: paciente.altura,
        peso: paciente.peso,
        carnet_seguro: paciente.carnetSeguro,
        antecedentes_personales: paciente.antecedentesPersonales,
        antecedentes_familiares: paciente.antecedentesFamiliares,
        alergias: paciente.alergias,
        tipo_sangre: paciente.tipo_sangre || '',
        foto_url: paciente.fotoUrl || '',
        direccion: paciente.direccion || ''
      };

      if (navigator.onLine) {
        const { error } = await this.supabase.from('pacientes').upsert(dbData);
        if (error) throw error;
      } else {
        await this.offlineService.addToQueue('pacientes', 'upsert', dbData);
      }
    } catch (error) {
      console.warn('Supabase save error, queueing write:', error);
      const dbData = {
        cedula: paciente.cedula,
        nombre: paciente.nombre,
        edad: paciente.fecha_nacimiento ? this.calcularEdad(paciente.fecha_nacimiento) : paciente.edad,
        fecha_nacimiento: paciente.fecha_nacimiento,
        profesion: paciente.profesion,
        seguro: paciente.seguro,
        sexo: paciente.sexo,
        telefono: paciente.telefono,
        email: paciente.email,
        altura: paciente.altura,
        peso: paciente.peso,
        carnet_seguro: paciente.carnetSeguro,
        antecedentes_personales: paciente.antecedentesPersonales,
        antecedentes_familiares: paciente.antecedentesFamiliares,
        alergias: paciente.alergias,
        tipo_sangre: paciente.tipo_sangre || '',
        foto_url: paciente.fotoUrl || '',
        direccion: paciente.direccion || ''
      };
      await this.offlineService.addToQueue('pacientes', 'upsert', dbData);
    }
  }

  async importPatients(pacientes: Paciente[]) {
    try {
      for (const p of pacientes) {
        await this.savePatient(p);
      }
      return null;
    } catch (error) {
      console.error('Error importing patients:', error);
      return error;
    }
  }

  calcularEdad(fechaNacimiento: string): number {
    if (!fechaNacimiento) return 0;
    const today = new Date();
    const birthDate = new Date(fechaNacimiento);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  findPatientByCedula(cedula: string): Paciente | undefined {
    return this.getPatients().find(p => p.cedula === cedula);
  }

  async addSignosVitales(cedula: string, signos: SignoVital) {
    try {
      const dataToInsert = {
        paciente_cedula: cedula,
        fecha: new Date().toISOString().split('T')[0],
        presion_arterial: signos.presionArterial || '',
        frecuencia_cardiaca: signos.frecuenciaCardiaca ? Math.round(signos.frecuenciaCardiaca) : null,
        temperatura: signos.temperatura ? Number(Math.min(Number(signos.temperatura), 99.9).toFixed(1)) : null,
        peso: signos.peso ? Number(Math.min(Number(signos.peso), 999.9).toFixed(1)) : null,
        talla: signos.talla ? Number(Math.min(Number(signos.talla), 999.9).toFixed(1)) : null,
        imc: signos.imc ? Number(Math.min(Number(signos.imc), 99.9).toFixed(1)) : null
      };

      // 1. Save locally inside the patient object
      const patient = this.findPatientByCedula(cedula);
      if (patient) {
        if (!patient.signosVitales) patient.signosVitales = [];
        patient.signosVitales.push(signos);
        await this.offlineService.saveLocalData('pacientes', patient);
        this.patientsSubject.next(this.getPatients());
      }

      // 2. Queue or write to Supabase
      if (navigator.onLine) {
        const { error } = await this.supabase.from('signos_vitales').insert(dataToInsert);
        if (error) throw error;
      } else {
        await this.offlineService.addToQueue('signos_vitales', 'insert', dataToInsert);
      }
      return null;
    } catch (error) {
      console.warn('Error saving signs, queueing write:', error);
      const dataToInsert = {
        paciente_cedula: cedula,
        fecha: new Date().toISOString().split('T')[0],
        presion_arterial: signos.presionArterial || '',
        frecuencia_cardiaca: signos.frecuenciaCardiaca ? Math.round(signos.frecuenciaCardiaca) : null,
        temperatura: signos.temperatura ? Number(Math.min(Number(signos.temperatura), 99.9).toFixed(1)) : null,
        peso: signos.peso ? Number(Math.min(Number(signos.peso), 999.9).toFixed(1)) : null,
        talla: signos.talla ? Number(Math.min(Number(signos.talla), 999.9).toFixed(1)) : null,
        imc: signos.imc ? Number(Math.min(Number(signos.imc), 99.9).toFixed(1)) : null
      };
      await this.offlineService.addToQueue('signos_vitales', 'insert', dataToInsert);
      return null;
    }
  }

  async updateAntecedentes(cedula: string, data: { personales?: string, familiares?: string, alergias?: string }) {
    try {
      // 1. Update locally
      const patient = this.findPatientByCedula(cedula);
      if (patient) {
        patient.antecedentesPersonales = data.personales;
        patient.antecedentesFamiliares = data.familiares;
        patient.alergias = data.alergias;
        await this.offlineService.saveLocalData('pacientes', patient);
        this.patientsSubject.next(this.getPatients());
      }

      // 2. Sync
      const dbPayload = {
        antecedentes_personales: data.personales,
        antecedentes_familiares: data.familiares,
        alergias: data.alergias
      };

      if (navigator.onLine) {
        const { error } = await this.supabase.from('pacientes').update(dbPayload).eq('cedula', cedula);
        if (error) throw error;
      } else {
        await this.offlineService.addToQueue('pacientes', 'update', dbPayload, 'cedula', cedula);
      }
    } catch (error) {
      console.warn('Error updating antecedents, queueing write:', error);
      const dbPayload = {
        antecedentes_personales: data.personales,
        antecedentes_familiares: data.familiares,
        alergias: data.alergias
      };
      await this.offlineService.addToQueue('pacientes', 'update', dbPayload, 'cedula', cedula);
    }
  }

  async consultarJCE(cedula: string): Promise<any> {
    const cleanCedula = cedula.replace(/[^0-9]/g, '');
    if (!cleanCedula) {
      throw new Error('Por favor, ingrese un número de cédula.');
    }
    if (cleanCedula.length !== 11) {
      throw new Error('La cédula debe contener exactamente 11 dígitos.');
    }

    const baseUrl = environment.jceApiUrl || 'https://edging-rarity-routing.ngrok-free.dev';
    const apiUrl = `${baseUrl}/api/v1/cedula-queries/query`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({ cedula: cleanCedula })
    });

    if (!response.ok) {
      throw new Error(`Error en el servidor JCE: Código ${response.status}`);
    }

    const resData = await response.json();
    if (resData.success && resData.data && resData.data.result) {
      return resData.data.result;
    } else {
      throw new Error(resData.message || 'No se encontró información para la cédula ingresada.');
    }
  }
}
