/**
 * useCatalogResolver - Hook para Resolução de Catálogos em Ações
 * 
 * FASE 7: Fornece funções utilitárias para mapear e validar
 * ações de regras contra os catálogos carregados.
 * 
 * @see src/lib/catalog-mapper.ts - Funções de mapeamento
 */

import { useCallback, useMemo } from 'react';
import type { CatalogMap, CatalogItem } from '@/types/catalog';
import type { RuleAction, RuleActionKind } from '@/types/rule-action';
import {
  mapCatalogItemToAction,
  resolveCatalogItem,
  resolveActionCatalogItem,
  getActionDisplayLabel,
  validateActionAgainstCatalog,
  validateActionsAgainstCatalogs,
  extractCatalogIdsFromActions,
  type CatalogMappingResult,
} from '@/lib/catalog-mapper';

// ============================================================================
// TYPES
// ============================================================================

interface UseCatalogResolverOptions {
  catalogs: CatalogMap;
}

interface UseCatalogResolverReturn {
  /** Mapeia um item de catálogo para campos de ação */
  mapToAction: (kind: RuleActionKind, item: CatalogItem | null) => CatalogMappingResult;
  /** Resolve o item de catálogo de uma ação */
  resolveItem: (action: RuleAction) => CatalogItem | null;
  /** Obtém o label de exibição de uma ação */
  getLabel: (action: RuleAction) => string;
  /** Valida uma ação contra os catálogos */
  validate: (action: RuleAction) => { valid: boolean; message?: string };
  /** Valida múltiplas ações */
  validateAll: (actions: RuleAction[]) => { allValid: boolean; results: Array<{ action: RuleAction; valid: boolean; message?: string }> };
  /** Extrai IDs de catálogo de ações */
  extractIds: (actions: RuleAction[]) => { stageIds: string[]; queueIds: string[]; ownerIds: string[]; automationIds: string[] };
  /** Busca um item em um catálogo específico por ID */
  findById: <T extends CatalogItem>(catalogKey: keyof CatalogMap, id: string) => T | null;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCatalogResolver({ catalogs }: UseCatalogResolverOptions): UseCatalogResolverReturn {
  
  // ============================================================================
  // MEMOIZED FUNCTIONS
  // ============================================================================

  const mapToAction = useCallback(
    (kind: RuleActionKind, item: CatalogItem | null): CatalogMappingResult => {
      return mapCatalogItemToAction(kind, item, catalogs);
    },
    [catalogs]
  );

  const resolveItem = useCallback(
    (action: RuleAction): CatalogItem | null => {
      return resolveActionCatalogItem(action, catalogs);
    },
    [catalogs]
  );

  const getLabel = useCallback(
    (action: RuleAction): string => {
      return getActionDisplayLabel(action, catalogs);
    },
    [catalogs]
  );

  const validate = useCallback(
    (action: RuleAction): { valid: boolean; message?: string } => {
      return validateActionAgainstCatalog(action, catalogs);
    },
    [catalogs]
  );

  const validateAll = useCallback(
    (actions: RuleAction[]) => {
      return validateActionsAgainstCatalogs(actions, catalogs);
    },
    [catalogs]
  );

  const extractIds = useCallback(
    (actions: RuleAction[]) => {
      return extractCatalogIdsFromActions(actions);
    },
    []
  );

  const findById = useCallback(
    <T extends CatalogItem>(catalogKey: keyof CatalogMap, id: string): T | null => {
      const items = catalogs[catalogKey] as T[] | undefined;
      return resolveCatalogItem(items, id);
    },
    [catalogs]
  );

  // ============================================================================
  // RETURN
  // ============================================================================

  return useMemo(
    () => ({
      mapToAction,
      resolveItem,
      getLabel,
      validate,
      validateAll,
      extractIds,
      findById,
    }),
    [mapToAction, resolveItem, getLabel, validate, validateAll, extractIds, findById]
  );
}

export default useCatalogResolver;
