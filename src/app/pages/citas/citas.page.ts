import { Component, OnInit, signal, computed, HostListener } from '@angular/core';
import { AppointmentService, Cita } from '../../services/appointment.service';
import { PatientService, Paciente } from '../../services/patient.service';
import { ConfigService } from '../../services/config.service';
import { FinancialService } from '../../services/financial.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { ThemeService } from '../../services/theme.service';
import { formatMonto, parseJCEDate } from '../../utils/format.utils';

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
    fecha_nacimiento: '' as string,
    altura: '',
    peso: '',
    profesion: '',
    seguro: 'Particular',
    sexo: 'M' as 'M' | 'F',
    telefono: '',
    fotoUrl: '',
    tipo_sangre: '',
    direccion: ''
  };

  isLoadingJce = false;

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

  // Listado de pacientes para agendamiento
  listaPacientes: Paciente[] = [];
  pacientesFiltrados: Paciente[] = [];
  mostrarDropdownPacientes = false;
  activeSearchField: 'cedula' | 'nombre' | null = null;

  setActiveSearchField(field: 'cedula' | 'nombre') {
    this.activeSearchField = field;
  }

  @HostListener('document:click')
  closeCitasDropdowns() {
    this.mostrarDropdownPacientes = false;
  }

  navigationItems = computed(() => {
    const base: any[] = [
      { icon: 'home-outline', label: 'Inicio', route: '/main' },
      { icon: 'grid-outline', label: 'Panel', route: '/dashboard' },
      { icon: 'calendar-outline', label: 'Citas', active: true, route: '/citas' },
      { icon: 'people-outline', label: 'Pacientes', route: '/pacientes' }
    ];

    if (this.currentProfile()?.rol === 'doctor' || this.currentProfile()?.rol === 'admin') {
      base.push({ icon: 'medical-outline', label: 'Consulta', route: '/consulta' });
      base.push({ icon: 'wallet-outline', label: 'Contabilidad', route: '/contabilidad' });
      base.push({ icon: 'settings-outline', label: 'Ajustes', route: '/configuracion' });
    }

    return base;
  });

  // Exponer Math y utilidades para el template
  Math = Math;
  formatMonto = formatMonto;

  constructor(
    public appointmentService: AppointmentService,
    private patientService: PatientService,
    private configService: ConfigService,
    private financialService: FinancialService,
    private authService: AuthService,
    public router: Router,
    public themeService: ThemeService
  ) {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localDate = new Date(now.getTime() - (offset * 60 * 1000));
    const todayStr = localDate.toISOString().split('T')[0];

    this.fechaSeleccionada = todayStr;
    this.fechaFiltro = todayStr;
  }

  ngOnInit() {
    this.configService.config$.subscribe(config => {
      this.listaSeguros = ['Particular', ...config.tarifasSeguros.map(t => t.seguro)];
    });

    this.appointmentService.appointments$.subscribe(appointments => {
      this.actualizarListas(appointments);
    });

    this.patientService.patients$.subscribe(patients => {
      this.listaPacientes = patients;
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
    this.actualizarListas(this.appointmentService.getAppointments());
  }

  actualizarListas(appointments: Cita[]) {
    this.proximasCitas = appointments
      .filter(c => (c.estado === 'espera' || c.estado === 'consulta') && c.fecha === this.fechaFiltro)
      .sort((a, b) => a.turno - b.turno);

    this.citasPorCobrar = appointments
      .filter(c => c.estado === 'por_pagar' && c.fecha === this.fechaFiltro)
      .sort((a, b) => a.turno - b.turno);

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

    const tarifa = this.configService.getTarifaSeguro(cita.seguro);
    const montoSeguroConfig = tarifa ? tarifa.montoCobertura : 0;
    const copagoConfig = tarifa ? tarifa.copago : 0;

    // Calcular montos según la instrucción
    if (cita.instruccionCobro === 'cobrar') {
      if (cita.seguro !== 'Particular') {
        this.datosCobro.montoSeguro = montoSeguroConfig;
        this.datosCobro.diferencia = copagoConfig; // Sugerir el copago configurado
      } else {
        const config = this.configService.getConfig();
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
      await this.financialService.registrarCobro(this.citaParaCobrar.turno, montoTotal);

      // Preparar mensaje interno usando formatMonto
      this.mensajeExito = `Cobro registrado exitosamente!
      
Paciente: ${this.citaParaCobrar.nombre}
Seguro médico: ${this.formatMonto(this.datosCobro.montoSeguro)}
Diferencia cobrada: ${this.formatMonto(this.datosCobro.diferencia)}
Pago recibido: ${this.formatMonto(this.datosCobro.pagoRecibido)}
Vuelto entregado: ${this.formatMonto(this.datosCobro.vuelto)}`;

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

    const paciente = this.patientService.findPatientByCedula(this.nuevoPaciente.cedula);
    if (paciente) {
      this.nuevoPaciente = {
        ...this.nuevoPaciente,
        nombre: paciente.nombre,
        edad: paciente.edad,
        fecha_nacimiento: paciente.fecha_nacimiento || '',
        profesion: paciente.profesion,
        seguro: paciente.seguro,
        sexo: paciente.sexo || 'M',
        altura: paciente.altura || '',
        peso: paciente.peso || '',
        telefono: paciente.telefono || '',
        fotoUrl: paciente.fotoUrl || '',
        tipo_sangre: paciente.tipo_sangre || '',
        direccion: paciente.direccion || ''
      };
      this.carnetSeguroTemp = paciente.carnetSeguro || '';
    } else {
      this.errorBusqueda = 'Paciente no encontrado. Use el modo "Nuevo" para registrarlo.';
    }
  }

  async buscarJCE() {
    if (!this.nuevoPaciente.cedula) {
      this.errorBusqueda = 'Por favor, ingrese un número de cédula.';
      return;
    }
    const cleanCedula = this.nuevoPaciente.cedula.replace(/[^0-9]/g, '');
    if (cleanCedula.length !== 11) {
      this.errorBusqueda = 'La cédula debe contener exactamente 11 dígitos.';
      return;
    }

    this.isLoadingJce = true;
    this.errorBusqueda = '';
    try {
      // First, check if the patient exists locally
      const localPatient = this.patientService.findPatientByCedula(cleanCedula);
      if (localPatient) {
        this.nuevoPaciente = {
          ...this.nuevoPaciente,
          nombre: localPatient.nombre,
          edad: localPatient.edad,
          fecha_nacimiento: localPatient.fecha_nacimiento || '',
          profesion: localPatient.profesion,
          seguro: localPatient.seguro,
          sexo: localPatient.sexo || 'M',
          altura: localPatient.altura || '',
          peso: localPatient.peso || '',
          telefono: localPatient.telefono || '',
          fotoUrl: localPatient.fotoUrl || '',
          tipo_sangre: localPatient.tipo_sangre || '',
          direccion: localPatient.direccion || ''
        };
        this.carnetSeguroTemp = localPatient.carnetSeguro || '';

        // If the patient already has a photo, bypass JCE lookup
        if (localPatient.fotoUrl) {
          this.isLoadingJce = false;
          return;
        }
      }

      // If patient does not exist or has no photo, query JCE API
      const result = await this.patientService.consultarJCE(cleanCedula);
      if (result) {
        // Nombre
        if (!this.nuevoPaciente.nombre) {
          this.nuevoPaciente.nombre = result.nombreCompleto ||
            `${result.nombres || ''} ${result.apellido1 || ''} ${result.apellido2 || ''}`.trim().replace(/\s+/g, ' ');
        }

        // Fecha de nacimiento: JCE devuelve "M/D/YYYY h:mm:ss AM/PM"
        if (result.fechaNacimiento && !this.nuevoPaciente.fecha_nacimiento) {
          this.nuevoPaciente.fecha_nacimiento = parseJCEDate(result.fechaNacimiento);
          if (this.nuevoPaciente.fecha_nacimiento) {
            this.nuevoPaciente.edad = this.patientService.calcularEdad(this.nuevoPaciente.fecha_nacimiento);
          }
        }

        // Sexo: la API devuelve "F" o "M"
        if (result.sexo && !this.nuevoPaciente.sexo) {
          const s = result.sexo.trim().toUpperCase();
          this.nuevoPaciente.sexo = s.startsWith('F') ? 'F' : 'M';
        }

        // Ocupación: la API JCE no incluye este campo; mantener lo existente
        if ((result.ocupacion || result.ocupación) && !this.nuevoPaciente.profesion) {
          this.nuevoPaciente.profesion = result.ocupacion || result.ocupación;
        }

        // Dirección: usar lugarNacimiento como referencia si no hay dirección directa
        if (!this.nuevoPaciente.direccion) {
          this.nuevoPaciente.direccion = result.direccion || result.dirección ||
            [result.lugarNacimiento].filter(Boolean).join(', ') || '';
        }

        // Foto
        this.nuevoPaciente.fotoUrl = result.fotoUrl || this.nuevoPaciente.fotoUrl || '';

        // Si el paciente ya existe localmente, actualizamos sus datos con la nueva foto/datos
        if (localPatient) {
          const updatedPatient = {
            ...localPatient,
            fecha_nacimiento: this.nuevoPaciente.fecha_nacimiento || localPatient.fecha_nacimiento,
            sexo: this.nuevoPaciente.sexo || localPatient.sexo,
            fotoUrl: this.nuevoPaciente.fotoUrl || localPatient.fotoUrl,
            direccion: this.nuevoPaciente.direccion || localPatient.direccion,
            edad: this.nuevoPaciente.edad || localPatient.edad
          };
          await this.patientService.savePatient(updatedPatient);
        }
      }
    } catch (error: any) {
      console.error('Error JCE lookup in Citas:', error);
      this.errorBusqueda = 'Error al consultar JCE: ' + (error.message || error);
    } finally {
      this.isLoadingJce = false;
    }
  }

  async registrarCita() {
    if (this.nuevoPaciente.nombre && this.nuevoPaciente.cedula && this.nuevoPaciente.fecha_nacimiento) {
      // Calcular edad automáticamente si se tiene la fecha de nacimiento
      this.nuevoPaciente.edad = this.patientService.calcularEdad(this.nuevoPaciente.fecha_nacimiento);

      // 1. Guardar/Actualizar en el registro de pacientes
      const datosPaciente: Paciente = {
        cedula: this.nuevoPaciente.cedula,
        nombre: this.nuevoPaciente.nombre,
        edad: this.nuevoPaciente.edad,
        fecha_nacimiento: this.nuevoPaciente.fecha_nacimiento,
        profesion: this.nuevoPaciente.profesion,
        seguro: this.nuevoPaciente.seguro,
        sexo: this.nuevoPaciente.sexo,
        altura: this.nuevoPaciente.altura,
        peso: this.nuevoPaciente.peso,
        telefono: this.nuevoPaciente.telefono,
        carnetSeguro: this.carnetSeguroTemp,
        tipo_sangre: this.nuevoPaciente.tipo_sangre,
        fotoUrl: this.nuevoPaciente.fotoUrl,
        direccion: this.nuevoPaciente.direccion
      };
      await this.patientService.savePatient(datosPaciente);

      // 2. Crear la cita
      const nuevaCita: Cita = {
        turno: this.proximoTurno,
        nombre: this.nuevoPaciente.nombre,
        cedula: this.nuevoPaciente.cedula,
        edad: this.nuevoPaciente.edad,
        fecha_nacimiento: this.nuevoPaciente.fecha_nacimiento,
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

      await this.appointmentService.addAppointment(nuevaCita);
      this.limpiarFormulario();
      this.carnetSeguroTemp = '';

      const now = new Date();
      const offset = now.getTimezoneOffset();
      const localDate = new Date(now.getTime() - (offset * 60 * 1000));
      this.fechaSeleccionada = localDate.toISOString().split('T')[0];
    }
  }

  filtrarPacientes(event: any) {
    const val = (event.target.value || '').toLowerCase().trim();
    if (!val) {
      this.pacientesFiltrados = [];
      this.mostrarDropdownPacientes = false;
      return;
    }

    const cleanVal = val.replace(/[^0-9a-zA-Z]/g, '');

    this.pacientesFiltrados = this.listaPacientes.filter(p => {
      const matchNombre = p.nombre.toLowerCase().includes(val);
      const cleanCedula = p.cedula.replace(/[^0-9]/g, '');
      const matchCedula = cleanCedula.includes(cleanVal);
      return matchNombre || matchCedula;
    }).slice(0, 5); // Limit to 5 results

    this.mostrarDropdownPacientes = this.pacientesFiltrados.length > 0;
  }

  seleccionarPacienteDeLista(paciente: Paciente) {
    this.nuevoPaciente = {
      nombre: paciente.nombre,
      cedula: paciente.cedula,
      edad: paciente.edad,
      fecha_nacimiento: paciente.fecha_nacimiento || '',
      altura: paciente.altura || '',
      peso: paciente.peso || '',
      profesion: paciente.profesion || '',
      seguro: paciente.seguro || 'Particular',
      sexo: paciente.sexo || 'M',
      telefono: paciente.telefono || '',
      fotoUrl: paciente.fotoUrl || '',
      tipo_sangre: paciente.tipo_sangre || '',
      direccion: paciente.direccion || ''
    };
    this.carnetSeguroTemp = paciente.carnetSeguro || '';
    this.pacientesFiltrados = [];
    this.mostrarDropdownPacientes = false;
  }

  limpiarFormulario() {
    this.nuevoPaciente = {
      nombre: '',
      cedula: '',
      edad: null,
      fecha_nacimiento: '',
      altura: '',
      peso: '',
      profesion: '',
      seguro: 'Particular',
      sexo: 'M',
      telefono: '',
      fotoUrl: '',
      tipo_sangre: '',
      direccion: ''
    };
    this.errorBusqueda = '';
  }

  getPatientPhoto(cedula: string): string {
    const paciente = this.patientService.findPatientByCedula(cedula);
    return paciente?.fotoUrl || '';
  }

  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/auth/login']);
  }
}