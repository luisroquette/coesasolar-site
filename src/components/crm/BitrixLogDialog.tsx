import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUIConfig } from '@/hooks/useUIConfig';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Loader2, 
  Clock,
  FileText,
  Database,
  ArrowUpCircle,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BitrixLog {
  id: string;
  bitrix24_lead_id: string | null;
  proposta_id: string | null;
  action: string;
  status: string;
  error_message: string | null;
  request_data: Record<string, unknown> | null;
  response_data: Record<string, unknown> | null;
  created_at: string;
}

interface BitrixLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bitrixLeadId: string;
  contatoNome: string;
  ultimoErro?: string | null;
  onReprocessSuccess?: () => void;
}

// Mapeamento de ações para labels amigáveis
const ACTION_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  lead_created: { 
    label: 'Proposta criada', 
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'text-green-600'
  },
  lead_updated: { 
    label: 'Proposta atualizada', 
    icon: <RefreshCw className="h-4 w-4" />,
    color: 'text-blue-600'
  },
  validation_failed: { 
    label: 'Dados incompletos (Contrato)', 
    icon: <AlertTriangle className="h-4 w-4" />,
    color: 'text-amber-600'
  },
  validation_failed_inicial: { 
    label: 'Dados incompletos (Inicial)', 
    icon: <AlertTriangle className="h-4 w-4" />,
    color: 'text-amber-600'
  },
  tarifa_not_found: { 
    label: 'Tarifa não encontrada', 
    icon: <XCircle className="h-4 w-4" />,
    color: 'text-red-600'
  },
  tarifa_not_found_inicial: { 
    label: 'Tarifa não encontrada (Inicial)', 
    icon: <XCircle className="h-4 w-4" />,
    color: 'text-red-600'
  },
  initial_proposal_update: { 
    label: 'Atualização proposta inicial', 
    icon: <ArrowUpCircle className="h-4 w-4" />,
    color: 'text-purple-600'
  },
  tarifa_update: { 
    label: 'Atualização de tarifa', 
    icon: <Database className="h-4 w-4" />,
    color: 'text-indigo-600'
  },
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  success: { label: 'Sucesso', className: 'bg-green-100 text-green-800' },
  failed: { label: 'Falhou', className: 'bg-red-100 text-red-800' },
  skipped: { label: 'Ignorado', className: 'bg-amber-100 text-amber-800' },
  pending: { label: 'Pendente', className: 'bg-gray-100 text-gray-800' },
};

export function BitrixLogDialog({ 
  open, 
  onOpenChange, 
  bitrixLeadId, 
  contatoNome,
  ultimoErro,
  onReprocessSuccess 
}: BitrixLogDialogProps) {
  const { queryLimitBitrixLogs } = useUIConfig();
  const [logs, setLogs] = useState<BitrixLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    if (open && bitrixLeadId) {
      loadLogs();
    }
  }, [open, bitrixLeadId, queryLimitBitrixLogs]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bitrix24_sync_logs')
        .select('*')
        .eq('bitrix24_lead_id', bitrixLeadId)
        .order('created_at', { ascending: false })
        .limit(queryLimitBitrixLogs);

      if (error) throw error;
      setLogs((data as BitrixLog[]) || []);
    } catch (error) {
      console.error('Error loading logs:', error);
      toast.error('Erro ao carregar logs');
    } finally {
      setLoading(false);
    }
  };

  const handleReprocess = async () => {
    setReprocessing(true);
    try {
      const payload = {
        event: 'ONCRMLEAD_UPDATE',
        data: {
          FIELDS: {
            ID: bitrixLeadId,
          },
        },
        forceProcess: true,
      };

      const { data, error } = await supabase.functions.invoke('bitrix24-webhook', {
        body: payload,
      });

      if (error) {
        toast.error('Erro ao reprocessar lead');
        return;
      }

      if (data?.proposalCreated) {
        toast.success('Proposta criada com sucesso!');
        onReprocessSuccess?.();
        loadLogs();
      } else if (data?.missingFields) {
        toast.warning(`Campos faltantes: ${data.missingFields.join(', ')}`);
        loadLogs();
      } else {
        toast.info(data?.message || 'Processamento concluído');
        loadLogs();
      }
    } catch (err) {
      console.error('Reprocess error:', err);
      toast.error('Erro ao reprocessar lead');
    } finally {
      setReprocessing(false);
    }
  };

  const getActionInfo = (action: string) => {
    return ACTION_LABELS[action] || { 
      label: action, 
      icon: <FileText className="h-4 w-4" />,
      color: 'text-gray-600'
    };
  };

  const getStatusBadge = (status: string) => {
    const info = STATUS_BADGES[status] || STATUS_BADGES.pending;
    return (
      <Badge className={info.className}>
        {info.label}
      </Badge>
    );
  };

  const extractMissingFields = (log: BitrixLog): string[] => {
    const responseData = log.response_data as any;
    if (responseData?.validation?.missingFields) {
      return responseData.validation.missingFields;
    }
    if (responseData?.missingFields) {
      return responseData.missingFields;
    }
    return [];
  };

  const extractConcessionaria = (log: BitrixLog): string | null => {
    const responseData = log.response_data as any;
    return responseData?.concessionaria || null;
  };

  const extractLeadData = (log: BitrixLog): { nome?: string; telefone?: string; email?: string } => {
    const responseData = log.response_data as any;
    return responseData?.lead || {};
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Logs de Erro - {contatoNome}
          </DialogTitle>
          <DialogDescription>
            Lead Bitrix24 #{bitrixLeadId} • Histórico de tentativas de geração de proposta
          </DialogDescription>
        </DialogHeader>

        {/* Último erro resumido */}
        {ultimoErro && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm font-medium text-red-800">Último erro:</p>
            <p className="text-sm text-red-700 mt-1">{ultimoErro}</p>
          </div>
        )}

        {/* Botão de reprocessar */}
        <div className="flex justify-between items-center py-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadLogs}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button
            onClick={handleReprocess}
            disabled={reprocessing}
          >
            {reprocessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Reprocessando...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reprocessar Lead
              </>
            )}
          </Button>
        </div>

        {/* Lista de logs */}
        <ScrollArea className="h-[400px] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum log encontrado para este lead</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => {
                const actionInfo = getActionInfo(log.action);
                const missingFields = extractMissingFields(log);
                const concessionaria = extractConcessionaria(log);
                const leadData = extractLeadData(log);
                const isExpanded = expandedLog === log.id;

                return (
                  <div 
                    key={log.id} 
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      log.status === 'success' ? 'border-green-200 bg-green-50/50' :
                      log.status === 'failed' ? 'border-red-200 bg-red-50/50' :
                      'border-amber-200 bg-amber-50/50'
                    }`}
                    onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                  >
                    {/* Header do log */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={actionInfo.color}>
                          {actionInfo.icon}
                        </span>
                        <span className="font-medium text-sm">{actionInfo.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(log.status)}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </div>

                    {/* Campos faltantes (sempre visível se houver) */}
                    {missingFields.length > 0 && (
                      <div className="mt-2 pl-6">
                        <p className="text-xs font-medium text-red-700">Campos faltantes:</p>
                        <ul className="text-xs text-red-600 mt-1">
                          {missingFields.map((field, i) => (
                            <li key={i} className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              {field}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Concessionária (se relevante) */}
                    {concessionaria && (log.action.includes('tarifa') || log.action.includes('validation')) && (
                      <div className="mt-2 pl-6">
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">Concessionária:</span> {concessionaria}
                        </p>
                      </div>
                    )}

                    {/* Detalhes expandidos */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-dashed space-y-2">
                        {leadData.nome && (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">Nome:</span> {leadData.nome}
                          </p>
                        )}
                        {leadData.telefone && (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">Telefone:</span> {leadData.telefone}
                          </p>
                        )}
                        {leadData.email && (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">Email:</span> {leadData.email}
                          </p>
                        )}
                        {log.proposta_id && (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-muted-foreground">
                              <span className="font-medium">Proposta ID:</span> {log.proposta_id.substring(0, 8)}...
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`/proposta/${log.proposta_id}`, '_blank');
                              }}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Ver proposta
                            </Button>
                          </div>
                        )}
                        {log.error_message && (
                          <p className="text-xs text-red-600">
                            <span className="font-medium">Erro:</span> {log.error_message}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">Data/Hora:</span>{' '}
                          {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
          Clique em um log para ver mais detalhes • Mostrando últimos 20 registros
        </div>
      </DialogContent>
    </Dialog>
  );
}
