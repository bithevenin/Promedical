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

export interface Cita {
  id?: number;
  turno: number;
  nombre: string;
  cedula: string;
  edad: number;
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
}

export interface Consulta {
  cedula: string;
  fecha: string;
  diagnostico: string;
  receta: string;
}

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

export interface TarifaSeguro {
  seguro: string;
  montoCobertura: number; // Lo que paga el seguro
  copago: number; // Lo que paga el paciente
}

export interface ConfiguracionDoctor {
  nombreDoctor: string;
  especialidad: string;
  email?: string;
  password?: string;
  fotoUrl: string;
  montoConsultaParticular: number;
  tarifasSeguros: TarifaSeguro[];
}

@Injectable({
  providedIn: 'root'
})
export class CitasService {
  private supabase = this.supabaseService.client;

  private defaultConfig: ConfiguracionDoctor = {
    nombreDoctor: 'Dr. Thevenin',
    especialidad: 'Urólogo',
    email: 'doctor@promedical.com',
    fotoUrl: 'https://i.pravatar.cc/150?u=doctor',
    montoConsultaParticular: 1500,
    tarifasSeguros: [
      { seguro: 'ARS Humano', montoCobertura: 500, copago: 200 },
      { seguro: 'ARS Primera', montoCobertura: 450, copago: 250 },
      { seguro: 'ARS Senasa', montoCobertura: 400, copago: 0 },
      { seguro: 'ARS Mapfre', montoCobertura: 500, copago: 200 },
      { seguro: 'ARS Futuro', montoCobertura: 450, copago: 250 },
      { seguro: 'ARS Palic', montoCobertura: 480, copago: 220 }
    ]
  };

  private appointmentsSubject = new BehaviorSubject<Cita[]>([]);
  appointments$ = this.appointmentsSubject.asObservable();

  private patientsSubject = new BehaviorSubject<Paciente[]>([]);
  patients$ = this.patientsSubject.asObservable();

  private transactionsSubject = new BehaviorSubject<Transaccion[]>([]);
  transactions$ = this.transactionsSubject.asObservable();

  private facturasSeguroSubject = new BehaviorSubject<FacturaSeguro[]>([]);
  facturasSeguro$ = this.facturasSeguroSubject.asObservable();

  private reportesPagosSeguroSubject = new BehaviorSubject<ReportePagoSeguro[]>([]);
  reportesPagosSeguro$ = this.reportesPagosSeguroSubject.asObservable();

  private consultationsSubject = new BehaviorSubject<Consulta[]>([]);
  consultations$ = this.consultationsSubject.asObservable();

  private configSubject = new BehaviorSubject<ConfiguracionDoctor>(this.defaultConfig);
  config$ = this.configSubject.asObservable();

  constructor(private supabaseService: SupabaseService) {
    this.initializeData();
  }

  private async initializeData() {
    await Promise.all([
      this.refreshConfig(),
      this.refreshPatients(),
      this.refreshAppointments(),
      this.refreshTransactions(),
      this.refreshFacturasSeguro(),
      this.refreshReportesPagosSeguro(),
      this.refreshConsultas()
    ]);
  }

  // --- Refresh Methods (Fetch from Supabase) ---
  async refreshConsultas() {
    const { data } = await this.supabase.from('consultas').select('*');
    if (data) {
      const consultas: Consulta[] = data.map(c => ({
        cedula: c.paciente_cedula,
        fecha: c.fecha,
        diagnostico: c.diagnostico,
        receta: c.receta
      }));
      this.consultationsSubject.next(consultas);
    }
  }
  async refreshConfig() {
    const { data: configRows } = await this.supabase.from('configuracion_doctor').select('*').single();
    const { data: tarifas } = await this.supabase.from('tarifas_seguro').select('*');

    if (configRows) {
      const config: ConfiguracionDoctor = {
        nombreDoctor: configRows.nombre_doctor,
        especialidad: configRows.especialidad,
        email: configRows.email,
        fotoUrl: configRows.foto_url,
        montoConsultaParticular: configRows.monto_consulta_particular,
        tarifasSeguros: (tarifas || []).map(t => ({
          seguro: t.seguro,
          montoCobertura: t.monto_cobertura,
          copago: t.copago
        }))
      };
      this.configSubject.next(config);
    } else {
      // Si no hay datos en la DB, usar los valores por defecto
      this.configSubject.next(this.defaultConfig);
    }
  }

  async refreshPatients() {
    const { data } = await this.supabase.from('pacientes').select('*, signos_vitales(*)');
    if (data) {
      const patients: Paciente[] = data.map(p => ({
        cedula: p.cedula,
        nombre: p.nombre,
        edad: p.edad,
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
        signosVitales: p.signos_vitales.map((sv: any) => ({
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
  }

  async refreshAppointments() {
    const { data } = await this.supabase.from('citas').select('*');
    if (data) {
      const appointments: Cita[] = data.map(c => ({
        id: c.id,
        turno: Number(c.turno),
        nombre: c.nombre,
        cedula: c.cedula,
        edad: c.edad,
        seguro: c.seguro,
        sexo: c.sexo,
        fecha: c.fecha,
        estado: c.estado,
        hora: c.hora,
        altura: c.altura,
        peso: c.peso,
        profesion: c.profesion,
        instruccionCobro: c.instruccion_cobro,
        montoCobrado: c.monto_cobrado,
        carnetSeguro: c.carnet_seguro,
        telefono: c.telefono
      }));
      this.appointmentsSubject.next(appointments);
    }
  }

  async refreshTransactions() {
    const { data } = await this.supabase.from('transacciones').select('*');
    if (data) {
      this.transactionsSubject.next(data);
    }
  }

  async refreshFacturasSeguro() {
    const { data } = await this.supabase.from('facturas_seguro').select('*');
    if (data) {
      const facturas: FacturaSeguro[] = data.map(f => ({
        id: f.id,
        cedula: f.cedula,
        nombrePaciente: f.nombre_paciente,
        edad: f.edad,
        carnetSeguro: f.carnet_seguro,
        seguro: f.seguro,
        fecha: f.fecha,
        monto: f.monto,
        estado: f.estado,
        fechaPago: f.fecha_pago
      }));
      this.facturasSeguroSubject.next(facturas);
    }
  }

  async refreshReportesPagosSeguro() {
    const { data } = await this.supabase.from('reportes_pagos_seguro').select('*');
    if (data) {
      const reportes: ReportePagoSeguro[] = data.map(r => ({
        id: r.id,
        seguro: r.seguro,
        mes: r.mes,
        montoEnviado: r.monto_enviado,
        montoRecibido: r.monto_recibido,
        fechaEnvio: r.fecha_envio,
        fechaPago: r.fecha_pago,
        comentario: r.comentario,
        estado: r.estado
      }));
      this.reportesPagosSeguroSubject.next(reportes);
    }
  }

  // --- Configuration ---
  async saveConfig(config: ConfiguracionDoctor) {
    // 1. Actualizar datos básicos del doctor
    await this.supabase.from('configuracion_doctor').update({
      nombre_doctor: config.nombreDoctor,
      especialidad: config.especialidad,
      email: config.email,
      foto_url: config.fotoUrl,
      monto_consulta_particular: config.montoConsultaParticular
    }).eq('id', 1);

    // 2. Gestionar tarifas de seguros (borrar y re-insertar para sincronizar)
    // Primero borramos todas las tarifas actuales
    await this.supabase.from('tarifas_seguro').delete().neq('seguro', 'NONE');

    // Luego insertamos las nuevas
    if (config.tarifasSeguros.length > 0) {
      const inserts = config.tarifasSeguros.map(t => ({
        seguro: t.seguro,
        monto_cobertura: t.montoCobertura,
        copago: t.copago
      }));
      await this.supabase.from('tarifas_seguro').insert(inserts);
    }

    await this.refreshConfig();
  }

  getConfig(): ConfiguracionDoctor {
    return this.configSubject.value;
  }

  getTarifaSeguro(seguro: string): TarifaSeguro | undefined {
    return this.getConfig().tarifasSeguros.find(t => t.seguro === seguro);
  }

  // --- Appointments ---
  getAppointments() {
    return this.appointmentsSubject.value;
  }

  async addAppointment(cita: Cita) {
    await this.supabase.from('citas').insert([{
      turno: cita.turno,
      nombre: cita.nombre,
      cedula: cita.cedula,
      edad: cita.edad,
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
    }]);
    await this.refreshAppointments();
  }

  async updateAppointmentStatus(turno: number, estado: Cita['estado'], extraData?: Partial<Cita>) {
    const updateData: any = { estado };
    const today = extraData?.fecha || new Date().toISOString().split('T')[0];

    // Mapear automáticamente camelCase a snake_case para los campos adicionales
    if (extraData) {
      Object.keys(extraData).forEach(key => {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        updateData[snakeKey] = (extraData as any)[key];
      });
    }

    // Usar turno y fecha para encontrar la cita correcta si no hay ID
    await this.supabase.from('citas').update(updateData).eq('turno', turno).eq('fecha', today);
    await this.refreshAppointments();
  }

  // --- Patients ---
  getPatients(): Paciente[] {
    return this.patientsSubject.value;
  }

  async savePatient(paciente: Paciente) {
    await this.supabase.from('pacientes').upsert({
      cedula: paciente.cedula,
      nombre: paciente.nombre,
      edad: paciente.edad,
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
    await this.refreshPatients();
  }

  findPatientByCedula(cedula: string): Paciente | undefined {
    return this.getPatients().find(p => p.cedula === cedula);
  }

  // --- History ---
  getPatientHistory(cedula: string): Consulta[] {
    return this.consultationsSubject.value.filter(h => h.cedula === cedula);
  }

  async saveConsultation(consulta: Consulta) {
    await this.supabase.from('consultas').insert({
      paciente_cedula: consulta.cedula,
      fecha: consulta.fecha,
      diagnostico: consulta.diagnostico,
      receta: consulta.receta
    });
    await this.refreshConsultas();
  }

  async addSignosVitales(cedula: string, signos: SignoVital) {
    await this.supabase.from('signos_vitales').insert({
      paciente_cedula: cedula,
      fecha: new Date().toISOString(),
      presion_arterial: signos.presionArterial,
      frecuencia_cardiaca: signos.frecuenciaCardiaca,
      temperatura: signos.temperatura,
      peso: signos.peso,
      talla: signos.talla,
      imc: signos.imc
    });
    await this.refreshPatients();
  }

  async updateAntecedentes(cedula: string, data: { personales?: string, familiares?: string, alergias?: string }) {
    await this.supabase.from('pacientes').update({
      antecedentes_personales: data.personales,
      antecedentes_familiares: data.familiares,
      alergias: data.alergias
    }).eq('cedula', cedula);
    await this.refreshPatients();
  }

  // --- Accounting ---
  async agregarTransaccion(transaccion: Transaccion) {
    await this.supabase.from('transacciones').insert({
      concepto: transaccion.concepto,
      categoria: transaccion.categoria,
      monto: transaccion.monto,
      paciente: transaccion.paciente,
      fecha: transaccion.fecha || new Date().toISOString().split('T')[0]
    });
    await this.refreshTransactions();
  }

  async registrarCobro(turno: number, monto: number) {
    const apps = this.getAppointments();
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localDate = new Date(now.getTime() - (offset * 60 * 1000));
    const today = localDate.toISOString().split('T')[0];

    // Buscar la cita por turno y fecha de hoy
    const cita = apps.find(c => c.turno === turno && c.fecha === today);

    if (cita) {
      const nuevaTrans: Transaccion = {
        id: Date.now(),
        fecha: today,
        concepto: `Consulta Médica - ${cita.nombre}`,

        categoria: 'Ingreso',
        monto: monto,
        paciente: cita.nombre
      };
      await this.agregarTransaccion(nuevaTrans);

      // 2. Si tiene seguro y no es consulta gratis, crear factura para el seguro
      if (cita.seguro && cita.seguro !== 'Particular' && cita.instruccionCobro !== 'gratis') {
        const paciente = this.findPatientByCedula(cita.cedula);
        const tarifa = this.getTarifaSeguro(cita.seguro);

        // El monto a cobrar al seguro es lo que dice la tarifa (cobertura)
        const montoSeguro = tarifa ? tarifa.montoCobertura : 500;

        await this.agregarFacturaSeguro({
          id: Date.now(),
          cedula: cita.cedula,
          nombrePaciente: cita.nombre,
          edad: cita.edad,
          carnetSeguro: cita.carnetSeguro || paciente?.carnetSeguro || 'Sin carnet',
          seguro: cita.seguro,
          fecha: today,
          monto: montoSeguro,
          estado: 'pendiente'
        });
      }

      // 3. Marcar cita como atendida
      await this.updateAppointmentStatus(turno, 'atendido', { montoCobrado: monto, fecha: today });
    }
  }

  // --- Facturas de Seguro ---
  getFacturasSeguro(): FacturaSeguro[] {
    return this.facturasSeguroSubject.value;
  }

  async agregarFacturaSeguro(factura: FacturaSeguro) {
    await this.supabase.from('facturas_seguro').insert({
      cedula: factura.cedula,
      nombre_paciente: factura.nombrePaciente,
      edad: factura.edad,
      carnet_seguro: factura.carnetSeguro,
      seguro: factura.seguro,
      fecha: factura.fecha,
      monto: factura.monto,
      estado: factura.estado
    });
    await this.refreshFacturasSeguro();
  }

  async marcarFacturaPagada(id: number) {
    await this.supabase.from('facturas_seguro').update({
      estado: 'pagado',
      fecha_pago: new Date().toISOString().split('T')[0]
    }).eq('id', id);
    await this.refreshFacturasSeguro();
  }

  getFacturasPorSeguro(seguro: string): FacturaSeguro[] {
    return this.getFacturasSeguro().filter(f => f.seguro === seguro);
  }

  getFacturasPendientesPorSeguro(seguro: string): FacturaSeguro[] {
    return this.getFacturasSeguro().filter(f => f.seguro === seguro && f.estado === 'pendiente');
  }

  getResumenSeguros(): { seguro: string; totalPendiente: number; totalFacturas: number }[] {
    const seguros = this.getConfig().tarifasSeguros.map(t => t.seguro);
    return seguros.map(seguro => {
      const facturas = this.getFacturasPendientesPorSeguro(seguro);
      return {
        seguro,
        totalPendiente: facturas.reduce((sum, f) => sum + f.monto, 0),
        totalFacturas: facturas.length
      };
    });
  }

  // --- Gestión de Seguros ---
  async agregarSeguro(nuevaTarifa: TarifaSeguro) {
    await this.supabase.from('tarifas_seguro').insert({
      seguro: nuevaTarifa.seguro,
      monto_cobertura: nuevaTarifa.montoCobertura,
      copago: nuevaTarifa.copago
    });
    await this.refreshConfig();
  }

  async eliminarSeguro(nombreSeguro: string) {
    await this.supabase.from('tarifas_seguro').delete().eq('seguro', nombreSeguro);
    await this.refreshConfig();
  }

  // --- Reportes de Pagos de Seguro ---
  async agregarReportePagoSeguro(reporte: Partial<ReportePagoSeguro>) {
    await this.supabase.from('reportes_pagos_seguro').insert({
      seguro: reporte.seguro,
      mes: reporte.mes,
      monto_enviado: reporte.montoEnviado,
      fecha_envio: new Date().toISOString().split('T')[0],
      comentario: reporte.comentario,
      estado: 'pendiente'
    });
    await this.refreshReportesPagosSeguro();
  }

  async registrarPagoRecibido(reporte: ReportePagoSeguro, montoRecibido: number, fechaPago: string) {
    // 1. Actualizar el reporte de pago
    await this.supabase.from('reportes_pagos_seguro').update({
      monto_recibido: montoRecibido,
      fecha_pago: fechaPago,
      estado: 'completado'
    }).eq('id', reporte.id);

    // 2. Registrar automáticamente la transacción en el libro mayor
    const nuevaTrans: Transaccion = {
      id: Date.now(),
      fecha: fechaPago,
      concepto: `Pago ARS: ${reporte.seguro} - ${reporte.mes}`,
      categoria: 'Ingreso',
      monto: montoRecibido
    };
    await this.agregarTransaccion(nuevaTrans);

    await this.refreshReportesPagosSeguro();
  }
}
