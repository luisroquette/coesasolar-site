import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, History, RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ActivityLog {
  id: string;
  action: string;
  entity_type: string;
  entity_name: string | null;
  details: unknown;
  created_at: string;
}

const parseDetails = (details: unknown): Record<string, unknown> | null => {
  if (!details) return null;
  if (typeof details === 'string') {
    try {
      return JSON.parse(details);
    } catch {
      return null;
    }
  }
  if (typeof details === 'object') {
    return details as Record<string, unknown>;
  }
  return null;
};

const ACTION_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  'sofia_daily_report': { label: 'Relatório Diário', icon: '📊', color: 'bg-blue-500/10 text-blue-600' },
  'sofia_weekly_report': { label: 'Resumo Semanal', icon: '📅', color: 'bg-purple-500/10 text-purple-600' },
  'sofia_hot_lead_alert': { label: 'Lead Quente', icon: '🔥', color: 'bg-orange-500/10 text-orange-600' },
};

export const NotificationLogsViewer = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .in('action', ['sofia_daily_report', 'sofia_weekly_report', 'sofia_hot_lead_alert'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
      toast.error('Erro ao carregar histórico');
    } finally {
      setLoading(false);
    }
  };

  const getStatusFromDetails = (rawDetails: unknown) => {
    const details = parseDetails(rawDetails);
    if (!details) return null;
    
    const sent = details.sent_count as number | undefined;
    const failed = details.failed_count as number | undefined;
    
    if (sent !== undefined && failed !== undefined) {
      return {
        sent,
        failed,
        success: failed === 0,
      };
    }
    
    // Fallback para formato antigo
    if (details.success !== undefined) {
      return {
        sent: details.recipients_count as number || 0,
        failed: 0,
        success: details.success as boolean,
      };
    }
    
    return null;
  };

  const toggleExpand = (id: string) => {
    setExpandedLog(expandedLog === id ? null : id);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              Histórico de Envios
            </CardTitle>
            <CardDescription>
              Últimas 50 notificações enviadas
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadLogs}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum envio registrado</p>
            <p className="text-sm">Os envios aparecerão aqui após serem disparados</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Destinatários</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const config = ACTION_CONFIG[log.action] || {
                  label: log.action,
                  icon: '📋',
                  color: 'bg-gray-500/10 text-gray-600',
                };
                const status = getStatusFromDetails(log.details);
                const isExpanded = expandedLog === log.id;

                return (
                  <Collapsible key={log.id} open={isExpanded} onOpenChange={() => toggleExpand(log.id)}>
                    <TableRow className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={config.color}>
                          <span className="mr-1">{config.icon}</span>
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {status ? (
                          status.success ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              Sucesso
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-red-600">
                              <XCircle className="h-4 w-4" />
                              Falha parcial
                            </div>
                          )
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {status ? (
                          <div className="flex items-center gap-2">
                            <span className="text-green-600">{status.sent} ✓</span>
                            {status.failed > 0 && (
                              <span className="text-red-600">{status.failed} ✗</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </TableCell>
                    </TableRow>
                    <CollapsibleContent asChild>
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={5}>
                          <div className="p-3 space-y-2">
                            <p className="text-sm font-medium">Detalhes do envio:</p>
                            <pre className="text-xs bg-background p-3 rounded-lg overflow-auto max-h-48">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </div>
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
