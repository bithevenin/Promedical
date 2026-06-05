import { Component, OnInit, signal, computed, ViewChild, ElementRef, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AppointmentService, Cita } from '../../services/appointment.service';
import { PatientService, Paciente } from '../../services/patient.service';
import { ConsultationService, Consulta } from '../../services/consultation.service';
import { PrintRecetaService } from '../../services/print-receta.service';
import { AuthService } from '../../services/auth.service';
import { ToastController } from '@ionic/angular';
import { ThemeService } from '../../services/theme.service';
import { getLocalDateString } from '../../utils/format.utils';

@Component({
  selector: 'app-consulta',
  templateUrl: './consulta.page.html',
  standalone: false,
  styleUrls: ['./consulta.page.scss'],
})
export class ConsultaPage implements OnInit {
  @ViewChild('diagnosticoEditor') diagnosticoEditor!: ElementRef;
  @ViewChild('recetaEditor') recetaEditor!: ElementRef;

  activeDropdown: 'font' | 'size' | null = null;

  toggleDropdown(dropdown: 'font' | 'size', event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.activeDropdown === dropdown) {
      this.activeDropdown = null;
    } else {
      this.activeDropdown = dropdown;
    }
  }

  @HostListener('document:click')
  closeDropdowns() {
    this.activeDropdown = null;
  }

  pacientesEspera: Cita[] = [];
  pacienteSeleccionado: Cita | null = null;
  historialPasado: Consulta[] = [];

  currentProfile = signal<any>(null);

  navigationItems = computed(() => {
    const base: any[] = [
      { icon: 'home-outline', label: 'Inicio', route: '/main' },
      { icon: 'grid-outline', label: 'Panel', route: '/dashboard' },
      { icon: 'calendar-outline', label: 'Citas', route: '/citas' },
      { icon: 'people-outline', label: 'Pacientes', route: '/pacientes' }
    ];

    if (this.currentProfile()?.rol === 'doctor' || this.currentProfile()?.rol === 'admin') {
      base.push({ icon: 'medical-outline', label: 'Consulta', active: true, route: '/consulta' });
      base.push({ icon: 'wallet-outline', label: 'Contabilidad', route: '/contabilidad' });
      base.push({ icon: 'settings-outline', label: 'Ajustes', route: '/configuracion' });
    }

    return base;
  });

  // Flag para indicar si es consulta directa (sin cita previa)
  esConsultaDirecta = false;

  // Formulario de consulta
  nuevaConsulta = {
    diagnostico: '',
    receta: '',
    instruccionCobro: 'cobrar' as 'cobrar' | 'seguro' | 'gratis'
  };

  lastActiveEditor: 'diagnostico' | 'receta' | null = null;

  setActiveEditor(editor: 'diagnostico' | 'receta') {
    this.lastActiveEditor = editor;
  }

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
    private appointmentService: AppointmentService,
    private patientService: PatientService,
    private consultationService: ConsultationService,
    private printRecetaService: PrintRecetaService,
    private route: ActivatedRoute,
    private authService: AuthService,
    private toastController: ToastController,
    private router: Router,
    public themeService: ThemeService
  ) { }

  ngOnInit() {
    // Verificar si viene un paciente desde la página de pacientes
    this.route.queryParams.subscribe(params => {
      if (params['cedula']) {
        this.cargarPacienteDirecto(params['cedula']);
      }
    });

    this.appointmentService.appointments$.subscribe(appointments => {
      const now = new Date();
      const offset = now.getTimezoneOffset();
      const localDate = new Date(now.getTime() - (offset * 60 * 1000));
      const today = localDate.toISOString().split('T')[0];

      this.pacientesEspera = appointments.filter(c => 
        (c.estado === 'espera' || c.estado === 'consulta') && c.fecha === today
      );
      // Si hay uno en 'consulta' y no hemos seleccionado ninguno (y no es consulta directa), seleccionarlo automáticamente
      const enConsulta = this.pacientesEspera.find(c => c.estado === 'consulta');
      if (enConsulta && !this.pacienteSeleccionado && !this.esConsultaDirecta) {
        this.seleccionarPaciente(enConsulta);
      }
    });

    this.authService.profile$.subscribe(p => this.currentProfile.set(p));
  }

  cargarPacienteDirecto(cedula: string) {
    const paciente = this.patientService.findPatientByCedula(cedula);
    if (paciente) {
      // Crear una cita temporal para este paciente (consulta directa)
      const citaTemporal: Cita = {
        turno: Date.now(), // Turno único temporal
        nombre: paciente.nombre,
        cedula: paciente.cedula,
        edad: paciente.edad,
        seguro: paciente.seguro,
        sexo: paciente.sexo || 'M',
        fecha: getLocalDateString(),
        estado: 'consulta',
        hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        altura: paciente.altura,
        peso: paciente.peso,
        profesion: paciente.profesion
      };

      this.esConsultaDirecta = true;
      this.pacienteSeleccionado = citaTemporal;
      this.historialPasado = this.consultationService.getPatientHistory(cedula);
      this.nuevaConsulta = { diagnostico: '', receta: '', instruccionCobro: 'cobrar' };
      this.updateEditorContents();
    }
  }

  async seleccionarPaciente(paciente: Cita) {
    this.pacienteSeleccionado = paciente;
    this.historialPasado = this.consultationService.getPatientHistory(paciente.cedula);
    this.nuevaConsulta = { diagnostico: '', receta: '', instruccionCobro: 'cobrar' };
    this.updateEditorContents();

    // Si estaba en espera, pasarlo a consulta
    if (paciente.estado === 'espera') {
      await this.appointmentService.updateAppointmentStatus(paciente.turno, 'consulta');
    }

    // Asegurarnos de que el paciente seleccionado tenga todos los datos clínicos (signos vitales, antecedentes)
    const fullPatient = this.patientService.findPatientByCedula(paciente.cedula);
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
        fecha: getLocalDateString(),
        diagnostico: this.nuevaConsulta.diagnostico,
        receta: this.nuevaConsulta.receta
      };

      await this.consultationService.saveConsultation(consulta);

      // Si es consulta directa (desde página de pacientes), no hay cita que actualizar
      if (!this.esConsultaDirecta) {
        // Pasar a por_pagar con la instrucción de cobro
        await this.appointmentService.updateAppointmentStatus(this.pacienteSeleccionado.turno, 'por_pagar', {
          instruccionCobro: this.nuevaConsulta.instruccionCobro
        });
      }

      // Limpiar
      this.pacienteSeleccionado = null;
      this.historialPasado = [];
      this.nuevaConsulta = { diagnostico: '', receta: '', instruccionCobro: 'cobrar' };
      this.esConsultaDirecta = false;
      this.updateEditorContents();
    }
  }

  // --- Rich Text Editing Toolbar Helpers ---
  savedSelection: Range | null = null;

  saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      // Ensure the selection is within one of our editors
      const host = range.commonAncestorContainer;
      const editor = host.nodeType === 3 ? host.parentNode : host;
      if (editor && (editor as HTMLElement).closest('.rich-textarea-editor')) {
        this.savedSelection = range.cloneRange();
      }
    }
  }

  restoreSelection() {
    if (this.savedSelection) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(this.savedSelection);
      }
    }
  }

  formatText(command: string, value: string = '') {
    if (this.lastActiveEditor) {
      const editorEl = this.lastActiveEditor === 'diagnostico' ? this.diagnosticoEditor : this.recetaEditor;
      if (editorEl && editorEl.nativeElement) {
        editorEl.nativeElement.focus();
        this.restoreSelection();
      }
    }
    document.execCommand(command, false, value);
    // Save selection again after formatting
    this.saveSelection();
  }

  onEditorInput(field: 'diagnostico' | 'receta', event: any) {
    const html = event.target.innerHTML;
    if (field === 'diagnostico') {
      this.nuevaConsulta.diagnostico = html;
    } else {
      this.nuevaConsulta.receta = html;
    }
  }

  updateEditorContents() {
    setTimeout(() => {
      if (this.diagnosticoEditor?.nativeElement) {
        this.diagnosticoEditor.nativeElement.innerHTML = this.nuevaConsulta.diagnostico || '';
      }
      if (this.recetaEditor?.nativeElement) {
        this.recetaEditor.nativeElement.innerHTML = this.nuevaConsulta.receta || '';
      }
    }, 100);
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
      const error = await this.patientService.addSignosVitales(this.pacienteSeleccionado.cedula, {
        ...this.signosForm,
        fecha: new Date().toISOString().split('T')[0]
      });

      if (error) {
        this.presentToast('Error al guardar signos vitales: ' + ((error as any).message || 'Error desconocido'), 'danger');
      } else {
        this.presentToast('Signos vitales guardados con éxito', 'success');
        this.cerrarModalSignos();
        // Recargar datos del paciente para ver el historial actualizado
        const fullPatient = this.patientService.findPatientByCedula(this.pacienteSeleccionado.cedula);
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
    const p = this.patientService.findPatientByCedula(this.pacienteSeleccionado.cedula);
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
      await this.patientService.updateAntecedentes(this.pacienteSeleccionado.cedula, {
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

  getPatientPhoto(cedula: string): string {
    const p = this.patientService.findPatientByCedula(cedula);
    return p?.fotoUrl || '';
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
