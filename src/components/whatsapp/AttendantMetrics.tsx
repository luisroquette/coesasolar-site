import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUIConfig } from '@/hooks/useUIConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  BarChart3, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  TrendingUp,
  Users,
  Timer
} from 'lucide-react';
import { formatDistanceToNow, subDays, format, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AttendantStats {
  id: string;
  nome: string;
  telefone: string;
  escalacoes_recebidas: number;
  escalacoes_resolvidas: number;
  tempo_medio_resolucao_segundos: number;
  is_active: boolean;
  is_plantao: boolean;
}

interface EscalationData {
  id: string;
  cliente_nome: string;
  cliente_telefone: string;
  escalated_at: string;
  escalation_reason: string;
  needs_human_fallback: boolean;
  human_resolved_at: string | null;
  human_resolution_time_seconds: number | null;
  atendente_notificado_nome: string | null;
}

interface PeriodStats {
  total_escalations: number;
  resolved: number;
  pending: number;
  avg_resolution_time: number;
}

export function AttendantMetrics() {
  const { escalationsDisplayLimit } = useUIConfig();
  const [attendants, setAttendants] = useState<AttendantStats[]>([]);
  const [escalations, setEscalations] = useState<EscalationData[]>([]);
  const [periodStats, setPeriodStats] = useState<PeriodStats>({
    total_escalations: 0,
    resolved: 0,
    pending: 0,
    avg_resolution_time: 0
  });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7');

  const fetchData = async () => {
    setLoading(true);
    try {
      const daysAgo = parseInt(period);
      const startDate = startOfDay(subDays(new Date(), daysAgo)).toISOString();
      const endDate = endOfDay(new Date()).toISOString();

      // Fetch attendants
      const { data: attendantsData } = await supabase
        .from('whatsapp_atendentes')
        .select('id, nome, telefone, escalacoes_recebidas, escalacoes_resolvidas, tempo_medio_resolucao_segundos, is_active, is_plantao')
        .order('escalacoes_recebidas', { ascending: false });

      // Fetch escalations for the period
      const { data: escalationsData } = await supabase
        .from('chatbot_conversas')
        .select('id, cliente_nome, cliente_telefone, escalated_at, escalation_reason, needs_human_fallback, human_resolved_at, human_resolution_time_seconds, atendente_notificado_nome')
        .not('escalated_at', 'is', null)
        .gte('escalated_at', startDate)
        .lte('escalated_at', endDate)
        .order('escalated_at', { ascending: false });

      setAttendants((attendantsData as AttendantStats[]) || []);
      setEscalations((escalationsData as EscalationData[]) || []);

      // Calculate period stats
      if (escalationsData) {
        const resolved = escalationsData.filter(e => e.human_resolved_at).length;
        const pending = escalationsData.filter(e => e.needs_human_fallback && !e.human_resolved_at).length;
        const resolutionTimes = escalationsData
          .filter(e => e.human_resolution_time_seconds)
          .map(e => e.human_resolution_time_seconds as number);
        
        const avgTime = resolutionTimes.length > 0 
          ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length)
          : 0;

        setPeriodStats({
          total_escalations: escalationsData.length,
          resolved,
          pending,
          avg_resolution_time: avgTime
        });
      }
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period]);

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds === 0) return '-';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `${hours}h ${mins}min`;
  };

  const getSuccessRate = (attendant: AttendantStats) => {
    if (attendant.escalacoes_recebidas === 0) return 0;
    return Math.round((attendant.escalacoes_resolvidas / attendant.escalacoes_recebidas) * 100);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Métricas de Atendimento</h3>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Últimas 24 horas</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <AlertTriangle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{periodStats.total_escalations}</p>
                <p className="text-xs text-muted-foreground">Total Escalações</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{periodStats.resolved}</p>
                <p className="text-xs text-muted-foreground">Resolvidas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{periodStats.pending}</p>
                <p className="text-xs text-muted-foreground">Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Timer className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatDuration(periodStats.avg_resolution_time)}</p>
                <p className="text-xs text-muted-foreground">Tempo Médio</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Success Rate */}
      {periodStats.total_escalations > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Taxa de Resolução</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold">
                  {periodStats.total_escalations > 0 
                    ? Math.round((periodStats.resolved / periodStats.total_escalations) * 100) 
                    : 0}%
                </span>
              </div>
            </div>
            <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 transition-all duration-500"
                style={{ 
                  width: `${periodStats.total_escalations > 0 
                    ? (periodStats.resolved / periodStats.total_escalations) * 100 
                    : 0}%` 
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Attendants Performance */}
      {attendants.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Desempenho por Atendente</CardTitle>
            </div>
            <CardDescription>Métricas acumuladas de cada atendente</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {attendants.map((attendant) => (
                <div 
                  key={attendant.id}
                  className={`p-4 border rounded-lg ${!attendant.is_active ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{attendant.nome}</span>
                      {attendant.is_plantao && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-xs">
                          Plantão
                        </Badge>
                      )}
                      {!attendant.is_active && (
                        <Badge variant="secondary" className="text-xs">Inativo</Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center p-2 bg-muted/50 rounded">
                      <p className="text-lg font-semibold">{attendant.escalacoes_recebidas}</p>
                      <p className="text-xs text-muted-foreground">Recebidas</p>
                    </div>
                    <div className="text-center p-2 bg-muted/50 rounded">
                      <p className="text-lg font-semibold text-green-600">{getSuccessRate(attendant)}%</p>
                      <p className="text-xs text-muted-foreground">Taxa Sucesso</p>
                    </div>
                    <div className="text-center p-2 bg-muted/50 rounded">
                      <p className="text-lg font-semibold">{formatDuration(attendant.tempo_medio_resolucao_segundos)}</p>
                      <p className="text-xs text-muted-foreground">Tempo Médio</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Escalations */}
      {escalations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Escalações Recentes</CardTitle>
            <CardDescription>Últimas {Math.min(escalations.length, escalationsDisplayLimit)} escalações do período</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {escalations.slice(0, escalationsDisplayLimit).map((escalation) => (
                <div 
                  key={escalation.id}
                  className="flex items-center justify-between p-3 border rounded-lg text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{escalation.cliente_nome || 'Cliente'}</span>
                      {escalation.needs_human_fallback && !escalation.human_resolved_at ? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-xs">
                          Pendente
                        </Badge>
                      ) : escalation.human_resolved_at ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/30 text-xs">
                          Resolvido
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Fechado</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {escalation.escalation_reason?.substring(0, 60)}...
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-xs text-muted-foreground">
                      {escalation.escalated_at && formatDistanceToNow(new Date(escalation.escalated_at), { 
                        addSuffix: true, 
                        locale: ptBR 
                      })}
                    </p>
                    {escalation.human_resolution_time_seconds && (
                      <p className="text-xs text-green-600">
                        Resolvido em {formatDuration(escalation.human_resolution_time_seconds)}
                      </p>
                    )}
                    {escalation.atendente_notificado_nome && (
                      <p className="text-xs text-muted-foreground">
                        → {escalation.atendente_notificado_nome}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {escalations.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma escalação encontrada neste período</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
