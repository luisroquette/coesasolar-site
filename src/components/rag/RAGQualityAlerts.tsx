import { useState, useEffect } from 'react';
import { useUIConfig } from '@/hooks/useUIConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  XCircle,
  RefreshCw,
  Bell,
  TrendingDown
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RAGAlert {
  id: string;
  agent_id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  metric_value: number | null;
  threshold_value: number | null;
  period_days: number | null;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

interface Props {
  onAlertResolved?: () => void;
}

export function RAGQualityAlerts({ onAlertResolved }: Props) {
  const { resolvedAlertsDisplayLimit, queryLimitRagQualityAlerts } = useUIConfig();
  const [alerts, setAlerts] = useState<RAGAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from('rag_quality_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(queryLimitRagQualityAlerts);

      if (error) throw error;
      setAlerts((data || []) as RAGAlert[]);
    } catch (err) {
      console.error('Error fetching alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.rpc('check_rag_quality_alerts');
      
      if (error) throw error;
      
      const result = data?.[0] || { alerts_created: 0, agents_checked: 0 };
      
      toast({
        title: 'Verificação concluída',
        description: `${result.agents_checked} agentes verificados, ${result.alerts_created} novos alertas.`,
      });
      
      await fetchAlerts();
    } catch (err: any) {
      toast({
        title: 'Erro na verificação',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setChecking(false);
    }
  };

  const handleResolve = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from('rag_quality_alerts')
        .update({ 
          is_resolved: true, 
          resolved_at: new Date().toISOString() 
        })
        .eq('id', alertId);

      if (error) throw error;

      setAlerts(prev => prev.map(a => 
        a.id === alertId 
          ? { ...a, is_resolved: true, resolved_at: new Date().toISOString() } 
          : a
      ));
      
      toast({ title: 'Alerta resolvido' });
      onAlertResolved?.();
    } catch (err: any) {
      toast({
        title: 'Erro ao resolver',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  const getSeverityConfig = (severity: string) => {
    switch (severity) {
      case 'critical':
        return { 
          icon: XCircle, 
          color: 'text-destructive', 
          bg: 'bg-destructive/10',
          badge: 'destructive' as const
        };
      case 'warning':
        return { 
          icon: AlertTriangle, 
          color: 'text-yellow-600', 
          bg: 'bg-yellow-500/10',
          badge: 'secondary' as const
        };
      default:
        return { 
          icon: Bell, 
          color: 'text-muted-foreground', 
          bg: 'bg-muted',
          badge: 'outline' as const
        };
    }
  };

  const getAlertTypeIcon = (type: string) => {
    switch (type) {
      case 'low_hit_rate':
        return TrendingDown;
      case 'slow_response':
        return Clock;
      default:
        return AlertTriangle;
    }
  };

  const unresolvedAlerts = alerts.filter(a => !a.is_resolved);
  const resolvedAlerts = alerts.filter(a => a.is_resolved);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h3 className="font-semibold">Alertas de Qualidade</h3>
          {unresolvedAlerts.length > 0 && (
            <Badge variant="destructive">{unresolvedAlerts.length}</Badge>
          )}
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleCheckNow}
          disabled={checking}
        >
          {checking ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Verificar Agora
        </Button>
      </div>

      {/* Active Alerts */}
      {unresolvedAlerts.length > 0 ? (
        <div className="space-y-3">
          {unresolvedAlerts.map(alert => {
            const config = getSeverityConfig(alert.severity);
            const TypeIcon = getAlertTypeIcon(alert.alert_type);
            const SeverityIcon = config.icon;
            
            return (
              <Card key={alert.id} className={`border-l-4 ${
                alert.severity === 'critical' ? 'border-l-destructive' : 'border-l-yellow-500'
              }`}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${config.bg}`}>
                        <SeverityIcon className={`h-5 w-5 ${config.color}`} />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{alert.title}</span>
                          <Badge variant={config.badge} className="text-xs">
                            {alert.agent_id}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {alert.message}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <TypeIcon className="h-3 w-3" />
                            {alert.metric_value !== null && (
                              <span>
                                {alert.alert_type === 'low_hit_rate' 
                                  ? `${(alert.metric_value * 100).toFixed(1)}%`
                                  : `${alert.metric_value.toFixed(0)}ms`
                                }
                              </span>
                            )}
                          </span>
                          <span>
                            {formatDistanceToNow(new Date(alert.created_at), { 
                              addSuffix: true, 
                              locale: ptBR 
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleResolve(alert.id)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Resolver
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-primary mb-4" />
            <h4 className="font-medium mb-2">Tudo em ordem!</h4>
            <p className="text-sm text-muted-foreground">
              Nenhum alerta de qualidade ativo. A base de conhecimento está funcionando bem.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Resolved Alerts */}
      {resolvedAlerts.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
            <span>Alertas resolvidos ({resolvedAlerts.length})</span>
          </summary>
          <div className="mt-3 space-y-2">
            {resolvedAlerts.slice(0, resolvedAlertsDisplayLimit).map(alert => (
              <div 
                key={alert.id} 
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 text-sm"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-muted-foreground">{alert.title}</span>
                  <Badge variant="outline" className="text-xs">{alert.agent_id}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {alert.resolved_at && formatDistanceToNow(new Date(alert.resolved_at), { 
                    addSuffix: true, 
                    locale: ptBR 
                  })}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
