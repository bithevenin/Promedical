export interface TarifaSeguro {
  id?: string;
  seguro: string;
  montoCobertura: number;
  copago: number;
}

export interface ConfiguracionFacturacion {
  tipoContribuyente: 'fisica' | 'juridica'; // Persona Física (Médico independiente) vs Persona Jurídica (Clínica / Centro)
  rncEmisor: string; // Cédula (11 dígitos) o RNC (9 dígitos)
  razonSocial: string; // Nombre oficial según DGII
  nombreComercial: string; // Nombre del Consultorio o Clínica
  actividadEconomica?: string; // Ej: 85121 - Servicios Médicos
  telefono?: string;
  correoEmisor?: string;
  direccionFiscal?: string;
  provincia?: string;
  municipio?: string;
  ambiente: 'certecf' | 'ecf'; // certecf (Certificación / Pruebas) | ecf (Producción)
  apiUrlDgii?: string; // Microservicio DGII (ej: http://192.168.1.15:8000 o local)
  formatoImpresion: 'termico_80mm' | 'hoja_carta'; // 80mm ticket vs Carta PDF
  impresionAutomatica: boolean;
  pieFactura?: string;
}

export interface ConfiguracionCertificado {
  nombreArchivo?: string;
  rutaArchivo?: string;
  passwordCertificado?: string;
  emisor?: string; // Ej: Avansi, DIGIFIRMA, Cámara de Comercio
  sujeto?: string; // Titular del certificado
  rncSujeto?: string;
  fechaEmision?: string;
  fechaVencimiento?: string;
  estado: 'vigente' | 'por_vencer' | 'vencido' | 'no_configurado';
  serialNumber?: string;
}

export interface ConfiguracionDoctor {
  id?: number;
  nombreDoctor: string;
  especialidad: string;
  email?: string;
  password?: string;
  fotoUrl: string;
  montoConsultaParticular: number;
  exequatur?: string;
  tarifasSeguros: TarifaSeguro[];
  facturacion?: ConfiguracionFacturacion;
  certificado?: ConfiguracionCertificado;
}

