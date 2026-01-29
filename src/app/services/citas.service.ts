import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

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

export interface TarifaSeguro {
  seguro: string;
  montoCobertura: number; // Lo que paga el seguro
  copago: number; // Lo que paga el paciente
}

export interface ConfiguracionDoctor {
  nombreDoctor: string;
  especialidad: string;
  fotoUrl: string;
  montoConsultaParticular: number;
  tarifasSeguros: TarifaSeguro[];
}

@Injectable({
  providedIn: 'root'
})
export class CitasService {
  private appointmentsKey = 'medical_appointments';
  private historyKey = 'medical_history';
  private patientsKey = 'medical_patients';
  private transactionsKey = 'medical_transactions';
  private facturasSeguroKey = 'medical_facturas_seguro';
  private configKey = 'medical_config';

  private defaultConfig: ConfiguracionDoctor = {
    nombreDoctor: 'Dr. Thevenin',
    especialidad: 'Urólogo',
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

  private appointmentsSubject = new BehaviorSubject<Cita[]>(this.loadAppointments());
  appointments$ = this.appointmentsSubject.asObservable();

  private patientsSubject = new BehaviorSubject<Paciente[]>(this.loadPatients());
  patients$ = this.patientsSubject.asObservable();

  private transactionsSubject = new BehaviorSubject<Transaccion[]>(this.loadTransactions());
  transactions$ = this.transactionsSubject.asObservable();

  private facturasSeguroSubject = new BehaviorSubject<FacturaSeguro[]>(this.loadFacturasSeguro());
  facturasSeguro$ = this.facturasSeguroSubject.asObservable();

  private configSubject = new BehaviorSubject<ConfiguracionDoctor>(this.loadConfig());
  config$ = this.configSubject.asObservable();

  constructor() { }

  // --- Configuration ---
  private loadConfig(): ConfiguracionDoctor {
    const data = localStorage.getItem(this.configKey);
    return data ? JSON.parse(data) : this.defaultConfig;
  }

  saveConfig(config: ConfiguracionDoctor) {
    localStorage.setItem(this.configKey, JSON.stringify(config));
    this.configSubject.next(config);
  }

  getConfig(): ConfiguracionDoctor {
    return this.configSubject.value;
  }

  getTarifaSeguro(seguro: string): TarifaSeguro | undefined {
    return this.getConfig().tarifasSeguros.find(t => t.seguro === seguro);
  }

  // --- Appointments ---
  private loadAppointments(): Cita[] {
    const data = localStorage.getItem(this.appointmentsKey);
    return data ? JSON.parse(data) : [];
  }

  private saveAppointments(appointments: Cita[]) {
    localStorage.setItem(this.appointmentsKey, JSON.stringify(appointments));
    this.appointmentsSubject.next(appointments);
  }

  getAppointments() {
    return this.appointmentsSubject.value;
  }

  addAppointment(cita: Cita) {
    const current = this.getAppointments();
    this.saveAppointments([...current, cita]);
  }

  updateAppointmentStatus(turno: number, estado: Cita['estado'], extraData?: Partial<Cita>) {
    const current = this.getAppointments();
    const updated = current.map(c =>
      c.turno === turno ? { ...c, estado, ...extraData } : c
    );
    this.saveAppointments(updated);
  }

  // --- Patients ---
  private loadPatients(): Paciente[] {
    const data = localStorage.getItem(this.patientsKey);
    return data ? JSON.parse(data) : [];
  }

  private savePatients(patients: Paciente[]) {
    localStorage.setItem(this.patientsKey, JSON.stringify(patients));
    this.patientsSubject.next(patients);
  }

  getPatients(): Paciente[] {
    return this.patientsSubject.value;
  }

  savePatient(paciente: Paciente) {
    const current = this.getPatients();
    const index = current.findIndex(p => p.cedula === paciente.cedula);
    if (index > -1) {
      current[index] = paciente;
      this.savePatients([...current]);
    } else {
      this.savePatients([...current, paciente]);
    }
  }

  findPatientByCedula(cedula: string): Paciente | undefined {
    return this.getPatients().find(p => p.cedula === cedula);
  }

  // --- History ---
  getPatientHistory(cedula: string): Consulta[] {
    const data = localStorage.getItem(this.historyKey);
    const history: Consulta[] = data ? JSON.parse(data) : [];
    return history.filter(h => h.cedula === cedula);
  }

  saveConsultation(consulta: Consulta) {
    const data = localStorage.getItem(this.historyKey);
    const history: Consulta[] = data ? JSON.parse(data) : [];
    history.push(consulta);
    localStorage.setItem(this.historyKey, JSON.stringify(history));
  }

  addSignosVitales(cedula: string, signos: SignoVital) {
    const paciente = this.findPatientByCedula(cedula);
    if (paciente) {
      if (!paciente.signosVitales) paciente.signosVitales = [];
      paciente.signosVitales.push(signos);
      this.savePatient(paciente);
    }
  }

  updateAntecedentes(cedula: string, data: { personales?: string, familiares?: string, alergias?: string }) {
    const paciente = this.findPatientByCedula(cedula);
    if (paciente) {
      paciente.antecedentesPersonales = data.personales ?? paciente.antecedentesPersonales;
      paciente.antecedentesFamiliares = data.familiares ?? paciente.antecedentesFamiliares;
      paciente.alergias = data.alergias ?? paciente.alergias;
      this.savePatient(paciente);
    }
  }

  // --- Accounting ---
  private loadTransactions(): Transaccion[] {
    const data = localStorage.getItem(this.transactionsKey);
    return data ? JSON.parse(data) : [];
  }

  private saveTransactions(transactions: Transaccion[]) {
    localStorage.setItem(this.transactionsKey, JSON.stringify(transactions));
    this.transactionsSubject.next(transactions);
  }

  agregarTransaccion(transaccion: Transaccion) {
    const current = this.loadTransactions();
    this.saveTransactions([...current, transaccion]);
  }

  registrarCobro(turno: number, monto: number) {
    const apps = this.getAppointments();
    const cita = apps.find(c => c.turno === turno);

    if (cita) {
      // 1. Registrar transacción
      const transactions = this.loadTransactions();
      const nuevaTrans: Transaccion = {
        id: Date.now(),
        fecha: new Date().toLocaleDateString(),
        concepto: `Consulta Médica - ${cita.nombre}`,
        categoria: 'Ingreso',
        monto: monto,
        paciente: cita.nombre
      };
      this.saveTransactions([...transactions, nuevaTrans]);

      // 2. Si tiene seguro y la instrucción es seguro, crear factura para el seguro
      if (cita.seguro && cita.seguro !== 'Particular' && cita.instruccionCobro === 'seguro') {
        const paciente = this.findPatientByCedula(cita.cedula);
        const tarifa = this.getTarifaSeguro(cita.seguro);
        this.agregarFacturaSeguro({
          id: Date.now(),
          cedula: cita.cedula,
          nombrePaciente: cita.nombre,
          edad: cita.edad,
          carnetSeguro: paciente?.carnetSeguro || cita.carnetSeguro || 'Sin carnet',
          seguro: cita.seguro,
          fecha: new Date().toLocaleDateString(),
          monto: tarifa ? tarifa.montoCobertura : 500, // Usar monto de configuración si existe
          estado: 'pendiente'
        });
      }

      // 3. Marcar cita como atendida
      this.updateAppointmentStatus(turno, 'atendido', { montoCobrado: monto });
    }
  }

  // --- Facturas de Seguro ---
  private loadFacturasSeguro(): FacturaSeguro[] {
    const data = localStorage.getItem(this.facturasSeguroKey);
    return data ? JSON.parse(data) : [];
  }

  private saveFacturasSeguro(facturas: FacturaSeguro[]) {
    localStorage.setItem(this.facturasSeguroKey, JSON.stringify(facturas));
    this.facturasSeguroSubject.next(facturas);
  }

  getFacturasSeguro(): FacturaSeguro[] {
    return this.facturasSeguroSubject.value;
  }

  agregarFacturaSeguro(factura: FacturaSeguro) {
    const current = this.getFacturasSeguro();
    this.saveFacturasSeguro([...current, factura]);
  }

  marcarFacturaPagada(id: number) {
    const current = this.getFacturasSeguro();
    const updated = current.map(f =>
      f.id === id ? { ...f, estado: 'pagado' as const, fechaPago: new Date().toLocaleDateString() } : f
    );
    this.saveFacturasSeguro(updated);
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
  agregarSeguro(nuevaTarifa: TarifaSeguro) {
    const config = this.getConfig();
    if (!config.tarifasSeguros.find(t => t.seguro === nuevaTarifa.seguro)) {
      config.tarifasSeguros.push(nuevaTarifa);
      this.saveConfig(config);
    }
  }

  eliminarSeguro(nombreSeguro: string) {
    const config = this.getConfig();
    config.tarifasSeguros = config.tarifasSeguros.filter(t => t.seguro !== nombreSeguro);
    this.saveConfig(config);
  }
}

