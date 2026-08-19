import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { RefreshCw, Loader2, Zap } from 'lucide-react';

export function ReprocessBitrixLeadDialog() {
  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState('');
  const [forceTarifaUpdate, setForceTarifaUpdate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    details?: string;
  } | null>(null);

  const handleReprocess = async () => {
    if (!leadId.trim()) {
      toast.error('Informe o ID do lead');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      // Construir payload similar ao que o Bitrix24 envia
      const payload = {
        event: 'ONCRMLEAD_UPDATE',
        data: {
          FIELDS: {
            ID: leadId.trim(),
          },
        },
        // Ignora verificação de status para reprocessamento manual
        forceProcess: true,
        // Flag para forçar atualização da tarifa mesmo se já preenchida
        forceTarifaUpdate,
      };

      const { data, error } = await supabase.functions.invoke('bitrix24-webhook', {
        body: payload,
      });

      if (error) {
        console.error('Error reprocessing lead:', error);
        setResult({
          success: false,
          message: 'Erro ao chamar webhook',
          details: error.message,
        });
        toast.error('Erro ao reprocessar lead');
        return;
      }

      console.log('Reprocess result:', data);

      if (data?.proposalCreated) {
        let details = `✅ ID da proposta: ${data.proposalId}`;
        details += `\n📄 Link: ${data.publicUrl || 'N/A'}`;
        details += `\n🔗 Campo Link Proposta: ${data.linkFieldUpdated ? 'Atualizado' : 'Não atualizado'}`;
        
        // Informações detalhadas sobre tarifa
        details += `\n\n📊 TARIFA:`;
        details += `\n• Valor no Bitrix (antes): ${data.tarifaBitrixAntes || 'Vazio'}`;
        details += `\n• Valor calculado: R$ ${data.tarifaCalculada?.toFixed(2).replace('.', ',') || 'N/A'} /kWh`;
        details += `\n• Campo usado: ${data.tarifaFieldUsed || 'N/A'}`;
        details += `\n• Tipo do campo: ${data.tarifaFieldType || 'N/A'}`;
        details += `\n• Update tentado: ${data.tarifaUpdateAttempted ? 'Sim' : 'Não'}`;
        details += `\n• Update sucesso: ${data.tarifaUpdateSuccess ? '✅ Sim' : '❌ Não'}`;
        
        if (data.tarifaUpdateResponse?.error) {
          details += `\n• Erro: ${data.tarifaUpdateResponse.error} - ${data.tarifaUpdateResponse.error_description || ''}`;
        }
        
        setResult({
          success: true,
          message: 'Proposta criada/atualizada com sucesso!',
          details,
        });
        toast.success('Lead reprocessado com sucesso!');
      } else if (data?.missingFields) {
        setResult({
          success: false,
          message: 'Campos obrigatórios faltando',
          details: `Campos: ${data.missingFields.join(', ')}`,
        });
        toast.warning('Lead com campos incompletos');
      } else if (data?.message?.includes('not in target status')) {
        setResult({
          success: false,
          message: 'Lead não está na etapa correta',
          details: `Status atual: ${data.currentStatus}\nStatus esperado: ${data.targetStatus || 'Não configurado'}`,
        });
        toast.warning('Lead não está na etapa de geração de proposta');
      } else {
        setResult({
          success: data?.success ?? false,
          message: data?.message || 'Resposta desconhecida',
          details: JSON.stringify(data, null, 2),
        });
      }
    } catch (err) {
      console.error('Reprocess error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setResult({
        success: false,
        message: 'Erro ao reprocessar',
        details: errorMessage,
      });
      toast.error('Erro ao reprocessar lead');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setLeadId('');
    setForceTarifaUpdate(false);
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Zap className="mr-2 h-4 w-4" />
          Reprocessar Lead Bitrix
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Reprocessar Lead do Bitrix24
          </DialogTitle>
          <DialogDescription>
            Insira o ID do lead no Bitrix24 para forçar o reprocessamento e preencher a Tarifa
            Energia automaticamente (caso esteja vazia).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="leadId">ID do Lead no Bitrix24</Label>
            <Input
              id="leadId"
              placeholder="Ex: 8239"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Você pode encontrar o ID do lead na URL do card no Bitrix24
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="forceTarifa" className="text-sm font-medium">
                Forçar atualização da tarifa
              </Label>
              <p className="text-xs text-muted-foreground">
                Sobrescreve o valor mesmo se já estiver preenchido no Bitrix24
              </p>
            </div>
            <Switch
              id="forceTarifa"
              checked={forceTarifaUpdate}
              onCheckedChange={setForceTarifaUpdate}
              disabled={loading}
            />
          </div>

          {result && (
            <div
              className={`rounded-md p-3 text-sm ${
                result.success
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-amber-50 border border-amber-200 text-amber-800'
              }`}
            >
              <p className="font-medium">{result.message}</p>
              {result.details && (
                <pre className="mt-2 text-xs whitespace-pre-wrap opacity-80">
                  {result.details}
                </pre>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Fechar
          </Button>
          <Button onClick={handleReprocess} disabled={loading || !leadId.trim()}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reprocessar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
