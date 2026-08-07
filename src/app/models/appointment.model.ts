import { SignoVital } from './patient.model';

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
  signosVitales?: SignoVital[];
  antecedentesPersonales?: string;
  antecedentesFamiliares?: string;
  alergias?: string;
}
