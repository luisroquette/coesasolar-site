import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface StatusOption {
  value: string;
  label: string;
  color: string;
}

interface CRMConfig {
  statusOptions: StatusOption[];
  origemLabels: Record<string, string>;
  loading: boolean;
}

// Fallback values in case DB is unavailable
const DEFAULT_STATUS_OPTIONS: StatusOption[] = [
  { value: 'novo', label: 'Novo', color: 'bg-blue-100 text-blue-800' },
  { value: 'contatado', label: 'Contatado', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'interessado', label: 'Interessado', color: 'bg-purple-100 text-purple-800' },
  { value: 'negociando', label: 'Negociando', color: 'bg-orange-100 text-orange-800' },
  { value: 'fechado', label: 'Fechado', color: 'bg-green-100 text-green-800' },
  { value: 'perdido', label: 'Perdido', color: 'bg-red-100 text-red-800' },
  { value: 'erro', label: 'Erro', color: 'bg-red-600 text-white' },
];

const DEFAULT_ORIGEM_LABELS: Record<string, string> = {
  proposta_assinante: 'Proposta Assinante',
  proposta_usineiro: 'Proposta Usineiro',
  manual: 'Cadastro Manual',
  bitrix24_webhook: 'Bitrix24 (Auto)',
  whatsapp_sofia: 'WhatsApp (sofIA)',
};

// Cache for avoiding repeated fetches
let cachedConfig: { statusOptions: StatusOption[]; origemLabels: Record<string, string> } | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useCRMConfig(): CRMConfig {
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>(cachedConfig?.statusOptions || DEFAULT_STATUS_OPTIONS);
  const [origemLabels, setOrigemLabels] = useState<Record<string, string>>(cachedConfig?.origemLabels || DEFAULT_ORIGEM_LABELS);
  const [loading, setLoading] = useState(!cachedConfig || Date.now() - cacheTimestamp > CACHE_TTL);

  useEffect(() => {
    // Use cache if still valid
    if (cachedConfig && Date.now() - cacheTimestamp < CACHE_TTL) {
      setStatusOptions(cachedConfig.statusOptions);
      setOrigemLabels(cachedConfig.origemLabels);
      setLoading(false);
      return;
    }

    const loadConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('configuracoes_sistema')
          .select('chave, valor')
          .in('chave', ['crm_status_options', 'crm_origem_labels']);

        if (error) {
          console.error('Error loading CRM config:', error);
          return;
        }

        if (data) {
          const configMap = Object.fromEntries(data.map(d => [d.chave, d.valor]));
          
          const parsedStatusOptions = configMap['crm_status_options'] 
            ? JSON.parse(configMap['crm_status_options']) 
            : DEFAULT_STATUS_OPTIONS;
            
          const parsedOrigemLabels = configMap['crm_origem_labels'] 
            ? JSON.parse(configMap['crm_origem_labels']) 
            : DEFAULT_ORIGEM_LABELS;

          // Update cache
          cachedConfig = {
            statusOptions: parsedStatusOptions,
            origemLabels: parsedOrigemLabels,
          };
          cacheTimestamp = Date.now();

          setStatusOptions(parsedStatusOptions);
          setOrigemLabels(parsedOrigemLabels);
        }
      } catch (err) {
        console.error('Error parsing CRM config:', err);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  return { statusOptions, origemLabels, loading };
}

// Utility function to get status badge color
export function getStatusColor(statusOptions: StatusOption[], status: string): string {
  return statusOptions.find(s => s.value === status)?.color || 'bg-gray-100 text-gray-800';
}

// Utility function to get status label
export function getStatusLabel(statusOptions: StatusOption[], status: string): string {
  return statusOptions.find(s => s.value === status)?.label || status;
}

// Utility function to get origem label
export function getOrigemLabel(origemLabels: Record<string, string>, origem: string | null): string {
  return origemLabels[origem || ''] || origem || '';
}
