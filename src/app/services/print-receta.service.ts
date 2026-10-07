import { Injectable } from '@angular/core';
import {
  LOGO_CENTRO_MEDICO,
  SIMBOLO_RX,
  SELLO_DOCTOR,
  FONDO_RINONES
} from '../assets/receta-images.constants';

export interface DatosReceta {
  pacienteNombre: string;
  pacienteEdad: number;
  pacienteSexo: string;
  receta: string;
}

export interface PrinterConfig {
  selectedPrinter: string; // '' = predeterminada
  silent: boolean;         // true = sin diálogos ni modales
  pageSize: 'Letter' | 'A4' | 'Legal' | 'Ticket';
  landscape: boolean;
  copies: number;
  margins: 'none' | 'default' | 'minimum';
  printBackground: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PrintRecetaService {

  private readonly STORAGE_KEY = 'promedical_printer_config';

  private defaultConfig: PrinterConfig = {
    selectedPrinter: '',
    silent: true,
    pageSize: 'Letter',
    landscape: false,
    copies: 1,
    margins: 'none',
    printBackground: true
  };

  constructor() { }

  private get electronApi(): any {
    return (window as any).electronAPI;
  }

  isElectron(): boolean {
    return !!this.electronApi?.isElectron;
  }

  async getPrinters(): Promise<any[]> {
    if (this.isElectron() && this.electronApi?.getPrinters) {
      try {
        return await this.electronApi.getPrinters();
      } catch (e) {
        console.error('Error al consultar impresoras desde Electron:', e);
      }
    }
    return [];
  }

  async getPrinterConfig(): Promise<PrinterConfig> {
    if (this.isElectron() && this.electronApi?.getPrinterConfig) {
      try {
        const cfg = await this.electronApi.getPrinterConfig();
        if (cfg) return { ...this.defaultConfig, ...cfg };
      } catch (e) {
        console.warn('Error al leer configuración de impresora desde Electron:', e);
      }
    }

    // Fallback a localStorage
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return { ...this.defaultConfig, ...JSON.parse(stored) };
      }
    } catch (e) {}

    return { ...this.defaultConfig };
  }

  async savePrinterConfig(config: PrinterConfig): Promise<boolean> {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
      if (this.isElectron() && this.electronApi?.savePrinterConfig) {
        await this.electronApi.savePrinterConfig(config);
      }
      return true;
    } catch (e) {
      console.error('Error al guardar configuración de impresora:', e);
      return false;
    }
  }

  async imprimirHtml(html: string, customOptions?: Partial<PrinterConfig>): Promise<{ success: boolean; error?: string }> {
    const config = await this.getPrinterConfig();
    const finalOptions: PrinterConfig = { ...config, ...(customOptions || {}) };

    // Si estamos en entorno Electron, usamos el motor nativo directo
    if (this.isElectron() && this.electronApi?.printHtml) {
      try {
        const res = await this.electronApi.printHtml({
          html,
          printerName: finalOptions.selectedPrinter,
          silent: finalOptions.silent,
          copies: finalOptions.copies,
          pageSize: finalOptions.pageSize === 'Ticket' ? { width: 80000, height: 297000 } : finalOptions.pageSize,
          landscape: finalOptions.landscape,
          margins: finalOptions.margins,
          printBackground: finalOptions.printBackground
        });
        return res;
      } catch (err: any) {
        console.error('Error en printHtml Electron:', err);
        return { success: false, error: err?.message || 'Error al comunicarse con la impresora' };
      }
    }

    // Fallback para navegador web (modo iframe silencioso o ventana emergente)
    return new Promise((resolve) => {
      try {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow?.document;
        if (!doc) {
          throw new Error('No se pudo acceder al documento del iframe de impresión');
        }

        doc.open();
        doc.write(html);
        doc.close();

        iframe.onload = () => {
          setTimeout(() => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
              setTimeout(() => {
                iframe.remove();
                resolve({ success: true });
              }, 1500);
            } catch (err: any) {
              iframe.remove();
              resolve({ success: false, error: err?.message });
            }
          }, 300);
        };
      } catch (err: any) {
        console.error('Error en impresión fallback:', err);
        resolve({ success: false, error: err?.message });
      }
    });
  }

  generarRecetaHtml(datos: DatosReceta): string {
    const fecha = new Date().toLocaleDateString('es-DO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receta Médica - Dr. Miguel Thevenin</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    @page {
      size: letter;
      margin: 0;
    }

    body {
      font-family: 'Times New Roman', Times, serif;
      width: 8.5in;
      height: 11in;
      padding: 0.5in;
      margin: 0;
      position: relative;
    }

    .fondo-rinones {
      position: fixed;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 450px;
      height: auto;
      opacity: 0.15;
      z-index: -1;
      pointer-events: none;
    }

    .header {
      text-align: center;
      margin-bottom: 15px;
    }

    .doctor-name {
      font-size: 26px;
      font-weight: bold;
      color: #1e40af;
      margin-bottom: 5px;
    }

    .especialidad {
      font-size: 18px;
      color: #334155;
      margin-bottom: 0;
    }
 
    .logo-centro {
      height: 60px;
      margin: 5px 0;
    }
 
    .contact-info {
      font-size: 11px;
      line-height: 1.6;
      color: #1e293b;
      margin: 10px 0;
      padding: 10px;
      border-top: 2px solid #3b82f6;
      border-bottom: 2px solid #3b82f6;
    }
 
    .contact-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
 
    .contact-label {
      font-weight: bold;
      min-width: 200px;
    }
 
    .rx-section {
      display: flex;
      align-items: flex-start;
      margin: 15px 0;
      gap: 20px;
    }
 
    .rx-symbol {
      width: 80px;
      height: 80px;
      flex-shrink: 0;
    }
 
    .patient-info {
      flex-grow: 1;
    }
 
    .patient-field {
      margin-bottom: 8px;
      font-size: 14px;
    }
 
    .patient-label {
      font-weight: bold;
      color: #1e40af;
    }
 
    .receta-content {
      min-height: 300px;
      padding: 10px 0;
      border: none;
      background: transparent;
      margin: 10px 0;
      font-size: 15px;
      line-height: 1.8;
      white-space: pre-wrap;
    }
 
    .footer {
      position: absolute;
      bottom: 0.5in;
      left: 0.5in;
      right: 0.5in;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
 
    .sello {
      width: 150px;
      height: 150px;
    }
 
    .firma-box {
      text-align: center;
    }
 
    .firma-line {
      width: 250px;
      border-top: 2px solid #000;
      margin-top: 60px;
      margin-bottom: 5px;
    }
 
    .firma-text {
      font-size: 12px;
      color: #475569;
    }
 
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <img class="fondo-rinones" src="data:image/png;base64,${this.getFondoRinones()}" alt="">
  <div class="header">
    <div class="doctor-name">Dr. Miguel Thevenin</div>
    <div class="especialidad">Cirujano-Urólogo</div>
    <img class="logo-centro" src="data:image/png;base64,${this.getLogoCentro()}" alt="Centro Médico Padre Fantino">
  </div>
 
  <div class="contact-info">
    <div class="contact-row">
      <span class="contact-label">Calle Gral. Juan Rodríguez esquina padre Fantino.</span>
      <span>CMPF. 809-573-2533 ext. 264</span>
    </div>
    <div class="contact-row">
      <span class="contact-label">La Vega, República Dominicana.</span>
      <span>Consultorio 809-242-4800</span>
    </div>
    <div class="contact-row">
      <span class="contact-label">Consultorio 304</span>
      <span>Cel. 809-864-2307</span>
    </div>
    <div class="contact-row">
      <span class="contact-label">Egresado de Medicina en la Universidad Central del Este</span>
      <span><strong>Correo:</strong> drmiguelthevenin@gmail.com</span>
    </div>
    <div class="contact-row">
      <span class="contact-label">Postgrado Urología HRUJMCYB, Ministerio de Salud Pública.</span>
      <span></span>
    </div>
    <div class="contact-row">
      <span class="contact-label">Pontificia Universidad Católica Madre y Maestra.</span>
      <span></span>
    </div>
    <div class="contact-row">
      <span class="contact-label">Exequatur. 370-94</span>
      <span>RNC. 04700029822</span>
    </div>
    <div class="contact-row">
      <span class="contact-label">CMD. 12265</span>
      <span></span>
    </div>
  </div>
 
  <div class="rx-section">
    <img class="rx-symbol" src="data:image/png;base64,${this.getRxSymbol()}" alt="Rx">
    <div class="patient-info">
      <div class="patient-field">
        <span class="patient-label">Fecha:</span> ${fecha}
      </div>
      <div class="patient-field">
        <span class="patient-label">Nombre:</span> ${datos.pacienteNombre}
      </div>
      <div class="patient-field">
        <span class="patient-label">Edad:</span> ${datos.pacienteEdad} años
      </div>
      <div class="patient-field">
        <span class="patient-label">Sexo:</span> ${datos.pacienteSexo}
      </div>
    </div>
  </div>
 
  <div class="receta-content">
${datos.receta}
  </div>
 
  <div class="footer">
    <img class="sello" src="data:image/png;base64,${this.getSelloDoctor()}" alt="Sello">
    <div class="firma-box">
      <div class="firma-line"></div>
      <div class="firma-text">Firma del Médico</div>
    </div>
  </div>
</body>
</html>
    `;
  }

  async imprimirReceta(datos: DatosReceta): Promise<{ success: boolean; error?: string }> {
    try {
      const html = this.generarRecetaHtml(datos);
      return await this.imprimirHtml(html);
    } catch (error: any) {
      console.error('Error al intentar imprimir la receta:', error);
      return { success: false, error: error?.message || 'Error inesperado al imprimir' };
    }
  }

  async imprimirPaginaPrueba(printerName?: string): Promise<{ success: boolean; error?: string }> {
    const fechaHora = new Date().toLocaleString('es-DO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Página de Prueba de Impresión - ProMedical</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      padding: 40px;
      color: #0f172a;
      background: #ffffff;
      box-sizing: border-box;
    }
    .card {
      border: 2px solid #2563eb;
      border-radius: 16px;
      padding: 30px;
      max-width: 650px;
      margin: 0 auto;
      text-align: center;
    }
    .title {
      font-size: 24px;
      font-weight: 900;
      color: #1d4ed8;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: 13px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 24px;
    }
    .info-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      text-align: left;
      font-size: 13px;
      line-height: 1.8;
      margin-bottom: 20px;
    }
    .badge {
      display: inline-block;
      background: #10b981;
      color: #ffffff;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 15px;
    }
    .footer-note {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 15px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✓ Conexión Exitosa</div>
    <div class="title">ProMedical System</div>
    <div class="subtitle">Prueba de Impresión Directa Electron</div>

    <div class="info-box">
      <div><strong>Impresora Utilizada:</strong> ${printerName || 'Predeterminada del Sistema de Windows'}</div>
      <div><strong>Fecha y Hora de Emisión:</strong> ${fechaHora}</div>
      <div><strong>Estado del Canal de Hardware:</strong> Activo / Operativo (Silent Direct Print)</div>
      <div><strong>Sistema:</strong> ProMedical Desktop v2.3.7</div>
    </div>

    <p style="font-size: 13px; color: #334155; font-weight: 600;">
      ¡Excelente! Si estás leyendo este documento, la configuración de impresión directa en ProMedical está funcionando a la perfección.
    </p>

    <div class="footer-note">
      ProMedical Clinical System &bull; La Vega, República Dominicana &bull; Dr. Miguel Thevenin
    </div>
  </div>
</body>
</html>
    `;

    return await this.imprimirHtml(html, { selectedPrinter: printerName });
  }

  // Métodos para obtener las imágenes en base64
  private getLogoCentro(): string {
    return LOGO_CENTRO_MEDICO;
  }

  private getRxSymbol(): string {
    return SIMBOLO_RX;
  }

  private getSelloDoctor(): string {
    return SELLO_DOCTOR;
  }

  private getFondoRinones(): string {
    return FONDO_RINONES;
  }
}
