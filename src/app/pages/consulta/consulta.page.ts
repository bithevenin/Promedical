import { Component, OnInit, AfterViewInit, signal, computed, ViewChild, ElementRef, HostListener } from '@angular/core';
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
import { SpellCheckService } from '../../services/spell-check.service';

@Component({
  selector: 'app-consulta',
  templateUrl: './consulta.page.html',
  standalone: false,
  styleUrls: ['./consulta.page.scss'],
})
export class ConsultaPage implements OnInit, AfterViewInit {
  @ViewChild('diagnosticoEditor') diagnosticoEditor!: ElementRef;
  @ViewChild('recetaEditor') recetaEditor!: ElementRef;

  activeDropdown: string | null = null;

  toggleDropdown(dropdown: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.activeDropdown === dropdown) {
      this.activeDropdown = null;
    } else {
      this.activeDropdown = dropdown;
    }
  }

  @HostListener('document:click', ['$event'])
  closeDropdowns(event: MouseEvent) {
    const target = event.target as HTMLElement;
    // Close spell popup if clicked outside the popup and not on a spell-error span
    if (this.spellPopup.visible) {
      if (!target.closest('.spell-popup-container') && !target.classList.contains('spell-error')) {
        this.spellPopup.visible = false;
      }
    }
    this.activeDropdown = null;
  }

  // ─── Spell Check State ───────────────────────────────────────────────────────
  spellCheckLoading = true;
  spellPopup: {
    visible: boolean;
    x: number;
    y: number;
    word: string;
    suggestions: string[];
    targetEl: HTMLElement | null;
    field: 'diagnostico' | 'receta';
  } = { visible: false, x: 0, y: 0, word: '', suggestions: [], targetEl: null, field: 'diagnostico' };
  private spellTimers: { [k: string]: any } = {};

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
    public themeService: ThemeService,
    private spellCheckService: SpellCheckService
  ) { }

  ngOnInit() {
    // Inicializar corrector ortográfico español
    this.spellCheckService.initialize().then(() => {
      this.spellCheckLoading = false;
    });

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
      const enConsulta = this.pacientesEspera.find(c => c.estado === 'consulta');
      if (enConsulta && !this.pacienteSeleccionado && !this.esConsultaDirecta) {
        this.seleccionarPaciente(enConsulta);
      }
    });

    this.consultationService.consultations$.subscribe(() => {
      if (this.pacienteSeleccionado) {
        this.historialPasado = this.consultationService.getPatientHistory(this.pacienteSeleccionado.cedula);
      }
    });

    this.authService.profile$.subscribe(p => this.currentProfile.set(p));
  }

  ngAfterViewInit() {
    this.spellCheckService.initialize().then(() => {
      this.spellCheckLoading = false;
      setTimeout(() => {
        if (this.diagnosticoEditor?.nativeElement) {
          this.performSpellCheck(this.diagnosticoEditor.nativeElement, 'diagnostico');
        }
        if (this.recetaEditor?.nativeElement) {
          this.performSpellCheck(this.recetaEditor.nativeElement, 'receta');
        }
      }, 300);
    });
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

  formatText(command: string, value: string | undefined = undefined, editorField?: 'diagnostico' | 'receta') {
    if (editorField) {
      this.lastActiveEditor = editorField;
      const editorEl = editorField === 'diagnostico' ? this.diagnosticoEditor : this.recetaEditor;
      if (editorEl?.nativeElement) {
        editorEl.nativeElement.focus();
      }
    }
    this.restoreSelection();
    document.execCommand(command, false, value);
    const activeField = editorField || this.lastActiveEditor || 'diagnostico';
    const editorEl = activeField === 'diagnostico' ? this.diagnosticoEditor : this.recetaEditor;
    if (editorEl?.nativeElement) {
      if (activeField === 'diagnostico') {
        this.nuevaConsulta.diagnostico = editorEl.nativeElement.innerHTML;
      } else {
        this.nuevaConsulta.receta = editorEl.nativeElement.innerHTML;
      }
    }
  }

  // ─── Estado y Métodos del Ribbon de Word ──────────────────────────────────
  currentFontNames: { [key: string]: string } = { diagnostico: 'Calibri', receta: 'Calibri' };
  currentFontSizes: { [key: string]: number } = { diagnostico: 11, receta: 11 };

  fontList = [
    { name: 'Calibri', font: 'Calibri, sans-serif' },
    { name: 'Arial', font: 'Arial, sans-serif' },
    { name: 'Times New Roman', font: 'Times New Roman, serif' },
    { name: 'Georgia', font: 'Georgia, serif' },
    { name: 'Inter', font: 'Inter, sans-serif' },
    { name: 'Courier New', font: 'Courier New, monospace' },
    { name: 'Verdana', font: 'Verdana, sans-serif' },
    { name: 'Tahoma', font: 'Tahoma, sans-serif' }
  ];

  fontSizeList = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

  colorPalette = [
    { name: 'Negro', color: '#0f172a' },
    { name: 'Rojo', color: '#dc2626' },
    { name: 'Azul', color: '#2563eb' },
    { name: 'Verde', color: '#16a34a' },
    { name: 'Morado', color: '#7c3aed' },
    { name: 'Naranja', color: '#ea580c' },
    { name: 'Blanco', color: '#ffffff' }
  ];

  highlightPalette = [
    { name: 'Amarillo', color: '#fef08a' },
    { name: 'Verde', color: '#bbf7d0' },
    { name: 'Cyan', color: '#a5f3fc' },
    { name: 'Rosa', color: '#fbcfe8' },
    { name: 'Naranja', color: '#fed7aa' },
    { name: 'Sin resaltado', color: 'transparent' }
  ];

  selectFont(fontName: string, field: 'diagnostico' | 'receta') {
    this.currentFontNames[field] = fontName;
    this.formatText('fontName', fontName, field);
    this.activeDropdown = null;
  }

  setFontSizePx(pxSize: number | string, field: 'diagnostico' | 'receta') {
    const sizeNum = Number(pxSize);
    this.currentFontSizes[field] = sizeNum;
    const editorEl = field === 'diagnostico' ? this.diagnosticoEditor : this.recetaEditor;
    if (editorEl?.nativeElement) {
      editorEl.nativeElement.focus();
    }
    this.restoreSelection();

    document.execCommand('fontSize', false, '7');

    if (editorEl?.nativeElement) {
      const fonts = editorEl.nativeElement.querySelectorAll('font[size="7"]');
      fonts.forEach((fontEl: HTMLElement) => {
        const span = document.createElement('span');
        span.style.fontSize = `${sizeNum}px`;
        span.innerHTML = fontEl.innerHTML;
        fontEl.parentNode?.replaceChild(span, fontEl);
      });
    }

    this.onEditorInput(field, { target: editorEl?.nativeElement });
    this.activeDropdown = null;
  }

  changeFontSizeStep(delta: number, field: 'diagnostico' | 'receta') {
    const steps = this.fontSizeList;
    const current = this.currentFontSizes[field] || 11;
    let idx = steps.indexOf(current);
    if (idx === -1) idx = 3; // 11
    const newIdx = Math.max(0, Math.min(steps.length - 1, idx + delta));
    const newSize = steps[newIdx];
    this.setFontSizePx(newSize, field);
  }

  changeCase(mode: 'upper' | 'lower' | 'sentence' | 'title', field: 'diagnostico' | 'receta') {
    const editorEl = field === 'diagnostico' ? this.diagnosticoEditor : this.recetaEditor;
    if (editorEl?.nativeElement) {
      editorEl.nativeElement.focus();
    }
    this.restoreSelection();

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      this.activeDropdown = null;
      return;
    }

    const text = sel.toString();
    if (!text) return;

    let converted = text;
    if (mode === 'upper') {
      converted = text.toUpperCase();
    } else if (mode === 'lower') {
      converted = text.toLowerCase();
    } else if (mode === 'sentence') {
      converted = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    } else if (mode === 'title') {
      converted = text.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    }

    document.execCommand('insertText', false, converted);
    this.activeDropdown = null;
  }

  setTextColor(color: string, field: 'diagnostico' | 'receta') {
    this.formatText('foreColor', color, field);
    this.activeDropdown = null;
  }

  setHighlightColor(color: string, field: 'diagnostico' | 'receta') {
    if (color === 'transparent') {
      this.formatText('removeFormat', undefined, field);
    } else {
      this.formatText('hiliteColor', color, field);
    }
    this.activeDropdown = null;
  }

  indentText(command: 'indent' | 'outdent', field: 'diagnostico' | 'receta') {
    this.formatText(command, undefined, field);
  }

  changeFont(fontName: string) {
    this.formatText('fontName', fontName);
  }

  changeFontSize(size: string) {
    this.formatText('fontSize', size);
  }

  onEditorInput(field: 'diagnostico' | 'receta', event: any) {
    // Guardar HTML limpio (sin marcadores de corrección) en el modelo
    const html = this.getCleanHTML(event.target);
    if (field === 'diagnostico') {
      this.nuevaConsulta.diagnostico = html;
    } else {
      this.nuevaConsulta.receta = html;
    }
    // Programar revisión ortográfica con debounce de 700ms
    this.scheduleSpellCheck(field);
  }

  updateEditorContents() {
    if (this.diagnosticoEditor?.nativeElement) {
      this.diagnosticoEditor.nativeElement.innerHTML = this.nuevaConsulta.diagnostico || '';
      if (this.nuevaConsulta.diagnostico) {
        setTimeout(() => this.performSpellCheck(this.diagnosticoEditor.nativeElement, 'diagnostico'), 200);
      }
    }
    if (this.recetaEditor?.nativeElement) {
      this.recetaEditor.nativeElement.innerHTML = this.nuevaConsulta.receta || '';
      if (this.nuevaConsulta.receta) {
        setTimeout(() => this.performSpellCheck(this.recetaEditor.nativeElement, 'receta'), 200);
      }
    }
  }

  // ─── Métodos de Corrección Ortográfica Real (estilo Word) ────────────────────

  /** Programa revisión ortográfica con debounce de 700ms para no interferir con la escritura */
  scheduleSpellCheck(field: 'diagnostico' | 'receta') {
    clearTimeout(this.spellTimers[field]);
    this.spellTimers[field] = setTimeout(() => {
      const editorEl = field === 'diagnostico' ? this.diagnosticoEditor : this.recetaEditor;
      if (editorEl?.nativeElement) {
        this.performSpellCheck(editorEl.nativeElement, field);
      }
    }, 400);
  }

  /** Realiza la revisión ortográfica en el editor indicado */
  performSpellCheck(el: HTMLElement, field: 'diagnostico' | 'receta') {
    if (!this.spellCheckService.isReady) return;
    if (!el) return;

    const sel = window.getSelection();
    let markerEl: HTMLSpanElement | null = null;

    // 1. Insertar marcador de posición de cursor antes de modificar el DOM
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (el.contains(range.startContainer)) {
        try {
          markerEl = document.createElement('span');
          markerEl.setAttribute('data-cursor-marker', 'true');
          markerEl.style.display = 'none';
          const markerRange = range.cloneRange();
          markerRange.collapse(true);
          markerRange.insertNode(markerEl);
        } catch (e) {
          markerEl = null;
        }
      }
    }

    // 2. Quitar spans de errores anteriores (desenvolver sin borrar texto)
    const existingErrors = Array.from(el.querySelectorAll('.spell-error'));
    for (const span of existingErrors) {
      const parent = span.parentNode;
      if (!parent) continue;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    }
    el.normalize();

    // 3. Recopilar todos los nodos de texto (excluyendo el marcador de cursor)
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = (node as Text).parentElement;
      if (parent?.getAttribute('data-cursor-marker') === 'true') continue;
      textNodes.push(node as Text);
    }

    // 4. Marcar palabras incorrectas
    const wordPattern = /([a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+)/g;
    for (const textNode of textNodes) {
      const text = textNode.textContent || '';
      if (!text.trim()) continue;

      const parts: { text: string; error: boolean }[] = [];
      let lastIdx = 0;
      let m: RegExpExecArray | null;
      wordPattern.lastIndex = 0;

      while ((m = wordPattern.exec(text)) !== null) {
        if (m.index > lastIdx) {
          parts.push({ text: text.slice(lastIdx, m.index), error: false });
        }
        const word = m[0];
        parts.push({ text: word, error: word.length >= 2 && !this.spellCheckService.isCorrect(word) });
        lastIdx = m.index + word.length;
      }
      if (lastIdx < text.length) parts.push({ text: text.slice(lastIdx), error: false });

      if (!parts.some(p => p.error)) continue;

      const fragment = document.createDocumentFragment();
      for (const part of parts) {
        if (!part.error) {
          fragment.appendChild(document.createTextNode(part.text));
        } else {
          const errSpan = document.createElement('span');
          errSpan.className = 'spell-error';
          errSpan.style.textDecoration = 'underline wavy #ef4444';
          errSpan.style.textDecorationThickness = '2px';
          errSpan.style.textUnderlineOffset = '3px';
          errSpan.style.cursor = 'pointer';
          errSpan.style.borderRadius = '2px';
          errSpan.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
          errSpan.setAttribute('data-word', part.text);
          errSpan.textContent = part.text;
          fragment.appendChild(errSpan);
        }
      }
      if (textNode.parentNode) {
        textNode.parentNode.replaceChild(fragment, textNode);
      }
    }

    // 5. Restaurar posición del cursor
    if (markerEl && markerEl.parentNode) {
      try {
        const restoreRange = document.createRange();
        restoreRange.setStartAfter(markerEl);
        restoreRange.collapse(true);
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(restoreRange);
        }
      } catch (e) { /* ignore */ }
      markerEl.parentNode.removeChild(markerEl);
    }
  }

  /** Gestiona el clic en el editor — abre popup de sugerencias al clic en palabra roja */
  onEditorClick(event: MouseEvent, field: 'diagnostico' | 'receta') {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('spell-error')) {
      this.spellPopup.visible = false;
      return;
    }

    event.stopPropagation();
    const word = target.getAttribute('data-word') || target.textContent || '';
    const suggestions = this.spellCheckService.suggest(word);
    const rect = target.getBoundingClientRect();

    this.spellPopup = {
      visible: true,
      x: rect.left,
      y: rect.bottom + 6,
      word,
      suggestions,
      targetEl: target,
      field
    };
  }

  /** Aplica la sugerencia seleccionada, reemplazando la palabra mal escrita */
  applySuggestion(suggestion: string) {
    if (!this.spellPopup.targetEl) return;

    const span = this.spellPopup.targetEl;
    const parent = span.parentNode;
    if (!parent) return;

    const textNode = document.createTextNode(suggestion);
    parent.replaceChild(textNode, span);
    parent.normalize();

    const field = this.spellPopup.field;
    const editorEl = field === 'diagnostico' ? this.diagnosticoEditor : this.recetaEditor;
    if (editorEl?.nativeElement) {
      const cleanHtml = this.getCleanHTML(editorEl.nativeElement);
      if (field === 'diagnostico') {
        this.nuevaConsulta.diagnostico = cleanHtml;
      } else {
        this.nuevaConsulta.receta = cleanHtml;
      }
    }

    this.spellPopup.visible = false;
    this.spellPopup.targetEl = null;
  }

  /** Ignora el error ortográfico de la palabra seleccionada */
  ignoreSpellError() {
    if (this.spellPopup.targetEl) {
      this.spellPopup.targetEl.className = 'spell-ignored';
      this.spellPopup.targetEl.removeAttribute('data-word');
    }
    this.spellPopup.visible = false;
  }

  /** Devuelve el HTML del editor sin marcadores de corrección ortográfica */
  private getCleanHTML(el: HTMLElement): string {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.spell-error, .spell-ignored').forEach(span => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    });
    clone.querySelectorAll('[data-cursor-marker]').forEach(el => el.remove());
    clone.normalize();
    return clone.innerHTML;
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
