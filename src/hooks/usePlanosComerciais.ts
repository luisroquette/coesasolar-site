import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PlanoComercial {
  id: string;
  nome: string;
  fidelidade_anos: number;
  desconto_percentual: number;
  consumo_minimo_kwh: number;
  ativo: boolean;
  destaque: boolean;
  unlock: boolean;
  ordem: number;
  // Novos campos dinâmicos (Zero Hardcode)
  consumo_range: string | null;
  features: string[] | null;
}

interface UsePlanosResult {
  planos: PlanoComercial[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// Cache simples para evitar múltiplas requisições
let cachedPlanos: PlanoComercial[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export function usePlanosComerciais(): UsePlanosResult {
  const [planos, setPlanos] = useState<PlanoComercial[]>(cachedPlanos || []);
  const [loading, setLoading] = useState(!cachedPlanos);
  const [error, setError] = useState<string | null>(null);

  const fetchPlanos = async () => {
    // Usar cache se ainda válido
    if (cachedPlanos && Date.now() - cacheTimestamp < CACHE_TTL) {
      setPlanos(cachedPlanos);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('planos_comerciais')
        .select('*')
        .eq('ativo', true)
        .order('ordem', { ascending: true });

      if (fetchError) throw fetchError;

      const planosData = data as PlanoComercial[];
      cachedPlanos = planosData;
      cacheTimestamp = Date.now();
      setPlanos(planosData);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar planos comerciais:', err);
      setError('Erro ao carregar planos');
      // Fallback para planos padrão se der erro
      setPlanos(getDefaultPlanos());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlanos();
  }, []);

  return { planos, loading, error, refresh: fetchPlanos };
}

// Planos padrão como fallback (15%, 20%, 25%, 30% - clássicos COESA)
function getDefaultPlanos(): PlanoComercial[] {
  return [
    { id: '1', nome: 'Plano Flex', fidelidade_anos: 1, desconto_percentual: 15, consumo_minimo_kwh: 0, ativo: true, destaque: false, unlock: false, ordem: 1, consumo_range: 'Até 300 kWh/mês', features: ['Energia 100% solar', 'Sem taxa de adesão', 'Contrato digital'] },
    { id: '2', nome: 'Plano Economia', fidelidade_anos: 2, desconto_percentual: 20, consumo_minimo_kwh: 0, ativo: true, destaque: false, unlock: false, ordem: 2, consumo_range: '301 a 1.000 kWh/mês', features: ['Energia 100% solar', 'Sem taxa de adesão', 'Contrato digital', 'Atendimento prioritário'] },
    { id: '3', nome: 'Plano Premium', fidelidade_anos: 3, desconto_percentual: 25, consumo_minimo_kwh: 0, ativo: true, destaque: true, unlock: false, ordem: 3, consumo_range: '1.001 a 3.000 kWh/mês', features: ['Energia 100% solar', 'Sem taxa de adesão', 'Contrato digital', 'Gestor dedicado'] },
    { id: '4', nome: 'Plano UNLOCK', fidelidade_anos: 4, desconto_percentual: 30, consumo_minimo_kwh: 3000, ativo: true, destaque: false, unlock: true, ordem: 4, consumo_range: 'Acima de 3.000 kWh/mês', features: ['Energia 100% solar', 'Sem taxa de adesão', 'Contrato digital', 'Atendimento VIP'] },
  ];
}

// Hook para obter configurações de cálculo dinâmicas
export function useCalculoConfigs() {
  const [configs, setConfigs] = useState({
    planoUnlockThreshold: 3000,
    planoUnlockDesconto: 30,
    planoUnlockFidelidade: 4,
    loaded: false,
  });

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase
          .from('configuracoes_sistema')
          .select('chave, valor')
          .in('chave', ['plano_unlock_threshold', 'plano_unlock_desconto', 'plano_unlock_fidelidade']);

        if (data) {
          const configMap = Object.fromEntries(data.map(c => [c.chave, c.valor]));
          setConfigs({
            planoUnlockThreshold: parseInt(configMap.plano_unlock_threshold) || 3000,
            planoUnlockDesconto: parseInt(configMap.plano_unlock_desconto) || 30,
            planoUnlockFidelidade: parseInt(configMap.plano_unlock_fidelidade) || 4,
            loaded: true,
          });
        }
      } catch (err) {
        console.error('Erro ao carregar configs de cálculo:', err);
        setConfigs(prev => ({ ...prev, loaded: true }));
      }
    }
    load();
  }, []);

  return configs;
}

// Função utilitária para converter plano do banco para o formato do PlanSelector
export function convertToPlanoConfig(plano: PlanoComercial) {
  return {
    id: `plano-${plano.id}`,
    fidelidadeAnos: plano.fidelidade_anos,
    descontoPercentual: plano.desconto_percentual,
    label: `${plano.fidelidade_anos} ${plano.fidelidade_anos === 1 ? 'ano' : 'anos'}`,
    destaque: plano.destaque,
    unlock: plano.unlock,
    consumoMinimo: plano.consumo_minimo_kwh,
    nome: plano.nome,
  };
}
