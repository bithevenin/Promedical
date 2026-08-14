import { Component, OnInit, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { PatientService } from '../../services/patient.service';
import { ConsultationService } from '../../services/consultation.service';
import { ConfigService } from '../../services/config.service';
import { AuthService } from '../../services/auth.service';
import { Paciente, Consulta, UserProfile } from '../../models';
import { formatMonto, parseJCEDate } from '../../utils/format.utils';
import { ToastController, AlertController } from '@ionic/angular';
import { ThemeService } from '../../services/theme.service';
import jsPDF from 'jspdf';

interface JceResult {
  fotoUrl?: string;
  nombreCompleto?: string;
  nombres?: string;
  apellido1?: string;
  apellido2?: string;
  fechaNacimiento?: string;
  sexo?: string;
  ocupacion?: string;
  ocupación?: string;
  direccion?: string;
  dirección?: string;
  lugarNacimiento?: string;
}

@Component({
  selector: 'app-pacientes',
  templateUrl: './pacientes.page.html',
  standalone: false,
  styleUrls: ['./pacientes.page.scss'],
})
export class PacientesPage implements OnInit {
  pacientes: Paciente[] = [];
  filtroNombre: string = '';
  displayLimit: number = 50;

  onFiltroChange(valor: string) {
    this.filtroNombre = valor;
    this.displayLimit = 50;
    this.actualizarFiltro();
  }

  currentProfile = signal<UserProfile | null>(null);

  navigationItems = computed(() => {
    const base: { icon: string; label: string; route: string; active?: boolean }[] = [
      { icon: 'home-outline', label: 'Inicio', route: '/main' },
      { icon: 'grid-outline', label: 'Panel', route: '/dashboard' },
      { icon: 'calendar-outline', label: 'Citas', route: '/citas' }
    ];

    if (this.currentProfile()?.rol === 'doctor' || this.currentProfile()?.rol === 'admin') {
      base.push({ icon: 'people-outline', label: 'Pacientes', active: true, route: '/pacientes' });
      base.push({ icon: 'medical-outline', label: 'Consulta', route: '/consulta' });
      base.push({ icon: 'wallet-outline', label: 'Contabilidad', route: '/contabilidad' });
      base.push({ icon: 'settings-outline', label: 'Ajustes', route: '/configuracion' });
    }

    if (this.currentProfile()?.rol === 'secretaria' || this.currentProfile()?.rol === 'admin' || this.currentProfile()?.rol === 'doctor') {      base.push({ icon: 'lock-closed-outline', label: 'Turno', route: '/cierre-turno' });    }    return base;
  });

  // Modals state
  showHistoryModal = false;
  showEditModal = false;
  showCartasModal = false;
  pacienteAEliminar: Paciente | null = null;
  confirmarEliminarTodos = false;

  // Consent letters state
  cartasFiltroPaciente: string = '';
  cartaPacienteSeleccionado: Paciente | null = null;
  tipoCartaSeleccionada: 'litiasis' | 'cistoscopia' | 'doble_j' = 'litiasis';
  cartaMedicoNombre: string = '';
  cartaMedicoColegiado: string = '';
  cartaCiudad: string = 'La Vega';
  cartaFecha: string = '';

  // Print Studio options
  showPrintStudioModal = false;
  opcionTamanoPapel: 'letter' | 'a4' | 'legal' = 'letter';
  opcionTamanoFuente: 'normal' | 'mediana' | 'grande' = 'normal';
  opcionMargen: 'estandar' | 'estrecho' = 'estandar';
  opcionIncluirMembrete: boolean = true;
  opcionIncluirEtiqueta: boolean = true;
  opcionIncluirTestigo: boolean = true;
  opcionIncluirRevocacion: boolean = true;

  pacienteSeleccionado: Paciente | null = null;
  historialPaciente: Consulta[] = [];

  // Tab control in History Modal
  activeTab: 'consultas' | 'clinico' = 'consultas';

  // Vital Signs Form
  nuevosSignos = {
    presionArterial: '',
    frecuenciaCardiaca: 0,
    temperatura: 0,
    peso: 0,
    talla: 0,
    imc: 0
  };

  // Edit Form
  editData: Paciente = {
    cedula: '',
    nombre: '',
    edad: 0,
    fecha_nacimiento: '',
    profesion: '',
    seguro: '',
    sexo: 'M',
    altura: '',
    peso: '',
    telefono: '',
    email: '',
    antecedentesPersonales: '',
    antecedentesFamiliares: '',
    alergias: '',
    tipo_sangre: '',
    fotoUrl: '',
    direccion: ''
  };

  isLoadingJce = false;
  cargandoFotos = false;

  listaSeguros: string[] = ['Particular'];

  constructor(
    private patientService: PatientService,
    private consultationService: ConsultationService,
    private configService: ConfigService,
    private router: Router,
    private authService: AuthService,
    private toastController: ToastController,
    private alertController: AlertController,
    public themeService: ThemeService
  ) { }

  private fotosCargadasEnSesion = false;

  ngOnInit() {
    this.patientService.patients$.subscribe(patients => {
      this.pacientes = patients;
      this.actualizarFiltro();
      // Iniciar la carga suave de fotos solo una vez por sesión para evitar bucles de actualización
      if (!this.fotosCargadasEnSesion && !this.cargandoFotos && patients.length > 0) {
        this.fotosCargadasEnSesion = true;
        this.cargarFotosEnSegundoPlano();
      }
    });

    this.authService.profile$.subscribe(p => this.currentProfile.set(p));

    this.configService.config$.subscribe(config => {
      this.listaSeguros = ['Particular', ...config.tarifasSeguros.map(t => t.seguro)];
    });
  }

  /** Silently fetches photos from the backend server for patients that have no fotoUrl.
   *  The backend returns cached photos (base64 data URIs) without re-scraping the JCE.
   *  Base64 photos are used in-memory for display; only proper URL strings are persisted to Supabase.
   */
  async cargarFotosEnSegundoPlano() {
    if (this.cargandoFotos) return;
    this.cargandoFotos = true;

    // Solo cargar fotos para los pacientes que se están mostrando actualmente en pantalla
    const visibles = this.pacientesFiltrados;
    const sinFoto = visibles.filter((p: Paciente) => !p.fotoUrl && p.cedula);
    
    // Cargar en lotes pequeños de hasta 10 por tanda
    const lote = sinFoto.slice(0, 10);

    for (const paciente of lote) {
      try {
        const result = await this.patientService.consultarJCE(paciente.cedula) as JceResult;
        if (result && result.fotoUrl) {
          // Update the in-memory reference so the UI re-renders immediately
          paciente.fotoUrl = result.fotoUrl;

          // Persistir el paciente con la foto en la base de datos (Supabase e IndexedDB)
          await this.patientService.savePatient({ ...paciente });
        }
      } catch {
        // Silently ignore errors for individual patients
      }
      // Small throttle to avoid overwhelming the backend
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    this.cargandoFotos = false;
  }

  pacientesFiltradosTodos: Paciente[] = [];

  private searchTimeout: any;

  actualizarFiltro() {
    const term = (this.filtroNombre || '').trim().toLowerCase();
    
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    if (!term) {
      this.pacientesFiltradosTodos = [...this.pacientes];
      // Cargar fotos para la lista inicial visible
      this.cargarFotosEnSegundoPlano();
      return;
    }

    this.searchTimeout = setTimeout(async () => {
      if (navigator.onLine && term.length >= 2) {
        this.pacientesFiltradosTodos = await this.patientService.buscarPacientesRemoto(term);
      } else {
        this.pacientesFiltradosTodos = this.pacientes.filter(p =>
          p.nombre.toLowerCase().includes(term) ||
          (p.cedula && p.cedula.includes(this.filtroNombre))
        );
      }
      // Cargar fotos para los resultados visibles de la búsqueda
      this.cargarFotosEnSegundoPlano();
    }, 300);
  }

  get pacientesFiltrados() {
    return this.pacientesFiltradosTodos.slice(0, this.displayLimit);
  }

  onScroll(event: any) {
    const element = event.target;
    if (element.scrollHeight - element.scrollTop <= element.clientHeight + 100) {
      if (this.displayLimit < this.pacientesFiltradosTodos.length) {
        this.displayLimit += 50;
        // Cargar fotos para el nuevo lote cargado visible
        this.cargarFotosEnSegundoPlano();
      }
    }
  }

  async verHistorial(paciente: Paciente) {
    this.pacienteSeleccionado = paciente;
    this.historialPaciente = []; // Limpiamos mientras carga
    this.showHistoryModal = true;
    this.historialPaciente = await this.consultationService.cargarHistorialPaciente(paciente.cedula);
  }

  editarPaciente(paciente: Paciente) {
    this.pacienteSeleccionado = paciente;
    this.editData = {
      ...paciente,
      antecedentesPersonales: paciente.antecedentesPersonales || (paciente as any).antecedentes_personales || '',
      antecedentesFamiliares: paciente.antecedentesFamiliares || (paciente as any).antecedentes_familiares || ''
    };
    this.showEditModal = true;
  }

  eliminarPaciente(paciente: Paciente) {
    this.pacienteAEliminar = paciente;
  }

  async confirmarEliminacion() {
    if (this.pacienteAEliminar) {
      await this.patientService.deletePatient(this.pacienteAEliminar.cedula);
      this.presentToast('Paciente eliminado exitosamente', 'success');
      this.pacienteAEliminar = null;
    }
  }

  async buscarJCE() {
    if (!this.editData.cedula) {
      this.presentToast('Por favor, ingrese una cédula.', 'danger');
      return;
    }
    this.isLoadingJce = true;
    try {
      const result = await this.patientService.consultarJCE(this.editData.cedula) as JceResult;
      if (result) {
        // Nombre
        this.editData.nombre = result.nombreCompleto ||
          `${result.nombres || ''} ${result.apellido1 || ''} ${result.apellido2 || ''}`.trim().replace(/\s+/g, ' ');

        // Fecha de nacimiento: JCE devuelve "M/D/YYYY h:mm:ss AM/PM"
        if (result.fechaNacimiento) {
          this.editData.fecha_nacimiento = parseJCEDate(result.fechaNacimiento);
          if (this.editData.fecha_nacimiento) {
            this.editData.edad = this.patientService.calcularEdad(this.editData.fecha_nacimiento);
          }
        }

        // Sexo: la API devuelve "F" o "M"
        if (result.sexo) {
          const s = result.sexo.trim().toUpperCase();
          this.editData.sexo = s.startsWith('F') ? 'F' : 'M';
        }

        // Ocupación: la API JCE no incluye este campo directamente
        if (result.ocupacion || result.ocupación) {
          this.editData.profesion = result.ocupacion || result.ocupación || '';
        }

        // Dirección
        this.editData.direccion = result.direccion || result.dirección ||
          [result.lugarNacimiento].filter(Boolean).join(', ') || '';

        // Foto
        this.editData.fotoUrl = result.fotoUrl || this.editData.fotoUrl || '';

        this.presentToast('¡Datos de la cédula cargados con éxito!', 'success');
      }
    } catch (error: any) {
      this.presentToast('Error al consultar cédula JCE: ' + (error?.message || error), 'danger');
    } finally {
      this.isLoadingJce = false;
    }
  }

  async guardarCambios() {
    if (this.editData.nombre) {
      if (this.editData.fecha_nacimiento) {
        this.editData.edad = this.patientService.calcularEdad(this.editData.fecha_nacimiento);
      }
      await this.patientService.savePatient(this.editData);
      this.closeModals();
    }
  }

  eliminarTodosLosPacientes() {
    this.confirmarEliminarTodos = true;
  }

  async confirmarEliminacionTodos() {
    await this.patientService.deleteAllPatients();
    this.presentToast('Todos los pacientes han sido eliminados.', 'success');
    this.confirmarEliminarTodos = false;
  }

  closeModals() {
    this.showHistoryModal = false;
    this.showEditModal = false;
    this.showCartasModal = false;
    this.showPrintStudioModal = false;
    this.pacienteSeleccionado = null;
    this.pacienteAEliminar = null;
    this.confirmarEliminarTodos = false;
    this.activeTab = 'consultas';
  }

  abrirModalCartas() {
    this.cartaPacienteSeleccionado = null;
    this.cartasFiltroPaciente = '';
    this.tipoCartaSeleccionada = 'litiasis';
    
    // Load defaults directly from master configuration settings
    const config = this.configService.getConfig();
    this.cartaMedicoNombre = config?.nombreDoctor || this.currentProfile()?.nombre || '';
    this.cartaMedicoColegiado = config?.exequatur || '';
    this.cartaCiudad = localStorage.getItem('default_carta_ciudad') || 'La Vega';
    
    // Current date in YYYY-MM-DD
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    this.cartaFecha = `${year}-${month}-${day}`;
    
    this.showCartasModal = true;
  }

  seleccionarPacienteCarta(paciente: Paciente) {
    this.cartaPacienteSeleccionado = paciente;
    this.cartasFiltroPaciente = '';
  }

  get pacientesFiltradosCartas() {
    if (!this.cartasFiltroPaciente) return [];
    return this.pacientes.filter(p =>
      p.nombre.toLowerCase().includes(this.cartasFiltroPaciente.toLowerCase()) ||
      p.cedula.includes(this.cartasFiltroPaciente)
    );
  }

  getFormattedDateText() {
    if (!this.cartaFecha) return '____ de ____________ de 20___';
    const parts = this.cartaFecha.split('-');
    if (parts.length !== 3) return '____ de ____________ de 20___';
    
    const day = parseInt(parts[2], 10);
    const monthIndex = parseInt(parts[1], 10) - 1;
    const year = parts[0];
    
    const months = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];
    
    return `${day} de ${months[monthIndex]} de ${year}`;
  }

  abrirEstudioImpresion() {
    if (!this.cartaPacienteSeleccionado) {
      this.presentToast('Por favor seleccione un paciente para previsualizar.', 'danger');
      return;
    }
    localStorage.setItem('default_carta_ciudad', this.cartaCiudad);
    this.showPrintStudioModal = true;
  }

  getConsentTemplateData() {
    const templates = {
      litiasis: {
        titulo: 'Cirugía de la litiasis urinaria',
        p1: 'EN QUÉ CONSISTE Y PARA QUÉ SIRVE: Consiste en la eliminación de los cálculos (piedras) localizados en el riñón, el uréter o la vejiga urinaria. Dependiendo de las características individuales (localización, tamaño y dureza del cálculo), se puede realizar mediante técnicas endourológicas (fragmentación con láser a través de conductos urinarios naturales), litotricia extracorpórea por ondas de choque (LEOC), nefrolitotomía percutánea o cirugía abierta.',
        p2: 'CÓMO SE REALIZA: El procedimiento se realiza en quirófano bajo anestesia general o regional. Se accede de forma endoscópica a través de la uretra y vejiga para fragmentar el cálculo e instalar de manera temporal un catéter (Doble J) para proteger la vía urinaria alta, o se realiza incisión percutánea lumbar/abdominal directa.',
        p3: 'EFECTOS Y BENEFICIOS: Se espera erradicar la obstrucción del conducto urinario, calmar dolores cólicos intensos, prevenir el daño renal irreversible y evitar infecciones generalizadas graves. Tras la intervención, es común orinar sangre de forma transitoria y sentir molestias miccionales leves.',
        p4: 'RIESGOS Y ALTERNATIVAS: La alternativa médica inicial es la observación farmacológica de expulsión o la LEOC si está indicado. Los riesgos principales incluyen: hematuria persistente, infección renal (sepsis de origen urinario), estenosis o estrechez de la vía urinaria alta a largo plazo, y perforación accidental del uréter que requiera reparación quirúrgica.'
      },
      cistoscopia: {
        titulo: 'Cistoscopia, cateterismo ureteral y pielografía retrógrada',
        p1: 'EN QUÉ CONSISTE Y PARA QUÉ SIRVE: Consiste en la exploración visual directa del interior de la uretra y de la vejiga urinaria (cistoscopia) usando un fino endoscopio rígido o flexible, seguido de la introducción de una pequeña sonda (catéter) en el conducto ureteral y la administración de contraste radiológico opaco para delimitar y fotografiar por rayos X la vía urinaria alta (riñón y uréter).',
        p2: 'CÓMO SE REALIZA: Se ejecuta en quirófano de forma ambulatoria o bajo sedación/anestesia regional. Se irriga y lubrica la uretra para pasar el endoscopio sin dolor. Una vez localizado el conducto ureteral, se avanza el catéter y se inyecta el medio de contraste para registrar las radiografías correspondientes.',
        p3: 'EFECTOS Y BENEFICIOS: Permite un diagnóstico definitivo e inmediato de obstrucciones, tumores, estrecheces o malformaciones en la vía urinaria. Tras el procedimiento, el paciente suele experimentar escozor leve al orinar, orina ligeramente rosada y espasmos vesicales transitorios.',
        p4: 'RIESGOS Y ALTERNATIVAS: Como alternativas existen la ecografía, el TAC urinario (Uro-TAC) y la resonancia magnética, aunque no aportan la precisión visual interna o posibilidad de manipulación que ofrece este procedimiento. Los riesgos comunes son: infección urinaria ascendente (pielonefritis), retención de orina post-procedimiento, sangrado moderado y perforación de la vía urinaria (uretra o uréter).'
      },
      doble_j: {
        titulo: 'Colocación doble J',
        p1: 'EN QUÉ CONSISTE Y PARA QUÉ SIRVE: Consiste en colocar un catéter plástico, flexible y biocompatible en el interior del uréter (conducto que une el riñón con la vejiga). Tiene forma de espiral en ambos extremos (J) para auto-retenerse y evitar desplazamientos. Su función principal es servir de bypass interno para garantizar la salida de la orina desde el riñón y evitar su colapso u obstrucción.',
        p2: 'CÓMO SE REALIZA: Se coloca por vía endoscópica (cistoscopia) bajo sedación o anestesia regional. Bajo control de rayos X en tiempo real, se pasa una guía de alambre y se hace progresar el catéter hasta la pelvis renal, quedando el extremo inferior flotando dentro de la vejiga.',
        p3: 'EFECTOS Y BENEFICIOS: Permite resolver inmediatamente la retención de orina del riñón, evitando la pionefrosis (infección con pus) o atrofia renal irreversible. Es habitual sentir ardor leve al orinar, ganas frecuentes de micción (polaquiuria), y sangre en la orina asociada al movimiento físico.',
        p4: 'RIESGOS Y ALTERNATIVAS: La alternativa más común es la nefrostomía percutánea (colocar un catéter externo directo al riñón a través de la espalda y conectado a una bolsa). Los riesgos principales de la colocación de doble J son: migración o desplazamiento del catéter, colonización bacteriana/infección, calcificación del catéter si se excede el tiempo médico indicado, y espasmos urinarios intensos.'
      }
    };
    return templates[this.tipoCartaSeleccionada];
  }

  imprimirDirecto() {
    const printElement = document.getElementById('print-document-sheet');
    if (!printElement) return;

    const windowPrint = window.open('', '', 'left=0,top=0,width=850,height=900,toolbar=0,scrollbars=1,status=0');
    if (!windowPrint) return;

    windowPrint.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Consentimiento Informado - ${this.cartaPacienteSeleccionado?.nombre || ''}</title>
          <style>
            @page { size: ${this.opcionTamanoPapel}; margin: ${this.opcionMargen === 'estrecho' ? '10mm' : '15mm'}; }
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 20px; line-height: 1.5; font-size: ${this.opcionTamanoFuente === 'grande' ? '13px' : this.opcionTamanoFuente === 'mediana' ? '12px' : '11px'}; }
            * { box-sizing: border-box; }
            .bg-white { background: #fff !important; }
            .text-slate-900 { color: #0f172a !important; }
            .text-blue-700 { color: #1d4ed8 !important; }
            .text-blue-800 { color: #1e40af !important; }
            .text-blue-900 { color: #1e3a8a !important; }
            .text-blue-950 { color: #172554 !important; }
            .text-slate-400 { color: #94a3b8 !important; }
            .text-slate-500 { color: #64748b !important; }
            .text-slate-600 { color: #475569 !important; }
            .text-slate-700 { color: #334155 !important; }
            .text-slate-800 { color: #1e293b !important; }
            .bg-slate-50 { background-color: #f8fafc !important; }
            .bg-blue-50 { background-color: #eff6ff !important; }
            .border-slate-200 { border-color: #e2e8f0 !important; }
            .border-blue-600 { border-color: #2563eb !important; }
            .border-b-2 { border-bottom-width: 2px !important; border-bottom-style: solid !important; }
            .border-l-4 { border-left-width: 4px !important; border-left-style: solid !important; }
            .border { border: 1px solid #cbd5e1 !important; }
            .p-3 { padding: 12px !important; }
            .p-4 { padding: 16px !important; }
            .mb-3 { margin-bottom: 12px !important; }
            .mb-4 { margin-bottom: 16px !important; }
            .my-4 { margin-top: 16px !important; margin-bottom: 16px !important; }
            .mt-6 { margin-top: 24px !important; }
            .grid { display: grid !important; }
            .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
            .gap-4 { gap: 16px !important; }
            .rounded-md { border-radius: 6px !important; }
            .flex { display: flex !important; }
            .justify-between { justify-content: space-between !important; }
            .items-center { align-items: center !important; }
            .text-right { text-align: right !important; }
            .text-justify { text-align: justify !important; }
            .italic { font-style: italic !important; }
            .font-bold { font-weight: 700 !important; }
            .font-black { font-weight: 900 !important; }
            .uppercase { text-transform: uppercase !important; }
            .h-28 { height: 110px !important; }
            .flex-col { flex-direction: column !important; }
            .border-t { border-top: 1px solid #cbd5e1 !important; }
            .border-dashed { border-style: dashed !important; }
            .pt-1 { padding-top: 4px !important; }
            .text-center { text-align: center !important; }
            .mt-4 { margin-top: 16px !important; }
            .border-rose-200 { border-color: #fecdd3 !important; }
            .bg-rose-50\/60 { background-color: #fff1f2 !important; }
            .text-rose-800 { color: #9f1239 !important; }
            .text-rose-900\/80 { color: #881337 !important; }
          </style>
        </head>
        <body>
          ${printElement.innerHTML}
        </body>
      </html>
    `);

    windowPrint.document.close();
    windowPrint.focus();
    setTimeout(() => {
      windowPrint.print();
      windowPrint.close();
    }, 500);
  }

  generarCartaWord() {
    if (!this.cartaPacienteSeleccionado) {
      this.presentToast('Por favor seleccione un paciente.', 'danger');
      return;
    }

    const printElement = document.getElementById('print-document-sheet');
    if (!printElement) return;

    const patientName = this.cartaPacienteSeleccionado.nombre.replace(/\s+/g, '_');
    const filename = `Consentimiento_${this.tipoCartaSeleccionada}_${patientName}.doc`;

    const header = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word' 
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>Consentimiento Informado - ${this.cartaPacienteSeleccionado.nombre}</title>
        <style>
          @page { size: ${this.opcionTamanoPapel}; margin: ${this.opcionMargen === 'estrecho' ? '10mm' : '15mm'}; }
          body { font-family: 'Arial', sans-serif; color: #1e293b; line-height: 1.5; font-size: ${this.opcionTamanoFuente === 'grande' ? '12pt' : this.opcionTamanoFuente === 'mediana' ? '11pt' : '10pt'}; }
          p { margin-bottom: 10pt; text-align: justify; }
          .border-b-2 { border-bottom: 2pt solid #1d4ed8; padding-bottom: 8pt; margin-bottom: 12pt; }
          .text-blue-700 { color: #1d4ed8; font-weight: bold; }
          .text-blue-800 { color: #1e40af; font-weight: bold; }
          .text-blue-900 { color: #1e3a8a; font-weight: bold; }
          .bg-slate-50 { background-color: #f8fafc; border: 1pt solid #cbd5e1; padding: 8pt; margin-bottom: 12pt; border-radius: 4pt; }
          .bg-blue-50 { background-color: #eff6ff; border-left: 4pt solid #1d4ed8; padding: 8pt; margin: 12pt 0; }
          .grid { width: 100%; margin-top: 15pt; }
          .grid-cols-2 { display: table; width: 100%; table-layout: fixed; }
          .grid-cols-2 > div { display: table-cell; width: 48%; vertical-align: top; border: 1pt solid #cbd5e1; background: #fafafa; padding: 8pt; height: 90pt; }
          .grid-cols-2 > div:first-child { margin-right: 4%; }
          .border-rose-200 { border: 1pt solid #fecdd3; background: #fff1f2; padding: 8pt; margin-top: 12pt; border-radius: 4pt; }
          .text-rose-800 { color: #9f1239; font-weight: bold; }
        </style>
      </head>
      <body>
    `;

    const footer = `</body></html>`;
    const sourceHTML = header + printElement.innerHTML + footer;

    const blob = new Blob(['\ufeff', sourceHTML], {
      type: 'application/msword'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.presentToast('Documento editable de Word (.doc) generado.', 'success');
  }

  generarCartaPDF() {
    if (!this.cartaPacienteSeleccionado) {
      this.presentToast('Por favor seleccione un paciente.', 'danger');
      return;
    }

    localStorage.setItem('default_carta_ciudad', this.cartaCiudad);

    const pdfFormat = this.opcionTamanoPapel === 'legal' ? 'legal' : this.opcionTamanoPapel === 'a4' ? 'a4' : 'letter';
    const doc = new jsPDF({ format: pdfFormat });

    const patientName = this.cartaPacienteSeleccionado.nombre;
    const patientCedula = this.cartaPacienteSeleccionado.cedula;
    const docName = this.cartaMedicoNombre;
    const colNumber = this.cartaMedicoColegiado || 'N/A';
    const dateText = this.getFormattedDateText();
    const city = this.cartaCiudad;

    const selectedTmpl = this.getConsentTemplateData();
    const marginX = this.opcionMargen === 'estrecho' ? 10 : 15;
    const baseFontSize = this.opcionTamanoFuente === 'grande' ? 10 : this.opcionTamanoFuente === 'mediana' ? 9 : 8.5;

    let currentY = 48;

    const drawHeaderAndFooter = () => {
      if (this.opcionIncluirMembrete) {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('CONSENTIMIENTO INFORMADO', marginX, 14);

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(48, 113, 203);
        doc.text(selectedTmpl.titulo.toUpperCase(), marginX, 19);

        doc.setFontSize(12);
        doc.text('PROMEDICAL', 160, 19);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7);
        doc.text('Grupo Hospitalario', 160, 22);

        doc.setDrawColor(220, 220, 220);
        doc.line(marginX, 25, 210 - marginX, 25);
      }

      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text('Este documento es confidencial y de uso estrictamente médico-legal.', marginX, 285);
      
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.text(`Página ${pageCount}`, 180, 285);
    };

    const printParagraph = (text: string, style: 'normal' | 'bold' | 'italic' = 'normal', size = baseFontSize, indent = 0) => {
      doc.setFont('Helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(60, 60, 60);
      const splitText = doc.splitTextToSize(text, 210 - marginX * 2 - indent);
      const neededHeight = splitText.length * size * 0.3527 * 1.4;
      
      if (currentY + neededHeight > 270) {
        doc.addPage();
        drawHeaderAndFooter();
        currentY = 32;
      }
      
      doc.text(splitText, marginX + indent, currentY);
      currentY += neededHeight + 3;
    };

    drawHeaderAndFooter();

    if (this.opcionIncluirEtiqueta) {
      doc.setDrawColor(220, 220, 220);
      doc.setFillColor(250, 250, 250);
      doc.roundedRect(marginX, 28, 210 - marginX * 2, 14, 1, 1, 'FD');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text('ESPACIO DESTINADO A LA IDENTIFICACIÓN DEL PACIENTE', marginX + 4, 33);
      doc.setFont('Helvetica', 'normal');
      doc.text(`Paciente: ${patientName}   |   Cédula: ${patientCedula}   |   Edad: ${this.cartaPacienteSeleccionado.edad} años`, marginX + 4, 39);
    } else {
      currentY = 32;
    }

    printParagraph('De conformidad con lo dispuesto en la legislación de derechos y deberes de los pacientes, el firmante declara haber sido plenamente informado/a acerca del procedimiento recomendado por el especialista.', 'italic', baseFontSize, 0);
    
    printParagraph(selectedTmpl.p1, 'normal', baseFontSize, 0);
    printParagraph(selectedTmpl.p2, 'normal', baseFontSize, 0);
    printParagraph(selectedTmpl.p3, 'normal', baseFontSize, 0);
    printParagraph(selectedTmpl.p4, 'normal', baseFontSize, 0);

    // Signatures
    const drawSignaturesBlock = () => {
      const boxWidth = (210 - marginX * 2 - 10) / 2;
      const boxHeight = 45;

      if (currentY + boxHeight + 20 > 270) {
        doc.addPage();
        drawHeaderAndFooter();
        currentY = 32;
      }

      currentY += 5;

      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(252, 252, 252);
      doc.roundedRect(marginX, currentY, boxWidth, boxHeight, 1, 1, 'FD');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      doc.text('PACIENTE O REPRESENTANTE LEGAL', marginX + 4, currentY + 6);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`Nombre: D./Dña. ${patientName}`, marginX + 4, currentY + 12);
      doc.text(`Cédula: ${patientCedula}`, marginX + 4, currentY + 17);

      doc.setDrawColor(180, 180, 180);
      doc.line(marginX + 4, currentY + 34, marginX + boxWidth - 4, currentY + 34);
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text('Firma del Paciente / Tutor Autorizado', marginX + 4, currentY + 39);

      const rightBoxX = marginX + boxWidth + 10;
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(252, 252, 252);
      doc.roundedRect(rightBoxX, currentY, boxWidth, boxHeight, 1, 1, 'FD');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      doc.text('CIRUJANO / MÉDICO TRATANTE', rightBoxX + 4, currentY + 6);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`Médico: ${docName}`, rightBoxX + 4, currentY + 12);
      doc.text(`Exequatur / Reg: ${colNumber}`, rightBoxX + 4, currentY + 17);

      doc.setDrawColor(180, 180, 180);
      doc.line(rightBoxX + 4, currentY + 34, rightBoxX + boxWidth - 4, currentY + 34);
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text('Firma y Sello del Médico Cirujano', rightBoxX + 4, currentY + 39);

      currentY += boxHeight + 8;

      if (this.opcionIncluirTestigo) {
        if (currentY + 25 > 270) {
          doc.addPage();
          drawHeaderAndFooter();
          currentY = 32;
        }

        doc.setDrawColor(210, 210, 210);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(marginX, currentY, 210 - marginX * 2, 22, 1, 1, 'FD');

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(80, 80, 80);
        doc.text('DECLARACIÓN DE TESTIGO (En caso de imposibilidad del paciente para firmar):', marginX + 4, currentY + 5);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7);
        doc.text('Testigo Nombre: _____________________________________   Cédula: ________________________   Firma: ________________________', marginX + 4, currentY + 14);

        currentY += 27;
      }

      if (this.opcionIncluirRevocacion) {
        if (currentY + 30 > 270) {
          doc.addPage();
          drawHeaderAndFooter();
          currentY = 32;
        }

        doc.setDrawColor(240, 180, 180);
        doc.setFillColor(255, 245, 245);
        doc.roundedRect(marginX, currentY, 210 - marginX * 2, 26, 1, 1, 'FD');

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(180, 40, 40);
        doc.text('DENEGACIÓN O REVOCACIÓN DEL CONSENTIMIENTO INFORMADO:', marginX + 4, currentY + 6);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 60, 60);
        doc.text('Rechazo la realización del procedimiento tras haber sido oportunamente informado/a de los riesgos de la no intervención.', marginX + 4, currentY + 12);
        doc.text(`En ${city}, a _____ de ____________________ de 20____.`, marginX + 4, currentY + 18);
        doc.text('Firma Paciente: _____________________________________    Firma Médico: _____________________________________', marginX + 4, currentY + 23);
      }
    };

    drawSignaturesBlock();

    const filename = `Consentimiento_${this.tipoCartaSeleccionada}_${patientName.replace(/\s+/g, '_')}.pdf`;
    doc.save(filename);
    this.presentToast('PDF generado correctamente.', 'success');
    this.closeModals();
  }

  // Clinical History Logic
  calcularIMC() {
    if (this.nuevosSignos.peso > 0 && this.nuevosSignos.talla > 30) {
      const tallaMeters = this.nuevosSignos.talla / 100;
      const imcVal = this.nuevosSignos.peso / (tallaMeters * tallaMeters);
      this.nuevosSignos.imc = Number(Math.min(imcVal, 99.9).toFixed(1));
    } else {
      this.nuevosSignos.imc = 0;
    }
  }

  async guardarSignos() {
    if (this.pacienteSeleccionado && this.nuevosSignos.peso > 0) {
      const signos = {
        ...this.nuevosSignos,
        fecha: new Date().toLocaleDateString()
      };
      const error = await this.patientService.addSignosVitales(this.pacienteSeleccionado.cedula, signos);

      if (error) {
        const errMsg = (error as any)?.message || String(error);
        this.presentToast('Error al guardar signos vitales: ' + errMsg, 'danger');
        return;
      }

      this.presentToast('Signos vitales guardados con éxito', 'success');
      // Actualizar paciente seleccionado para reflejar cambios
      this.pacienteSeleccionado = this.patientService.findPatientByCedula(this.pacienteSeleccionado.cedula) || null;
      // Reset form
      this.nuevosSignos = { presionArterial: '', frecuenciaCardiaca: 0, temperatura: 0, peso: 0, talla: 0, imc: 0 };
    }
  }

  async presentToast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom',
      cssClass: 'custom-toast'
    });
    await toast.present();
  }

  consultarPaciente(paciente: Paciente) {
    this.router.navigate(['/consulta'], {
      queryParams: { cedula: paciente.cedula }
    });
  }

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/auth/login']);
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
      return fechaStr;
    }

    try {
      const d = new Date(fechaStr);
      if (isNaN(d.getTime())) return fechaStr;

      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();

      const rawHours = d.getHours();
      const rawMinutes = d.getMinutes();

      if (rawHours === 0 && rawMinutes === 0) {
        return `${day}/${month}/${year}`;
      }

      const ampm = rawHours >= 12 ? 'PM' : 'AM';
      const hours = rawHours % 12 || 12;
      const minutes = String(rawMinutes).padStart(2, '0');

      return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
    } catch {
      return fechaStr;
    }
  }

  // ─── Evaluadores clínicos de signos vitales ───────────────────────────────
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
    if (sys < 90 || dia < 60) return { ...this.vitalsStyle('warning'), label: 'Presión baja (hipotensión)' };
    if (sys <= 120 && dia <= 80) return { ...this.vitalsStyle('normal'), label: 'Normal ✓' };
    if (sys <= 129 && dia < 80) return { ...this.vitalsStyle('warning'), label: 'Presión elevada' };
    if (sys <= 139 || dia <= 89) return { ...this.vitalsStyle('warning'), label: 'Hipertensión Etapa 1' };
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
}
