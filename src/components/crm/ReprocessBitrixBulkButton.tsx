import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { RefreshCw, Loader2 } from 'lucide-react';

interface ReprocessResult {
  contatoId: string;
  nome: string;
  bitrixLeadId: string | null;
  success: boolean;
  message: string;
  tarifaUpdateSuccess?: boolean;
  tarifaError?: string;
}

interface Props {
  selectedContatoIds: string[];
  onComplete: () => void;
}

export function ReprocessBitrixBulkButton({ selectedContatoIds, onComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [forceTarifaUpdate, setForceTarifaUpdate] = useState(false);
  const [results, setResults] = useState<ReprocessResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  const handleReprocess = async () => {
    if (selectedContatoIds.length === 0) return;

    setLoading(true);
    setResults([]);
    const processResults: ReprocessResult[] = [];

    try {
      // 1. Buscar os contatos selecionados com suas propostas
      const { data: contatos, error: contatosError } = await supabase
        .from('crm_contatos')
        .select('id, nome, proposta_id')
        .in('id', selectedContatoIds);

      if (contatosError) throw contatosError;

      if (!contatos || contatos.length === 0) {
        toast.error('Nenhum contato encontrado');
        return;
      }

      // 2. Buscar os bitrix24_lead_id das propostas
      const propostaIds = contatos
        .map(c => c.proposta_id)
        .filter((id): id is string => id !== null);

      let propostasMap: Record<string, string | null> = {};
      
      if (propostaIds.length > 0) {
        const { data: propostas, error: propostasError } = await supabase
          .from('propostas_assinantes')
          .select('id, bitrix24_lead_id')
          .in('id', propostaIds);

        if (propostasError) {
          console.error('Error fetching propostas:', propostasError);
        } else if (propostas) {
          propostasMap = propostas.reduce((acc, p) => {
            acc[p.id] = p.bitrix24_lead_id;
            return acc;
          }, {} as Record<string, string | null>);
        }
      }

      // 3. Processar cada contato (com delay para reduzir OPERATION_TIME_LIMIT no Bitrix)
      const perLeadDelayMs = 4000;

      for (let idx = 0; idx < contatos.length; idx++) {
        const contato = contatos[idx];
        const bitrixLeadId = contato.proposta_id 
          ? propostasMap[contato.proposta_id] 
          : null;

        if (!bitrixLeadId) {
          processResults.push({
            contatoId: contato.id,
            nome: contato.nome,
            bitrixLeadId: null,
            success: false,
            message: 'Sem lead Bitrix24 vinculado',
          });
          continue;
        }

        try {
          // Chamar o webhook para reprocessar
          const payload = {
            event: 'ONCRMLEAD_UPDATE',
            data: {
              FIELDS: {
                ID: bitrixLeadId,
              },
            },
            forceProcess: true, // Ignora verificação de status para reprocessamento manual
            forceTarifaUpdate,
          };

          const { data, error } = await supabase.functions.invoke('bitrix24-webhook', {
            body: payload,
          });

          if (error) {
            processResults.push({
              contatoId: contato.id,
              nome: contato.nome,
              bitrixLeadId,
              success: false,
              message: error.message || 'Erro ao chamar webhook',
            });
            continue;
          }

          const tarifaErr = data?.tarifaUpdateResponse?.error as string | undefined;
          const tarifaOk = data?.tarifaUpdateSuccess as boolean | undefined;

          if (data?.proposalCreated) {
            const message =
              tarifaOk === false
                ? `Proposta atualizada (Tarifa não preenchida: ${tarifaErr || 'erro'})`
                : 'Proposta atualizada';

            processResults.push({
              contatoId: contato.id,
              nome: contato.nome,
              bitrixLeadId,
              success: true,
              message,
              tarifaUpdateSuccess: tarifaOk,
              tarifaError: tarifaErr,
            });
          } else {
            processResults.push({
              contatoId: contato.id,
              nome: contato.nome,
              bitrixLeadId,
              success: false,
              message: data?.message || 'Resposta inesperada',
              tarifaUpdateSuccess: tarifaOk,
              tarifaError: tarifaErr,
            });
          }
        } catch (err) {
          processResults.push({
            contatoId: contato.id,
            nome: contato.nome,
            bitrixLeadId,
            success: false,
            message: err instanceof Error ? err.message : 'Erro desconhecido',
          });
        }

        if (idx < contatos.length - 1) {
          await new Promise((r) => setTimeout(r, perLeadDelayMs));
        }
      }

      setResults(processResults);
      setShowResults(true);

      const successCount = processResults.filter(r => r.success).length;
      const failCount = processResults.length - successCount;

      if (successCount > 0 && failCount === 0) {
        toast.success(`${successCount} lead(s) reprocessado(s) com sucesso!`);
      } else if (successCount > 0) {
        toast.warning(`${successCount} sucesso(s), ${failCount} falha(s)`);
      } else {
        toast.error('Nenhum lead foi reprocessado');
      }

      onComplete();
    } catch (err) {
      console.error('Bulk reprocess error:', err);
      toast.error('Erro ao reprocessar leads');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Reprocessar Bitrix
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Reprocessar {selectedContatoIds.length} lead(s) no Bitrix24
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os contatos selecionados serão reprocessados no Bitrix24. 
              Isso irá atualizar as propostas e preencher a Tarifa Energia se estiver vazia.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex items-center justify-between rounded-lg border p-3 my-2">
            <div className="space-y-0.5">
              <Label htmlFor="forceTarifaBulk" className="text-sm font-medium">
                Forçar atualização da tarifa
              </Label>
              <p className="text-xs text-muted-foreground">
                Sobrescreve mesmo se já estiver preenchida
              </p>
            </div>
            <Switch
              id="forceTarifaBulk"
              checked={forceTarifaUpdate}
              onCheckedChange={setForceTarifaUpdate}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReprocess}>
              Reprocessar {selectedContatoIds.length} lead(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Results Dialog */}
      <AlertDialog open={showResults} onOpenChange={setShowResults}>
        <AlertDialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Resultado do Reprocessamento</AlertDialogTitle>
          </AlertDialogHeader>

          <div className="space-y-2">
            {results.map((result, idx) => (
              <div
                key={idx}
                className={`rounded-md p-3 text-sm ${
                  result.success
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-amber-50 border border-amber-200 text-amber-800'
                }`}
              >
                <p className="font-medium">{result.nome}</p>
                <p className="text-xs opacity-80">
                  Lead ID: {result.bitrixLeadId || 'N/A'} • {result.message}
                  {result.tarifaUpdateSuccess !== undefined && (
                    <> • Tarifa: {result.tarifaUpdateSuccess ? '✅' : '❌'}</>
                  )}
                </p>
              </div>
            ))}
          </div>

          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowResults(false)}>
              Fechar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
