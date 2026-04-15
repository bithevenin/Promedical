import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';

export interface TarifaSeguro {
  seguro: string;
  montoCobertura: number;
  copago: number;
}

export interface ConfiguracionDoctor {
  nombreDoctor: string;
  especialidad: string;
  email?: string;
  password?: string;
  fotoUrl: string;
  montoConsultaParticular: number;
  tarifasSeguros: TarifaSeguro[];
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
    tarifasSeguros: [
      { seguro: 'ARS Humano', montoCobertura: 500, copago: 200 },
      { seguro: 'ARS Primera', montoCobertura: 450, copago: 250 },
      { seguro: 'ARS Senasa', montoCobertura: 400, copago: 0 },
      { seguro: 'ARS Mapfre', montoCobertura: 500, copago: 200 },
      { seguro: 'ARS Futuro', montoCobertura: 450, copago: 250 },
      { seguro: 'ARS Palic', montoCobertura: 480, copago: 220 }
    ]
  };

  private configSubject = new BehaviorSubject<ConfiguracionDoctor>(this.defaultConfig);
  config$ = this.configSubject.asObservable();

  constructor(private supabaseService: SupabaseService) {
    this.refreshConfig();
  }

  async refreshConfig() {
    try {
      const { data: configRows, error: configError } = await this.supabase.from('configuracion_doctor').select('*').single();
      const { data: tarifas, error: tarifasError } = await this.supabase.from('tarifas_seguro').select('*');

      if (configRows) {
        const config: ConfiguracionDoctor = {
          nombreDoctor: configRows.nombre_doctor,
          especialidad: configRows.especialidad,
          email: configRows.email,
          fotoUrl: configRows.foto_url,
          montoConsultaParticular: configRows.monto_consulta_particular,
          tarifasSeguros: (tarifas || []).map((t: any) => ({
            seguro: t.seguro,
            montoCobertura: t.monto_cobertura,
            copago: t.copago
          }))
        };
        this.configSubject.next(config);
      } else {
        this.configSubject.next(this.defaultConfig);
      }
    } catch (error) {
      console.error('Error fetching config:', error);
      this.configSubject.next(this.defaultConfig);
    }
  }

  async saveConfig(config: ConfiguracionDoctor) {
    try {
      // 1. Update doctor basic info
      const { error: updateError } = await this.supabase.from('configuracion_doctor').update({
        nombre_doctor: config.nombreDoctor,
        especialidad: config.especialidad,
        email: config.email,
        foto_url: config.fotoUrl,
        monto_consulta_particular: config.montoConsultaParticular
      }).eq('id', 1);
      
      if (updateError) throw updateError;

      // 2. Manage insurance rates
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

      await this.refreshConfig();
    } catch (error) {
      console.error('Error saving config:', error);
      throw error;
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
      const { error } = await this.supabase.from('tarifas_seguro').insert({
        seguro: nuevaTarifa.seguro,
        monto_cobertura: nuevaTarifa.montoCobertura,
        copago: nuevaTarifa.copago
      });
      if (error) throw error;
      await this.refreshConfig();
    } catch (error) {
      console.error('Error adding insurance:', error);
      throw error;
    }
  }

  async eliminarSeguro(nombreSeguro: string) {
    try {
      const { error } = await this.supabase.from('tarifas_seguro').delete().eq('seguro', nombreSeguro);
      if (error) throw error;
      await this.refreshConfig();
    } catch (error) {
      console.error('Error removing insurance:', error);
      throw error;
    }
  }
}
