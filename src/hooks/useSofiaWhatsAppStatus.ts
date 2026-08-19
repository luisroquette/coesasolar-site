import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useSofiaWhatsAppStatus() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', 'sofia_whatsapp_enabled')
        .single();

      if (error) {
        console.error('Erro ao buscar status da sofIA:', error);
        return;
      }

      setEnabled(data?.valor !== 'false');
    } catch (error) {
      console.error('Erro ao buscar status da sofIA:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const updateStatus = async (newStatus: boolean) => {
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('configuracoes_sistema')
        .update({ valor: newStatus ? 'true' : 'false', updated_at: new Date().toISOString() })
        .eq('chave', 'sofia_whatsapp_enabled');

      if (error) {
        console.error('Erro ao atualizar status da sofIA:', error);
        toast.error('Erro ao atualizar status da sofIA');
        return false;
      }

      setEnabled(newStatus);
      toast.success(
        newStatus 
          ? 'sofIA ativada! Ela voltará a responder automaticamente.' 
          : 'sofIA pausada. Mensagens serão registradas mas não respondidas.'
      );
      return true;
    } catch (error) {
      console.error('Erro ao atualizar status da sofIA:', error);
      toast.error('Erro ao atualizar status da sofIA');
      return false;
    } finally {
      setUpdating(false);
    }
  };

  const toggle = () => updateStatus(!enabled);

  return {
    enabled,
    loading,
    updating,
    toggle,
    setEnabled: updateStatus,
    refresh: fetchStatus,
  };
}
