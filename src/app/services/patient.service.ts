import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';

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
  signosVitales?: SignoVital[];
}

@Injectable({
  providedIn: 'root'
})
export class PatientService {
  private supabase = this.supabaseService.client;
  private patientsSubject = new BehaviorSubject<Paciente[]>([]);
  patients$ = this.patientsSubject.asObservable();

  constructor(private supabaseService: SupabaseService) {
    this.refreshPatients();
  }

  async refreshPatients() {
    try {
      const { data, error } = await this.supabase.from('pacientes').select('*, signos_vitales(*)');
      if (error) throw error;

      if (data) {
        const patients: Paciente[] = data.map((p: any) => ({
          cedula: p.cedula,
          nombre: p.nombre,
          edad: p.fecha_nacimiento ? this.calcularEdad(p.fecha_nacimiento) : p.edad,
          fecha_nacimiento: p.fecha_nacimiento,
          profesion: p.profesion,
          seguro: p.seguro,
          sexo: p.sexo,
          telefono: p.telefono,
          email: p.email,
          altura: p.altura,
          peso: p.peso,
          carnetSeguro: p.carnet_seguro,
          antecedentesPersonales: p.antecedentes_personales,
          antecedentesFamiliares: p.antecedentes_familiares,
          alergias: p.alergias,
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
        this.patientsSubject.next(patients);
      }
    } catch (error) {
      console.error('Error fetching patients:', error);
    }
  }

  getPatients(): Paciente[] {
    return this.patientsSubject.value;
  }

  async savePatient(paciente: Paciente) {
    try {
      const { error } = await this.supabase.from('pacientes').upsert({
        cedula: paciente.cedula,
        nombre: paciente.nombre,
        edad: paciente.edad,
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
        alergias: paciente.alergias
      });
      if (error) throw error;
      await this.refreshPatients();
    } catch (error) {
      console.error('Error saving patient:', error);
      throw error;
    }
  }

  async importPatients(pacientes: Paciente[]) {
    try {
      const dataToUpsert = pacientes.map(p => ({
        cedula: p.cedula,
        nombre: p.nombre,
        edad: p.edad || (p.fecha_nacimiento ? this.calcularEdad(p.fecha_nacimiento) : 0),
        fecha_nacimiento: p.fecha_nacimiento,
        profesion: p.profesion,
        seguro: p.seguro,
        sexo: p.sexo,
        altura: p.altura,
        peso: p.peso,
        telefono: p.telefono,
        email: p.email,
        carnet_seguro: p.carnetSeguro,
        antecedentes_personales: p.antecedentesPersonales,
        antecedentes_familiares: p.antecedentesFamiliares,
        alergias: p.alergias
      }));

      const { error } = await this.supabase
        .from('pacientes')
        .upsert(dataToUpsert, { onConflict: 'cedula' });

      if (error) throw error;
      await this.refreshPatients();
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

      const { error } = await this.supabase.from('signos_vitales').insert(dataToInsert);
      if (error) throw error;

      await this.refreshPatients();
      return null;
    } catch (error) {
      console.error('Error adding vital signs:', error);
      return error;
    }
  }

  async updateAntecedentes(cedula: string, data: { personales?: string, familiares?: string, alergias?: string }) {
    try {
      const { error } = await this.supabase.from('pacientes').update({
        antecedentes_personales: data.personales,
        antecedentes_familiares: data.familiares,
        alergias: data.alergias
      }).eq('cedula', cedula);
      if (error) throw error;
      await this.refreshPatients();
    } catch (error) {
      console.error('Error updating antecedents:', error);
      throw error;
    }
  }
}
