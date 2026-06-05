import { Component, OnInit, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { PatientService, Paciente } from '../../services/patient.service';
import { ConsultationService, Consulta } from '../../services/consultation.service';
import { ConfigService } from '../../services/config.service';
import { AuthService } from '../../services/auth.service';
import { formatMonto, parseJCEDate } from '../../utils/format.utils';
import { ToastController } from '@ionic/angular';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-pacientes',
  templateUrl: './pacientes.page.html',
  standalone: false,
  styleUrls: ['./pacientes.page.scss'],
})
export class PacientesPage implements OnInit {
  pacientes: Paciente[] = [];
  filtroNombre: string = '';

  currentProfile = signal<any>(null);

  navigationItems = computed(() => {
    const base: any[] = [
      { icon: 'home-outline', label: 'Inicio', route: '/main' },
      { icon: 'grid-outline', label: 'Panel', route: '/dashboard' },
      { icon: 'calendar-outline', label: 'Citas', route: '/citas' },
      { icon: 'people-outline', label: 'Pacientes', active: true, route: '/pacientes' }
    ];

    if (this.currentProfile()?.rol === 'doctor' || this.currentProfile()?.rol === 'admin') {
      base.push({ icon: 'medical-outline', label: 'Consulta', route: '/consulta' });
      base.push({ icon: 'wallet-outline', label: 'Contabilidad', route: '/contabilidad' });
      base.push({ icon: 'settings-outline', label: 'Ajustes', route: '/configuracion' });
    }

    return base;
  });

  // Modals state
  showHistoryModal = false;
  showEditModal = false;

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
    public themeService: ThemeService
  ) { }

  ngOnInit() {
    this.patientService.patients$.subscribe(patients => {
      this.pacientes = patients;
      // Auto-load photos for patients without one, once the list is ready
      if (!this.cargandoFotos && patients.length > 0) {
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

    const sinFoto = this.pacientes.filter(p => !p.fotoUrl && p.cedula);
    for (const paciente of sinFoto) {
      try {
        const result = await this.patientService.consultarJCE(paciente.cedula);
        if (result && result.fotoUrl) {
          // Update the in-memory reference so the UI re-renders immediately
          paciente.fotoUrl = result.fotoUrl;

          // Only persist to Supabase if it's a real URL (not a base64 data URI)
          // Base64 strings are too large for a database column
          if (!result.fotoUrl.startsWith('data:')) {
            this.patientService.savePatient({ ...paciente });
          }
        }
      } catch {
        // Silently ignore errors for individual patients
      }
      // Small throttle to avoid overwhelming the backend
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    this.cargandoFotos = false;
  }

  get pacientesFiltrados() {
    return this.pacientes.filter(p =>
      p.nombre.toLowerCase().includes(this.filtroNombre.toLowerCase()) ||
      p.cedula.includes(this.filtroNombre)
    );
  }

  verHistorial(paciente: Paciente) {
    this.pacienteSeleccionado = paciente;
    this.historialPaciente = this.consultationService.getPatientHistory(paciente.cedula);
    this.showHistoryModal = true;
  }

  editarPaciente(paciente: Paciente) {
    console.log('editarPaciente called with:', JSON.stringify(paciente));
    this.pacienteSeleccionado = paciente;
    this.editData = { ...paciente };
    console.log('editarPaciente editData is:', JSON.stringify(this.editData));
    this.showEditModal = true;
  }

  async buscarJCE() {
    if (!this.editData.cedula) {
      this.presentToast('Por favor, ingrese una cédula.', 'danger');
      return;
    }
    this.isLoadingJce = true;
    console.log('buscarJCE called for:', this.editData.cedula);
    try {
      const result = await this.patientService.consultarJCE(this.editData.cedula);
      console.log('buscarJCE result received:', JSON.stringify(result));
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
          this.editData.profesion = result.ocupacion || result.ocupación;
        }

        // Dirección
        this.editData.direccion = result.direccion || result.dirección ||
          [result.lugarNacimiento].filter(Boolean).join(', ') || '';

        // Foto
        this.editData.fotoUrl = result.fotoUrl || this.editData.fotoUrl || '';

        console.log('buscarJCE editData set to:', JSON.stringify(this.editData));
        this.presentToast('¡Datos de la cédula cargados con éxito!', 'success');
      }
    } catch (error: any) {
      console.error('Error JCE lookup:', error);
      this.presentToast('Error al consultar cédula JCE: ' + (error.message || error), 'danger');
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

  closeModals() {
    this.showHistoryModal = false;
    this.showEditModal = false;
    this.pacienteSeleccionado = null;
    this.activeTab = 'consultas';
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
        this.presentToast('Error al guardar signos vitales: ' + ((error as any).message || 'Error desconocido'), 'danger');
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
}
