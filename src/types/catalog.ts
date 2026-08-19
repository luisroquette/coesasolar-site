/**
 * Catalog Item Pattern - Base Types
 * 
 * Padrão reaproveitável para "Ação Fixa + Seleção de Catálogo"
 * Usado para mapear entidades configuráveis (Etapas CRM, Filas, Automações, etc.)
 * 
 * @see .lovable/plan.md - Seção "Padrão Reaproveitável"
 */

// ============================================================================
// BASE TYPES
// ============================================================================

/**
 * Item base de qualquer catálogo
 * Todos os catálogos específicos devem estender esta interface
 */
export interface CatalogItem {
  /** ID técnico enviado ao backend/API (ex: "UC_9SLRPP", "QUEUE_001") */
  id: string;
  /** Nome amigável exibido na UI (ex: "Proposta Inicial", "Fila Vendas") */
  label: string;
}

/**
 * Metadados opcionais para itens de catálogo
 */
export interface CatalogItemMetadata {
  /** Descrição detalhada do item */
  description?: string;
  /** Ordem de exibição */
  sortOrder?: number;
  /** Se o item está ativo */
  isActive?: boolean;
  /** Cor ou ícone associado */
  color?: string;
  icon?: string;
}

// ============================================================================
// BITRIX24 - STAGES (Etapas do CRM)
// ============================================================================

/**
 * Target field para etapas do Bitrix24
 * - STATUS_ID: Estágios genéricos (NEW, IN_PROCESS, WON, JUNK)
 * - STAGE_ID: Estágios customizados de pipeline (UC_*, DT*_*)
 */
export type BitrixStageTarget = 'STATUS_ID' | 'STAGE_ID';

/**
 * Definição de uma etapa do Bitrix24
 * Usado para configurar quais etapas estão disponíveis para movimentação de leads
 */
export interface BitrixStageDefinition extends CatalogItem, Partial<CatalogItemMetadata> {
  /** Campo técnico no CRM que será alterado */
  target: BitrixStageTarget;
}

// ============================================================================
// BITRIX24 - QUEUES (Filas de Atendimento)
// ============================================================================

/**
 * Definição de uma fila de atendimento
 */
export interface QueueDefinition extends CatalogItem, Partial<CatalogItemMetadata> {
  /** Departamento associado à fila */
  department?: string;
  /** Tipo da fila */
  type?: 'internal' | 'external' | 'mixed';
}

// ============================================================================
// AUTOMATIONS (Automações/Webhooks)
// ============================================================================

/**
 * Definição de uma automação que pode ser disparada
 */
export interface AutomationDefinition extends CatalogItem, Partial<CatalogItemMetadata> {
  /** URL do webhook a ser chamado (se aplicável) */
  webhookUrl?: string;
  /** Tipo de automação */
  type?: 'webhook' | 'internal' | 'bitrix_bp';
  /** ID da automação no Bitrix (se for Business Process) */
  bitrixBpId?: string;
}

// ============================================================================
// OWNERS (Proprietários/Responsáveis)
// ============================================================================

/**
 * Definição de um proprietário/responsável
 */
export interface OwnerDefinition extends CatalogItem, Partial<CatalogItemMetadata> {
  /** ID do usuário no Bitrix24 */
  bitrixUserId?: string;
  /** E-mail do responsável */
  email?: string;
  /** Departamento */
  department?: string;
}

// ============================================================================
// GENERIC CATALOG CONFIG
// ============================================================================

/**
 * Configuração de um catálogo genérico
 * Usado para criar catálogos dinâmicos sem tipo específico
 */
export interface GenericCatalogConfig {
  /** Tipo do catálogo (ex: 'bitrix_stage', 'queue', 'automation') */
  catalogType: string;
  /** Título da seção na UI */
  title: string;
  /** Descrição da seção */
  description: string;
  /** Campos extras além de id/label */
  extraFields?: CatalogFieldConfig[];
}

/**
 * Configuração de um campo extra em catálogo
 */
export interface CatalogFieldConfig {
  /** Nome do campo */
  name: string;
  /** Label exibido na UI */
  label: string;
  /** Tipo do campo */
  type: 'text' | 'select' | 'number' | 'boolean';
  /** Opções (se type === 'select') */
  options?: { value: string; label: string }[];
  /** Se é obrigatório */
  required?: boolean;
  /** Placeholder */
  placeholder?: string;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard para verificar se é um BitrixStageDefinition
 */
export function isBitrixStageDefinition(item: CatalogItem): item is BitrixStageDefinition {
  return 'target' in item && (item as BitrixStageDefinition).target !== undefined;
}

/**
 * Type guard para verificar se é um QueueDefinition
 */
export function isQueueDefinition(item: CatalogItem): item is QueueDefinition {
  return 'department' in item || 'type' in item;
}

/**
 * Type guard para verificar se é um AutomationDefinition
 */
export function isAutomationDefinition(item: CatalogItem): item is AutomationDefinition {
  return 'webhookUrl' in item || 'bitrixBpId' in item;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Tipo para array de itens de catálogo
 */
export type CatalogItems<T extends CatalogItem = CatalogItem> = T[];

/**
 * Mapa de catálogos por tipo
 */
export interface CatalogMap {
  bitrixStages?: BitrixStageDefinition[];
  queues?: QueueDefinition[];
  automations?: AutomationDefinition[];
  owners?: OwnerDefinition[];
}
