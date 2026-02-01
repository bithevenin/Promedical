import { Component, OnInit, signal } from '@angular/core';
import { CitasService, Cita, Paciente } from '../../services/citas.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-citas',
  templateUrl: './citas.page.html',
  standalone: false,
  styleUrls: ['./citas.page.scss'],
})
export class CitasPage implements OnInit {
  // Modo de registro: 'nuevo' o 'registrado'
  modoRegistro: 'nuevo' | 'registrado' = 'nuevo';

  // Datos del formulario
  nuevoPaciente = {
    nombre: '',
    cedula: '',
    edad: null as number | null,
    altura: '',
    peso: '',
    profesion: '',
    seguro: 'Particular',
    sexo: 'M' as 'M' | 'F',
    telefono: ''
  };

  // Listado de ARS (se carga dinámicamente)
  listaSeguros: string[] = ['Particular'];

  proximasCitas: Cita[] = [];
  citasPorCobrar: Cita[] = [];
  proximoTurno: number = 1;
  errorBusqueda: string = '';
  fechaSeleccionada: string;
  fechaFiltro: string;

  // Modal de Seguro (Nuevo)
  mostrarModalSeguro = false;
  carnetSeguroTemp = '';
  
  currentProfile = signal<any>(null);

  // Exponer Math para el template
  Math = Math;

  constructor(
    public citasService: CitasService, 
    private authService: AuthService,
    private router: Router
  ) {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localDate = new Date(now.getTime() - (offset * 60 * 1000));
    const todayStr = localDate.toISOString().split('T')[0];

    this.fechaSeleccionada = todayStr;
    this.fechaFiltro = todayStr;
  }

  ngOnInit() {
    this.citasService.config$.subscribe(config => {
      this.listaSeguros = ['Particular', ...config.tarifasSeguros.map(t => t.seguro)];
    });

    this.citasService.appointments$.subscribe(appointments => {
      this.actualizarListas(appointments);
    });
    
    this.authService.profile$.subscribe(p => this.currentProfile.set(p));
  }

  onSeguroChange() {
    if (this.nuevoPaciente.seguro !== 'Particular') {
      this.mostrarModalSeguro = true;
    }
  }

  cerrarModalSeguro() {
    this.mostrarModalSeguro = false;
  }

  guardarCarnetSeguro() {
    this.mostrarModalSeguro = false;
  }

  cambiarFechaFiltro(event: any) {
    this.fechaFiltro = event.detail.value.split('T')[0];
    this.actualizarListas(this.citasService.getAppointments());
  }

  actualizarListas(appointments: Cita[]) {
    this.proximasCitas = appointments.filter(c => c.estado === 'espera' && c.fecha === this.fechaFiltro);
    this.citasPorCobrar = appointments.filter(c => c.estado === 'por_pagar' && c.fecha === this.fechaFiltro);

    // Calcular próximo turno solo para el día de hoy o el día seleccionado
    const citasDelDia = appointments.filter(c => c.fecha === this.fechaSeleccionada);
    this.proximoTurno = citasDelDia.length > 0
      ? Math.max(...citasDelDia.map(c => c.turno)) + 1
      : 1;
  }

  // Modal de cobro
  mostrarModalCobro = false;
  citaParaCobrar: Cita | null = null;
  datosCobro = {
    montoSeguro: 0,        // Informativo - lo paga el seguro
    diferencia: 0,          // Lo que paga el paciente
    totalACobrar: 0,        // = diferencia (solo lo que paga el paciente)
    pagoRecibido: 0,
    vuelto: 0
  };

  // Sistema de mensajes interno
  mostrarMensajeExito = false;
  mensajeExito = '';

  cobrar(cita: Cita) {
    this.citaParaCobrar = cita;
    this.mostrarModalCobro = true;

    const tarifa = this.citasService.getTarifaSeguro(cita.seguro);
    const montoSeguroConfig = tarifa ? tarifa.montoCobertura : 0;
    const copagoConfig = tarifa ? tarifa.copago : 0;

    // Calcular montos según la instrucción
    if (cita.instruccionCobro === 'cobrar') {
      if (cita.seguro !== 'Particular') {
        this.datosCobro.montoSeguro = montoSeguroConfig;
        this.datosCobro.diferencia = copagoConfig; // Sugerir el copago configurado
      } else {
        const config = this.citasService.getConfig();
        this.datosCobro.montoSeguro = 0;
        this.datosCobro.diferencia = config.montoConsultaParticular;
      }
    } else if (cita.instruccionCobro === 'seguro') {
      this.datosCobro.montoSeguro = montoSeguroConfig;
      this.datosCobro.diferencia = 0;
    } else {
      this.datosCobro.montoSeguro = 0;
      this.datosCobro.diferencia = 0;
    }

    this.calcularTotal();
  }

  calcularTotal() {
    // El total a cobrar AL PACIENTE es solo la diferencia
    this.datosCobro.totalACobrar = this.datosCobro.diferencia;
    this.calcularVuelto();
  }

  calcularVuelto() {
    const vuelto = this.datosCobro.pagoRecibido - this.datosCobro.totalACobrar;
    this.datosCobro.vuelto = vuelto > 0 ? vuelto : 0;
  }

  async confirmarCobro() {
    if (this.citaParaCobrar) {
      const montoTotal = this.datosCobro.diferencia; // Solo se registra lo que pagó el paciente
      await this.citasService.registrarCobro(this.citaParaCobrar.turno, montoTotal);

      // Preparar mensaje interno
      this.mensajeExito = `Cobro registrado exitosamente!
      
Paciente: ${this.citaParaCobrar.nombre}
Seguro médico: $${this.datosCobro.montoSeguro.toFixed(2)}
Diferencia cobrada: $${this.datosCobro.diferencia.toFixed(2)}
Pago recibido: $${this.datosCobro.pagoRecibido.toFixed(2)}
Vuelto entregado: $${this.datosCobro.vuelto.toFixed(2)}`;

      this.mostrarMensajeExito = true;
      this.cerrarModalCobro();

      // Ocultar mensaje después de 5 segundos
      setTimeout(() => {
        this.mostrarMensajeExito = false;
      }, 5000);
    }
  }

  cerrarModalCobro() {
    this.mostrarModalCobro = false;
    this.citaParaCobrar = null;
    this.datosCobro = {
      montoSeguro: 0,
      diferencia: 0,
      totalACobrar: 0,
      pagoRecibido: 0,
      vuelto: 0
    };
  }

  enviarRecordatorio(cita: Cita) {
    const telefono = cita.telefono || '';
    const name = cita.nombre;
    const time = cita.hora;
    const date = cita.fecha;

    const message = `Hola ${name}, le recordamos su cita el día ${date} a las ${time} en el consultorio del Dr. Thevenin. Por favor confirme su asistencia.`;
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${telefono.replace(/\D/g, '')}?text=${encodedMessage}`;

    window.open(whatsappUrl, '_blank');
  }

  cambiarModo(modo: 'nuevo' | 'registrado') {
    this.modoRegistro = modo;
    this.limpiarFormulario();
    this.carnetSeguroTemp = '';
  }

  buscarPaciente() {
    this.errorBusqueda = '';
    if (!this.nuevoPaciente.cedula) return;

    const paciente = this.citasService.findPatientByCedula(this.nuevoPaciente.cedula);
    if (paciente) {
      this.nuevoPaciente = {
        ...this.nuevoPaciente,
        nombre: paciente.nombre,
        edad: paciente.edad,
        profesion: paciente.profesion,
        seguro: paciente.seguro,
        sexo: paciente.sexo || 'M',
        altura: paciente.altura || '',
        peso: paciente.peso || '',
        telefono: paciente.telefono || ''
      };
      this.carnetSeguroTemp = paciente.carnetSeguro || '';
    } else {
      this.errorBusqueda = 'Paciente no encontrado. Use el modo "Nuevo" para registrarlo.';
    }
  }

  async registrarCita() {
    if (this.nuevoPaciente.nombre && this.nuevoPaciente.cedula && this.nuevoPaciente.edad) {
      // 1. Guardar/Actualizar en el registro de pacientes
      const datosPaciente: Paciente = {
        cedula: this.nuevoPaciente.cedula,
        nombre: this.nuevoPaciente.nombre,
        edad: this.nuevoPaciente.edad,
        profesion: this.nuevoPaciente.profesion,
        seguro: this.nuevoPaciente.seguro,
        sexo: this.nuevoPaciente.sexo,
        altura: this.nuevoPaciente.altura,
        peso: this.nuevoPaciente.peso,
        telefono: this.nuevoPaciente.telefono,
        carnetSeguro: this.carnetSeguroTemp
      };
      await this.citasService.savePatient(datosPaciente);

      // 2. Crear la cita
      const nuevaCita: Cita = {
        turno: this.proximoTurno,
        nombre: this.nuevoPaciente.nombre,
        cedula: this.nuevoPaciente.cedula,
        edad: this.nuevoPaciente.edad,
        seguro: this.nuevoPaciente.seguro,
        sexo: this.nuevoPaciente.sexo,
        fecha: this.fechaSeleccionada,
        estado: 'espera',
        hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        altura: this.nuevoPaciente.altura,
        peso: this.nuevoPaciente.peso,
        profesion: this.nuevoPaciente.profesion,
        telefono: this.nuevoPaciente.telefono,
        carnetSeguro: this.carnetSeguroTemp
      };

      await this.citasService.addAppointment(nuevaCita);
      this.limpiarFormulario();
      this.carnetSeguroTemp = '';

      const now = new Date();
      const offset = now.getTimezoneOffset();
      const localDate = new Date(now.getTime() - (offset * 60 * 1000));
      this.fechaSeleccionada = localDate.toISOString().split('T')[0];
    }
  }

  limpiarFormulario() {
    this.nuevoPaciente = {
      nombre: '',
      cedula: '',
      edad: null,
      altura: '',
      peso: '',
      profesion: '',
      seguro: 'Particular',
      sexo: 'M',
      telefono: ''
    };
    this.errorBusqueda = '';
  }

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/auth/login']);
  }
}