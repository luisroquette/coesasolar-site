import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface StatusOption {
  value: string;
  label: string;
}

interface StatusBadge {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
}

interface PropostasConfig {
  statusOptions: StatusOption[];
  statusBadges: Record<string, StatusBadge>;
  loading: boolean;
}

// Fallback values in case DB is unavailable
const DEFAULT_STATUS_OPTIONS: StatusOption[] = [
  { value: 'all', label: 'Todos os status' },
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'enviada', label: 'Enviada' },
  { value: 'aceita', label: 'Aceita' },
  { value: 'recusada', label: 'Recusada' },
];

const DEFAULT_STATUS_BADGES: Record<string, StatusBadge> = {
  rascunho: { variant: 'secondary', label: 'Rascunho' },
  enviada: { variant: 'default', label: 'Enviada' },
  aceita: { variant: 'default', label: 'Aceita' },
  recusada: { variant: 'destructive', label: 'Recusada' },
};

// Cache
let cachedConfig: { statusOptions: StatusOption[]; statusBadges: Record<string, StatusBadge> } | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function usePropostasStatusConfig(): PropostasConfig {
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>(cachedConfig?.statusOptions || DEFAULT_STATUS_OPTIONS);
  const [statusBadges, setStatusBadges] = useState<Record<string, StatusBadge>>(cachedConfig?.statusBadges || DEFAULT_STATUS_BADGES);
  const [loading, setLoading] = useState(!cachedConfig || Date.now() - cacheTimestamp > CACHE_TTL);

  useEffect(() => {
    if (cachedConfig && Date.now() - cacheTimestamp < CACHE_TTL) {
      setStatusOptions(cachedConfig.statusOptions);
      setStatusBadges(cachedConfig.statusBadges);
      setLoading(false);
      return;
    }

    const loadConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('configuracoes_sistema')
          .select('chave, valor')
          .in('chave', ['propostas_status_options', 'propostas_status_badges']);

        if (error) {
          console.error('Error loading propostas config:', error);
          return;
        }

        if (data) {
          const configMap = Object.fromEntries(data.map(d => [d.chave, d.valor]));
          
          const parsedStatusOptions = configMap['propostas_status_options'] 
            ? JSON.parse(configMap['propostas_status_options']) 
            : DEFAULT_STATUS_OPTIONS;
            
          const parsedStatusBadges = configMap['propostas_status_badges'] 
            ? JSON.parse(configMap['propostas_status_badges']) 
            : DEFAULT_STATUS_BADGES;

          cachedConfig = {
            statusOptions: parsedStatusOptions,
            statusBadges: parsedStatusBadges,
          };
          cacheTimestamp = Date.now();

          setStatusOptions(parsedStatusOptions);
          setStatusBadges(parsedStatusBadges);
        }
      } catch (err) {
        console.error('Error parsing propostas config:', err);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  return { statusOptions, statusBadges, loading };
}
