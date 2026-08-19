import { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function ElevenLabsFallbackAlert() {
  const [fallbackActive, setFallbackActive] = useState(false);
  const [fallbackAt, setFallbackAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState(false);

  const fetchStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('configuracoes_sistema')
        .select('chave, valor')
        .in('chave', ['elevenlabs_fallback_active', 'elevenlabs_fallback_at']);

      if (error) {
        console.error('Erro ao buscar status do fallback:', error);
        return;
      }

      const activeConfig = data?.find(c => c.chave === 'elevenlabs_fallback_active');
      const atConfig = data?.find(c => c.chave === 'elevenlabs_fallback_at');

      setFallbackActive(activeConfig?.valor === 'true');
      setFallbackAt(atConfig?.valor || null);
    } catch (error) {
      console.error('Erro ao buscar status do fallback:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Subscribe to changes
    const channel = supabase
      .channel('elevenlabs-fallback')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'configuracoes_sistema',
          filter: 'chave=eq.elevenlabs_fallback_active',
        },
        (payload) => {
          setFallbackActive(payload.new.valor === 'true');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      const { error } = await supabase
        .from('configuracoes_sistema')
        .update({ valor: 'false', updated_at: new Date().toISOString() })
        .eq('chave', 'elevenlabs_fallback_active');

      if (error) throw error;

      setFallbackActive(false);
      toast.info('Alerta dispensado. Será reativado se o limite de falhas for atingido novamente.');
    } catch (error) {
      console.error('Erro ao dispensar alerta:', error);
      toast.error('Erro ao dispensar alerta');
    } finally {
      setDismissing(false);
    }
  };


  if (loading || !fallbackActive) {
    return null;
  }

  const formattedTime = fallbackAt
    ? formatDistanceToNow(new Date(fallbackAt), { addSuffix: true, locale: ptBR })
    : 'recentemente';

  return (
    <Alert variant="destructive" className="mb-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30">
      <AlertTriangle className="h-5 w-5 text-amber-600" />
      <AlertTitle className="text-amber-800 dark:text-amber-200 font-semibold">
        Áudio Auto-Desativado (ElevenLabs sem créditos)
      </AlertTitle>
      <AlertDescription className="text-amber-700 dark:text-amber-300">
        <p className="mb-3">
          O sistema detectou <strong>2 falhas consecutivas</strong> do ElevenLabs em 30 minutos {formattedTime}.
          O <strong>Envio de Áudio foi desativado automaticamente</strong> para evitar tentativas frustradas.
          Recarregue seus créditos ElevenLabs e reative manualmente quando estiver pronto.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDismiss}
            disabled={dismissing}
            className="border-amber-500 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Dispensar Alerta
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
