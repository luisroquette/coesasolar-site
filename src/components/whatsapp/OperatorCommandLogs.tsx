import { useState, useEffect } from 'react';
import { useUIConfig } from '@/hooks/useUIConfig';
import { Terminal, UserCheck, RotateCcw, Clock, Phone, User, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CommandLog {
  id: string;
  command: string;
  operator_phone: string | null;
  operator_name: string | null;
  client_phone: string | null;
  client_name: string | null;
  action_result: string | null;
  created_at: string;
}

const commandConfig: Record<string, { label: string; icon: React.ReactNode; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  '#ASSUMIR': { label: 'Assumir', icon: <UserCheck className="h-3 w-3" />, variant: 'destructive' },
  '#MEU': { label: 'Assumir', icon: <UserCheck className="h-3 w-3" />, variant: 'destructive' },
  '#TAKEOVER': { label: 'Assumir', icon: <UserCheck className="h-3 w-3" />, variant: 'destructive' },
  '#RESOLVIDO': { label: 'Devolver', icon: <RotateCcw className="h-3 w-3" />, variant: 'default' },
  '#DEVOLVER': { label: 'Devolver', icon: <RotateCcw className="h-3 w-3" />, variant: 'default' },
  '#SOFIA': { label: 'Devolver', icon: <RotateCcw className="h-3 w-3" />, variant: 'default' },
};

export function OperatorCommandLogs() {
  const { realtimeCommandLogsLimit } = useUIConfig();
  const [logs, setLogs] = useState<CommandLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('operator_command_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(realtimeCommandLogsLimit);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Error fetching operator command logs:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();

    // Set up realtime subscription
    const channel = supabase
      .channel('operator_command_logs_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'operator_command_logs',
        },
        (payload) => {
          setLogs(prev => [payload.new as CommandLog, ...prev].slice(0, realtimeCommandLogsLimit));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchLogs();
  };

  const formatPhone = (phone: string | null) => {
    if (!phone) return 'N/A';
    return phone.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, '+$1 ($2) $3-$4');
  };

  const getCommandInfo = (command: string) => {
    return commandConfig[command.toUpperCase()] || { 
      label: command, 
      icon: <Terminal className="h-3 w-3" />, 
      variant: 'secondary' as const 
    };
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Log de Comandos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Log de Comandos de Operador
            </CardTitle>
            <CardDescription>
              Histórico de comandos #ASSUMIR e #RESOLVIDO executados
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Terminal className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Nenhum comando de operador registrado ainda.</p>
            <p className="text-sm mt-1">
              Comandos como #ASSUMIR e #RESOLVIDO aparecerão aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => {
              const cmdInfo = getCommandInfo(log.command);
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <Badge variant={cmdInfo.variant} className="flex items-center gap-1">
                      {cmdInfo.icon}
                      {cmdInfo.label}
                    </Badge>
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {log.client_name || 'Cliente'}
                      </span>
                      {log.client_phone && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {formatPhone(log.client_phone)}
                        </span>
                      )}
                    </div>
                    
                    {log.operator_name && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>por {log.operator_name}</span>
                      </div>
                    )}
                    
                    {log.action_result && (
                      <p className="text-xs text-muted-foreground truncate">
                        {log.action_result}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex-shrink-0 text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(log.created_at), { 
                      addSuffix: true, 
                      locale: ptBR 
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
