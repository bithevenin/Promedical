import { Component, OnInit, signal, computed, HostListener } from '@angular/core';
import { AppointmentService } from '../../services/appointment.service';
import { PatientService } from '../../services/patient.service';
import { Cita, Paciente, UserProfile } from '../../models';
import { ConfigService } from '../../services/config.service';
import { FinancialService } from '../../services/financial.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { NotificationService } from '../../services/notification.service';
import { ToastController } from '@ionic/angular';
import { ThemeService } from '../../services/theme.service';
import { formatMonto, parseJCEDate } from '../../utils/format.utils';

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
  tipo_sangre?: string;
  tipoSangre?: string;
  grupoSanguineo?: string;
  grupo_sanguineo?: string;
  sangre?: string;
}

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
  fotoTemporal = '';

  cedulaOriginal: string = '';

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

  currentProfile = signal<UserProfile | null>(null);

  // Listado de pacientes para agendamiento
  listaPacientes: Paciente[] = [];
  pacientesFiltrados: Paciente[] = [];
  mostrarDropdownPacientes = false;
  activeSearchField: 'cedula' | 'nombre' | null = null;
  private searchTimeout: any;

  setActiveSearchField(field: 'cedula' | 'nombre') {
    this.activeSearchField = field;
  }

  @HostListener('document:click')
  closeCitasDropdowns() {
    this.mostrarDropdownPacientes = false;
  }

  navigationItems = computed(() => {
    const base: { icon: string; label: string; route: string; active?: boolean }[] = [
      { icon: 'home-outline', label: 'Inicio', route: '/main' },
      { icon: 'grid-outline', label: 'Panel', route: '/dashboard' },
      { icon: 'calendar-outline', label: 'Citas', active: true, route: '/citas' }
    ];

    if (this.currentProfile()?.rol === 'doctor' || this.currentProfile()?.rol === 'admin') {
      base.push({ icon: 'people-outline', label: 'Pacientes', route: '/pacientes' });
      base.push({ icon: 'medical-outline', label: 'Consulta', route: '/consulta' });
      base.push({ icon: 'wallet-outline', label: 'Contabilidad', route: '/contabilidad' });
      base.push({ icon: 'settings-outline', label: 'Ajustes', route: '/configuracion' });
    }

    if (this.currentProfile()?.rol === 'secretaria' || this.currentProfile()?.rol === 'admin' || this.currentProfile()?.rol === 'doctor') {      base.push({ icon: 'lock-closed-outline', label: 'Turno', route: '/cierre-turno' });    }    return base;
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
    private notificationService: NotificationService,
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

  get montoCobroInput(): number {
    return this.datosCobro.diferencia;
  }

  set montoCobroInput(val: number) {
    this.datosCobro.diferencia = val;
    this.calcularTotal();
  }

  onInstruccionCobroChange() {
    if (this.citaParaCobrar) {
      this.cobrar(this.citaParaCobrar);
    }
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

    this.isLoadingJce = true;
    this.errorBusqueda = '';
    try {
      // 1. Buscar primero en la base de datos local (soporta cédulas normales e IMPORTADAS tipo IMP-...)
      const localPatient = this.patientService.findPatientByCedula(this.nuevoPaciente.cedula);
      if (localPatient) {
        this.nuevoPaciente = {
          ...this.nuevoPaciente,
          cedula: localPatient.cedula,
          nombre: localPatient.nombre,
          edad: localPatient.edad,
          fecha_nacimiento: localPatient.fecha_nacimiento || '',
          profesion: localPatient.profesion || '',
          seguro: localPatient.seguro || 'Particular',
          sexo: localPatient.sexo || 'M',
          altura: localPatient.altura || '',
          peso: localPatient.peso || '',
          telefono: localPatient.telefono || '',
          fotoUrl: localPatient.fotoUrl || '',
          tipo_sangre: localPatient.tipo_sangre || '',
          direccion: localPatient.direccion || ''
        };
        this.carnetSeguroTemp = localPatient.carnetSeguro || '';
        this.isLoadingJce = false;
        return;
      }

      // 2. Si no es un paciente guardado, consultar la JCE (requiere 11 dígitos)
      const cleanCedula = this.nuevoPaciente.cedula.replace(/[^0-9]/g, '');
      if (cleanCedula.length !== 11) {
        this.errorBusqueda = 'La cédula debe contener exactamente 11 dígitos para consultar JCE.';
        this.isLoadingJce = false;
        return;
      }

      const result = await this.patientService.consultarJCE(cleanCedula) as JceResult;
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

        // Ocupación
        if ((result.ocupacion || result.ocupación) && !this.nuevoPaciente.profesion) {
          this.nuevoPaciente.profesion = result.ocupacion || result.ocupación || '';
        }

        // Dirección
        if (!this.nuevoPaciente.direccion) {
          this.nuevoPaciente.direccion = result.direccion || result.dirección ||
            [result.lugarNacimiento].filter(Boolean).join(', ') || '';
        }

        // Tipo de Sangre
        if (result.tipo_sangre) {
          this.nuevoPaciente.tipo_sangre = result.tipo_sangre;
        }

        // Foto
        this.fotoTemporal = result.fotoUrl || '';
        this.nuevoPaciente.fotoUrl = result.fotoUrl || this.nuevoPaciente.fotoUrl || '';
      }
    } catch (error: any) {
      console.error('Error JCE lookup in Citas:', error);
      const errMsg = error.message || error || 'No se pudo conectar con el servidor JCE';
      this.errorBusqueda = errMsg;
      this.notificationService.showError('Consulta Cédula JCE', errMsg);
    } finally {
      this.isLoadingJce = false;
    }
  }

  async registrarCita() {
    if (this.nuevoPaciente.nombre && this.nuevoPaciente.cedula && this.nuevoPaciente.fecha_nacimiento) {
      // Calcular edad automáticamente si se tiene la fecha de nacimiento
      this.nuevoPaciente.edad = this.patientService.calcularEdad(this.nuevoPaciente.fecha_nacimiento);

      // 1. Guardar/Actualizar en el registro de pacientes
      const existingPatient = this.patientService.findPatientByCedula(this.cedulaOriginal || this.nuevoPaciente.cedula);
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
        fotoUrl: this.nuevoPaciente.fotoUrl || existingPatient?.fotoUrl,
        direccion: this.nuevoPaciente.direccion,
        antecedentesPersonales: existingPatient?.antecedentesPersonales || (existingPatient as any)?.antecedentes_personales || '',
        antecedentesFamiliares: existingPatient?.antecedentesFamiliares || (existingPatient as any)?.antecedentes_familiares || '',
        alergias: existingPatient?.alergias || '',
        email: existingPatient?.email || ''
      };
      await this.patientService.savePatient(datosPaciente, this.cedulaOriginal);

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

  ionViewWillEnter() {
    this.patientService.refreshPatients();
    this.appointmentService.refreshAppointments();
  }

  filtrarPacientes(event: any) {
    const rawVal = (event.target.value || '').trim();
    if (!rawVal || rawVal.length < 2) {
      this.pacientesFiltrados = [];
      this.mostrarDropdownPacientes = false;
      return;
    }

    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    this.searchTimeout = setTimeout(async () => {
      if (navigator.onLine) {
        this.pacientesFiltrados = await this.patientService.buscarPacientesRemoto(rawVal);
      } else {
        // Búsqueda local offline (solo en los recientes guardados en caché)
        const normQuery = rawVal.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const queryWords: string[] = normQuery.split(/\s+/).filter(Boolean);
        const cleanDigits = rawVal.replace(/[^0-9]/g, '');

        let matches = this.listaPacientes.filter(p => {
          let matchCedula = false;
          if (p.cedula) {
            const pCleanCedula = p.cedula.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
            matchCedula = pCleanCedula.includes(normQuery) || (cleanDigits !== '' && pCleanCedula.includes(cleanDigits));
          }
          
          let matchNombre = false;
          if (p.nombre) {
            const normNombre = p.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            matchNombre = queryWords.length > 0 && queryWords.every((word: string) => normNombre.includes(word));
          }
          
          return matchCedula || matchNombre;
        });

        this.pacientesFiltrados = matches.slice(0, 15);
      }
      
      this.mostrarDropdownPacientes = this.pacientesFiltrados.length > 0;
    }, 300);
  }

  seleccionarPacienteDeLista(paciente: Paciente) {
    this.cedulaOriginal = paciente.cedula;
    this.nuevoPaciente = {
      nombre: paciente.nombre,
      cedula: paciente.cedula && paciente.cedula.startsWith('IMP-') ? '' : paciente.cedula,
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

    if (!paciente.fotoUrl && paciente.cedula) {
      this.patientService.fetchPhotoIfMissing(paciente.cedula).then(() => {
        const updated = this.patientService.findPatientByCedula(paciente.cedula);
        if (updated && updated.fotoUrl) {
          this.nuevoPaciente.fotoUrl = updated.fotoUrl;
        }
      });
    }
  }

  limpiarFormulario() {
    this.cedulaOriginal = '';
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