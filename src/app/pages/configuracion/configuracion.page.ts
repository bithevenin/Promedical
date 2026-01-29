import { Component, OnInit } from '@angular/core';
import { CitasService, ConfiguracionDoctor, TarifaSeguro } from '../../services/citas.service';

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
        fotoUrl: '',
        montoConsultaParticular: 0,
        tarifasSeguros: []
    };

    guardando = false;
    mensajeExito = '';

    nuevoSeguro: TarifaSeguro = {
        seguro: '',
        montoCobertura: 0,
        copago: 0
    };

    constructor(private citasService: CitasService) { }

    ngOnInit() {
        this.cargarConfiguracion();
    }

    cargarConfiguracion() {
        this.config = { ...this.citasService.getConfig() };
        // Clonar tarifas para evitar mutación directa
        this.config.tarifasSeguros = this.config.tarifasSeguros.map(t => ({ ...t }));
    }

    async guardarConfiguracion() {
        this.guardando = true;
        try {
            await this.citasService.saveConfig(this.config);
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
}
