import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CitasService, Cita, Consulta, Paciente } from '../../services/citas.service';
import { PrintRecetaService } from '../../services/print-receta.service';
import { AuthService } from '../../services/auth.service';
import { ToastController } from '@ionic/angular';
import { signal } from '@angular/core';

@Component({
  selector: 'app-consulta',
  templateUrl: './consulta.page.html',
  standalone: false,
  styleUrls: ['./consulta.page.scss'],
})
export class ConsultaPage implements OnInit {
  pacientesEspera: Cita[] = [];
  pacienteSeleccionado: Cita | null = null;
  historialPasado: Consulta[] = [];

  currentProfile = signal<any>(null);

  // Flag para indicar si es consulta directa (sin cita previa)
  esConsultaDirecta = false;

  // Formulario de consulta
  nuevaConsulta = {
    diagnostico: '',
    receta: '',
    instruccionCobro: 'cobrar' as 'cobrar' | 'seguro' | 'gratis'
  };

  // Signos Vitales Modal
  showVitalSignsModal = false;
  signosForm = {
    presionArterial: '',
    frecuenciaCardiaca: 0,
    temperatura: 0,
    peso: 0,
    talla: 0,
    imc: 0
  };

  // Antecedentes Modal
  showAntecedentesModal = false;
  antecedentesForm = {
    personales: '',
    familiares: '',
    alergias: ''
  };

  constructor(
    private citasService: CitasService,
    private printRecetaService: PrintRecetaService,
    private route: ActivatedRoute,
    private authService: AuthService,
    private toastController: ToastController,
    private router: Router
  ) { }

  ngOnInit() {
    // Verificar si viene un paciente desde la página de pacientes
    this.route.queryParams.subscribe(params => {
      if (params['cedula']) {
        this.cargarPacienteDirecto(params['cedula']);
      }
    });

    this.citasService.appointments$.subscribe(appointments => {
      this.pacientesEspera = appointments.filter(c => c.estado === 'espera' || c.estado === 'consulta');
      // Si hay uno en 'consulta' y no hemos seleccionado ninguno (y no es consulta directa), seleccionarlo automáticamente
      const enConsulta = this.pacientesEspera.find(c => c.estado === 'consulta');
      if (enConsulta && !this.pacienteSeleccionado && !this.esConsultaDirecta) {
        this.seleccionarPaciente(enConsulta);
      }
    });

    this.authService.profile$.subscribe(p => this.currentProfile.set(p));
  }

  cargarPacienteDirecto(cedula: string) {
    const paciente = this.citasService.findPatientByCedula(cedula);
    if (paciente) {
      // Crear una cita temporal para este paciente (consulta directa)
      const citaTemporal: Cita = {
        turno: Date.now(), // Turno único temporal
        nombre: paciente.nombre,
        cedula: paciente.cedula,
        edad: paciente.edad,
        seguro: paciente.seguro,
        sexo: paciente.sexo || 'M',
        fecha: new Date().toISOString().split('T')[0],
        estado: 'consulta',
        hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        altura: paciente.altura,
        peso: paciente.peso,
        profesion: paciente.profesion
      };

      this.esConsultaDirecta = true;
      this.pacienteSeleccionado = citaTemporal;
      this.historialPasado = this.citasService.getPatientHistory(cedula);
    }
  }

  async seleccionarPaciente(paciente: Cita) {
    this.pacienteSeleccionado = paciente;
    this.historialPasado = this.citasService.getPatientHistory(paciente.cedula);

    // Si estaba en espera, pasarlo a consulta
    if (paciente.estado === 'espera') {
      await this.citasService.updateAppointmentStatus(paciente.turno, 'consulta');
    }

    // Asegurarnos de que el paciente seleccionado tenga todos los datos clínicos (signos vitales, antecedentes)
    const fullPatient = this.citasService.findPatientByCedula(paciente.cedula);
    if (fullPatient) {
      this.pacienteSeleccionado = {
        ...this.pacienteSeleccionado,
        signosVitales: fullPatient.signosVitales,
        antecedentesPersonales: fullPatient.antecedentesPersonales,
        antecedentesFamiliares: fullPatient.antecedentesFamiliares,
        alergias: fullPatient.alergias
      };
    }
  }

  async finalizarConsulta() {
    if (this.pacienteSeleccionado && this.nuevaConsulta.diagnostico) {
      const consulta: Consulta = {
        cedula: this.pacienteSeleccionado.cedula,
        fecha: new Date().toLocaleDateString(),
        diagnostico: this.nuevaConsulta.diagnostico,
        receta: this.nuevaConsulta.receta
      };

      await this.citasService.saveConsultation(consulta);

      // Si es consulta directa (desde página de pacientes), no hay cita que actualizar
      if (!this.esConsultaDirecta) {
        // Pasar a por_pagar con la instrucción de cobro
        await this.citasService.updateAppointmentStatus(this.pacienteSeleccionado.turno, 'por_pagar', {
          instruccionCobro: this.nuevaConsulta.instruccionCobro
        });
      }

      // Limpiar
      this.pacienteSeleccionado = null;
      this.historialPasado = [];
      this.nuevaConsulta = { diagnostico: '', receta: '', instruccionCobro: 'cobrar' };
      this.esConsultaDirecta = false;
    }
  }

  imprimirReceta() {
    if (this.pacienteSeleccionado && this.nuevaConsulta.receta) {
      this.printRecetaService.imprimirReceta({
        pacienteNombre: this.pacienteSeleccionado.nombre,
        pacienteEdad: this.pacienteSeleccionado.edad,
        receta: this.nuevaConsulta.receta
      });
    } else {
      alert('Por favor ingrese la receta antes de imprimir.');
    }
  }

  // --- Signos Vitales ---
  abrirModalSignos() {
    if (!this.pacienteSeleccionado) return;
    this.showVitalSignsModal = true;
  }

  cerrarModalSignos() {
    this.showVitalSignsModal = false;
  }

  calcularIMC() {
    if (this.signosForm.peso > 0 && this.signosForm.talla > 30) {
      const tallaMeters = this.signosForm.talla / 100;
      const imcVal = this.signosForm.peso / (tallaMeters * tallaMeters);
      this.signosForm.imc = Number(Math.min(imcVal, 99.9).toFixed(1));
    } else {
      this.signosForm.imc = 0;
    }
  }

  async guardarSignos() {
    if (this.pacienteSeleccionado) {
      const error = await this.citasService.addSignosVitales(this.pacienteSeleccionado.cedula, {
        ...this.signosForm,
        fecha: new Date().toLocaleDateString()
      });

      if (error) {
        this.presentToast('Error al guardar signos vitales: ' + (error.message || 'Error desconocido'), 'danger');
      } else {
        this.presentToast('Signos vitales guardados con éxito', 'success');
        this.cerrarModalSignos();
        // Recargar datos del paciente para ver el historial actualizado
        const fullPatient = this.citasService.findPatientByCedula(this.pacienteSeleccionado.cedula);
        if (fullPatient && this.pacienteSeleccionado) {
          this.pacienteSeleccionado.signosVitales = fullPatient.signosVitales;
        }
        // Reset form
        this.signosForm = { presionArterial: '', frecuenciaCardiaca: 0, temperatura: 0, peso: 0, talla: 0, imc: 0 };
      }
    }
  }

  // --- Antecedentes ---
  abrirModalAntecedentes() {
    if (!this.pacienteSeleccionado) return;

    // Cargar datos actuales del paciente al formulario
    const p = this.citasService.findPatientByCedula(this.pacienteSeleccionado.cedula);
    if (p) {
      this.antecedentesForm = {
        personales: p.antecedentesPersonales || '',
        familiares: p.antecedentesFamiliares || '',
        alergias: p.alergias || ''
      };
    }

    this.showAntecedentesModal = true;
  }

  cerrarModalAntecedentes() {
    this.showAntecedentesModal = false;
  }

  async guardarAntecedentes() {
    if (this.pacienteSeleccionado) {
      await this.citasService.updateAntecedentes(this.pacienteSeleccionado.cedula, {
        personales: this.antecedentesForm.personales,
        familiares: this.antecedentesForm.familiares,
        alergias: this.antecedentesForm.alergias
      });

      this.presentToast('Antecedentes actualizados con éxito', 'success');
      this.cerrarModalAntecedentes();

      // Actualizar vista local
      if (this.pacienteSeleccionado) {
        this.pacienteSeleccionado.antecedentesPersonales = this.antecedentesForm.personales;
        this.pacienteSeleccionado.antecedentesFamiliares = this.antecedentesForm.familiares;
        this.pacienteSeleccionado.alergias = this.antecedentesForm.alergias;
      }
    }
  }

  async presentToast(message: string, color: 'success' | 'danger' | 'info') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color: color === 'info' ? 'primary' : color,
      position: 'bottom',
      cssClass: 'custom-toast'
    });
    await toast.present();
  }

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/auth/login']);
  }
}
