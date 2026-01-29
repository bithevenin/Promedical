import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CitasService, Paciente, Consulta } from '../../services/citas.service';

@Component({
  selector: 'app-pacientes',
  templateUrl: './pacientes.page.html',
  standalone: false,
  styleUrls: ['./pacientes.page.scss'],
})
export class PacientesPage implements OnInit {
  pacientes: Paciente[] = [];
  filtroNombre: string = '';

  // Modals state
  showHistoryModal = false;
  showEditModal = false;

  pacienteSeleccionado: Paciente | null = null;
  historialPaciente: Consulta[] = [];

  // Edit Form
  editData: Paciente = {
    cedula: '',
    nombre: '',
    edad: 0,
    profesion: '',
    seguro: '',
    altura: '',
    peso: ''
  };

  listaSeguros: string[] = [
    'Particular',
    'ARS Senasa',
    'ARS Humano',
    'ARS Mapfre',
    'ARS Monumental',
    'ARS Primera',
    'ARS Renacer',
    'ARS Universal'
  ];

  constructor(
    private citasService: CitasService,
    private router: Router
  ) { }

  ngOnInit() {
    this.citasService.patients$.subscribe(patients => {
      this.pacientes = patients;
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

  guardarCambios() {
    if (this.editData.nombre) {
      this.citasService.savePatient(this.editData);
      this.closeModals();
    }
  }

  closeModals() {
    this.showHistoryModal = false;
    this.showEditModal = false;
    this.pacienteSeleccionado = null;
  }

  consultarPaciente(paciente: Paciente) {
    // Navegar a la página de consulta con la cédula del paciente
    this.router.navigate(['/consulta'], {
      queryParams: { cedula: paciente.cedula }
    });
  }
}
