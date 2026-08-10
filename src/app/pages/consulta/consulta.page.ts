import { Component, OnInit, signal, computed, ViewChild, ElementRef, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AppointmentService } from '../../services/appointment.service';
import { PatientService } from '../../services/patient.service';
import { ConsultationService } from '../../services/consultation.service';
import { PrintRecetaService } from '../../services/print-receta.service';
import { AuthService } from '../../services/auth.service';
import { Cita, Paciente, Consulta, UserProfile } from '../../models';
import { SignoVital } from '../../models/patient.model';
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

  currentProfile = signal<UserProfile | null>(null);

  navigationItems = computed(() => {
    const base: { icon: string; label: string; route: string; active?: boolean }[] = [
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

    if (this.currentProfile()?.rol === 'secretaria' || this.currentProfile()?.rol === 'admin' || this.currentProfile()?.rol === 'doctor') {      base.push({ icon: 'lock-closed-outline', label: 'Turno', route: '/cierre-turno' });    }    return base;
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
    imc: 0,
    saturacionOxigeno: 0
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

    // Actualizar historial del paciente seleccionado en tiempo real
    this.consultationService.consultations$.subscribe(() => {
      if (this.pacienteSeleccionado) {
        this.historialPasado = this.consultationService.getPatientHistory(this.pacienteSeleccionado.cedula);
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

    if (paciente.estado === 'espera') {
      await this.appointmentService.updateAppointmentStatus(paciente.turno, 'consulta');
    }

    let fullPatient = this.patientService.findPatientByCedula(paciente.cedula);
    if (!fullPatient && paciente.nombre) {
      fullPatient = this.patientService.getPatients().find(p => p.nombre.toLowerCase().trim() === paciente.nombre.toLowerCase().trim());
    }

    if (fullPatient) {
      this.pacienteSeleccionado = {
        ...this.pacienteSeleccionado,
        cedula: fullPatient.cedula || this.pacienteSeleccionado.cedula,
        signosVitales: fullPatient.signosVitales || this.pacienteSeleccionado.signosVitales,
        antecedentesPersonales: fullPatient.antecedentesPersonales || (fullPatient as any).antecedentes_personales || this.pacienteSeleccionado.antecedentesPersonales,
        antecedentesFamiliares: fullPatient.antecedentesFamiliares || (fullPatient as any).antecedentes_familiares || this.pacienteSeleccionado.antecedentesFamiliares,
        alergias: fullPatient.alergias || this.pacienteSeleccionado.alergias
      };
      (this.pacienteSeleccionado as any).antecedentes_personales = this.pacienteSeleccionado.antecedentesPersonales;
      (this.pacienteSeleccionado as any).antecedentes_familiares = this.pacienteSeleccionado.antecedentesFamiliares;
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

      if (!this.esConsultaDirecta) {
        await this.appointmentService.updateAppointmentStatus(this.pacienteSeleccionado.turno, 'por_pagar', {
          instruccionCobro: this.nuevaConsulta.instruccionCobro
        });
      }

      this.pacienteSeleccionado = null;
      this.historialPasado = [];
      this.nuevaConsulta = { diagnostico: '', receta: '', instruccionCobro: 'cobrar' };
      this.esConsultaDirecta = false;
      this.updateEditorContents();
    }
  }

  savedSelection: Range | null = null;

  saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      this.savedSelection = sel.getRangeAt(0).cloneRange();
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

  formatText(command: string, value: string | undefined = undefined) {
    this.restoreSelection();
    document.execCommand(command, false, value);
    const editorEl = this.lastActiveEditor === 'diagnostico' ? this.diagnosticoEditor : this.recetaEditor;
    if (editorEl?.nativeElement) {
      if (this.lastActiveEditor === 'diagnostico') {
        this.nuevaConsulta.diagnostico = editorEl.nativeElement.innerHTML;
      } else {
        this.nuevaConsulta.receta = editorEl.nativeElement.innerHTML;
      }
    }
  }

  changeFont(fontName: string) {
    this.formatText('fontName', fontName);
  }

  changeFontSize(size: string) {
    this.formatText('fontSize', size);
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
    if (this.diagnosticoEditor?.nativeElement) {
      this.diagnosticoEditor.nativeElement.innerHTML = this.nuevaConsulta.diagnostico || '';
    }
    if (this.recetaEditor?.nativeElement) {
      this.recetaEditor.nativeElement.innerHTML = this.nuevaConsulta.receta || '';
    }
  }

  imprimirReceta() {
    if (this.pacienteSeleccionado && this.nuevaConsulta.receta) {
      this.printRecetaService.imprimirReceta({
        pacienteNombre: this.pacienteSeleccionado.nombre,
        pacienteEdad: this.pacienteSeleccionado.edad,
        pacienteSexo: this.pacienteSeleccionado.sexo || 'M',
        receta: this.nuevaConsulta.receta
      });
    } else {
      alert('Por favor ingrese la receta antes de imprimir.');
    }
  }

  abrirModalSignos() {
    this.signosForm = { presionArterial: '', frecuenciaCardiaca: 0, temperatura: 0, peso: 0, talla: 0, imc: 0, saturacionOxigeno: 0 };
    this.showVitalSignsModal = true;
  }

  cerrarModalSignos() {
    this.showVitalSignsModal = false;
  }

  async guardarSignosVitales() {
    if (this.pacienteSeleccionado) {
      const sv: SignoVital = {
        fecha: getLocalDateString(),
        presionArterial: this.signosForm.presionArterial,
        frecuenciaCardiaca: Number(this.signosForm.frecuenciaCardiaca) || 0,
        temperatura: Number(this.signosForm.temperatura) || 0,
        peso: Number(this.signosForm.peso) || 0,
        talla: Number(this.signosForm.talla) || 0,
        imc: Number(this.signosForm.imc) || 0,
        saturacionOxigeno: Number(this.signosForm.saturacionOxigeno) || 0
      };

      await this.patientService.addSignosVitales(this.pacienteSeleccionado.cedula, sv);
      this.presentToast('Signos vitales guardados con éxito', 'success');
      this.cerrarModalSignos();

      const fullPatient = this.patientService.findPatientByCedula(this.pacienteSeleccionado.cedula);
      if (fullPatient && this.pacienteSeleccionado && fullPatient.signosVitales) {
        this.pacienteSeleccionado.signosVitales = [...fullPatient.signosVitales];
      }
      this.signosForm = { presionArterial: '', frecuenciaCardiaca: 0, temperatura: 0, peso: 0, talla: 0, imc: 0, saturacionOxigeno: 0 };
    }
  }

  abrirModalAntecedentes() {
    if (!this.pacienteSeleccionado) return;

    let p = this.patientService.findPatientByCedula(this.pacienteSeleccionado.cedula);
    if (!p && this.pacienteSeleccionado.nombre) {
      p = this.patientService.getPatients().find(pt => pt.nombre.toLowerCase().trim() === this.pacienteSeleccionado!.nombre.toLowerCase().trim());
    }
    const source = p || this.pacienteSeleccionado;

    this.antecedentesForm = {
      personales: source.antecedentesPersonales || (source as any).antecedentes_personales || '',
      familiares: source.antecedentesFamiliares || (source as any).antecedentes_familiares || '',
      alergias: source.alergias || ''
    };

    this.showAntecedentesModal = true;
  }

  cerrarModalAntecedentes() {
    this.showAntecedentesModal = false;
  }

  async guardarAntecedentes() {
    if (!this.pacienteSeleccionado) return;

    let p = this.patientService.findPatientByCedula(this.pacienteSeleccionado.cedula);
    if (!p && this.pacienteSeleccionado.nombre) {
      p = this.patientService.getPatients().find(pt => pt.nombre.toLowerCase().trim() === this.pacienteSeleccionado!.nombre.toLowerCase().trim());
    }
    const targetCedula = p?.cedula || this.pacienteSeleccionado.cedula;

    await this.patientService.updateAntecedentes(targetCedula, {
      personales: this.antecedentesForm.personales,
      familiares: this.antecedentesForm.familiares,
      alergias: this.antecedentesForm.alergias
    });

    this.pacienteSeleccionado.antecedentesPersonales = this.antecedentesForm.personales;
    (this.pacienteSeleccionado as any).antecedentes_personales = this.antecedentesForm.personales;
    this.pacienteSeleccionado.antecedentesFamiliares = this.antecedentesForm.familiares;
    (this.pacienteSeleccionado as any).antecedentes_familiares = this.antecedentesForm.familiares;
    this.pacienteSeleccionado.alergias = this.antecedentesForm.alergias;

    this.presentToast('Antecedentes actualizados con éxito', 'success');
    this.cerrarModalAntecedentes();
  }

  showDetalleConsultaModal = false;
  consultaDetalleSeleccionada: Consulta | null = null;

  verDetalleConsulta(consulta: Consulta) {
    this.consultaDetalleSeleccionada = consulta;
    this.showDetalleConsultaModal = true;
  }

  cerrarModalDetalleConsulta() {
    this.showDetalleConsultaModal = false;
    this.consultaDetalleSeleccionada = null;
  }

  imprimirRecetaHistorica() {
    if (this.pacienteSeleccionado && this.consultaDetalleSeleccionada?.receta) {
      this.printRecetaService.imprimirReceta({
        pacienteNombre: this.pacienteSeleccionado.nombre,
        pacienteEdad: this.pacienteSeleccionado.edad,
        pacienteSexo: this.pacienteSeleccionado.sexo || 'M',
        receta: this.consultaDetalleSeleccionada.receta
      });
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

  formatFechaLegible(fechaStr: string | null | undefined): string {
    if (!fechaStr) return '-';
    
    if (!fechaStr.includes('T') && !fechaStr.includes(':')) {
      const parts = fechaStr.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        }
        return fechaStr;
      }
    }
    return fechaStr;
  }

  private vitalsStyle(level: 'normal' | 'warning' | 'danger'): { border: string; dot: string; text: string; label: string } {
    const map = {
      normal:  { border: 'border-emerald-500/40', dot: 'bg-emerald-400', text: 'text-emerald-400', label: '' },
      warning: { border: 'border-amber-400/50',   dot: 'bg-amber-400',   text: 'text-amber-400',   label: '' },
      danger:  { border: 'border-red-500/50',      dot: 'bg-red-400',     text: 'text-red-400',     label: '' },
    };
    return map[level];
  }

  evalPresion(value: string): { border: string; dot: string; text: string; label: string } {
    if (!value || !value.includes('/')) return this.vitalsStyle('normal');
    const [sys, dia] = value.split('/').map(Number);
    if (isNaN(sys) || isNaN(dia)) return this.vitalsStyle('normal');
    // Hipotensión
    if (sys < 90 || dia < 60) return { ...this.vitalsStyle('warning'), label: 'Presión baja (hipotensión)' };
    // Normal
    if (sys <= 120 && dia <= 80) return { ...this.vitalsStyle('normal'), label: 'Normal ✓' };
    // Elevada
    if (sys <= 129 && dia < 80) return { ...this.vitalsStyle('warning'), label: 'Presión elevada' };
    // HTA Etapa 1
    if (sys <= 139 || dia <= 89) return { ...this.vitalsStyle('warning'), label: 'Hipertensión Etapa 1' };
    // HTA Etapa 2 o crisis
    return { ...this.vitalsStyle('danger'), label: sys >= 180 || dia >= 120 ? '⚠ Crisis hipertensiva' : 'Hipertensión Etapa 2' };
  }

  evalSatO2(value: number): { border: string; dot: string; text: string; label: string } {
    if (!value || value === 0) return this.vitalsStyle('normal');
    if (value >= 95) return { ...this.vitalsStyle('normal'), label: 'Normal ✓' };
    if (value >= 90) return { ...this.vitalsStyle('warning'), label: 'Hipoxia leve' };
    return { ...this.vitalsStyle('danger'), label: '⚠ Hipoxia severa' };
  }

  evalPulso(value: number): { border: string; dot: string; text: string; label: string } {
    if (!value || value === 0) return this.vitalsStyle('normal');
    if (value < 60) return { ...this.vitalsStyle('warning'), label: 'Bradicardia' };
    if (value <= 100) return { ...this.vitalsStyle('normal'), label: 'Normal ✓' };
    if (value <= 120) return { ...this.vitalsStyle('warning'), label: 'Taquicardia leve' };
    return { ...this.vitalsStyle('danger'), label: '⚠ Taquicardia severa' };
  }

  evalTemp(value: number): { border: string; dot: string; text: string; label: string } {
    if (!value || value === 0) return this.vitalsStyle('normal');
    if (value < 35) return { ...this.vitalsStyle('danger'), label: '⚠ Hipotermia' };
    if (value < 36.5) return { ...this.vitalsStyle('warning'), label: 'Hipotermia leve' };
    if (value <= 37.3) return { ...this.vitalsStyle('normal'), label: 'Normal ✓' };
    if (value <= 38) return { ...this.vitalsStyle('warning'), label: 'Febrícula' };
    if (value <= 39) return { ...this.vitalsStyle('warning'), label: 'Fiebre moderada' };
    return { ...this.vitalsStyle('danger'), label: '⚠ Fiebre alta' };
  }

  formatearPresion(event: Event) {
    const input = event.target as HTMLInputElement;
    // Remove anything that's not a digit or slash
    let raw = input.value.replace(/[^\d/]/g, '');

    // Remove extra slashes, keep only one
    const parts = raw.split('/');
    const systolic = parts[0].slice(0, 3);   // Max 3 digits for systolic (e.g. 120)
    const diastolic = parts[1]?.slice(0, 2) ?? ''; // Max 2 digits for diastolic (e.g. 80)

    let formatted = systolic;

    // Auto-add slash when systolic reaches 3 digits or user typed a slash
    if (systolic.length === 3 || (parts.length > 1)) {
      formatted = systolic + '/' + diastolic;
    }

    input.value = formatted;
    this.signosForm.presionArterial = formatted;
  }

  calcularIMC() {
    if (this.signosForm.peso > 0 && this.signosForm.talla > 0) {
      const tallaMeters = this.signosForm.talla / 100;
      const imcVal = this.signosForm.peso / (tallaMeters * tallaMeters);
      this.signosForm.imc = Number(Math.min(imcVal, 999.9).toFixed(1));
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
        const errMsg = (error as any)?.message || String(error);
        this.presentToast('Error al guardar signos vitales: ' + errMsg, 'danger');
      } else {
        this.presentToast('Signos vitales guardados con éxito', 'success');
        this.cerrarModalSignos();
        const fullPatient = this.patientService.findPatientByCedula(this.pacienteSeleccionado.cedula);
        if (fullPatient && this.pacienteSeleccionado && fullPatient.signosVitales) {
          this.pacienteSeleccionado.signosVitales = [...fullPatient.signosVitales];
        }
        this.signosForm = { presionArterial: '', frecuenciaCardiaca: 0, temperatura: 0, peso: 0, talla: 0, imc: 0, saturacionOxigeno: 0 };
      }
    }
  }

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/auth/login']);
  }
}
