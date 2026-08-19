// Tipos para validação cruzada de dados

export interface DataDivergence {
  campo: string;
  campoLabel: string;
  valorOriginal: string | number | null;
  valorExtraido: string | number | null;
  fonte: 'bitrix24' | 'proposta_inicial';
  prioridade: 'extraido'; // Sempre usar o extraído
  tipo: 'texto' | 'numero' | 'documento';
}

export interface ComparisonResult {
  hasDivergences: boolean;
  divergences: DataDivergence[];
  totalCamposComparados: number;
  totalDivergencias: number;
}

export interface OriginalData {
  cliente_nome?: string;
  cliente_cpf_cnpj?: string;
  cliente_endereco?: string;
  cliente_cep?: string;
  cliente_cidade?: string;
  cliente_uf?: string;
  consumo_medio?: number;
  tipo_instalacao?: string;
  concessionaria?: string;
  numero_instalacao?: string;
}

export interface ExtractedDataForComparison {
  nome_completo?: string | null;
  cpf_cnpj_titular?: string | null;
  cpf?: string | null;
  endereco?: string | null;
  cep?: string | null;
  cidade?: string | null;
  uf?: string | null;
  consumo_media_anual?: number | null;
  consumo_kwh?: number | null;
  tipo_instalacao?: string | null;
  concessionaria?: string | null;
  numero_uc?: string | null;
}

// Tipos para validação anti-fraude de titularidade
export interface TitularidadeValidation {
  documentos_mesmo_titular: boolean;
  cpf_identificacao: string | null;
  cpf_cnpj_conta: string | null;
  tipo_divergencia: 'cpf_diferente' | 'cnpj_pj' | 'dados_incompletos' | null;
  confianca_validacao: number; // 0-100
}

export interface FraudeAlertaData {
  proposta_id?: string;
  cpf_identificacao: string | null;
  cpf_cnpj_conta: string | null;
  tipo_alerta: 'cpf_diferente' | 'documento_invalido' | 'cnpj_pj_pendente';
  dados_extraidos?: Record<string, unknown>;
  ip_cliente?: string;
  user_agent?: string;
}
