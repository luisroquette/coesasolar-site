/**
 * useCatalogs - Hook para gerenciamento de catálogos do agente
 * 
 * Gerencia CRUD de catálogos (stages, queues, automations, owners)
 * armazenados como JSONB no ai_agents.
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { 
  CatalogMap, 
  BitrixStageDefinition, 
  QueueDefinition, 
  AutomationDefinition, 
  OwnerDefinition 
} from '@/types/catalog';

interface UseCatalogsOptions {
  agentId: string;
  autoLoad?: boolean;
}

interface UseCatalogsReturn {
  catalogs: CatalogMap;
  loading: boolean;
  saving: boolean;
  error: string | null;
  loadCatalogs: () => Promise<void>;
  saveCatalogs: (catalogs: Partial<CatalogMap>) => Promise<boolean>;
  updateBitrixStages: (stages: BitrixStageDefinition[]) => void;
  updateQueues: (queues: QueueDefinition[]) => void;
  updateAutomations: (automations: AutomationDefinition[]) => void;
  updateOwners: (owners: OwnerDefinition[]) => void;
  hasChanges: boolean;
}

export function useCatalogs({ agentId, autoLoad = true }: UseCatalogsOptions): UseCatalogsReturn {
  const [catalogs, setCatalogs] = useState<CatalogMap>({
    bitrixStages: [],
    queues: [],
    automations: [],
    owners: [],
  });
  const [originalCatalogs, setOriginalCatalogs] = useState<CatalogMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // ============================================================================
  // LOAD
  // ============================================================================

  const loadCatalogs = useCallback(async () => {
    if (!agentId) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('ai_agents')
        .select('queues, automations, owners')
        .eq('id', agentId)
        .single();

      if (fetchError) throw fetchError;

      // Parse JSONB fields - now we need to handle queues, automations, owners
      // bitrixStages is still using the existing bitrix_stages_config table for now
      const loadedCatalogs: CatalogMap = {
        bitrixStages: [], // Will be loaded separately if needed
        queues: (data?.queues as unknown as QueueDefinition[]) || [],
        automations: (data?.automations as unknown as AutomationDefinition[]) || [],
        owners: (data?.owners as unknown as OwnerDefinition[]) || [],
      };

      // Load bitrix stages from config table
      const { data: stagesData } = await supabase
        .from('bitrix_stages_config')
        .select('stage_id, nome, is_active')
        .eq('is_active', true)
        .order('sort_order');

      if (stagesData) {
        loadedCatalogs.bitrixStages = stagesData.map(s => ({
          id: s.stage_id,
          label: s.nome,
          target: s.stage_id.startsWith('UC_') || s.stage_id.includes(':') ? 'STAGE_ID' : 'STATUS_ID',
        })) as BitrixStageDefinition[];
      }

      setCatalogs(loadedCatalogs);
      setOriginalCatalogs(loadedCatalogs);
    } catch (err: any) {
      const message = err.message || 'Erro ao carregar catálogos';
      setError(message);
      console.error('useCatalogs.loadCatalogs error:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // ============================================================================
  // SAVE
  // ============================================================================

  const saveCatalogs = useCallback(async (catalogsToSave: Partial<CatalogMap>): Promise<boolean> => {
    if (!agentId) return false;

    try {
      setSaving(true);
      setError(null);

      // Build update object - only include fields that are in catalogsToSave
      const updateData: Record<string, unknown> = {};

      if (catalogsToSave.queues !== undefined) {
        updateData.queues = catalogsToSave.queues;
      }
      if (catalogsToSave.automations !== undefined) {
        updateData.automations = catalogsToSave.automations;
      }
      if (catalogsToSave.owners !== undefined) {
        updateData.owners = catalogsToSave.owners;
      }

      // Only update if there's something to update
      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from('ai_agents')
          .update(updateData)
          .eq('id', agentId);

        if (updateError) throw updateError;
      }

      // Update local state
      setCatalogs(prev => ({ ...prev, ...catalogsToSave }));
      setOriginalCatalogs(prev => prev ? { ...prev, ...catalogsToSave } : catalogsToSave as CatalogMap);

      toast({
        title: 'Catálogos salvos',
        description: 'As configurações foram atualizadas com sucesso.',
      });

      return true;
    } catch (err: any) {
      const message = err.message || 'Erro ao salvar catálogos';
      setError(message);
      toast({
        title: 'Erro ao salvar',
        description: message,
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [agentId, toast]);

  // ============================================================================
  // UPDATE HELPERS
  // ============================================================================

  const updateBitrixStages = useCallback((stages: BitrixStageDefinition[]) => {
    setCatalogs(prev => ({ ...prev, bitrixStages: stages }));
  }, []);

  const updateQueues = useCallback((queues: QueueDefinition[]) => {
    setCatalogs(prev => ({ ...prev, queues }));
  }, []);

  const updateAutomations = useCallback((automations: AutomationDefinition[]) => {
    setCatalogs(prev => ({ ...prev, automations }));
  }, []);

  const updateOwners = useCallback((owners: OwnerDefinition[]) => {
    setCatalogs(prev => ({ ...prev, owners }));
  }, []);

  // ============================================================================
  // DETECT CHANGES
  // ============================================================================

  const hasChanges = originalCatalogs !== null && 
    JSON.stringify(catalogs) !== JSON.stringify(originalCatalogs);

  // ============================================================================
  // AUTO LOAD
  // ============================================================================

  useEffect(() => {
    if (autoLoad && agentId) {
      loadCatalogs();
    }
  }, [autoLoad, agentId, loadCatalogs]);

  return {
    catalogs,
    loading,
    saving,
    error,
    loadCatalogs,
    saveCatalogs,
    updateBitrixStages,
    updateQueues,
    updateAutomations,
    updateOwners,
    hasChanges,
  };
}

export default useCatalogs;
