import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ConfigService } from './config.service';

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private proxyResendUrl = 'https://corsproxy.io/?https://api.resend.com/emails';
  private defaultResendKey = 're_dyuNoZNR_5gNUZiZEcqpd6G2crrqGLfHS';

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  private sendEmail(toEmail: string, subject: string, html: string): Observable<boolean> {
    if (!toEmail || !toEmail.includes('@')) {
      return of(false);
    }

    const config = this.configService.getConfig();
    const apiKey = this.defaultResendKey;
    const senderEmail = 'promedical@outlook.com'; // Default sender or we can use resend dev email
    const senderName = config.nombreDoctor || 'ProMedical Hub';

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    });

    const body = {
      from: `${senderName} <onboarding@resend.dev>`,
      to: [toEmail],
      subject: subject,
      html: html,
      reply_to: config.email || senderEmail
    };

    return this.http.post(this.proxyResendUrl, body, { headers }).pipe(
      map((res: any) => {
        console.log('✅ Correo enviado exitosamente:', res);
        return true;
      }),
      catchError((err) => {
        console.warn('⚠️ Error al enviar correo:', err.error || err);
        return of(false);
      })
    );
  }

  sendCierreTurnoReport(params: {
    toEmail: string;
    fecha: string;
    totalIngresos: number;
    totalGastos: number;
    balanceNeto: number;
    totalPacientes: number;
    segurosUsados: number;
    deudaAseguradoras: number;
    detalleSeguros: { seguro: string; cantidad: number; monto: number }[];
  }): Observable<boolean> {
    const config = this.configService.getConfig();
    const senderName = config.nombreDoctor || 'ProMedical';
    const subject = `Resumen Cierre de Turno - ${params.fecha} | ${senderName}`;
    
    let segurosHtml = '';
    if (params.detalleSeguros.length > 0) {
      segurosHtml = `
        <h3 style="color: #3b82f6; border-bottom: 1px solid #333; padding-bottom: 8px;">Detalle de Seguros (ARS):</h3>
        <ul style="list-style: none; padding: 0;">
          ${params.detalleSeguros.map(s => `
            <li style="background: #1e3a8a; padding: 10px; margin-bottom: 8px; border-radius: 8px; border-left: 4px solid #3b82f6;">
              <strong>${s.seguro}</strong>: ${s.cantidad} paciente(s) - Cobertura esperada: <strong>RD$${s.monto.toLocaleString('es-DO')}</strong>
            </li>
          `).join('')}
        </ul>
      `;
    } else {
      segurosHtml = `<p style="color: #aaaaaa; font-style: italic;">No se registraron pacientes con seguro en este turno.</p>`;
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #121212; color: #ffffff; padding: 24px; border-radius: 16px; border: 1px solid #3b82f6;">
        <h2 style="color: #3b82f6; margin-top: 0; text-align: center;">Reporte de Cierre de Turno 🔒</h2>
        <p>Se ha realizado el cierre de caja administrativo correspondiente a la fecha: <strong>${params.fecha}</strong>.</p>
        
        <div style="background: #1e1e1e; padding: 16px; border-radius: 12px; margin: 20px 0; border: 1px solid #3b82f6;">
          <p style="margin: 8px 0; font-size: 16px;"><strong>Resumen Financiero (Efectivo)</strong></p>
          <p style="margin: 4px 0;">Total Ingresado: <span style="color: #22c55e; font-weight: bold;">RD$${params.totalIngresos.toLocaleString('es-DO')}</span></p>
          <p style="margin: 4px 0;">Total Gastos: <span style="color: #ef4444; font-weight: bold;">RD$${params.totalGastos.toLocaleString('es-DO')}</span></p>
          <p style="margin: 8px 0; border-top: 1px dashed #444; padding-top: 8px;"><strong>Efectivo Neto:</strong> <span style="color: #3b82f6; font-size: 18px; font-weight: bold;">RD$${params.balanceNeto.toLocaleString('es-DO')}</span></p>
        </div>

        <div style="background: #1e1e1e; padding: 16px; border-radius: 12px; margin: 20px 0; border: 1px solid #8b5cf6;">
          <p style="margin: 8px 0; font-size: 16px;"><strong>Métricas del Turno</strong></p>
          <p style="margin: 4px 0;">Pacientes Atendidos: <strong>${params.totalPacientes}</strong></p>
          <p style="margin: 4px 0;">Pacientes con Seguro: <strong>${params.segurosUsados}</strong></p>
          <p style="margin: 4px 0;">Total Deuda Aseguradoras (Por cobrar): <span style="color: #f59e0b; font-weight: bold;">RD$${params.deudaAseguradoras.toLocaleString('es-DO')}</span></p>
        </div>

        ${segurosHtml}

        <p style="color: #aaaaaa; font-size: 13px; text-align: center; margin-top: 20px;">Este es un reporte automático generado por ProMedical.</p>
      </div>
    `;

    return this.sendEmail(params.toEmail, subject, html);
  }
}
