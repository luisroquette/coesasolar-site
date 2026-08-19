import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUIConfig } from '@/hooks/useUIConfig';
import { useConfiguracoes } from '@/hooks/useConfiguracoes';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  AlertTriangle, 
  Mail, 
  DollarSign, 
  Building2, 
  User, 
  Clock, 
  MessageSquare,
  ExternalLink,
  RefreshCw,
  Wifi
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatWhatsAppDisplay } from '@/lib/whatsapp-utils';

interface DadosColetados {
  nome?: string;
  cliente_nome?: string;
  email?: string;
  cliente_email?: string;
  valorFatura?: number | string;
  consumo?: number | string;
  consumo_ou_valor?: number | string;
  distribuidora?: string;
  concessionaria?: string;
}

interface LeadPendente {
  id: string;
  cliente_telefone: string;
  cliente_nome: string | null;
  cliente_email: string | null;
  dados_coletados: DadosColetados | null;
  nudge_count: number;
  last_message_at: string | null;
  created_at: string;
  bitrix24_lead_id: string | null;
}

interface MissingField {
  field: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const FIELD_CONFIG: Record<string, MissingField> = {
  email: { 
    field: 'email', 
    label: 'E-mail', 
    icon: <Mail className="h-3 w-3" />,
    color: 'bg-blue-500/10 text-blue-600 border-blue-200'
  },
  valorFatura: { 
    field: 'valorFatura', 
    label: 'Valor Fatura', 
    icon: <DollarSign className="h-3 w-3" />,
    color: 'bg-green-500/10 text-green-600 border-green-200'
  },
  distribuidora: { 
    field: 'distribuidora', 
    label: 'Distribuidora', 
    icon: <Building2 className="h-3 w-3" />,
    color: 'bg-purple-500/10 text-purple-600 border-purple-200'
  },
  nome: { 
    field: 'nome', 
    label: 'Nome', 
    icon: <User className="h-3 w-3" />,
    color: 'bg-orange-500/10 text-orange-600 border-orange-200'
  },
};

function getMissingFields(dados: DadosColetados | null): string[] {
  const collected = dados || {};
  const missing: string[] = [];
  
  if (!collected.email && !collected.cliente_email) {
    missing.push('email');
  }
  if (!collected.valorFatura && !collected.consumo && !collected.consumo_ou_valor) {
    missing.push('valorFatura');
  }
  if (!collected.distribuidora && !collected.concessionaria) {
    missing.push('distribuidora');
  }
  if (!collected.nome && !collected.cliente_nome) {
    missing.push('nome');
  }
  
  return missing;
}

function getCollectedFields(dados: DadosColetados | null): string[] {
  const collected = dados || {};
  const present: string[] = [];
  
  if (collected.email || collected.cliente_email) {
    present.push('email');
  }
  if (collected.valorFatura || collected.consumo || collected.consumo_ou_valor) {
    present.push('valorFatura');
  }
  if (collected.distribuidora || collected.concessionaria) {
    present.push('distribuidora');
  }
  if (collected.nome || collected.cliente_nome) {
    present.push('nome');
  }
  
  return present;
}

export function PendingDataLeads() {
  const { queryLimitPendingLeads, pollingFallbackIntervalMs } = useUIConfig();
  const { configs } = useConfiguracoes();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastRealtimeUpdate, setLastRealtimeUpdate] = useState<Date | null>(null);
  const updateIndicatorTimeout = useRef<NodeJS.Timeout | null>(null);

  const { data: leads, isLoading, refetch } = useQuery({
    queryKey: ['pending-data-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chatbot_conversas')
        .select('id, cliente_telefone, cliente_nome, cliente_email, dados_coletados, nudge_count, last_message_at, created_at, bitrix24_lead_id')
        .eq('awaiting_response', true)
        .eq('needs_human_fallback', false)
        .is('ended_at', null)
        .is('contrato_enviado_at', null)
        .order('last_message_at', { ascending: false })
        .limit(queryLimitPendingLeads);
      
      if (error) throw error;
      return (data || []) as LeadPendente[];
    },
    // Fallback polling only if realtime disconnects
    refetchInterval: realtimeConnected ? false : pollingFallbackIntervalMs,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('pending-data-leads-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chatbot_conversas'
        },
        (payload) => {
          console.log('📡 Realtime update received:', payload.eventType, payload);
          
          // Clear previous timeout
          if (updateIndicatorTimeout.current) {
            clearTimeout(updateIndicatorTimeout.current);
          }
          
          // Show update indicator
          setLastRealtimeUpdate(new Date());
          
          // Refetch data
          refetch();
          
          // Clear indicator after 3 seconds
          updateIndicatorTimeout.current = setTimeout(() => {
            setLastRealtimeUpdate(null);
          }, 3000);
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime subscription status:', status);
        setRealtimeConnected(status === 'SUBSCRIBED');
      });

    return () => {
      if (updateIndicatorTimeout.current) {
        clearTimeout(updateIndicatorTimeout.current);
      }
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Filter leads with missing data
  const leadsWithMissingData = (leads || []).filter(lead => {
    const missing = getMissingFields(lead.dados_coletados as DadosColetados | null);
    return missing.length > 0;
  });

  // Stats
  const totalPending = leadsWithMissingData.length;
  const missingEmailCount = leadsWithMissingData.filter(l => 
    getMissingFields(l.dados_coletados as DadosColetados | null).includes('email')
  ).length;
  const missingValorCount = leadsWithMissingData.filter(l => 
    getMissingFields(l.dados_coletados as DadosColetados | null).includes('valorFatura')
  ).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-lg">Leads Aguardando Dados</CardTitle>
            {totalPending > 0 && (
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600">
                {totalPending}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Realtime indicator */}
            <div className="flex items-center gap-1.5">
              <Wifi className={`h-3.5 w-3.5 ${realtimeConnected ? 'text-emerald-500' : 'text-muted-foreground'}`} />
              <span className="text-xs text-muted-foreground">
                {realtimeConnected ? 'Ao vivo' : 'Offline'}
              </span>
            </div>
            
            {/* Update flash indicator */}
            {lastRealtimeUpdate && (
              <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-200 animate-pulse">
                Atualizado!
              </Badge>
            )}
            
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        <CardDescription>
          Leads travados na coleta de dados com campos faltantes identificados
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Quick Stats */}
        {totalPending > 0 && (
          <div className="flex gap-4 mb-4 pb-4 border-b">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-blue-500" />
              <span className="text-muted-foreground">Sem e-mail:</span>
              <Badge variant="outline" className="bg-blue-500/5">{missingEmailCount}</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">Sem valor:</span>
              <Badge variant="outline" className="bg-green-500/5">{missingValorCount}</Badge>
            </div>
          </div>
        )}

        {leadsWithMissingData.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>Nenhum lead com dados faltantes no momento</p>
            <p className="text-sm">Todos os leads ativos têm os dados necessários</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {leadsWithMissingData.map(lead => {
                const missingFields = getMissingFields(lead.dados_coletados as DadosColetados | null);
                const collectedFields = getCollectedFields(lead.dados_coletados as DadosColetados | null);
                const lastActivity = lead.last_message_at 
                  ? formatDistanceToNow(new Date(lead.last_message_at), { addSuffix: true, locale: ptBR })
                  : 'Nunca';

                return (
                  <div 
                    key={lead.id} 
                    className="p-4 border rounded-lg hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-medium">
                          {lead.cliente_nome || 'Nome não informado'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatWhatsAppDisplay(lead.cliente_telefone)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {lastActivity}
                        {lead.nudge_count > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {lead.nudge_count} nudge{lead.nudge_count > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Missing Fields */}
                    <div className="mb-2">
                      <p className="text-xs text-muted-foreground mb-1.5">Dados faltantes:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {missingFields.map(field => {
                          const config = FIELD_CONFIG[field];
                          if (!config) return null;
                          return (
                            <Badge 
                              key={field} 
                              variant="outline" 
                              className={`text-xs ${config.color}`}
                            >
                              {config.icon}
                              <span className="ml-1">{config.label}</span>
                            </Badge>
                          );
                        })}
                      </div>
                    </div>

                    {/* Collected Fields */}
                    {collectedFields.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5">Já coletados:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {collectedFields.map(field => {
                            const config = FIELD_CONFIG[field];
                            if (!config) return null;
                            return (
                              <Badge 
                                key={field} 
                                variant="outline" 
                                className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-200"
                              >
                                ✓ {config.label}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Bitrix Link */}
                    {lead.bitrix24_lead_id && (
                      <div className="mt-3 pt-3 border-t">
                        <a 
                          href={`${configs.bitrix24_base_url}/crm/lead/details/${lead.bitrix24_lead_id}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Ver no Bitrix24
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
