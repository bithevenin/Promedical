import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CitasService, Cita, Consulta, Paciente } from '../../services/citas.service';
import { PrintRecetaService } from '../../services/print-receta.service';

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

  // Flag para indicar si es consulta directa (sin cita previa)
  esConsultaDirecta = false;

  // Formulario de consulta
  nuevaConsulta = {
    diagnostico: '',
    receta: '',
    instruccionCobro: 'cobrar' as 'cobrar' | 'seguro' | 'gratis'
  };

  constructor(
    private citasService: CitasService,
    private printRecetaService: PrintRecetaService,
    private route: ActivatedRoute
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
}
