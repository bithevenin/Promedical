import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { OfflineService } from './offline.service';
import { TarifaSeguro, ConfiguracionDoctor } from '../models';

interface DbTarifaSeguro {
  id?: string;
  seguro: string;
  monto_cobertura: number;
  copago: number;
}

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private supabase = this.supabaseService.client;
  
  private defaultConfig: ConfiguracionDoctor = {
    nombreDoctor: 'Dr. Thevenin',
    especialidad: 'Urólogo',
    email: 'doctor@promedical.com',
    fotoUrl: 'https://i.pravatar.cc/150?u=doctor',
    montoConsultaParticular: 1500,
    exequatur: '',
    tarifasSeguros: [
      { seguro: 'ARS Humano', montoCobertura: 500, copago: 200 },
      { seguro: 'ARS Primera', montoCobertura: 450, copago: 250 },
      { seguro: 'ARS Senasa', montoCobertura: 400, copago: 0 },
      { seguro: 'ARS Mapfre', montoCobertura: 500, copago: 200 },
      { seguro: 'ARS Futuro', montoCobertura: 450, copago: 250 },
      { seguro: 'ARS Palic', montoCobertura: 480, copago: 220 }
    ],
    facturacion: {
      tipoContribuyente: 'fisica',
      rncEmisor: '',
      razonSocial: 'Dr. Thevenin',
      nombreComercial: 'Consultorio Médico Dr. Thevenin',
      actividadEconomica: '85121 - Servicios Médicos Especializados',
      telefono: '',
      correoEmisor: 'doctor@promedical.com',
      direccionFiscal: '',
      provincia: 'Santiago',
      municipio: 'Santiago de los Caballeros',
      ambiente: 'certecf',
      apiUrlDgii: 'http://192.168.1.15:8000',
      formatoImpresion: 'termico_80mm',
      impresionAutomatica: true,
      pieFactura: 'Servicio Médico Exento de ITBIS según Art. 344 del Código Tributario.'
    },
    certificado: {
      nombreArchivo: '',
      rutaArchivo: '',
      passwordCertificado: '',
      emisor: 'Avansi / DIGIFIRMA (Acreditado INDOTEL)',
      sujeto: 'Dr. Thevenin',
      rncSujeto: '',
      fechaEmision: '',
      fechaVencimiento: '',
      estado: 'no_configurado',
      serialNumber: ''
    }
  };

  private configSubject = new BehaviorSubject<ConfiguracionDoctor>(this.defaultConfig);
  config$ = this.configSubject.asObservable();

  constructor(
    private supabaseService: SupabaseService,
    private offlineService: OfflineService
  ) {
    this.refreshConfig();
  }

  async refreshConfig() {
    try {
      if (navigator.onLine) {
        const { data: configRows, error: configError } = await this.supabase.from('configuracion_doctor').select('*').single();
        const { data: tarifas, error: tarifasError } = await this.supabase.from('tarifas_seguro').select('*');

        if (configError && configError.code !== 'PGRST116') throw configError; // PGRST116 is empty table
        if (tarifasError) throw tarifasError;

        if (configRows) {
          console.log('[ConfigService] Row from Supabase:', JSON.stringify(configRows));
          const facturacionData = configRows.facturacion_json 
            ? (typeof configRows.facturacion_json === 'string' ? JSON.parse(configRows.facturacion_json) : configRows.facturacion_json)
            : this.defaultConfig.facturacion;

          const certificadoData = configRows.certificado_json
            ? (typeof configRows.certificado_json === 'string' ? JSON.parse(configRows.certificado_json) : configRows.certificado_json)
            : this.defaultConfig.certificado;

          const config: ConfiguracionDoctor = {
            nombreDoctor: configRows.nombre_doctor,
            especialidad: configRows.especialidad,
            email: configRows.email || this.defaultConfig.email,
            fotoUrl: configRows.foto_url,
            montoConsultaParticular: configRows.monto_consulta_particular,
            exequatur: configRows.exequatur || '',
            tarifasSeguros: (tarifas || []).map((t: DbTarifaSeguro) => ({
              id: t.id,
              seguro: t.seguro,
              montoCobertura: t.monto_cobertura,
              copago: t.copago
            })),
            facturacion: { ...this.defaultConfig.facturacion, ...facturacionData },
            certificado: { ...this.defaultConfig.certificado, ...certificadoData }
          };

          await this.offlineService.saveLocalData('configuracion_doctor', { ...config, id: 1 });
          this.configSubject.next(config);
          return;
        }
      }
    } catch (error) {
      console.warn('Network issue, fetching config from offline storage:', error);
    }

    const local = await this.offlineService.getLocalData<ConfiguracionDoctor>('configuracion_doctor');
    if (local.length > 0) {
      const merged: ConfiguracionDoctor = {
        ...this.defaultConfig,
        ...local[0],
        facturacion: {
          ...this.defaultConfig.facturacion!,
          ...(local[0].facturacion || {})
        },
        certificado: {
          ...this.defaultConfig.certificado!,
          ...(local[0].certificado || {})
        }
      };
      this.configSubject.next(merged);
    } else {
      this.configSubject.next(this.defaultConfig);
    }
  }

  async saveConfig(config: ConfiguracionDoctor) {
    try {
      // 1. Save locally
      await this.offlineService.saveLocalData('configuracion_doctor', { ...config, id: 1 });
      this.configSubject.next(config);

      // 2. Sync Configuration Info
      const dbConfigPayload = {
        nombre_doctor: config.nombreDoctor,
        especialidad: config.especialidad,
        foto_url: config.fotoUrl,
        email: config.email,
        monto_consulta_particular: config.montoConsultaParticular,
        exequatur: config.exequatur,
        facturacion_json: config.facturacion ? JSON.stringify(config.facturacion) : null,
        certificado_json: config.certificado ? JSON.stringify(config.certificado) : null
      };

      if (navigator.onLine) {
        console.log('[ConfigService] Saving to Supabase:', JSON.stringify(dbConfigPayload));
        const { data: updData, error: updateError } = await this.supabase.from('configuracion_doctor').update(dbConfigPayload).eq('id', 1).select();
        console.log('[ConfigService] Update result:', JSON.stringify(updData), 'Error:', updateError);
        if (updateError) throw updateError;
        
        // Sincronizar tarifas: borrar y re-insertar
        await this.supabase.from('tarifas_seguro').delete().neq('seguro', 'NONE');
        if (config.tarifasSeguros.length > 0) {
          const inserts = config.tarifasSeguros.map(t => ({
            seguro: t.seguro,
            monto_cobertura: t.montoCobertura,
            copago: t.copago
          }));
          const { error: insertError } = await this.supabase.from('tarifas_seguro').insert(inserts);
          if (insertError) throw insertError;
        }
      } else {
        await this.offlineService.addToQueue('configuracion_doctor', 'update', dbConfigPayload, 'id', 1);
        // Sincronizar tarifas offline
        await this.offlineService.addToQueue('tarifas_seguro', 'delete', null, 'seguro', 'NONE');
        if (config.tarifasSeguros.length > 0) {
          for (const t of config.tarifasSeguros) {
            await this.offlineService.addToQueue('tarifas_seguro', 'insert', {
              seguro: t.seguro,
              monto_cobertura: t.montoCobertura,
              copago: t.copago
            });
          }
        }
      }
      await this.refreshConfig();
    } catch (error) {
      console.warn('Error saving config, queueing updates:', error);
      const dbConfigPayload = {
        nombre_doctor: config.nombreDoctor,
        especialidad: config.especialidad,
        foto_url: config.fotoUrl,
        email: config.email,
        monto_consulta_particular: config.montoConsultaParticular,
        exequatur: config.exequatur,
        facturacion_json: config.facturacion ? JSON.stringify(config.facturacion) : null
      };
      await this.offlineService.addToQueue('configuracion_doctor', 'update', dbConfigPayload, 'id', 1);
    }
  }

  getConfig(): ConfiguracionDoctor {
    return this.configSubject.value;
  }

  getTarifaSeguro(seguro: string): TarifaSeguro | undefined {
    return this.getConfig().tarifasSeguros.find(t => t.seguro === seguro);
  }

  async agregarSeguro(nuevaTarifa: TarifaSeguro) {
    try {
      // 1. Save locally
      const current = this.getConfig();
      current.tarifasSeguros.push(nuevaTarifa);
      await this.offlineService.saveLocalData('configuracion_doctor', { ...current, id: 1 });
      this.configSubject.next(current);

      // 2. Sync
      const dbData = {
        seguro: nuevaTarifa.seguro,
        monto_cobertura: nuevaTarifa.montoCobertura,
        copago: nuevaTarifa.copago
      };

      if (navigator.onLine) {
        const { error } = await this.supabase.from('tarifas_seguro').insert(dbData);
        if (error) throw error;
      } else {
        await this.offlineService.addToQueue('tarifas_seguro', 'insert', dbData);
      }
      await this.refreshConfig();
    } catch (error) {
      console.warn('Error adding insurance, queueing write:', error);
      const dbData = {
        seguro: nuevaTarifa.seguro,
        monto_cobertura: nuevaTarifa.montoCobertura,
        copago: nuevaTarifa.copago
      };
      await this.offlineService.addToQueue('tarifas_seguro', 'insert', dbData);
    }
  }

  async eliminarSeguro(nombreSeguro: string) {
    try {
      // 1. Save locally
      const current = this.getConfig();
      current.tarifasSeguros = current.tarifasSeguros.filter(t => t.seguro !== nombreSeguro);
      await this.offlineService.saveLocalData('configuracion_doctor', { ...current, id: 1 });
      this.configSubject.next(current);

      // 2. Sync
      if (navigator.onLine) {
        const { error } = await this.supabase.from('tarifas_seguro').delete().eq('seguro', nombreSeguro);
        if (error) throw error;
      } else {
        await this.offlineService.addToQueue('tarifas_seguro', 'delete', null, 'seguro', nombreSeguro);
      }
      await this.refreshConfig();
    } catch (error) {
      console.warn('Error removing insurance, queueing deletion:', error);
      await this.offlineService.addToQueue('tarifas_seguro', 'delete', null, 'seguro', nombreSeguro);
    }
  }
}
