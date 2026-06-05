import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { ConfigService } from './config.service';
import { AppointmentService } from './appointment.service';
import { PatientService } from './patient.service';
import { OfflineService } from './offline.service';
import { getLocalDateString } from '../utils/format.utils';

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
    private patientService: PatientService,
    private offlineService: OfflineService
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
      if (navigator.onLine) {
        const { data, error } = await this.supabase.from('transacciones').select('*');
        if (error) throw error;
        if (data) {
          await this.offlineService.clearStore('transacciones');
          for (const t of data) {
            await this.offlineService.saveLocalData('transacciones', t);
          }
          this.transactionsSubject.next(data);
          return;
        }
      }
    } catch (error) {
      console.warn('Network issue, fetching transactions from offline storage:', error);
    }

    const local = await this.offlineService.getLocalData('transacciones');
    this.transactionsSubject.next(local);
  }

  async refreshFacturasSeguro() {
    try {
      if (navigator.onLine) {
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

          await this.offlineService.clearStore('facturas_seguro');
          for (const f of facturas) {
            await this.offlineService.saveLocalData('facturas_seguro', f);
          }
          this.facturasSeguroSubject.next(facturas);
          return;
        }
      }
    } catch (error) {
      console.warn('Network issue, fetching insurance invoices from offline storage:', error);
    }

    const local = await this.offlineService.getLocalData('facturas_seguro');
    this.facturasSeguroSubject.next(local);
  }

  async refreshReportesPagosSeguro() {
    try {
      if (navigator.onLine) {
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

          await this.offlineService.clearStore('reportes_pagos_seguro');
          for (const r of reportes) {
            await this.offlineService.saveLocalData('reportes_pagos_seguro', r);
          }
          this.reportesPagosSeguroSubject.next(reportes);
          return;
        }
      }
    } catch (error) {
      console.warn('Network issue, fetching insurance reports from offline storage:', error);
    }

    const local = await this.offlineService.getLocalData('reportes_pagos_seguro');
    this.reportesPagosSeguroSubject.next(local);
  }

  // --- Transactions ---
  async agregarTransaccion(transaccion: Transaccion) {
    const localTrans = {
      ...transaccion,
      id: transaccion.id || Date.now()
    };

    try {
      // 1. Save locally
      await this.offlineService.saveLocalData('transacciones', localTrans);
      await this.refreshTransactions();

      // 2. Prepare payload
      const dbData = {
        concepto: transaccion.concepto,
        categoria: transaccion.categoria,
        monto: transaccion.monto,
        paciente: transaccion.paciente,
        fecha: transaccion.fecha || new Date().toISOString().split('T')[0]
      };

      if (navigator.onLine) {
        const { error } = await this.supabase.from('transacciones').insert(dbData);
        if (error) throw error;
      } else {
        await this.offlineService.addToQueue('transacciones', 'insert', dbData);
      }
    } catch (error) {
      console.warn('Error saving transaction, queueing write:', error);
      const dbData = {
        concepto: transaccion.concepto,
        categoria: transaccion.categoria,
        monto: transaccion.monto,
        paciente: transaccion.paciente,
        fecha: transaccion.fecha || new Date().toISOString().split('T')[0]
      };
      await this.offlineService.addToQueue('transacciones', 'insert', dbData);
    }
  }

  // --- Billing Logic ---
  async registrarCobro(turno: number, monto: number) {
    try {
      const apps = this.appointmentService.getAppointments();
      const today = getLocalDateString();
      // Search by turno first, fallback to turno+fecha in case of date mismatch
      let cita = apps.find((c: any) => c.turno === turno && c.fecha === today);
      if (!cita) {
        cita = apps.find((c: any) => c.turno === turno);
        if (cita) console.warn(`[FinancialService] Cita found by turno only (fecha mismatch). turno=${turno}, today=${today}, cita.fecha=${cita.fecha}`);
      }

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
    const localFact = {
      ...factura,
      id: factura.id || Date.now()
    };

    try {
      // 1. Save locally
      await this.offlineService.saveLocalData('facturas_seguro', localFact);
      await this.refreshFacturasSeguro();

      // 2. Sync payload
      const dbData = {
        cedula: factura.cedula,
        nombre_paciente: factura.nombrePaciente,
        edad: factura.edad,
        carnet_seguro: factura.carnetSeguro,
        seguro: factura.seguro,
        fecha: factura.fecha,
        monto: factura.monto,
        estado: factura.estado
      };

      if (navigator.onLine) {
        const { error } = await this.supabase.from('facturas_seguro').insert(dbData);
        if (error) throw error;
      } else {
        await this.offlineService.addToQueue('facturas_seguro', 'insert', dbData);
      }
    } catch (error) {
      console.warn('Error saving insurance invoice, queueing write:', error);
      const dbData = {
        cedula: factura.cedula,
        nombre_paciente: factura.nombrePaciente,
        edad: factura.edad,
        carnet_seguro: factura.carnetSeguro,
        seguro: factura.seguro,
        fecha: factura.fecha,
        monto: factura.monto,
        estado: factura.estado
      };
      await this.offlineService.addToQueue('facturas_seguro', 'insert', dbData);
    }
  }

  async marcarFacturaPagada(id: number) {
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Update locally
      const local = await this.offlineService.getLocalData('facturas_seguro');
      const target = local.find(f => f.id === id);
      if (target) {
        target.estado = 'pagado';
        target.fechaPago = today;
        await this.offlineService.saveLocalData('facturas_seguro', target);
        await this.refreshFacturasSeguro();
      }

      // 2. Sync
      const dbPayload = {
        estado: 'pagado',
        fecha_pago: today
      };

      if (navigator.onLine) {
        const { error } = await this.supabase.from('facturas_seguro').update(dbPayload).eq('id', id);
        if (error) throw error;
      } else {
        await this.offlineService.addToQueue('facturas_seguro', 'update', dbPayload, 'id', id);
      }
    } catch (error) {
      console.warn('Error marking invoice paid online, queueing update:', error);
      const today = new Date().toISOString().split('T')[0];
      const dbPayload = {
        estado: 'pagado',
        fecha_pago: today
      };
      await this.offlineService.addToQueue('facturas_seguro', 'update', dbPayload, 'id', id);
    }
  }

  // --- Reports ---
  async agregarReportePagoSeguro(reporte: Partial<ReportePagoSeguro>) {
    const today = new Date().toISOString().split('T')[0];
    const localReport = {
      ...reporte,
      id: reporte.id || Date.now(),
      fechaEnvio: today,
      estado: 'pendiente'
    } as ReportePagoSeguro;

    try {
      // 1. Save locally
      await this.offlineService.saveLocalData('reportes_pagos_seguro', localReport);
      await this.refreshReportesPagosSeguro();

      // 2. Sync
      const dbData = {
        seguro: reporte.seguro,
        mes: reporte.mes,
        monto_enviado: reporte.montoEnviado,
        fecha_envio: today,
        comentario: reporte.comentario,
        estado: 'pendiente'
      };

      if (navigator.onLine) {
        const { error } = await this.supabase.from('reportes_pagos_seguro').insert(dbData);
        if (error) throw error;
      } else {
        await this.offlineService.addToQueue('reportes_pagos_seguro', 'insert', dbData);
      }
    } catch (error) {
      console.warn('Error saving insurance payment report, queueing write:', error);
      const dbData = {
        seguro: reporte.seguro,
        mes: reporte.mes,
        monto_enviado: reporte.montoEnviado,
        fecha_envio: today,
        comentario: reporte.comentario,
        estado: 'pendiente'
      };
      await this.offlineService.addToQueue('reportes_pagos_seguro', 'insert', dbData);
    }
  }

  async registrarPagoRecibido(reporte: ReportePagoSeguro, montoRecibido: number, fechaPago: string) {
    try {
      // 1. Update locally
      const local = await this.offlineService.getLocalData('reportes_pagos_seguro');
      const target = local.find(r => r.id === reporte.id);
      if (target) {
        target.montoRecibido = montoRecibido;
        target.fechaPago = fechaPago;
        target.estado = 'completado';
        await this.offlineService.saveLocalData('reportes_pagos_seguro', target);
        await this.refreshReportesPagosSeguro();
      }

      // Add major ledger entry locally
      const nuevaTrans: Transaccion = {
        id: Date.now(),
        fecha: fechaPago,
        concepto: `Pago ARS: ${reporte.seguro} - ${reporte.mes}`,
        categoria: 'Ingreso',
        monto: montoRecibido
      };
      await this.agregarTransaccion(nuevaTrans);

      // 2. Sync
      const dbPayload = {
        monto_recibido: montoRecibido,
        fecha_pago: fechaPago,
        estado: 'completado'
      };

      if (navigator.onLine) {
        const { error } = await this.supabase.from('reportes_pagos_seguro').update(dbPayload).eq('id', reporte.id);
        if (error) throw error;
      } else {
        await this.offlineService.addToQueue('reportes_pagos_seguro', 'update', dbPayload, 'id', reporte.id);
      }
    } catch (error) {
      console.warn('Error registering payment received online, queueing update:', error);
      const dbPayload = {
        monto_recibido: montoRecibido,
        fecha_pago: fechaPago,
        estado: 'completado'
      };
      await this.offlineService.addToQueue('reportes_pagos_seguro', 'update', dbPayload, 'id', reporte.id);
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
