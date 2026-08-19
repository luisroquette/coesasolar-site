import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, FileWarning } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface LeadSemProposta {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  valor_potencial: number | null;
  bitrix24_lead_id: string | null;
  created_at: string;
}

interface MissingProposalAlertProps {
  leads: LeadSemProposta[];
  onReprocessed: () => void;
}

export function MissingProposalAlert({ leads, onReprocessed }: MissingProposalAlertProps) {
  const [reprocessing, setReprocessing] = useState<Record<string, boolean>>({});
  const [isOpen, setIsOpen] = useState(false);

  if (leads.length === 0) return null;

  const handleReprocess = async (lead: LeadSemProposta) => {
    if (!lead.bitrix24_lead_id) {
      toast.error('Lead sem ID do Bitrix24 vinculado');
      return;
    }

    setReprocessing(prev => ({ ...prev, [lead.id]: true }));

    try {
      const { data, error } = await supabase.functions.invoke('bitrix24-webhook', {
        body: {
          data: {
            FIELDS: {
              ID: lead.bitrix24_lead_id
            }
          },
          forceProcess: true,
          forceTarifaUpdate: false
        }
      });

      if (error) throw error;

      if (data?.proposalId) {
        toast.success(`Proposta gerada para ${lead.nome}!`);
        onReprocessed();
      } else if (data?.error) {
        toast.error(`Erro: ${data.error}`);
      } else {
        toast.warning('Reprocessamento concluído mas sem proposta gerada. Verifique os dados do lead.');
      }
    } catch (err: any) {
      console.error('Erro ao reprocessar:', err);
      toast.error(err.message || 'Erro ao reprocessar lead');
    } finally {
      setReprocessing(prev => ({ ...prev, [lead.id]: false }));
    }
  };

  const handleReprocessAll = async () => {
    const leadsWithBitrix = leads.filter(l => l.bitrix24_lead_id);
    
    if (leadsWithBitrix.length === 0) {
      toast.warning('Nenhum lead tem ID do Bitrix24 vinculado');
      return;
    }

    for (const lead of leadsWithBitrix) {
      await handleReprocess(lead);
    }
  };

  return (
    <Alert variant="default" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
      <FileWarning className="h-4 w-4 text-amber-600" />
      <AlertTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
        <span>Leads com dados completos sem proposta</span>
        <Badge variant="secondary" className="bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200">
          {leads.length}
        </Badge>
      </AlertTitle>
      <AlertDescription className="mt-2">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Estes leads têm dados suficientes para gerar proposta, mas podem ter falhado por race condition.
            </p>
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="outline"
                className="border-amber-500 text-amber-700 hover:bg-amber-100"
                onClick={handleReprocessAll}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Reprocessar Todos
              </Button>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="text-amber-700">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {isOpen ? 'Ocultar' : 'Ver lista'}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          
          <CollapsibleContent className="mt-3">
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {leads.map((lead) => (
                <div 
                  key={lead.id} 
                  className="flex items-center justify-between p-2 bg-white dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-700"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{lead.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {lead.telefone || lead.email || 'Sem contato'} • 
                      Criado {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true, locale: ptBR })}
                      {lead.bitrix24_lead_id && (
                        <span className="ml-1 text-amber-600">• Bitrix #{lead.bitrix24_lead_id}</span>
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-2 shrink-0"
                    onClick={() => handleReprocess(lead)}
                    disabled={reprocessing[lead.id] || !lead.bitrix24_lead_id}
                  >
                    {reprocessing[lead.id] ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </AlertDescription>
    </Alert>
  );
}
