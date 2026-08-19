// Types for the proposal template editor

export interface ElementStyle {
  fontSize?: number;
  fontWeight?: 'normal' | 'bold' | 'semibold' | 'light';
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  padding?: number;
  opacity?: number;
  lineHeight?: number;
}

export interface CanvasElementData {
  id: string;
  type: 'text' | 'image' | 'shape' | 'icon' | 'dynamic-field' | 'qr-code' | 'plans-comparison';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  style: ElementStyle;
  content: string;
  locked: boolean;
  zIndex: number;
}

export interface TemplatePage {
  id: string;
  elements: CanvasElementData[];
  backgroundColor?: string;
}

export interface ProposalTemplate {
  id: string;
  name: string;
  description?: string;
  type: 'inicial' | 'definitiva';
  pages: TemplatePage[];
  thumbnail_url?: string;
  is_active: boolean;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

// Dynamic fields available for proposals
export const DYNAMIC_FIELDS = [
  { key: '{{cliente_nome}}', label: 'Nome do Cliente', category: 'cliente' },
  { key: '{{cliente_cidade}}', label: 'Cidade', category: 'cliente' },
  { key: '{{cliente_uf}}', label: 'UF', category: 'cliente' },
  { key: '{{cliente_cpf_cnpj}}', label: 'CPF/CNPJ', category: 'cliente' },
  { key: '{{cliente_email}}', label: 'E-mail', category: 'cliente' },
  { key: '{{cliente_telefone}}', label: 'Telefone', category: 'cliente' },
  
  { key: '{{desconto_percentual}}', label: 'Desconto (%)', category: 'comercial' },
  { key: '{{economia_mensal}}', label: 'Economia Mensal', category: 'comercial' },
  { key: '{{economia_anual}}', label: 'Economia Anual', category: 'comercial' },
  { key: '{{economia_acumulada}}', label: 'Economia Acumulada', category: 'comercial' },
  { key: '{{valor_sem_coesa}}', label: 'Valor Sem COESA', category: 'comercial' },
  { key: '{{valor_com_coesa}}', label: 'Valor Com COESA', category: 'comercial' },
  
  { key: '{{consumo_medio}}', label: 'Consumo Médio (kWh)', category: 'instalacao' },
  { key: '{{fidelidade_anos}}', label: 'Fidelidade (anos)', category: 'instalacao' },
  { key: '{{fidelidade_meses}}', label: 'Fidelidade (meses)', category: 'instalacao' },
  { key: '{{concessionaria}}', label: 'Concessionária', category: 'instalacao' },
  { key: '{{tipo_instalacao}}', label: 'Tipo de Instalação', category: 'instalacao' },
  
  { key: '{{data_emissao}}', label: 'Data de Emissão', category: 'documento' },
  { key: '{{data_validade}}', label: 'Data de Validade', category: 'documento' },
  { key: '{{numero_proposta}}', label: 'Número da Proposta', category: 'documento' },
  
  { key: '{{qr_whatsapp}}', label: 'QR Code WhatsApp', category: 'especial' },
  { key: '{{logo_coesa}}', label: 'Logo COESA', category: 'especial' },
] as const;

export type DynamicFieldKey = typeof DYNAMIC_FIELDS[number]['key'];

// Element presets for the toolbar
export const ELEMENT_PRESETS = {
  heading: {
    type: 'text' as const,
    width: 400,
    height: 60,
    style: {
      fontSize: 32,
      fontWeight: 'bold' as const,
      color: '#1f2937',
      textAlign: 'center' as const,
    },
    content: 'Título',
  },
  subheading: {
    type: 'text' as const,
    width: 300,
    height: 40,
    style: {
      fontSize: 20,
      fontWeight: 'semibold' as const,
      color: '#374151',
      textAlign: 'left' as const,
    },
    content: 'Subtítulo',
  },
  paragraph: {
    type: 'text' as const,
    width: 400,
    height: 80,
    style: {
      fontSize: 14,
      fontWeight: 'normal' as const,
      color: '#4b5563',
      textAlign: 'left' as const,
      lineHeight: 1.5,
    },
    content: 'Parágrafo de texto. Clique para editar.',
  },
  rectangle: {
    type: 'shape' as const,
    width: 200,
    height: 100,
    style: {
      backgroundColor: '#e5e7eb',
      borderRadius: 8,
    },
    content: 'rectangle',
  },
  circle: {
    type: 'shape' as const,
    width: 100,
    height: 100,
    style: {
      backgroundColor: '#10b981',
      borderRadius: 50,
    },
    content: 'circle',
  },
  line: {
    type: 'shape' as const,
    width: 200,
    height: 4,
    style: {
      backgroundColor: '#9ca3af',
      borderRadius: 2,
    },
    content: 'line',
  },
};

// A4 dimensions in pixels (at 96 DPI)
export const A4_WIDTH = 794; // 210mm
export const A4_HEIGHT = 1123; // 297mm
