import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CitasService, Paciente, Consulta } from '../../services/citas.service';
import { AuthService } from '../../services/auth.service';
import { ToastController } from '@ionic/angular';

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
    alergias: ''
  };

  listaSeguros: string[] = ['Particular'];

  constructor(
    private citasService: CitasService,
    private router: Router,
    private authService: AuthService,
    private toastController: ToastController
  ) { }

  ngOnInit() {
    this.citasService.patients$.subscribe(patients => {
      this.pacientes = patients;
    });

    this.authService.profile$.subscribe(p => this.currentProfile.set(p));

    this.citasService.config$.subscribe(config => {
      this.listaSeguros = ['Particular', ...config.tarifasSeguros.map(t => t.seguro)];
    });
  }

  get pacientesFiltrados() {
    return this.pacientes.filter(p =>
      p.nombre.toLowerCase().includes(this.filtroNombre.toLowerCase()) ||
      p.cedula.includes(this.filtroNombre)
    );
  }

  verHistorial(paciente: Paciente) {
    this.pacienteSeleccionado = paciente;
    this.historialPaciente = this.citasService.getPatientHistory(paciente.cedula);
    this.showHistoryModal = true;
  }

  editarPaciente(paciente: Paciente) {
    this.pacienteSeleccionado = paciente;
    this.editData = { ...paciente };
    this.showEditModal = true;
  }

  async guardarCambios() {
    if (this.editData.nombre) {
      if (this.editData.fecha_nacimiento) {
        this.editData.edad = this.citasService.calcularEdad(this.editData.fecha_nacimiento);
      }
      await this.citasService.savePatient(this.editData);
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
      const error = await this.citasService.addSignosVitales(this.pacienteSeleccionado.cedula, signos);

      if (error) {
        this.presentToast('Error al guardar signos vitales: ' + (error.message || 'Error desconocido'), 'danger');
        return;
      }

      this.presentToast('Signos vitales guardados con éxito', 'success');
      // Actualizar paciente seleccionado para reflejar cambios
      this.pacienteSeleccionado = this.citasService.findPatientByCedula(this.pacienteSeleccionado.cedula) || null;
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
