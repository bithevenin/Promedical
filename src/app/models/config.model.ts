export interface TarifaSeguro {
  id?: string;
  seguro: string;
  montoCobertura: number;
  copago: number;
}

export interface ConfiguracionDoctor {
  id?: number;
  nombreDoctor: string;
  especialidad: string;
  email?: string;
  password?: string;
  fotoUrl: string;
  montoConsultaParticular: number;
  tarifasSeguros: TarifaSeguro[];
}
