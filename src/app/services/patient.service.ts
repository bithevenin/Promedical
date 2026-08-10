import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { OfflineService } from './offline.service';
import { environment } from '../../environments/environment';
import { Paciente, SignoVital } from '../models';

interface DbSignoVital {
  fecha: string;
  presion_arterial: string;
  frecuencia_cardiaca: number;
  temperatura: number;
  peso: number;
  talla: number;
  imc: number;
  saturacion_oxigeno?: number;
}

interface DbPaciente {
  cedula: string;
  nombre: string;
  edad: number;
  fecha_nacimiento?: string;
  profesion?: string;
  seguro?: string;
  sexo: 'M' | 'F';
  telefono?: string;
  email?: string;
  altura?: string;
  peso?: string;
  carnet_seguro?: string;
  antecedentes_personales?: string;
  antecedentes_familiares?: string;
  alergias?: string;
  tipo_sangre?: string;
  foto_url?: string;
  direccion?: string;
  signos_vitales?: DbSignoVital[];
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
    this.setupAutoSync();
  }

  private setupAutoSync() {
    setInterval(() => {
      if (navigator.onLine) {
        this.refreshPatients();
      }
    }, 15000);

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        if (navigator.onLine) this.refreshPatients();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          this.refreshPatients();
        }
      });
    }
  }

  async refreshPatients() {
    try {
      // 1. Cargar rápido desde almacenamiento local para que la UI no espere
      const localPatients = await this.offlineService.getLocalData<Paciente>('pacientes');
      if (localPatients && localPatients.length > 0) {
        this.patientsSubject.next(localPatients);
      }

      if (navigator.onLine) {
        let allData: DbPaciente[] = [];
        let from = 0;
        const step = 1000;
        
        while (true) {
          const { data, error } = await this.supabase
            .from('pacientes')
            .select('*, signos_vitales(*)')
            .range(from, from + step - 1);
            
          if (error) throw error;
          if (data && data.length > 0) {
            allData = allData.concat(data);
          }
          if (!data || data.length < step) {
            break;
          }
          from += step;
        }

        if (allData.length >= 0) {
          const data = allData;
          await this.offlineService.clearStore('pacientes');
          const patients: Paciente[] = data.map((p: DbPaciente) => ({
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
            antecedentesPersonales: p.antecedentes_personales || (p as any).antecedentesPersonales || '',
            antecedentesFamiliares: p.antecedentes_familiares || (p as any).antecedentesFamiliares || '',
            alergias: p.alergias || '',
            tipo_sangre: p.tipo_sangre || '',
            fotoUrl: p.foto_url || '',
            direccion: p.direccion || '',
            signosVitales: (p.signos_vitales || []).map((sv: DbSignoVital) => ({
              fecha: sv.fecha,
              presionArterial: sv.presion_arterial,
              frecuenciaCardiaca: sv.frecuencia_cardiaca,
              temperatura: sv.temperatura,
              peso: sv.peso,
              talla: sv.talla,
              imc: sv.imc,
              saturacionOxigeno: sv.saturacion_oxigeno
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
      // Network issue or offline
    }

    const local = await this.offlineService.getLocalData<Paciente>('pacientes');
    this.patientsSubject.next(local);
  }

  getPatients(): Paciente[] {
    return this.patientsSubject.value;
  }

  async savePatient(paciente: Paciente, oldCedula?: string) {
    try {
      if (oldCedula && oldCedula !== paciente.cedula) {
        await this.deletePatient(oldCedula);
      }

      // 1. Save locally first
      const fullPatient = {
        ...paciente,
        edad: paciente.fecha_nacimiento ? this.calcularEdad(paciente.fecha_nacimiento) : paciente.edad
      };
      await this.offlineService.saveLocalData('pacientes', fullPatient);

      // 2. Prepare payload for Supabase
      const dbData = {
        cedula: paciente.cedula,
        nombre: paciente.nombre,
        edad: fullPatient.edad,
        fecha_nacimiento: paciente.fecha_nacimiento || null,
        profesion: paciente.profesion || null,
        seguro: paciente.seguro || null,
        sexo: paciente.sexo || null,
        telefono: paciente.telefono || null,
        email: paciente.email || null,
        altura: (paciente.altura === '' || paciente.altura === undefined) ? null : paciente.altura,
        peso: (paciente.peso === '' || paciente.peso === undefined) ? null : paciente.peso,
        carnet_seguro: paciente.carnetSeguro || null,
        antecedentes_personales: paciente.antecedentesPersonales || null,
        antecedentes_familiares: paciente.antecedentesFamiliares || null,
        alergias: paciente.alergias || null,
        tipo_sangre: paciente.tipo_sangre || null,
        foto_url: paciente.fotoUrl || null,
        direccion: paciente.direccion || null
      };

      if (navigator.onLine) {
        const { error } = await this.supabase.from('pacientes').upsert(dbData);
        if (error) throw error;
      } else {
        await this.offlineService.addToQueue('pacientes', 'upsert', dbData);
      }
    } catch (error) {
      console.error('Error saving patient to Supabase, queuing for offline sync:', error);
      const dbDataOffline = {
        cedula: paciente.cedula,
        nombre: paciente.nombre,
        edad: paciente.fecha_nacimiento ? this.calcularEdad(paciente.fecha_nacimiento) : paciente.edad,
        fecha_nacimiento: paciente.fecha_nacimiento || null,
        profesion: paciente.profesion || null,
        seguro: paciente.seguro || null,
        sexo: paciente.sexo || null,
        telefono: paciente.telefono || null,
        email: paciente.email || null,
        altura: (paciente.altura === '' || paciente.altura === undefined) ? null : paciente.altura,
        peso: (paciente.peso === '' || paciente.peso === undefined) ? null : paciente.peso,
        carnet_seguro: paciente.carnetSeguro || null,
        antecedentes_personales: paciente.antecedentesPersonales || null,
        antecedentes_familiares: paciente.antecedentesFamiliares || null,
        alergias: paciente.alergias || null,
        tipo_sangre: paciente.tipo_sangre || null,
        foto_url: paciente.fotoUrl || null,
        direccion: paciente.direccion || null
      };
      await this.offlineService.addToQueue('pacientes', 'upsert', dbDataOffline);
    } finally {
      // Actualizar memoria RAM directamente sin recargar 21,000 registros
      const current = this.patientsSubject.getValue();
      const idx = current.findIndex(p => p.cedula === paciente.cedula);
      
      // Asegurarnos de que tenemos el fullPatient con edad calculada
      const fullPatient = {
        ...paciente,
        edad: paciente.fecha_nacimiento ? this.calcularEdad(paciente.fecha_nacimiento) : paciente.edad
      };

      if (idx >= 0) {
        current[idx] = fullPatient;
      } else {
        current.unshift(fullPatient);
      }
      this.patientsSubject.next([...current]);
    }
  }

  async deletePatient(cedula: string) {
    try {
      // 1. Eliminar localmente
      await this.offlineService.deleteLocalData('pacientes', cedula);
      
      // 2. Actualizar memoria RAM instantáneamente
      const current = this.patientsSubject.getValue().filter(p => p.cedula !== cedula);
      this.patientsSubject.next(current);

      // 3. Eliminar en Supabase o encolar
      if (navigator.onLine) {
        const { error } = await this.supabase.from('pacientes').delete().eq('cedula', cedula);
        if (error) throw error;
      } else {
        await this.offlineService.addToQueue('pacientes', 'delete', { queryKey: 'cedula', queryValue: cedula });
      }
    } catch (error) {
      console.error('Error deleting patient:', error);
      await this.offlineService.addToQueue('pacientes', 'delete', { queryKey: 'cedula', queryValue: cedula });
    }
  }

  async importPatients(pacientes: Paciente[]) {
    try {
      for (const p of pacientes) {
        await this.savePatient(p);
      }
      return null;
    } catch (error) {
      return error;
    }
  }

  async deleteAllPatients() {
    if (navigator.onLine) {
      // Supabase requires a filter for deletes by default, so we use a condition that matches everything
      const { error } = await this.supabase.from('pacientes').delete().not('cedula', 'eq', 'impossible_value_123');
      if (error) console.error("Error deleting remote patients:", error);
    }
    await this.offlineService.clearStore('pacientes');
    this.patientsSubject.next([]);
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
    if (!cedula) return undefined;
    const target = cedula.trim().toLowerCase();
    const cleanTarget = target.replace(/[^0-9a-z]/g, '');
    const digitsOnly = target.replace(/[^0-9]/g, '');

    return this.getPatients().find(p => {
      if (!p.cedula) return false;
      const pCedula = p.cedula.trim().toLowerCase();
      if (pCedula === target) return true;

      const pClean = pCedula.replace(/[^0-9a-z]/g, '');
      if (cleanTarget && pClean === cleanTarget) return true;

      if (digitsOnly && digitsOnly.length >= 5) {
        const pDigits = pCedula.replace(/[^0-9]/g, '');
        if (pDigits === digitsOnly) return true;
      }

      return false;
    });
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
      // 1. Update local patient object in RAM & offline storage
      const patient = this.findPatientByCedula(cedula);
      if (patient) {
        patient.antecedentesPersonales = data.personales || '';
        (patient as any).antecedentes_personales = data.personales || '';
        patient.antecedentesFamiliares = data.familiares || '';
        (patient as any).antecedentes_familiares = data.familiares || '';
        patient.alergias = data.alergias || '';
        await this.offlineService.saveLocalData('pacientes', patient);
      }

      // 2. Sync to Supabase table
      const dbPayload = {
        antecedentes_personales: data.personales || null,
        antecedentes_familiares: data.familiares || null,
        alergias: data.alergias || null
      };

      if (navigator.onLine) {
        const { error } = await this.supabase.from('pacientes').update(dbPayload).eq('cedula', cedula);
        if (error) {
          console.error('Error updating antecedentes in Supabase:', error);
          throw error;
        }
      } else {
        await this.offlineService.addToQueue('pacientes', 'update', dbPayload, 'cedula', cedula);
      }

      // Notify all subscribers of patients$ with updated array reference
      const current = this.patientsSubject.getValue();
      const idx = current.findIndex(p => p.cedula === cedula);
      if (idx >= 0 && patient) {
        current[idx] = { ...patient };
        this.patientsSubject.next([...current]);
      }
    } catch (error) {
      console.error('Error updating antecedentes:', error);
      const dbPayload = {
        antecedentes_personales: data.personales || null,
        antecedentes_familiares: data.familiares || null,
        alergias: data.alergias || null
      };
      await this.offlineService.addToQueue('pacientes', 'update', dbPayload, 'cedula', cedula);
    }
  }

  async consultarJCE(cedula: string): Promise<unknown> {
    const cleanCedula = cedula.replace(/[^0-9]/g, '');
    if (!cleanCedula) {
      throw new Error('Por favor, ingrese un número de cédula.');
    }
    if (cleanCedula.length !== 11) {
      throw new Error('La cédula debe contener exactamente 11 dígitos.');
    }

    const baseUrl = environment.jceApiUrl || 'https://unrude-unpopular-gerri.ngrok-free.dev';
    const targetUrl = `${baseUrl}/api/v1/cedula-queries/query`;
    // Usamos corsproxy.io para eludir el bloqueo de CORS directamente desde el frontend en desarrollo
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const apiUrl = isLocalhost ? `https://corsproxy.io/?${encodeURIComponent(targetUrl)}` : targetUrl;

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
