export interface SignoVital {
  fecha: string;
  presionArterial: string;
  frecuenciaCardiaca: number;
  temperatura: number;
  peso: number;
  talla: number;
  imc: number;
  saturacionOxigeno?: number;
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
  antecedentes_personales?: string;
  antecedentesFamiliares?: string;
  antecedentes_familiares?: string;
  alergias?: string;
  tipo_sangre?: string;
  fotoUrl?: string;
  direccion?: string;
  signosVitales?: SignoVital[];
}
