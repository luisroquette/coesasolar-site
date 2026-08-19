/**
 * Rule Action Types
 * 
 * Define os tipos de ações que podem ser executadas por regras
 * Segue o padrão "Ação Fixa + Seleção de Catálogo"
 * 
 * @see src/types/catalog.ts - Tipos de catálogo
 * @see .lovable/plan.md - Seção "Padrão Reaproveitável"
 */

import type { BitrixStageTarget } from './catalog';

// ============================================================================
// ACTION KINDS
// ============================================================================

/**
 * Tipos de ações disponíveis
 * Cada kind corresponde a uma ação fixa na UI
 */
export type RuleActionKind = 
  | 'changeStage'       // Alterar etapa do CRM
  | 'assignQueue'       // Atribuir a uma fila
  | 'assignOwner'       // Atribuir proprietário
  | 'triggerAutomation' // Disparar automação
  | 'sendNotification'  // Enviar notificação
  | 'updateField'       // Atualizar campo específico
  | 'addTag'            // Adicionar tag
  | 'removeTag'         // Remover tag
  | 'custom';           // Ação customizada

// ============================================================================
// BASE ACTION
// ============================================================================

/**
 * Ação base de uma regra
 * Todas as ações específicas devem seguir esta estrutura
 */
export interface RuleActionBase {
  /** Tipo da ação */
  kind: RuleActionKind;
  /** ID único da ação (para edição/remoção) */
  actionId?: string;
  /** Se a ação está habilitada */
  enabled?: boolean;
  /** Ordem de execução (se houver múltiplas ações) */
  order?: number;
}

// ============================================================================
// SPECIFIC ACTIONS
// ============================================================================

/**
 * Ação: Alterar etapa do CRM (Bitrix24)
 * 
 * @example
 * {
 *   kind: 'changeStage',
 *   target: 'STAGE_ID',
 *   value: 'UC_9SLRPP'
 * }
 */
export interface ChangeStageAction extends RuleActionBase {
  kind: 'changeStage';
  /** Campo técnico a ser alterado (STATUS_ID ou STAGE_ID) */
  target: BitrixStageTarget;
  /** ID da etapa destino */
  value: string;
}

/**
 * Ação: Atribuir a uma fila
 * 
 * @example
 * {
 *   kind: 'assignQueue',
 *   value: 'QUEUE_VENDAS_001'
 * }
 */
export interface AssignQueueAction extends RuleActionBase {
  kind: 'assignQueue';
  /** ID da fila */
  value: string;
}

/**
 * Ação: Atribuir proprietário/responsável
 * 
 * @example
 * {
 *   kind: 'assignOwner',
 *   value: '123',
 *   bitrixUserId: '123'
 * }
 */
export interface AssignOwnerAction extends RuleActionBase {
  kind: 'assignOwner';
  /** ID do proprietário no catálogo */
  value: string;
  /** ID do usuário no Bitrix24 (opcional, pode vir do catálogo) */
  bitrixUserId?: string;
}

/**
 * Ação: Disparar automação
 * 
 * @example
 * {
 *   kind: 'triggerAutomation',
 *   value: 'AUTO_WELCOME_EMAIL',
 *   webhookUrl: 'https://...'
 * }
 */
export interface TriggerAutomationAction extends RuleActionBase {
  kind: 'triggerAutomation';
  /** ID da automação no catálogo */
  value: string;
  /** URL do webhook (opcional, pode vir do catálogo) */
  webhookUrl?: string;
  /** Payload customizado */
  payload?: Record<string, unknown>;
}

/**
 * Ação: Enviar notificação
 */
export interface SendNotificationAction extends RuleActionBase {
  kind: 'sendNotification';
  /** Tipo de notificação */
  notificationType: 'whatsapp' | 'email' | 'internal';
  /** Template ou mensagem */
  template?: string;
  /** Destinatários */
  recipients?: string[];
}

/**
 * Ação: Atualizar campo específico
 */
export interface UpdateFieldAction extends RuleActionBase {
  kind: 'updateField';
  /** Nome do campo a ser atualizado */
  fieldName: string;
  /** Valor a ser definido */
  fieldValue: string | number | boolean;
  /** Entidade alvo (lead, contact, deal) */
  entityType?: 'lead' | 'contact' | 'deal';
}

/**
 * Ação: Adicionar tag
 */
export interface AddTagAction extends RuleActionBase {
  kind: 'addTag';
  /** Tag a ser adicionada */
  tag: string;
}

/**
 * Ação: Remover tag
 */
export interface RemoveTagAction extends RuleActionBase {
  kind: 'removeTag';
  /** Tag a ser removida */
  tag: string;
}

/**
 * Ação customizada (extensível)
 */
export interface CustomAction extends RuleActionBase {
  kind: 'custom';
  /** Tipo customizado */
  customType: string;
  /** Configuração customizada */
  config: Record<string, unknown>;
}

// ============================================================================
// UNION TYPE
// ============================================================================

/**
 * União de todas as ações possíveis
 */
export type RuleAction = 
  | ChangeStageAction
  | AssignQueueAction
  | AssignOwnerAction
  | TriggerAutomationAction
  | SendNotificationAction
  | UpdateFieldAction
  | AddTagAction
  | RemoveTagAction
  | CustomAction;

// ============================================================================
// ACTION METADATA
// ============================================================================

/**
 * Metadados de uma ação para exibição na UI
 */
export interface RuleActionMeta {
  /** Tipo da ação */
  kind: RuleActionKind;
  /** Label fixo exibido na UI (ex: "Alterar etapa") */
  label: string;
  /** Descrição da ação */
  description: string;
  /** Ícone (nome do ícone Lucide) */
  icon: string;
  /** Cor do badge */
  color: string;
  /** Se requer seleção de catálogo */
  requiresCatalog: boolean;
  /** Tipo do catálogo (se requiresCatalog) */
  catalogType?: keyof import('./catalog').CatalogMap;
  /** Label do select de catálogo */
  catalogSelectLabel?: string;
}

/**
 * Registro de metadados de todas as ações
 */
export const RULE_ACTION_META: Record<RuleActionKind, RuleActionMeta> = {
  changeStage: {
    kind: 'changeStage',
    label: 'Alterar etapa',
    description: 'Move o lead para uma etapa específica do funil',
    icon: 'GitBranch',
    color: 'bg-blue-500',
    requiresCatalog: true,
    catalogType: 'bitrixStages',
    catalogSelectLabel: 'Etapa do CRM',
  },
  assignQueue: {
    kind: 'assignQueue',
    label: 'Atribuir fila',
    description: 'Atribui o lead a uma fila de atendimento',
    icon: 'Users',
    color: 'bg-purple-500',
    requiresCatalog: true,
    catalogType: 'queues',
    catalogSelectLabel: 'Fila',
  },
  assignOwner: {
    kind: 'assignOwner',
    label: 'Atribuir responsável',
    description: 'Define o responsável pelo lead',
    icon: 'UserCheck',
    color: 'bg-green-500',
    requiresCatalog: true,
    catalogType: 'owners',
    catalogSelectLabel: 'Responsável',
  },
  triggerAutomation: {
    kind: 'triggerAutomation',
    label: 'Disparar automação',
    description: 'Executa uma automação ou webhook',
    icon: 'Zap',
    color: 'bg-yellow-500',
    requiresCatalog: true,
    catalogType: 'automations',
    catalogSelectLabel: 'Automação',
  },
  sendNotification: {
    kind: 'sendNotification',
    label: 'Enviar notificação',
    description: 'Envia uma notificação por WhatsApp, e-mail ou interna',
    icon: 'Bell',
    color: 'bg-orange-500',
    requiresCatalog: false,
  },
  updateField: {
    kind: 'updateField',
    label: 'Atualizar campo',
    description: 'Atualiza um campo específico da entidade',
    icon: 'Edit',
    color: 'bg-cyan-500',
    requiresCatalog: false,
  },
  addTag: {
    kind: 'addTag',
    label: 'Adicionar tag',
    description: 'Adiciona uma tag ao lead',
    icon: 'Tag',
    color: 'bg-emerald-500',
    requiresCatalog: false,
  },
  removeTag: {
    kind: 'removeTag',
    label: 'Remover tag',
    description: 'Remove uma tag do lead',
    icon: 'TagOff',
    color: 'bg-red-500',
    requiresCatalog: false,
  },
  custom: {
    kind: 'custom',
    label: 'Ação customizada',
    description: 'Executa uma ação customizada',
    icon: 'Settings',
    color: 'bg-slate-500',
    requiresCatalog: false,
  },
};

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isChangeStageAction(action: RuleAction): action is ChangeStageAction {
  return action.kind === 'changeStage';
}

export function isAssignQueueAction(action: RuleAction): action is AssignQueueAction {
  return action.kind === 'assignQueue';
}

export function isAssignOwnerAction(action: RuleAction): action is AssignOwnerAction {
  return action.kind === 'assignOwner';
}

export function isTriggerAutomationAction(action: RuleAction): action is TriggerAutomationAction {
  return action.kind === 'triggerAutomation';
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Cria uma ação vazia do tipo especificado
 */
export function createEmptyAction(kind: RuleActionKind): RuleAction {
  const base = { kind, enabled: true };
  
  switch (kind) {
    case 'changeStage':
      return { ...base, kind: 'changeStage', target: 'STAGE_ID', value: '' };
    case 'assignQueue':
      return { ...base, kind: 'assignQueue', value: '' };
    case 'assignOwner':
      return { ...base, kind: 'assignOwner', value: '' };
    case 'triggerAutomation':
      return { ...base, kind: 'triggerAutomation', value: '' };
    case 'sendNotification':
      return { ...base, kind: 'sendNotification', notificationType: 'internal' };
    case 'updateField':
      return { ...base, kind: 'updateField', fieldName: '', fieldValue: '' };
    case 'addTag':
      return { ...base, kind: 'addTag', tag: '' };
    case 'removeTag':
      return { ...base, kind: 'removeTag', tag: '' };
    case 'custom':
      return { ...base, kind: 'custom', customType: '', config: {} };
  }
}

/**
 * Valida se uma ação está completa
 */
export function isActionComplete(action: RuleAction): boolean {
  switch (action.kind) {
    case 'changeStage':
      return !!(action.target && action.value);
    case 'assignQueue':
    case 'assignOwner':
    case 'triggerAutomation':
      return !!action.value;
    case 'sendNotification':
      return !!action.notificationType;
    case 'updateField':
      return !!(action.fieldName && action.fieldValue !== undefined);
    case 'addTag':
    case 'removeTag':
      return !!action.tag;
    case 'custom':
      return !!action.customType;
  }
}
