/**
 * Rule Action Builder - Factory Functions para Construção de Ações
 * 
 * FASE 7: Funções helper para criar e atualizar ações de regra
 * a partir de seleções de catálogo.
 * 
 * @see src/lib/catalog-mapper.ts - Mapeamento de catálogo para ação
 */

import type { CatalogItem, CatalogMap } from '@/types/catalog';
import type { RuleAction, RuleActionKind } from '@/types/rule-action';
import { createEmptyAction, RULE_ACTION_META } from '@/types/rule-action';
import { mapCatalogItemToAction } from '@/lib/catalog-mapper';

// ============================================================================
// ACTION BUILDERS
// ============================================================================

/**
 * Cria uma nova ação com ID único e item de catálogo pré-selecionado
 */
export function buildAction(
  kind: RuleActionKind,
  catalogItem?: CatalogItem | null,
  catalogs?: CatalogMap
): RuleAction {
  // Cria ação base vazia
  const baseAction = createEmptyAction(kind);
  
  // Adiciona ID único
  const action = {
    ...baseAction,
    actionId: generateActionId(),
    enabled: true,
  } as RuleAction;

  // Se tiver item de catálogo, mapeia os campos
  if (catalogItem) {
    const mapping = mapCatalogItemToAction(kind, catalogItem, catalogs);
    if (mapping.success) {
      return { ...action, ...mapping.actionFields } as RuleAction;
    }
  }

  return action;
}

/**
 * Atualiza uma ação existente com novo item de catálogo
 */
export function updateActionWithCatalogItem(
  action: RuleAction,
  catalogItem: CatalogItem | null,
  catalogs?: CatalogMap
): RuleAction {
  const mapping = mapCatalogItemToAction(action.kind, catalogItem, catalogs);
  
  return {
    ...action,
    ...mapping.actionFields,
  } as RuleAction;
}

/**
 * Gera um ID único para ação
 */
export function generateActionId(): string {
  // Usa timestamp + random para evitar colisões
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `act_${timestamp}_${random}`;
}

// ============================================================================
// ACTION LIST HELPERS
// ============================================================================

/**
 * Adiciona uma nova ação à lista
 */
export function addActionToList(
  actions: RuleAction[],
  kind: RuleActionKind,
  catalogItem?: CatalogItem | null
): RuleAction[] {
  const newAction = buildAction(kind, catalogItem);
  return [...actions, newAction];
}

/**
 * Remove uma ação da lista por ID
 */
export function removeActionFromList(
  actions: RuleAction[],
  actionId: string
): RuleAction[] {
  return actions.filter(a => a.actionId !== actionId);
}

/**
 * Atualiza uma ação específica na lista
 */
export function updateActionInList(
  actions: RuleAction[],
  actionId: string,
  updates: Partial<RuleAction>
): RuleAction[] {
  return actions.map(action => {
    if (action.actionId === actionId) {
      return { ...action, ...updates } as RuleAction;
    }
    return action;
  });
}

/**
 * Reordena ações na lista
 */
export function reorderActions(
  actions: RuleAction[],
  fromIndex: number,
  toIndex: number
): RuleAction[] {
  const result = [...actions];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  
  // Atualiza order de cada ação
  return result.map((action, index) => ({
    ...action,
    order: index,
  }));
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Verifica se todas as ações de uma lista estão completas
 */
export function areAllActionsComplete(actions: RuleAction[]): boolean {
  const { isActionComplete } = require('@/types/rule-action');
  return actions.every(isActionComplete);
}

/**
 * Retorna ações incompletas de uma lista
 */
export function getIncompleteActions(actions: RuleAction[]): RuleAction[] {
  const { isActionComplete } = require('@/types/rule-action');
  return actions.filter(action => !isActionComplete(action));
}

// ============================================================================
// SERIALIZATION HELPERS
// ============================================================================

/**
 * Serializa lista de ações para persistência (remove campos temporários)
 */
export function serializeActions(actions: RuleAction[]): RuleAction[] {
  return actions.map((action, index) => ({
    ...action,
    order: index,
    // Garante que actionId existe
    actionId: action.actionId || generateActionId(),
  }));
}

/**
 * Deserializa lista de ações do banco (adiciona campos se necessário)
 */
export function deserializeActions(data: unknown): RuleAction[] {
  if (!Array.isArray(data)) return [];
  
  return data.map((item, index) => {
    const action = item as RuleAction;
    return {
      ...action,
      actionId: action.actionId || generateActionId(),
      order: action.order ?? index,
      enabled: action.enabled ?? true,
    };
  });
}

// ============================================================================
// ACTION MENU OPTIONS
// ============================================================================

/**
 * Retorna opções de menu para adicionar novas ações
 */
export function getAvailableActionKinds(): Array<{
  kind: RuleActionKind;
  label: string;
  description: string;
  icon: string;
  requiresCatalog: boolean;
}> {
  return Object.entries(RULE_ACTION_META).map(([kind, meta]) => ({
    kind: kind as RuleActionKind,
    label: meta.label,
    description: meta.description,
    icon: meta.icon,
    requiresCatalog: meta.requiresCatalog,
  }));
}

/**
 * Retorna apenas ações que usam catálogo
 */
export function getCatalogActionKinds(): RuleActionKind[] {
  return Object.entries(RULE_ACTION_META)
    .filter(([_, meta]) => meta.requiresCatalog)
    .map(([kind]) => kind as RuleActionKind);
}
