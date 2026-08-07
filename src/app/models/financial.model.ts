export interface Transaccion {
  id: number;
  fecha: string;
  concepto: string;
  categoria: 'Ingreso' | 'Gasto';
  monto: number;
  paciente?: string;
}

export interface FacturaSeguro {
  id: number;
  cedula: string;
  nombrePaciente: string;
  edad: number;
  carnetSeguro: string;
  seguro: string;
  fecha: string;
  monto: number;
  estado: 'pendiente' | 'pagado';
  fechaPago?: string;
}

export interface ReportePagoSeguro {
  id: number;
  seguro: string;
  mes: string; // Formato YYYY-MM
  montoEnviado: number;
  montoRecibido?: number;
  fechaEnvio: string;
  fechaPago?: string;
  comentario?: string;
  estado: 'pendiente' | 'completado';
}
