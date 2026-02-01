import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CitasService, ConfiguracionDoctor, TarifaSeguro } from '../../services/citas.service';
import { AuthService } from '../../services/auth.service';

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
        { value: 'recepcion', label: 'Recepción' },
        { value: 'enfermera', label: 'Enfermera' }
    ];

    nuevoSeguro: TarifaSeguro = {
        seguro: '',
        montoCobertura: 0,
        copago: 0
    };

    constructor(
        private citasService: CitasService,
        private authService: AuthService,
        private router: Router
    ) { }

    ngOnInit() {
        this.cargarConfiguracion();
        this.cargarUsuarios();
        this.authService.profile$.subscribe(p => this.currentProfile.set(p));
    }

    cargarConfiguracion() {
        this.config = { ...this.citasService.getConfig() };
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
            await this.citasService.saveConfig(this.config);

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
}
