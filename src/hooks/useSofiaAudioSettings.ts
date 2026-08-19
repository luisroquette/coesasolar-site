import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SofiaAudioSettings {
  enabled: boolean;
  congruenceEnabled: boolean;
  offerOnDoubtsEnabled: boolean;
  minCharsForCongruence: number;
  minCharsForAudioOffer: number; // NEW: threshold for offering audio on long responses
}

const DEFAULT_SETTINGS: SofiaAudioSettings = {
  enabled: true,
  congruenceEnabled: true,
  offerOnDoubtsEnabled: true,
  minCharsForCongruence: 50,
  minCharsForAudioOffer: 250, // Default: offer audio for responses >= 250 chars
};

export function useSofiaAudioSettings() {
  const [settings, setSettings] = useState<SofiaAudioSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [disabledByFallback, setDisabledByFallback] = useState(false);
  const [fallbackAt, setFallbackAt] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('configuracoes_sistema')
        .select('chave, valor')
        .in('chave', [
          'sofia_audio_enabled',
          'sofia_audio_congruence_enabled',
          'sofia_audio_offer_doubts_enabled',
          'sofia_audio_min_chars_congruence',
          'sofia_audio_min_chars_offer',
          'elevenlabs_fallback_active',
          'elevenlabs_fallback_at'
        ]);

      if (error) {
        console.error('Erro ao buscar configurações de áudio:', error);
        return;
      }

      const getValue = (key: string) => data?.find(c => c.chave === key)?.valor;

      setSettings({
        enabled: getValue('sofia_audio_enabled') !== 'false',
        congruenceEnabled: getValue('sofia_audio_congruence_enabled') !== 'false',
        offerOnDoubtsEnabled: getValue('sofia_audio_offer_doubts_enabled') !== 'false',
        minCharsForCongruence: parseInt(getValue('sofia_audio_min_chars_congruence') || '50', 10),
        minCharsForAudioOffer: parseInt(getValue('sofia_audio_min_chars_offer') || '250', 10),
      });

      setDisabledByFallback(getValue('elevenlabs_fallback_active') === 'true');
      setFallbackAt(getValue('elevenlabs_fallback_at') || null);
    } catch (error) {
      console.error('Erro ao buscar configurações de áudio:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = async (key: string, value: string) => {
    setUpdating(true);
    try {
      // Try upsert - insert or update
      const { error } = await supabase
        .from('configuracoes_sistema')
        .upsert(
          { 
            chave: key, 
            valor: value, 
            updated_at: new Date().toISOString() 
          },
          { onConflict: 'chave' }
        );

      if (error) {
        console.error('Erro ao salvar configuração:', error);
        toast.error('Erro ao salvar configuração');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      toast.error('Erro ao salvar configuração');
      return false;
    } finally {
      setUpdating(false);
    }
  };

  const toggleEnabled = async () => {
    const newValue = !settings.enabled;
    const success = await updateSetting('sofia_audio_enabled', newValue ? 'true' : 'false');
    if (success) {
      setSettings(prev => ({ ...prev, enabled: newValue }));
      toast.success(
        newValue 
          ? 'Áudio ativado! A sofIA poderá enviar respostas em áudio.' 
          : 'Áudio desativado. A sofIA responderá apenas por texto.'
      );

      // If re-enabling, clear fallback flag
      if (newValue) {
        await supabase
          .from('configuracoes_sistema')
          .update({ valor: 'false', updated_at: new Date().toISOString() })
          .eq('chave', 'elevenlabs_fallback_active');
        setDisabledByFallback(false);
      }
    }
  };

  const toggleCongruence = async () => {
    const newValue = !settings.congruenceEnabled;
    const success = await updateSetting('sofia_audio_congruence_enabled', newValue ? 'true' : 'false');
    if (success) {
      setSettings(prev => ({ ...prev, congruenceEnabled: newValue }));
      toast.success(
        newValue 
          ? 'Regra de congruência ativada!' 
          : 'Regra de congruência desativada.'
      );
    }
  };

  const toggleOfferOnDoubts = async () => {
    const newValue = !settings.offerOnDoubtsEnabled;
    const success = await updateSetting('sofia_audio_offer_doubts_enabled', newValue ? 'true' : 'false');
    if (success) {
      setSettings(prev => ({ ...prev, offerOnDoubtsEnabled: newValue }));
      toast.success(
        newValue 
          ? 'Oferta de áudio para dúvidas ativada!' 
          : 'Oferta de áudio para dúvidas desativada.'
      );
    }
  };

  const updateMinChars = async (value: number) => {
    const success = await updateSetting('sofia_audio_min_chars_congruence', value.toString());
    if (success) {
      setSettings(prev => ({ ...prev, minCharsForCongruence: value }));
      toast.success('Limite mínimo de caracteres para congruência atualizado!');
    }
  };

  const updateMinCharsOffer = async (value: number) => {
    const success = await updateSetting('sofia_audio_min_chars_offer', value.toString());
    if (success) {
      setSettings(prev => ({ ...prev, minCharsForAudioOffer: value }));
      toast.success('Limite mínimo de caracteres para oferta de áudio atualizado!');
    }
  };

  return {
    settings,
    loading,
    updating,
    toggleEnabled,
    toggleCongruence,
    toggleOfferOnDoubts,
    updateMinChars,
    updateMinCharsOffer,
    refresh: fetchSettings,
    disabledByFallback,
    fallbackAt,
  };
}
