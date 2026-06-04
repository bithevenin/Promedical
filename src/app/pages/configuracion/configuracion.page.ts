import { Component, OnInit, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { ConfigService, ConfiguracionDoctor, TarifaSeguro } from '../../services/config.service';
import { PatientService, Paciente } from '../../services/patient.service';
import { ConsultationService, Consulta } from '../../services/consultation.service';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { formatMonto } from '../../utils/format.utils';
import * as XLSX from 'xlsx';

@Component({
    selector: 'app-configuracion',
    templateUrl: './configuracion.page.html',
    styleUrls: ['./configuracion.page.scss'],
    standalone: false,
})
export class ConfiguracionPage implements OnInit {
    config: ConfiguracionDoctor = {
        nombreDoctor: '',
        especialidad: '',
        email: '',
        password: '',
        fotoUrl: '',
        montoConsultaParticular: 0,
        tarifasSeguros: []
    };

    guardando = false;
    mensajeExito = '';

    currentProfile = signal<any>(null);

    navigationItems = computed(() => {
        const base: any[] = [
            { icon: 'home-outline', label: 'Inicio', route: '/main' },
            { icon: 'grid-outline', label: 'Panel', route: '/dashboard' },
            { icon: 'calendar-outline', label: 'Citas', route: '/citas' },
            { icon: 'people-outline', label: 'Pacientes', route: '/pacientes' }
        ];

        if (this.currentProfile()?.rol === 'doctor' || this.currentProfile()?.rol === 'admin') {
            base.push({ icon: 'medical-outline', label: 'Consulta', route: '/consulta' });
            base.push({ icon: 'wallet-outline', label: 'Contabilidad', route: '/contabilidad' });
            base.push({ icon: 'settings-outline', label: 'Ajustes', active: true, route: '/configuracion' });
        }

        return base;
    });

    // Gestión de Usuarios
    selectedSegment = 'consultorio';
    usuarios: any[] = [];
    nuevoUsuario = {
        nombre: '',
        email: '',
        password: '',
        fotoUrl: 'https://ui-avatars.com/api/?name=User&background=random',
        rol: 'doctor',
        especialidad: ''
    };

    roles = [
        { value: 'admin', label: 'Administrador' },
        { value: 'doctor', label: 'Doctor' },
        { value: 'secretaria', label: 'Secretaria' }
    ];

    nuevoSeguro: TarifaSeguro = {
        seguro: '',
        montoCobertura: 0,
        copago: 0
    };

    formatMonto = formatMonto;

    constructor(
        private configService: ConfigService,
        private patientService: PatientService,
        private consultationService: ConsultationService,
        private authService: AuthService,
        private router: Router,
        public themeService: ThemeService
    ) { }

    ngOnInit() {
        this.cargarConfiguracion();
        this.cargarUsuarios();
        this.authService.profile$.subscribe(p => this.currentProfile.set(p));
    }

    cargarConfiguracion() {
        this.config = { ...this.configService.getConfig() };
        // Clonar tarifas para evitar mutación directa
        this.config.tarifasSeguros = this.config.tarifasSeguros.map(t => ({ ...t }));
    }

    async cargarUsuarios() {
        try {
            this.usuarios = await this.authService.getAllUsers();
        } catch (error) {
            console.error('Error al cargar usuarios:', error);
        }
    }

    async guardarConfiguracion() {
        this.guardando = true;
        try {
            // 1. Guardar configuración básica en la DB
            await this.configService.saveConfig(this.config);

            // 2. Si se proporcionó una contraseña y email, intentar registrar/actualizar el usuario en Auth
            // (Esta lógica se moverá a la gestión de usuarios, pero mantenemos compatibilidad por ahora si edita su propio perfil)
            if (this.config.email && this.config.password && this.config.password.length === 8) {
                // Opcional: Actualizar el usuario actual si coincide el email
            }

            this.mensajeExito = '¡Configuración guardada exitosamente!';
            setTimeout(() => {
                this.mensajeExito = '';
            }, 3000);
        } catch (error) {
            console.error('Error al guardar configuración:', error);
        } finally {
            this.guardando = false;
        }
    }

    agregarSeguro() {
        if (this.nuevoSeguro.seguro && !this.config.tarifasSeguros.find(t => t.seguro === this.nuevoSeguro.seguro)) {
            this.config.tarifasSeguros.push({ ...this.nuevoSeguro });
            // Resetear campos
            this.nuevoSeguro = { seguro: '', montoCobertura: 0, copago: 0 };
        }
    }

    eliminarSeguro(nombre: string) {
        this.config.tarifasSeguros = this.config.tarifasSeguros.filter(t => t.seguro !== nombre);
    }

    actualizarFoto(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.config.fotoUrl = e.target?.result as string;
            };
            reader.readAsDataURL(input.files[0]);
        }
    }

    usarFotoUrl(url: string) {
        this.config.fotoUrl = url;
    }

    // --- Métodos de Gestión de Usuarios ---

    async actualizarFotoNuevoUsuario(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];
            try {
                // Mostrar preview temporalmente (opcional, pero buena UX mientras sube)
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.nuevoUsuario.fotoUrl = e.target?.result as string;
                };
                reader.readAsDataURL(file);

                // Subir a Supabase
                const publicUrl = await this.authService.uploadAvatar(file);
                this.nuevoUsuario.fotoUrl = publicUrl;
                console.log('Avatar subido:', publicUrl);

            } catch (error) {
                console.error('Error al subir avatar:', error);
                alert('Error al subir la imagen');
            }
        }
    }

    actualizarNombreAvatar() {
        if (!this.nuevoUsuario.fotoUrl.startsWith('data:')) {
            this.nuevoUsuario.fotoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(this.nuevoUsuario.nombre || 'User')}&background=random&size=128`;
        }
    }

    async guardarNuevoUsuario() {
        if (!this.nuevoUsuario.email || !this.nuevoUsuario.password || !this.nuevoUsuario.nombre) {
            return;
        }

        this.guardando = true;
        try {
            await this.authService.signUp(
                this.nuevoUsuario.email,
                this.nuevoUsuario.password,
                this.nuevoUsuario.nombre,
                this.nuevoUsuario.fotoUrl,
                this.nuevoUsuario.rol,
                this.nuevoUsuario.especialidad
            );

            this.mensajeExito = '¡Usuario registrado exitosamente!';
            this.nuevoUsuario = {
                nombre: '',
                email: '',
                password: '',
                fotoUrl: 'https://ui-avatars.com/api/?name=User&background=random',
                rol: 'doctor',
                especialidad: ''
            };
            await this.cargarUsuarios();

            setTimeout(() => {
                this.mensajeExito = '';
            }, 3000);
        } catch (error: any) {
            console.error('Error al registrar usuario:', error);
            alert('Error: ' + (error.message || 'No se pudo crear el usuario'));
        } finally {
            this.guardando = false;
        }
    }

    async guardarEdicionUsuario(usuario: any) {
        try {
            await this.authService.updateUser(usuario.id, usuario.nombre, usuario.foto_url, usuario.rol, usuario.especialidad);
            alert('Usuario actualizado correctamente');
        } catch (error) {
            console.error('Error al actualizar usuario:', error);
        }
    }

    async actualizarFotoUsuarioExistente(event: Event, usuario: any) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];
            try {
                // Preview
                const reader = new FileReader();
                reader.onload = (e) => {
                    usuario.foto_url = e.target?.result as string;
                };
                reader.readAsDataURL(file);

                // Subir
                const publicUrl = await this.authService.uploadAvatar(file);
                usuario.foto_url = publicUrl;

                // Actualizar inmediatamente en BD
                await this.authService.updateUser(usuario.id, usuario.nombre, publicUrl, usuario.rol, usuario.especialidad);
                alert('Foto actualizada correctamente');

            } catch (error) {
                console.error('Error al subir/actualizar avatar:', error);
                alert('Error al subir la imagen');
            }
        }
    }

    async logout() {
        await this.authService.signOut();
        this.router.navigate(['/auth/login']);
    }

    // --- Gestión de Datos (Import/Export) ---

    async exportarPacientes() {
        const patients = this.patientService.getPatients();
        const ws = XLSX.utils.json_to_sheet(patients.map(p => ({
            'Cédula': p.cedula,
            'Nombre': p.nombre,
            'Fecha Nacimiento': p.fecha_nacimiento,
            'Teléfono': p.telefono,
            'Sexo': p.sexo,
            'Profesión': p.profesion,
            'Seguro': p.seguro,
            'Peso (kg)': p.peso,
            'Altura (cm)': p.altura,
            'Email': p.email,
            'Carnet Seguro': p.carnetSeguro
        })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Pacientes');
        XLSX.writeFile(wb, `Pacientes_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
    }

    async exportarHistorias() {
        const historias = await this.consultationService.getAllConsultations();
        const ws = XLSX.utils.json_to_sheet(historias.map(h => ({
            'Cédula Paciente': h.cedula,
            'Fecha': h.fecha,
            'Diagnóstico': h.diagnostico,
            'Receta': h.receta
        })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Historias_Clinicas');
        XLSX.writeFile(wb, `Historias_Clinicas_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
    }

    descargarPlantilla(tipo: 'pacientes' | 'historias') {
        let data: any[] = [];
        let fileName = '';

        if (tipo === 'pacientes') {
            data = [{
                'cedula': '000-0000000-0',
                'nombre': 'Juan Perez',
                'fecha_nacimiento': '1990-01-01',
                'telefono': '809-000-0000',
                'sexo': 'M',
                'profesion': 'Ingeniero',
                'seguro': 'ARS Humano',
                'peso': '70',
                'altura': '170'
            }];
            fileName = 'Plantilla_Importar_Pacientes.xlsx';
        } else {
            data = [{
                'cedula': '000-0000000-0',
                'fecha': '2024-01-01',
                'diagnostico': 'Gripe común',
                'receta': 'Acetaminofén 500mg cada 8h'
            }];
            fileName = 'Plantilla_Importar_Historias.xlsx';
        }

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
        XLSX.writeFile(wb, fileName);
    }

    async importarArchivo(event: any, tipo: 'pacientes' | 'historias') {
        const file = event.target.files[0];
        if (!file) return;

        this.guardando = true;
        const reader = new FileReader();
        reader.onload = async (e: any) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            // Función auxiliar para convertir fechas de Excel (serial numbers) a YYYY-MM-DD
            const formatExcelDate = (val: any): string => {
                if (!val) return '';
                if (val instanceof Date) {
                    return val.toISOString().split('T')[0];
                }
                if (typeof val === 'number') {
                    // Excel date serial to JS Date (offset 25569 days from 1900 to 1970)
                    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
                    return date.toISOString().split('T')[0];
                }
                return String(val).trim();
            };

            try {
                if (tipo === 'pacientes') {
                    const pacientes: Paciente[] = jsonData.map((row: any) => ({
                        cedula: String(row.cedula || row.Cédula || '').trim(),
                        nombre: String(row.nombre || row.Nombre || '').trim(),
                        edad: 0, // Will be recalculated in service
                        fecha_nacimiento: formatExcelDate(row.fecha_nacimiento || row['Fecha Nacimiento']),
                        telefono: String(row.telefono || row.Teléfono || '').trim(),
                        sexo: (String(row.sexo || row.Sexo || 'M').trim().toUpperCase()) as 'M' | 'F',
                        profesion: String(row.profesion || row.Profesión || '').trim(),
                        seguro: String(row.seguro || row.Seguro || 'Particular').trim(),
                        peso: String(row.peso || row['Peso (kg)'] || '').trim(),
                        altura: String(row.altura || row['Altura (cm)'] || '').trim(),
                        email: String(row.email || row.Email || '').trim(),
                        carnetSeguro: String(row.carnet_seguro || row['Carnet Seguro'] || '').trim()
                    })).filter((p: any) => p.cedula && p.nombre);

                    if (pacientes.length === 0) {
                        alert('No se encontraron pacientes válidos. Verifique que las columnas "cedula" y "nombre" tengan datos.');
                        this.guardando = false;
                        return;
                    }

                    const error = await this.patientService.importPatients(pacientes);
                    if (error) {
                        alert('Error al guardar pacientes: ' + ((error as any).message || JSON.stringify(error)));
                        this.guardando = false;
                        return;
                    }

                } else {
                    const consultas: Consulta[] = jsonData.map((row: any) => ({
                        cedula: String(row.cedula || row['Cédula Paciente'] || '').trim(),
                        fecha: formatExcelDate(row.fecha || row.Fecha || new Date().toISOString().split('T')[0]),
                        diagnostico: String(row.diagnostico || row.Diagnóstico || '').trim(),
                        receta: String(row.receta || row.Receta || '').trim()
                    })).filter((c: any) => c.cedula && c.diagnostico);

                    if (consultas.length === 0) {
                        alert('No se encontraron historias clínicas válidas.');
                        this.guardando = false;
                        return;
                    }

                    const error = await this.consultationService.importConsultations(consultas);
                    if (error) {
                        alert('Error al guardar historias: ' + ((error as any).message || JSON.stringify(error)));
                        this.guardando = false;
                        return;
                    }
                }

                alert(`¡Se han importado ${tipo} correctamente!`);
                this.mensajeExito = `¡Importación de ${tipo} completada con éxito!`;
                setTimeout(() => this.mensajeExito = '', 3000);
            } catch (error) {
                console.error('Error al importar:', error);
                alert('Error al procesar el archivo. Verifique el formato.');
            } finally {
                this.guardando = false;
                event.target.value = ''; // Reset input
            }
        };
        reader.readAsArrayBuffer(file);
    }
}
