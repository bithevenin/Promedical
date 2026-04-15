import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { ConfigService, TarifaSeguro } from './config.service';
import { AppointmentService, Cita } from './appointment.service';
import { PatientService } from './patient.service';

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

@Injectable({
  providedIn: 'root'
})
export class FinancialService {
  private supabase = this.supabaseService.client;
  
  private transactionsSubject = new BehaviorSubject<Transaccion[]>([]);
  transactions$ = this.transactionsSubject.asObservable();

  private facturasSeguroSubject = new BehaviorSubject<FacturaSeguro[]>([]);
  facturasSeguro$ = this.facturasSeguroSubject.asObservable();

  private reportesPagosSeguroSubject = new BehaviorSubject<ReportePagoSeguro[]>([]);
  reportesPagosSeguro$ = this.reportesPagosSeguroSubject.asObservable();

  constructor(
    private supabaseService: SupabaseService,
    private configService: ConfigService,
    private appointmentService: AppointmentService,
    private patientService: PatientService
  ) {
    this.refreshAll();
  }

  private async refreshAll() {
    await Promise.all([
      this.refreshTransactions(),
      this.refreshFacturasSeguro(),
      this.refreshReportesPagosSeguro()
    ]);
  }

  async refreshTransactions() {
    try {
      const { data, error } = await this.supabase.from('transacciones').select('*');
      if (error) throw error;
      if (data) this.transactionsSubject.next(data);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  }

  async refreshFacturasSeguro() {
    try {
      const { data, error } = await this.supabase.from('facturas_seguro').select('*');
      if (error) throw error;
      if (data) {
        const facturas: FacturaSeguro[] = data.map((f: any) => ({
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
    } catch (error) {
      console.error('Error fetching insurance invoices:', error);
    }
  }

  async refreshReportesPagosSeguro() {
    try {
      const { data, error } = await this.supabase.from('reportes_pagos_seguro').select('*');
      if (error) throw error;
      if (data) {
        const reportes: ReportePagoSeguro[] = data.map((r: any) => ({
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
    } catch (error) {
      console.error('Error fetching insurance reports:', error);
    }
  }

  // --- Transactions ---
  async agregarTransaccion(transaccion: Transaccion) {
    try {
      const { error } = await this.supabase.from('transacciones').insert({
        concepto: transaccion.concepto,
        categoria: transaccion.categoria,
        monto: transaccion.monto,
        paciente: transaccion.paciente,
        fecha: transaccion.fecha || new Date().toISOString().split('T')[0]
      });
      if (error) throw error;
      await this.refreshTransactions();
    } catch (error) {
      console.error('Error adding transaction:', error);
      throw error;
    }
  }

  // --- Billing Logic ---
  async registrarCobro(turno: number, monto: number) {
    try {
      const apps = this.appointmentService.getAppointments();
      const today = new Date().toISOString().split('T')[0];
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

        // Insurance logic
        if (cita.seguro && cita.seguro !== 'Particular' && cita.instruccionCobro !== 'gratis') {
          const paciente = this.patientService.findPatientByCedula(cita.cedula);
          const tarifa = this.configService.getTarifaSeguro(cita.seguro);
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

        await this.appointmentService.updateAppointmentStatus(turno, 'atendido', { montoCobrado: monto, fecha: today });
      }
    } catch (error) {
      console.error('Error registering payment:', error);
      throw error;
    }
  }

  // --- Insurance Invoices ---
  async agregarFacturaSeguro(factura: FacturaSeguro) {
    try {
      const { error } = await this.supabase.from('facturas_seguro').insert({
        cedula: factura.cedula,
        nombre_paciente: factura.nombrePaciente,
        edad: factura.edad,
        carnet_seguro: factura.carnetSeguro,
        seguro: factura.seguro,
        fecha: factura.fecha,
        monto: factura.monto,
        estado: factura.estado
      });
      if (error) throw error;
      await this.refreshFacturasSeguro();
    } catch (error) {
      console.error('Error adding insurance invoice:', error);
      throw error;
    }
  }

  async marcarFacturaPagada(id: number) {
    try {
      const { error } = await this.supabase.from('facturas_seguro').update({
        estado: 'pagado',
        fecha_pago: new Date().toISOString().split('T')[0]
      }).eq('id', id);
      if (error) throw error;
      await this.refreshFacturasSeguro();
    } catch (error) {
      console.error('Error marking invoice as paid:', error);
      throw error;
    }
  }

  // --- Reports ---
  async agregarReportePagoSeguro(reporte: Partial<ReportePagoSeguro>) {
    try {
      const { error } = await this.supabase.from('reportes_pagos_seguro').insert({
        seguro: reporte.seguro,
        mes: reporte.mes,
        monto_enviado: reporte.montoEnviado,
        fecha_envio: new Date().toISOString().split('T')[0],
        comentario: reporte.comentario,
        estado: 'pendiente'
      });
      if (error) throw error;
      await this.refreshReportesPagosSeguro();
    } catch (error) {
      console.error('Error adding insurance payment report:', error);
      throw error;
    }
  }

  async registrarPagoRecibido(reporte: ReportePagoSeguro, montoRecibido: number, fechaPago: string) {
    try {
      const { error } = await this.supabase.from('reportes_pagos_seguro').update({
        monto_recibido: montoRecibido,
        fecha_pago: fechaPago,
        estado: 'completado'
      }).eq('id', reporte.id);
      
      if (error) throw error;

      const nuevaTrans: Transaccion = {
        id: Date.now(),
        fecha: fechaPago,
        concepto: `Pago ARS: ${reporte.seguro} - ${reporte.mes}`,
        categoria: 'Ingreso',
        monto: montoRecibido
      };
      await this.agregarTransaccion(nuevaTrans);

      await this.refreshReportesPagosSeguro();
    } catch (error) {
      console.error('Error registering received payment:', error);
      throw error;
    }
  }

  // --- Analytical Methods ---
  getResumenSeguros(): { seguro: string; totalPendiente: number; totalFacturas: number }[] {
    const facturas = this.facturasSeguroSubject.value;
    const resumen: { [key: string]: { seguro: string; totalPendiente: number; totalFacturas: number } } = {};

    facturas.forEach(f => {
      if (!resumen[f.seguro]) {
        resumen[f.seguro] = { seguro: f.seguro, totalPendiente: 0, totalFacturas: 0 };
      }
      
      if (f.estado === 'pendiente') {
        resumen[f.seguro].totalPendiente += f.monto;
      }
      resumen[f.seguro].totalFacturas++;
    });

    return Object.values(resumen).sort((a, b) => b.totalPendiente - a.totalPendiente);
  }
}
