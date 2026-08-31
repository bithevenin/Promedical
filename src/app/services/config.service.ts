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
    email: 'dr.miguelthevenin@gmail.com',
    fotoUrl: 'https://i.pravatar.cc/150?u=doctor',
    montoConsultaParticular: 4000,
    exequatur: '34535',
    tarifasSeguros: [
      { id: 'ab975e42-92ca-46ac-9995-d1cf998b6ab8', seguro: 'ARS Humano', montoCobertura: 750, copago: 3000 },
      { id: 'b78d3821-cbf1-48bc-aab2-64075b3e9b78', seguro: 'ARS Primera', montoCobertura: 750, copago: 3000 },
      { id: '26b916d7-47f3-4020-ba10-c9d3042928c2', seguro: 'ARS Senasa', montoCobertura: 750, copago: 3000 },
      { id: '2560de46-59a4-4dc7-b392-48f2c53fac92', seguro: 'ARS Mapfre', montoCobertura: 750, copago: 3000 },
      { id: 'd2ff9b56-54d7-427d-a9b9-136fcfc38849', seguro: 'ARS Futuro', montoCobertura: 750, copago: 3000 },
      { id: '54d8815d-49d7-4aa8-98bb-45bc09ee8cb6', seguro: 'ARS Palic', montoCobertura: 750, copago: 3000 },
      { id: '7397ebfb-b7e4-48cb-ad52-e4d0df95fd62', seguro: 'universal', montoCobertura: 750, copago: 3000 },
      { id: '0b030875-1491-4911-9da3-5dc00785d1d7', seguro: 'renacer', montoCobertura: 750, copago: 3000 },
      { id: '7d84aad6-5b7f-4761-818d-76127c1632cc', seguro: 'monumental', montoCobertura: 750, copago: 3000 }
    ],
    facturacion: {
      tipoContribuyente: 'fisica',
      rncEmisor: '',
      razonSocial: 'Dr. Thevenin',
      nombreComercial: 'Consultorio Médico Dr. Thevenin',
      actividadEconomica: '85121 - Servicios Médicos Especializados',
      telefono: '',
      correoEmisor: 'dr.miguelthevenin@gmail.com',
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
    this.setupRealtimeSubscription();
  }

  private setupRealtimeSubscription() {
    try {
      this.supabase
        .channel('config-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracion_doctor' }, () => {
          this.refreshConfig();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tarifas_seguro' }, () => {
          this.refreshConfig();
        })
        .subscribe();
    } catch (e) {
      console.warn('[ConfigService] Could not setup realtime:', e);
    }
  }

  async refreshConfig() {
    try {
      if (navigator.onLine) {
        const { data: configRows, error: configError } = await this.supabase.from('configuracion_doctor').select('*');
        const { data: tarifas, error: tarifasError } = await this.supabase.from('tarifas_seguro').select('*');

        if (configError && configError.code !== 'PGRST116') throw configError;
        if (tarifasError) throw tarifasError;

        const configRow = Array.isArray(configRows) ? (configRows.find((r: any) => r.id === 1 || r.id === '1') || configRows[0]) : configRows;

        if (configRow) {
          const facturacionData = configRow.facturacion_json 
            ? (typeof configRow.facturacion_json === 'string' ? JSON.parse(configRow.facturacion_json) : configRow.facturacion_json)
            : this.defaultConfig.facturacion;

          const certificadoData = configRow.certificado_json
            ? (typeof configRow.certificado_json === 'string' ? JSON.parse(configRow.certificado_json) : configRow.certificado_json)
            : this.defaultConfig.certificado;

          const config: ConfiguracionDoctor = {
            nombreDoctor: configRow.nombre_doctor || this.defaultConfig.nombreDoctor,
            especialidad: configRow.especialidad || this.defaultConfig.especialidad,
            email: configRow.email || this.defaultConfig.email,
            fotoUrl: configRow.foto_url || this.defaultConfig.fotoUrl,
            montoConsultaParticular: configRow.monto_consulta_particular !== undefined ? Number(configRow.monto_consulta_particular) : this.defaultConfig.montoConsultaParticular,
            exequatur: configRow.exequatur || this.defaultConfig.exequatur,
            tarifasSeguros: (tarifas && tarifas.length > 0)
              ? tarifas.map((t: DbTarifaSeguro) => ({
                  id: t.id,
                  seguro: t.seguro,
                  montoCobertura: Number(t.monto_cobertura) || 0,
                  copago: Number(t.copago) || 0
                }))
              : this.defaultConfig.tarifasSeguros,
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
        id: 1,
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
        const { error: updateError } = await this.supabase.from('configuracion_doctor').upsert(dbConfigPayload);
        if (updateError) throw updateError;
        
        // Sincronizar tarifas: borrar y re-insertar
        await this.supabase.from('tarifas_seguro').delete().neq('seguro', 'NONE');
        if (config.tarifasSeguros.length > 0) {
          const inserts = config.tarifasSeguros.map(t => ({
            id: t.id || ('tar-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)),
            seguro: t.seguro,
            monto_cobertura: t.montoCobertura,
            copago: t.copago
          }));
          const { error: insertError } = await this.supabase.from('tarifas_seguro').insert(inserts);
          if (insertError) throw insertError;
        }
      } else {
        await this.offlineService.addToQueue('configuracion_doctor', 'upsert', dbConfigPayload, 'id', 1);
        await this.offlineService.addToQueue('tarifas_seguro', 'delete', null, 'seguro', 'NONE');
        if (config.tarifasSeguros.length > 0) {
          for (const t of config.tarifasSeguros) {
            await this.offlineService.addToQueue('tarifas_seguro', 'insert', {
              id: t.id,
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
        id: 1,
        nombre_doctor: config.nombreDoctor,
        especialidad: config.especialidad,
        foto_url: config.fotoUrl,
        email: config.email,
        monto_consulta_particular: config.montoConsultaParticular,
        exequatur: config.exequatur,
        facturacion_json: config.facturacion ? JSON.stringify(config.facturacion) : null
      };
      await this.offlineService.addToQueue('configuracion_doctor', 'upsert', dbConfigPayload, 'id', 1);
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
      const current = this.getConfig();
      const id = nuevaTarifa.id || ('tar-' + Date.now());
      const tarifaWithId = { ...nuevaTarifa, id };
      current.tarifasSeguros.push(tarifaWithId);
      await this.offlineService.saveLocalData('configuracion_doctor', { ...current, id: 1 });
      this.configSubject.next(current);

      const dbData = {
        id,
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
      const current = this.getConfig();
      current.tarifasSeguros = current.tarifasSeguros.filter(t => t.seguro !== nombreSeguro);
      await this.offlineService.saveLocalData('configuracion_doctor', { ...current, id: 1 });
      this.configSubject.next(current);

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
