import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface BitrixStageMap {
  [stageId: string]: string; // ID → Nome legível
}

// Fallback - será sobrescrito pelo banco de dados
const FALLBACK_STAGE_NAMES: Record<string, string> = {
  'NEW': 'Novo Lead',
  'IN_PROCESS': 'Em Processamento',
  'JUNK': 'Perdido/Lixo',
  'WON': 'Ganho',
};

let defaultStageNamesCache: Record<string, string> | null = null;

/**
 * Hook para buscar e cachear o mapeamento de estágios do Bitrix24.
 * Transforma o mapeamento chave → ID para ID → nome legível.
 */
export function useBitrixStages() {
  const [stageMap, setStageMap] = useState<BitrixStageMap>({});
  const [loading, setLoading] = useState(true);

  const loadStages = useCallback(async () => {
    try {
      // Carregar nomes padrão do banco (se não cacheados)
      if (!defaultStageNamesCache) {
        const { data: defaultNamesData } = await supabase
          .from('configuracoes_sistema')
          .select('valor')
          .eq('chave', 'bitrix24_default_stage_names')
          .single();
        
        if (defaultNamesData?.valor) {
          try {
            defaultStageNamesCache = JSON.parse(defaultNamesData.valor);
          } catch {
            defaultStageNamesCache = FALLBACK_STAGE_NAMES;
          }
        } else {
          defaultStageNamesCache = FALLBACK_STAGE_NAMES;
        }
      }

      const { data, error } = await supabase
        .from('configuracoes_sistema')
        .select('chave, valor, descricao')
        .like('chave', 'bitrix24_stage_%');

      if (error) {
        console.error('Erro ao carregar estágios Bitrix:', error);
        return;
      }

      // Criar mapeamento ID → nome
      const map: BitrixStageMap = { ...(defaultStageNamesCache || FALLBACK_STAGE_NAMES) };
      
      if (data) {
        data.forEach(config => {
          const stageId = config.valor;
          // Extrair nome legível da chave ou usar descrição
          // chave: bitrix24_stage_proposta_inicial → nome: Proposta Inicial
          const keyName = config.chave.replace('bitrix24_stage_', '');
          const readableName = config.descricao || formatStageName(keyName);
          
          if (stageId) {
            map[stageId] = readableName;
          }
        });
      }

      setStageMap(map);
    } catch (err) {
      console.error('Erro ao carregar estágios:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStages();
  }, [loadStages]);

  /**
   * Retorna o nome legível de um estágio pelo ID
   */
  const getStageName = useCallback((stageId: string | null): string | null => {
    if (!stageId) return null;
    return stageMap[stageId] || stageId;
  }, [stageMap]);

  return {
    stageMap,
    loading,
    getStageName,
    refresh: loadStages,
  };
}

/**
 * Formata o nome do estágio a partir da chave
 * Ex: proposta_inicial → Proposta Inicial
 */
function formatStageName(key: string): string {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
