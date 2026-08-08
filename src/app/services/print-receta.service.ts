import { Injectable } from '@angular/core';
import {
  LOGO_CENTRO_MEDICO,
  SIMBOLO_RX,
  SELLO_DOCTOR,
  FONDO_RINONES
} from '../assets/receta-images.constants';

interface DatosReceta {
  pacienteNombre: string;
  pacienteEdad: number;
  pacienteSexo: string;
  receta: string;
}

@Injectable({
  providedIn: 'root'
})
export class PrintRecetaService {

  constructor() { }

  imprimirReceta(datos: DatosReceta) {
    try {
      const fecha = new Date().toLocaleDateString('es-DO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const htmlContent = `
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
      margin: 25px 0;
      gap: 20px;
    }
 
    .rx-symbol {
      width: 80px;
      height: 80px;
      flex-shrink: 0;
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
      <span>drmiguelthevenin@gmail.com</span>
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

      // Crear ventana de impresión
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();

        // Esperar a que carguen las imágenes base64
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
        }, 500);
      } else {
        console.error('No se pudo abrir la ventana de impresión. Por favor, permita las ventanas emergentes (popups) para este sitio.');
        alert('No se pudo abrir la ventana de impresión. Por favor, permita las ventanas emergentes (popups) en la configuración de su navegador para imprimir la receta.');
      }
    } catch (error) {
      console.error('Error al intentar imprimir la receta:', error);
      alert('Ocurrió un error inesperado al intentar generar la impresión de la receta médica.');
    }
  }

  // Aquí irán los métodos para obtener las imágenes en base64
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
