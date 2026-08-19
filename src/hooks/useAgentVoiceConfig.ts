import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface VoiceSettings {
  language: string;
  voice_id: string | null;
  response_delay_ms: number;
  end_call_after_silence_ms?: number;
  max_call_duration_seconds: number;
  greeting_template?: string;
}

export interface CampaignSettings {
  max_attempts: number;
  retry_delay_hours: number;
  calling_hours_start: string;
  calling_hours_end: string;
  calling_days: string[];
}

export interface VoiceModeConfig {
  enabled: boolean;
  provider: string;
  agent_id: string | null;
  from_number: string | null;
  webhook_url: string | null;
  kb_mode: 'shared' | 'custom';
  custom_kb_sources: any[];
  settings: VoiceSettings;
  campaign_settings?: CampaignSettings;
  secrets: {
    api_key_ref: string | null;
  };
}

export interface AgentVoiceConfig {
  inbound: VoiceModeConfig;
  outbound: VoiceModeConfig;
}

export interface AgentSecret {
  id: string;
  agent_id: string;
  secret_name: string;
  secret_key: string;
  mode: 'inbound' | 'outbound' | 'shared';
  description: string | null;
  is_configured: boolean;
  created_at: string;
  updated_at: string;
}

const DEFAULT_INBOUND_CONFIG: VoiceModeConfig = {
  enabled: false,
  provider: 'retell',
  agent_id: null,
  from_number: null,
  webhook_url: null,
  kb_mode: 'shared',
  custom_kb_sources: [],
  settings: {
    language: 'pt-BR',
    voice_id: null,
    response_delay_ms: 0,
    end_call_after_silence_ms: 5000,
    max_call_duration_seconds: 600
  },
  secrets: {
    api_key_ref: null
  }
};

const DEFAULT_OUTBOUND_CONFIG: VoiceModeConfig = {
  enabled: false,
  provider: 'retell',
  agent_id: null,
  from_number: null,
  webhook_url: null,
  kb_mode: 'shared',
  custom_kb_sources: [],
  settings: {
    language: 'pt-BR',
    voice_id: null,
    response_delay_ms: 0,
    max_call_duration_seconds: 300,
    greeting_template: 'Olá {{customer_name}}, aqui é a {{agent_name}} da COESA Energia.'
  },
  campaign_settings: {
    max_attempts: 3,
    retry_delay_hours: 24,
    calling_hours_start: '09:00',
    calling_hours_end: '18:00',
    calling_days: ['mon', 'tue', 'wed', 'thu', 'fri']
  },
  secrets: {
    api_key_ref: null
  }
};

export function useAgentVoiceConfig(agentDbId: string | null) {
  const [config, setConfig] = useState<AgentVoiceConfig>({
    inbound: DEFAULT_INBOUND_CONFIG,
    outbound: DEFAULT_OUTBOUND_CONFIG
  });
  const [secrets, setSecrets] = useState<AgentSecret[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!agentDbId) return;

    try {
      setLoading(true);

      // Fetch voice_config from ai_agents
      const { data: agentData, error: agentError } = await supabase
        .from('ai_agents')
        .select('voice_config')
        .eq('id', agentDbId)
        .single();

      if (agentError) throw agentError;

      if (agentData?.voice_config) {
        const voiceConfig = agentData.voice_config as unknown as AgentVoiceConfig;
        setConfig({
          inbound: { ...DEFAULT_INBOUND_CONFIG, ...voiceConfig.inbound },
          outbound: { ...DEFAULT_OUTBOUND_CONFIG, ...voiceConfig.outbound }
        });
      }

      // Fetch secrets
      const { data: secretsData, error: secretsError } = await supabase
        .from('agent_secrets')
        .select('*')
        .eq('agent_id', agentDbId);

      if (secretsError) throw secretsError;
      setSecrets((secretsData || []).map(s => ({
        ...s,
        mode: s.mode as 'inbound' | 'outbound' | 'shared'
      })));

    } catch (error) {
      console.error('Error fetching voice config:', error);
    } finally {
      setLoading(false);
    }
  }, [agentDbId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updateConfig = async (
    mode: 'inbound' | 'outbound',
    updates: Partial<VoiceModeConfig>
  ): Promise<boolean> => {
    if (!agentDbId) return false;

    try {
      setSaving(true);

      const newModeConfig = { ...config[mode], ...updates };
      const newConfig = { ...config, [mode]: newModeConfig };

      const { error } = await supabase
        .from('ai_agents')
        .update({ voice_config: newConfig as unknown as any })
        .eq('id', agentDbId);

      if (error) throw error;

      setConfig(newConfig);
      toast.success(`Configurações de ${mode === 'inbound' ? 'entrada' : 'saída'} salvas`);
      return true;
    } catch (error: any) {
      console.error('Error updating voice config:', error);
      toast.error('Erro ao salvar configurações');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateSettings = async (
    mode: 'inbound' | 'outbound',
    settings: Partial<VoiceSettings>
  ): Promise<boolean> => {
    const currentSettings = config[mode].settings;
    return updateConfig(mode, { settings: { ...currentSettings, ...settings } });
  };

  const updateCampaignSettings = async (
    settings: Partial<CampaignSettings>
  ): Promise<boolean> => {
    const currentSettings = config.outbound.campaign_settings || DEFAULT_OUTBOUND_CONFIG.campaign_settings!;
    return updateConfig('outbound', { campaign_settings: { ...currentSettings, ...settings } });
  };

  const addSecret = async (
    secretName: string,
    secretKey: string,
    mode: 'inbound' | 'outbound' | 'shared',
    description?: string
  ): Promise<boolean> => {
    if (!agentDbId) return false;

    try {
      const { error } = await supabase
        .from('agent_secrets')
        .upsert({
          agent_id: agentDbId,
          secret_name: secretName,
          secret_key: secretKey,
          mode,
          description,
          is_configured: false
        }, {
          onConflict: 'agent_id,secret_name,mode'
        });

      if (error) throw error;

      await fetchConfig();
      toast.success('Secret adicionada');
      return true;
    } catch (error: any) {
      console.error('Error adding secret:', error);
      toast.error('Erro ao adicionar secret');
      return false;
    }
  };

  const removeSecret = async (secretId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('agent_secrets')
        .delete()
        .eq('id', secretId);

      if (error) throw error;

      setSecrets(prev => prev.filter(s => s.id !== secretId));
      toast.success('Secret removida');
      return true;
    } catch (error: any) {
      console.error('Error removing secret:', error);
      toast.error('Erro ao remover secret');
      return false;
    }
  };

  const markSecretConfigured = async (secretId: string, configured: boolean): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('agent_secrets')
        .update({ is_configured: configured })
        .eq('id', secretId);

      if (error) throw error;

      setSecrets(prev => prev.map(s => 
        s.id === secretId ? { ...s, is_configured: configured } : s
      ));
      return true;
    } catch (error: any) {
      console.error('Error updating secret:', error);
      return false;
    }
  };

  return {
    config,
    secrets,
    loading,
    saving,
    updateConfig,
    updateSettings,
    updateCampaignSettings,
    addSecret,
    removeSecret,
    markSecretConfigured,
    refresh: fetchConfig
  };
}
