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
    this.setupRealtime();
    this.setupAutoSync();
  }

  private setupRealtime() {
    try {
      this.supabase
        .channel('pacientes-realtime')
        .on('broadcast', { table: 'pacientes' }, () => {
          this.refreshPatients();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pacientes' }, () => {
          this.refreshPatients();
        })
        .subscribe();
    } catch (e) {
      console.warn('[PatientService] Could not setup realtime:', e);
    }
  }

  private setupAutoSync() {
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        this.refreshPatients();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.refreshPatients();
        }
      });
    }
  }

  private syncingRemote = false;
  private hasSyncedThisSession = false;

  async refreshPatients() {
    try {
      // 1. Cargar rápido desde almacenamiento local (IndexedDB) para respuesta instantánea
      const localPatients = await this.offlineService.getLocalData<Paciente>('pacientes');
      if (localPatients && localPatients.length > 0) {
        this.patientsSubject.next(localPatients);
      }

      // 2. Si estamos en modo LAN local (SQLite embebido o servidor remoto en red), consultar directamente
      if (this.supabaseService.isLocal) {
        const { data, error } = await this.supabase.from('pacientes').select('*');
        if (!error && data && data.length > 0) {
          const mapped: Paciente[] = data.map((p: any) => ({
            cedula: p.cedula,
            nombre: p.nombre,
            edad: p.fecha_nacimiento ? this.calcularEdad(p.fecha_nacimiento) : (p.edad || 0),
            fecha_nacimiento: p.fecha_nacimiento,
            profesion: p.profesion || '',
            seguro: p.seguro || 'Particular',
            sexo: p.sexo || 'M',
            telefono: p.telefono || '',
            email: p.email || '',
            altura: p.altura || '',
            peso: p.peso || '',
            carnetSeguro: p.carnet_seguro || '',
            antecedentesPersonales: p.antecedentes_personales || p.antecedentesPersonales || '',
            antecedentesFamiliares: p.antecedentes_familiares || p.antecedentesFamiliares || '',
            alergias: p.alergias || '',
            tipo_sangre: p.tipo_sangre || '',
            fotoUrl: p.foto_url || '',
            direccion: p.direccion || '',
            signosVitales: Array.isArray(p.signos_vitales) ? p.signos_vitales : []
          }));
          this.patientsSubject.next(mapped);
          await this.offlineService.saveLocalDataBulk('pacientes', mapped);
        }
        return;
      }

      // 3. Modo Nube Supabase
      if (localPatients && localPatients.length >= 20000) {
        return;
      }

      if (navigator.onLine && !this.syncingRemote && !this.hasSyncedThisSession) {
        this.hasSyncedThisSession = true;
        this.syncAllRemotePatients();
      }
    } catch (error) {
      console.error('Error refreshing patients:', error);
    }
  }

  async syncAllRemotePatients() {
    if (this.syncingRemote || !navigator.onLine) return;
    this.syncingRemote = true;

    try {
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;
      const allPatients: Paciente[] = [];

      while (hasMore) {
        const { data, error } = await this.supabase
          .from('pacientes')
          .select('*, signos_vitales(*)')
          .range(offset, offset + batchSize - 1);

        if (error || !data || data.length === 0) {
          hasMore = false;
          break;
        }

        const mapped: Paciente[] = data.map((p: DbPaciente) => ({
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

        allPatients.push(...mapped);
        offset += batchSize;

        // Emitir el progreso para que el contador de la interfaz aumente dinámicamente
        this.patientsSubject.next([...allPatients]);

        if (data.length < batchSize) {
          hasMore = false;
        }
      }

      if (allPatients.length > 0) {
        await this.offlineService.saveLocalDataBulk('pacientes', allPatients);
        this.patientsSubject.next(allPatients);
      }
    } catch (err) {
      console.error('Error syncing remote patients:', err);
    } finally {
      this.syncingRemote = false;
    }
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

      const existing = this.findPatientByCedula(paciente.cedula) || (oldCedula ? this.findPatientByCedula(oldCedula) : undefined);

      // 2. Prepare payload for Supabase
      const dbData = {
        cedula: paciente.cedula,
        nombre: paciente.nombre,
        edad: fullPatient.edad,
        fecha_nacimiento: paciente.fecha_nacimiento || existing?.fecha_nacimiento || null,
        profesion: paciente.profesion || existing?.profesion || null,
        seguro: paciente.seguro || existing?.seguro || null,
        sexo: paciente.sexo || existing?.sexo || null,
        telefono: paciente.telefono || existing?.telefono || null,
        email: paciente.email || existing?.email || null,
        altura: (paciente.altura === '' || paciente.altura === undefined) ? (existing?.altura || null) : paciente.altura,
        peso: (paciente.peso === '' || paciente.peso === undefined) ? (existing?.peso || null) : paciente.peso,
        carnet_seguro: paciente.carnetSeguro || existing?.carnetSeguro || null,
        antecedentes_personales: paciente.antecedentesPersonales || (existing as any)?.antecedentes_personales || existing?.antecedentesPersonales || null,
        antecedentes_familiares: paciente.antecedentesFamiliares || (existing as any)?.antecedentes_familiares || existing?.antecedentesFamiliares || null,
        alergias: paciente.alergias || existing?.alergias || null,
        tipo_sangre: paciente.tipo_sangre || existing?.tipo_sangre || null,
        foto_url: paciente.fotoUrl || existing?.fotoUrl || null,
        direccion: paciente.direccion || existing?.direccion || null
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
      const fullPacientes = pacientes.map(p => ({
        ...p,
        edad: p.fecha_nacimiento ? this.calcularEdad(p.fecha_nacimiento) : p.edad
      }));

      // 1. Guardado masivo local en IndexedDB (una sola transacción)
      await this.offlineService.saveLocalDataBulk('pacientes', fullPacientes);

      // 2. Preparar payload de base de datos
      const dbPayloads = fullPacientes.map(p => ({
        cedula: p.cedula,
        nombre: p.nombre,
        edad: p.edad,
        fecha_nacimiento: p.fecha_nacimiento || null,
        profesion: p.profesion || null,
        seguro: p.seguro || null,
        sexo: p.sexo || null,
        telefono: p.telefono || null,
        email: p.email || null,
        altura: (p.altura === '' || p.altura === undefined) ? null : p.altura,
        peso: (p.peso === '' || p.peso === undefined) ? null : p.peso,
        carnet_seguro: p.carnetSeguro || null,
        antecedentes_personales: p.antecedentesPersonales || null,
        antecedentes_familiares: p.antecedentesFamiliares || null,
        alergias: p.alergias || null,
        tipo_sangre: p.tipo_sangre || null,
        foto_url: p.fotoUrl || null,
        direccion: p.direccion || null
      }));

      // 3. Insertar por lotes a Supabase
      if (navigator.onLine) {
        const BATCH_SIZE = 500;
        for (let i = 0; i < dbPayloads.length; i += BATCH_SIZE) {
          const batch = dbPayloads.slice(i, i + BATCH_SIZE);
          const { error } = await this.supabase.from('pacientes').upsert(batch);
          if (error) throw error;
        }
      } else {
        for (const payload of dbPayloads) {
          await this.offlineService.addToQueue('pacientes', 'upsert', payload);
        }
      }

      // 4. Actualizar BehaviorSubject en memoria una sola vez
      const current = this.patientsSubject.getValue();
      const patientMap = new Map<string, Paciente>();
      for (const p of current) {
        patientMap.set(p.cedula, p);
      }
      for (const p of fullPacientes) {
        patientMap.set(p.cedula, p);
      }
      this.patientsSubject.next(Array.from(patientMap.values()));

      return null;
    } catch (error) {
      console.error('Error importing patients in bulk:', error);
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

  private pendingPhotoFetches = new Set<string>();

  async fetchPhotoIfMissing(cedula: string) {
    if (!cedula) return;
    const cleanDigits = cedula.replace(/[^0-9]/g, '');
    if (cleanDigits.length !== 11) return;
    if (this.pendingPhotoFetches.has(cleanDigits)) return;

    const patient = this.findPatientByCedula(cedula);
    if (patient && !patient.fotoUrl) {
      this.pendingPhotoFetches.add(cleanDigits);
      try {
        const result = await this.consultarJCE(cleanDigits) as any;
        if (result && result.fotoUrl) {
          patient.fotoUrl = result.fotoUrl;
          await this.savePatient({ ...patient });
        }
      } catch {
        // Ignore error if JCE lookup fails
      } finally {
        this.pendingPhotoFetches.delete(cleanDigits);
      }
    }
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

    const candidateUrls: string[] = [
      'http://192.168.1.15:8000/api/v1/cedula-queries/query',
      'http://192.168.1.15:8082/api/v1/cedula-queries/query',
      environment.jceApiUrl ? `${environment.jceApiUrl}/api/v1/cedula-queries/query` : 'https://unrude-unpopular-gerri.ngrok-free.dev/api/v1/cedula-queries/query'
    ];

    const uniqueUrls = Array.from(new Set(candidateUrls));
    let lastError = '';

    for (const url of uniqueUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 segundos

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({ cedula: cleanCedula }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const resData = await response.json();
          if (resData.success && resData.data && resData.data.result) {
            const raw = resData.data.result;
            const bloodType = this.normalizarTipoSangre(
              raw.tipo_sangre || raw.tipoSangre || raw.grupo_sanguineo || raw.grupoSanguineo || raw.sangre || raw.COD_TIPO_SANGRE || raw.DESC_TIPO_SANGRE || ''
            );
            return {
              ...raw,
              tipo_sangre: bloodType
            };
          } else {
            throw new Error(resData.message || 'No se encontró información para la cédula ingresada en el padrón.');
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          lastError = 'El servidor JCE no respondió en 6 segundos (Servidor fuera de línea o apagado). Puedes completar los datos manualmente.';
        } else if (err.message && (err.message.includes('No se encontró') || err.message.includes('padrón'))) {
          throw err;
        } else {
          lastError = 'No se pudo conectar con el servidor JCE (Servidor fuera de línea o apagado). Puedes ingresar los datos manualmente.';
        }
      }
    }

    throw new Error(lastError || 'No se pudo conectar con el servidor JCE (Servidor fuera de línea o apagado).');
  }

  normalizarTipoSangre(val: any): string {
    if (!val || typeof val !== 'string') return '';
    const cleaned = val.trim().toUpperCase().replace(/\s+/g, '');
    if (['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(cleaned)) {
      return cleaned;
    }
    if (cleaned.includes('AB') && (cleaned.includes('+') || cleaned.includes('POS'))) return 'AB+';
    if (cleaned.includes('AB') && (cleaned.includes('-') || cleaned.includes('NEG'))) return 'AB-';
    if (cleaned.includes('A') && (cleaned.includes('+') || cleaned.includes('POS'))) return 'A+';
    if (cleaned.includes('A') && (cleaned.includes('-') || cleaned.includes('NEG'))) return 'A-';
    if (cleaned.includes('B') && (cleaned.includes('+') || cleaned.includes('POS'))) return 'B+';
    if (cleaned.includes('B') && (cleaned.includes('-') || cleaned.includes('NEG'))) return 'B-';
    if (cleaned.includes('O') && (cleaned.includes('+') || cleaned.includes('POS'))) return 'O+';
    if (cleaned.includes('O') && (cleaned.includes('-') || cleaned.includes('NEG'))) return 'O-';
    return '';
  }

  async buscarPacientesRemoto(query: string): Promise<Paciente[]> {
    if (!navigator.onLine || !query || query.trim().length < 2) return [];

    const normQuery = query.trim().toLowerCase();
    const cleanDigits = normQuery.replace(/[^0-9]/g, '');

    try {
      let req = this.supabase.from('pacientes').select('*, signos_vitales(*)').limit(20);
      
      // Si son números, buscamos por cédula, sino por nombre
      if (cleanDigits.length > 2) {
        req = req.ilike('cedula', `%${cleanDigits}%`);
      } else {
        req = req.ilike('nombre', `%${normQuery}%`);
      }

      const { data, error } = await req;
      if (error) throw error;

      if (data) {
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

        // Guardar los resultados en la caché local offline
        for (const patient of patients) {
          await this.offlineService.saveLocalData('pacientes', patient);
        }

        return patients;
      }
    } catch (err) {
      console.error('Error buscando pacientes remotos:', err);
    }
    return [];
  }
}
