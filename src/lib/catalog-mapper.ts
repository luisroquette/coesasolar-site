/**
 * Catalog Mapper - Utilitário de Mapeamento de Catálogo para Ações
 * 
 * FASE 7: Ao selecionar um item do catálogo, preenche corretamente
 * os campos `action.target` e `action.value` com base no tipo de ação.
 * 
 * @see src/types/rule-action.ts - Tipos de ações
 * @see src/types/catalog.ts - Tipos de catálogo
 */

import type {
  CatalogItem,
  CatalogMap,
  BitrixStageDefinition,
  QueueDefinition,
  AutomationDefinition,
  OwnerDefinition,
} from '@/types/catalog';

import type {
  RuleAction,
  RuleActionKind,
  ChangeStageAction,
  AssignQueueAction,
  AssignOwnerAction,
  TriggerAutomationAction,
} from '@/types/rule-action';

// ============================================================================
// MAPPING RESULT
// ============================================================================

/**
 * Resultado do mapeamento de seleção de catálogo para campos de ação
 */
export interface CatalogMappingResult {
  /** Se o mapeamento foi bem-sucedido */
  success: boolean;
  /** Campos da ação mapeados */
  actionFields: Partial<RuleAction>;
  /** Label amigável para exibição */
  displayLabel?: string;
  /** Detalhes técnicos para debug */
  technicalDetails?: Record<string, unknown>;
}

// ============================================================================
// MAPPERS BY ACTION KIND
// ============================================================================

/**
 * Mapeia seleção de etapa do CRM para ChangeStageAction
 */
export function mapBitrixStageToAction(
  stage: BitrixStageDefinition | null
): CatalogMappingResult {
  if (!stage) {
    return {
      success: false,
      actionFields: { kind: 'changeStage', target: 'STAGE_ID', value: '' },
    };
  }

  const actionFields: Partial<ChangeStageAction> = {
    kind: 'changeStage',
    target: stage.target,
    value: stage.id,
  };

  return {
    success: true,
    actionFields,
    displayLabel: stage.label,
    technicalDetails: {
      stageId: stage.id,
      target: stage.target,
      isCustomStage: stage.target === 'STAGE_ID',
    },
  };
}

/**
 * Mapeia seleção de fila para AssignQueueAction
 */
export function mapQueueToAction(
  queue: QueueDefinition | null
): CatalogMappingResult {
  if (!queue) {
    return {
      success: false,
      actionFields: { kind: 'assignQueue', value: '' },
    };
  }

  const actionFields: Partial<AssignQueueAction> = {
    kind: 'assignQueue',
    value: queue.id,
  };

  return {
    success: true,
    actionFields,
    displayLabel: queue.label,
    technicalDetails: {
      queueId: queue.id,
      department: queue.department,
      type: queue.type,
    },
  };
}

/**
 * Mapeia seleção de responsável para AssignOwnerAction
 */
export function mapOwnerToAction(
  owner: OwnerDefinition | null
): CatalogMappingResult {
  if (!owner) {
    return {
      success: false,
      actionFields: { kind: 'assignOwner', value: '' },
    };
  }

  const actionFields: Partial<AssignOwnerAction> = {
    kind: 'assignOwner',
    value: owner.id,
    bitrixUserId: owner.bitrixUserId,
  };

  return {
    success: true,
    actionFields,
    displayLabel: owner.label,
    technicalDetails: {
      ownerId: owner.id,
      bitrixUserId: owner.bitrixUserId,
      email: owner.email,
    },
  };
}

/**
 * Mapeia seleção de automação para TriggerAutomationAction
 */
export function mapAutomationToAction(
  automation: AutomationDefinition | null
): CatalogMappingResult {
  if (!automation) {
    return {
      success: false,
      actionFields: { kind: 'triggerAutomation', value: '' },
    };
  }

  const actionFields: Partial<TriggerAutomationAction> = {
    kind: 'triggerAutomation',
    value: automation.id,
    webhookUrl: automation.webhookUrl,
  };

  return {
    success: true,
    actionFields,
    displayLabel: automation.label,
    technicalDetails: {
      automationId: automation.id,
      type: automation.type,
      webhookUrl: automation.webhookUrl,
      bitrixBpId: automation.bitrixBpId,
    },
  };
}

// ============================================================================
// GENERIC MAPPER
// ============================================================================

/**
 * Mapeia qualquer item de catálogo para sua ação correspondente
 */
export function mapCatalogItemToAction(
  kind: RuleActionKind,
  item: CatalogItem | null,
  catalogs?: CatalogMap
): CatalogMappingResult {
  switch (kind) {
    case 'changeStage':
      return mapBitrixStageToAction(item as BitrixStageDefinition | null);
    case 'assignQueue':
      return mapQueueToAction(item as QueueDefinition | null);
    case 'assignOwner':
      return mapOwnerToAction(item as OwnerDefinition | null);
    case 'triggerAutomation':
      return mapAutomationToAction(item as AutomationDefinition | null);
    default:
      return {
        success: false,
        actionFields: { kind },
      };
  }
}

// ============================================================================
// RESOLVER - LOOKUP BY ID
// ============================================================================

/**
 * Resolve um ID de catálogo para o item completo
 */
export function resolveCatalogItem<T extends CatalogItem>(
  items: T[] | undefined,
  id: string | null | undefined
): T | null {
  if (!items || !id) return null;
  return items.find((item) => item.id === id) || null;
}

/**
 * Resolve o item de catálogo de uma ação baseado no kind e value
 */
export function resolveActionCatalogItem(
  action: RuleAction,
  catalogs: CatalogMap
): CatalogItem | null {
  switch (action.kind) {
    case 'changeStage':
      return resolveCatalogItem(catalogs.bitrixStages, action.value);
    case 'assignQueue':
      return resolveCatalogItem(catalogs.queues, action.value);
    case 'assignOwner':
      return resolveCatalogItem(catalogs.owners, action.value);
    case 'triggerAutomation':
      return resolveCatalogItem(catalogs.automations, action.value);
    default:
      return null;
  }
}

/**
 * Retorna o label amigável de uma ação (ou fallback para o value)
 */
export function getActionDisplayLabel(
  action: RuleAction,
  catalogs: CatalogMap
): string {
  const item = resolveActionCatalogItem(action, catalogs);
  if (item) return item.label;

  // Fallback: mostra o value técnico
  if ('value' in action && action.value) {
    return `ID: ${action.value}`;
  }

  return 'Não selecionado';
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Valida se uma ação com catálogo está completamente mapeada
 */
export function isActionCatalogMapped(
  action: RuleAction,
  catalogs: CatalogMap
): boolean {
  const item = resolveActionCatalogItem(action, catalogs);
  return item !== null;
}

/**
 * Valida se o value da ação existe no catálogo correspondente
 */
export function validateActionAgainstCatalog(
  action: RuleAction,
  catalogs: CatalogMap
): { valid: boolean; message?: string } {
  if (!('value' in action) || !action.value) {
    return { valid: false, message: 'Nenhum item selecionado' };
  }

  const item = resolveActionCatalogItem(action, catalogs);
  if (!item) {
    return { 
      valid: false, 
      message: `Item "${action.value}" não encontrado no catálogo` 
    };
  }

  return { valid: true };
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Valida múltiplas ações contra os catálogos
 */
export function validateActionsAgainstCatalogs(
  actions: RuleAction[],
  catalogs: CatalogMap
): { allValid: boolean; results: Array<{ action: RuleAction; valid: boolean; message?: string }> } {
  const results = actions.map(action => ({
    action,
    ...validateActionAgainstCatalog(action, catalogs),
  }));

  return {
    allValid: results.every(r => r.valid),
    results,
  };
}

/**
 * Extrai todos os IDs de catálogo usados por um conjunto de ações
 */
export function extractCatalogIdsFromActions(
  actions: RuleAction[]
): { 
  stageIds: string[]; 
  queueIds: string[]; 
  ownerIds: string[]; 
  automationIds: string[] 
} {
  const stageIds: string[] = [];
  const queueIds: string[] = [];
  const ownerIds: string[] = [];
  const automationIds: string[] = [];

  for (const action of actions) {
    if ('value' in action && action.value) {
      switch (action.kind) {
        case 'changeStage':
          stageIds.push(action.value);
          break;
        case 'assignQueue':
          queueIds.push(action.value);
          break;
        case 'assignOwner':
          ownerIds.push(action.value);
          break;
        case 'triggerAutomation':
          automationIds.push(action.value);
          break;
      }
    }
  }

  return {
    stageIds: [...new Set(stageIds)],
    queueIds: [...new Set(queueIds)],
    ownerIds: [...new Set(ownerIds)],
    automationIds: [...new Set(automationIds)],
  };
}
