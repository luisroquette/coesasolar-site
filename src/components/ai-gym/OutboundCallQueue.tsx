import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useConfiguracoes } from '@/hooks/useConfiguracoes';
import { useUIConfig } from '@/hooks/useUIConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Phone, PhoneOff, Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ManualCallTrigger } from './ManualCallTrigger';

interface QueueItem {
  id: string;
  phone: string;
  customer_name: string | null;
  status: string;
  attempts: number | null;
  priority: number | null;
  scheduled_at: string | null;
  last_attempt_at: string | null;
  bitrix_lead_id: string | null;
  campaign_id: string | null;
  created_at: string;
  retell_call_id: string | null;
  lead_context: any;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  pending: { label: 'Aguardando', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
  scheduled: { label: 'Agendado', variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
  calling: { label: 'Ligando...', variant: 'default', icon: <Phone className="h-3 w-3 animate-pulse" /> },
  completed: { label: 'Concluído', variant: 'secondary', icon: <CheckCircle className="h-3 w-3 text-green-500" /> },
  failed: { label: 'Falhou', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
};

export function OutboundCallQueue() {
  const { configs } = useConfiguracoes();
  const { queryLimitOutboundQueue } = useUIConfig();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [calling, setCalling] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('outbound_call_queue')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(queryLimitOutboundQueue);

      if (error) throw error;
      setQueue(data || []);
    } catch (error) {
      console.error('Error fetching queue:', error);
      toast.error('Erro ao carregar fila');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    
    // Subscribe to realtime changes
    const channel = supabase
      .channel('outbound-queue-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'outbound_call_queue',
      }, () => {
        fetchQueue();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchQueue]);

  const handleCall = async (queueId: string) => {
    setCalling(queueId);
    
    try {
      const response = await supabase.functions.invoke('retell-create-outbound-call', {
        body: { queue_id: queueId }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao iniciar ligação');
      }

      toast.success('Ligação iniciada!');
      fetchQueue();
    } catch (error) {
      console.error('Error starting call:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao iniciar ligação');
    } finally {
      setCalling(null);
    }
  };

  const handleCancel = async (queueId: string) => {
    try {
      const { error } = await supabase
        .from('outbound_call_queue')
        .update({ status: 'failed' })
        .eq('id', queueId);

      if (error) throw error;
      
      toast.success('Item cancelado');
      fetchQueue();
    } catch (error) {
      console.error('Error canceling:', error);
      toast.error('Erro ao cancelar');
    }
  };

  const formatPhone = (phone: string) => {
    // Format Brazilian phone number
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13 && cleaned.startsWith('55')) {
      const ddd = cleaned.slice(2, 4);
      const part1 = cleaned.slice(4, 9);
      const part2 = cleaned.slice(9);
      return `(${ddd}) ${part1}-${part2}`;
    }
    return phone;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const stats = {
    total: queue.length,
    pending: queue.filter(q => q.status === 'pending' || q.status === 'scheduled').length,
    calling: queue.filter(q => q.status === 'calling').length,
    completed: queue.filter(q => q.status === 'completed').length,
    failed: queue.filter(q => q.status === 'failed').length,
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-orange-500">{stats.pending}</div>
            <div className="text-xs text-muted-foreground">Aguardando</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-blue-500">{stats.calling}</div>
            <div className="text-xs text-muted-foreground">Ligando</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-green-500">{stats.completed}</div>
            <div className="text-xs text-muted-foreground">Concluídos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-2xl font-bold text-red-500">{stats.failed}</div>
            <div className="text-xs text-muted-foreground">Falharam</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <ManualCallTrigger onSuccess={fetchQueue} />
        <Button variant="outline" size="sm" onClick={fetchQueue} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Queue Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Fila de Ligações Outbound
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : queue.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p>Nenhuma ligação na fila</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Última Tentativa</TableHead>
                  <TableHead>Bitrix</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((item) => {
                  const status = statusConfig[item.status] || statusConfig.pending;
                  const canCall = item.status === 'pending' || item.status === 'scheduled';
                  const canCancel = item.status === 'pending' || item.status === 'scheduled' || item.status === 'calling';

                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.customer_name || 'Não informado'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatPhone(item.phone)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant} className="gap-1">
                          {status.icon}
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.attempts || 0}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(item.last_attempt_at)}
                      </TableCell>
                      <TableCell>
                        {item.bitrix_lead_id ? (
                          <a 
                            href={`${configs.bitrix24_base_url}/crm/lead/details/${item.bitrix_lead_id}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline text-sm"
                          >
                            #{item.bitrix_lead_id}
                          </a>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canCall && (
                            <Button
                              size="sm"
                              onClick={() => handleCall(item.id)}
                              disabled={calling === item.id}
                            >
                              {calling === item.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Phone className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {canCancel && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleCancel(item.id)}
                            >
                              <PhoneOff className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
