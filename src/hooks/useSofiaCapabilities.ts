import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SofiaCapabilities {
  leituraImagens: boolean;
  leituraPdfs: boolean;
  transcricaoAudio: boolean;
  envioAudio: boolean;
  gerarPropostas: boolean;
  enviarLinks: boolean;
  modoCloser: boolean;
  followups: boolean;
  ofertaMaster: boolean;
}

const CAPABILITY_KEYS: Record<keyof SofiaCapabilities, string> = {
  leituraImagens: 'sofia_leitura_imagens_enabled',
  leituraPdfs: 'sofia_leitura_pdfs_enabled',
  transcricaoAudio: 'sofia_transcricao_audio_enabled',
  envioAudio: 'sofia_audio_enabled',
  gerarPropostas: 'sofia_gerar_propostas_enabled',
  enviarLinks: 'sofia_enviar_links_enabled',
  modoCloser: 'sofia_modo_closer_enabled',
  followups: 'sofia_followups_enabled',
  ofertaMaster: 'sofia_oferta_master_enabled',
};

const DEFAULT_CAPABILITIES: SofiaCapabilities = {
  leituraImagens: true,
  leituraPdfs: true,
  transcricaoAudio: true,
  envioAudio: true,
  gerarPropostas: true,
  enviarLinks: true,
  modoCloser: true,
  followups: true,
  ofertaMaster: true,
};

export function useSofiaCapabilities() {
  const [capabilities, setCapabilities] = useState<SofiaCapabilities>(DEFAULT_CAPABILITIES);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<keyof SofiaCapabilities | null>(null);

  const fetchCapabilities = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('configuracoes_sistema')
        .select('chave, valor')
        .like('chave', 'sofia_%_enabled');

      if (error) {
        console.error('Erro ao buscar capacidades da sofIA:', error);
        return;
      }

      const newCapabilities: SofiaCapabilities = { ...DEFAULT_CAPABILITIES };
      
      if (data) {
        for (const [key, chave] of Object.entries(CAPABILITY_KEYS)) {
          const config = data.find(c => c.chave === chave);
          if (config) {
            newCapabilities[key as keyof SofiaCapabilities] = config.valor !== 'false';
          }
        }
      }

      setCapabilities(newCapabilities);
    } catch (error) {
      console.error('Erro ao buscar capacidades da sofIA:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCapabilities();
  }, [fetchCapabilities]);

  const updateCapability = async (key: keyof SofiaCapabilities, newValue: boolean): Promise<boolean> => {
    setUpdating(key);
    try {
      const chave = CAPABILITY_KEYS[key];
      
      const { error } = await supabase
        .from('configuracoes_sistema')
        .update({ valor: newValue ? 'true' : 'false', updated_at: new Date().toISOString() })
        .eq('chave', chave);

      if (error) {
        console.error(`Erro ao atualizar ${key}:`, error);
        toast.error('Erro ao atualizar configuração');
        return false;
      }

      setCapabilities(prev => ({ ...prev, [key]: newValue }));
      toast.success(
        newValue 
          ? 'Capacidade ativada!' 
          : 'Capacidade desativada.'
      );
      return true;
    } catch (error) {
      console.error(`Erro ao atualizar ${key}:`, error);
      toast.error('Erro ao atualizar configuração');
      return false;
    } finally {
      setUpdating(null);
    }
  };

  const resetToDefaults = async (): Promise<boolean> => {
    try {
      const updates = Object.entries(CAPABILITY_KEYS).map(([key, chave]) => ({
        chave,
        valor: DEFAULT_CAPABILITIES[key as keyof SofiaCapabilities] ? 'true' : 'false',
        updated_at: new Date().toISOString(),
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('configuracoes_sistema')
          .update({ valor: update.valor, updated_at: update.updated_at })
          .eq('chave', update.chave);

        if (error) {
          console.error(`Erro ao restaurar ${update.chave}:`, error);
        }
      }

      setCapabilities(DEFAULT_CAPABILITIES);
      toast.success('Configurações restauradas para o padrão!');
      return true;
    } catch (error) {
      console.error('Erro ao restaurar configurações:', error);
      toast.error('Erro ao restaurar configurações');
      return false;
    }
  };

  return {
    capabilities,
    loading,
    updating,
    updateCapability,
    resetToDefaults,
    refresh: fetchCapabilities,
  };
}
