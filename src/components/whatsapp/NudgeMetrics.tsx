import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useUIConfig } from '@/hooks/useUIConfig';
import { 
  Bell, 
  TrendingUp, 
  Clock, 
  CheckCircle2,
  XCircle,
  Calendar,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { format, subDays, startOfDay, endOfDay, isWithinInterval, parseISO, differenceInMinutes, getHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface NudgeMessage {
  id: string;
  conversa_id: string;
  content: string;
  created_at: string;
}

interface ConversaNudge {
  id: string;
  nudge_count: number;
  awaiting_response: boolean;
  last_sofia_message_at: string | null;
  last_message_at: string | null;
  created_at: string;
}

interface HourlyData {
  hour: string;
  responses: number;
  total: number;
  rate: number;
}

type DateFilter = 'week' | 'month';

const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'week', label: '7 dias' },
  { value: 'month', label: '30 dias' },
];

export function NudgeMetrics() {
  const { 
    nudge1ResponseRate, 
    nudge2ResponseRate, 
    nudge3ResponseRate, 
    intervalNudgeMetricsMs,
    queryLimitNudgeMessages,
    queryLimitNudgeConversas
  } = useUIConfig();
  const [nudgeMessages, setNudgeMessages] = useState<NudgeMessage[]>([]);
  const [conversas, setConversas] = useState<ConversaNudge[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('week');

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch nudge messages (messages that contain [NUDGE])
      const { data: messages, error: messagesError } = await supabase
        .from('chatbot_mensagens')
        .select('id, conversa_id, content, created_at')
        .like('content', '[NUDGE%')
        .order('created_at', { ascending: false })
        .limit(queryLimitNudgeMessages);

      if (messagesError) throw messagesError;

      // Fetch conversations with nudge data
      const { data: convData, error: convError } = await supabase
        .from('chatbot_conversas')
        .select('id, nudge_count, awaiting_response, last_sofia_message_at, last_message_at, created_at')
        .gt('nudge_count', 0)
        .order('created_at', { ascending: false })
        .limit(queryLimitNudgeConversas);

      if (convError) throw convError;

      setNudgeMessages(messages || []);
      setConversas(convData as ConversaNudge[] || []);
    } catch (error) {
      console.error('Error fetching nudge metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, intervalNudgeMetricsMs);
    return () => clearInterval(interval);
  }, [intervalNudgeMetricsMs]);

  // Calculate metrics based on date filter
  const metrics = useMemo(() => {
    const days = dateFilter === 'week' ? 7 : 30;
    const start = startOfDay(subDays(new Date(), days - 1));
    const end = endOfDay(new Date());

    // Filter messages by date
    const filteredMessages = nudgeMessages.filter(m => {
      const createdAt = parseISO(m.created_at);
      return isWithinInterval(createdAt, { start, end });
    });

    // Count nudges by type
    const nudge1Count = filteredMessages.filter(m => m.content.includes('[NUDGE 1]')).length;
    const nudge2Count = filteredMessages.filter(m => m.content.includes('[NUDGE 2]')).length;
    const nudge3Count = filteredMessages.filter(m => m.content.includes('[NUDGE 3]')).length;
    const totalNudges = nudge1Count + nudge2Count + nudge3Count;

    // Filter conversations by date
    const filteredConversas = conversas.filter(c => {
      const createdAt = parseISO(c.created_at);
      return isWithinInterval(createdAt, { start, end });
    });

    // Calculate response rates
    // A conversation "responded after nudge" if awaiting_response is false AND nudge_count > 0
    const respondedAfterNudge = filteredConversas.filter(c => 
      !c.awaiting_response && c.nudge_count > 0
    ).length;
    
    const totalWithNudges = filteredConversas.length;
    const overallResponseRate = totalWithNudges > 0 
      ? (respondedAfterNudge / totalWithNudges * 100) 
      : 0;

    // Calculate average re-engagement time
    // Time between last_sofia_message_at and last_message_at for responded conversations
    let totalReengagementTime = 0;
    let reengagementCount = 0;

    filteredConversas.forEach(c => {
      if (!c.awaiting_response && c.last_sofia_message_at && c.last_message_at) {
        const sofiaTime = parseISO(c.last_sofia_message_at);
        const responseTime = parseISO(c.last_message_at);
        const diffMinutes = differenceInMinutes(responseTime, sofiaTime);
        if (diffMinutes > 0 && diffMinutes < 1440) { // Less than 24h
          totalReengagementTime += diffMinutes;
          reengagementCount++;
        }
      }
    });

    const avgReengagementMinutes = reengagementCount > 0 
      ? Math.round(totalReengagementTime / reengagementCount) 
      : 0;

    // Calculate hourly effectiveness
    const hourlyMap = new Map<number, { responses: number; total: number }>();
    for (let h = 0; h < 24; h++) {
      hourlyMap.set(h, { responses: 0, total: 0 });
    }

    filteredMessages.forEach(m => {
      const hour = getHours(parseISO(m.created_at));
      const existing = hourlyMap.get(hour)!;
      existing.total++;
    });

    // Check responses by hour (simplified - based on conversation response)
    filteredConversas.filter(c => !c.awaiting_response).forEach(c => {
      if (c.last_message_at) {
        const hour = getHours(parseISO(c.last_message_at));
        const existing = hourlyMap.get(hour);
        if (existing) existing.responses++;
      }
    });

    const hourlyData: HourlyData[] = Array.from(hourlyMap.entries())
      .map(([hour, data]) => ({
        hour: `${hour.toString().padStart(2, '0')}h`,
        responses: data.responses,
        total: data.total,
        rate: data.total > 0 ? Math.round((data.responses / data.total) * 100) : 0,
      }));

    // Find best hours
    const sortedHours = [...hourlyData]
      .filter(h => h.total >= 3)
      .sort((a, b) => b.rate - a.rate);
    const bestHours = sortedHours.slice(0, 3);

    // Per-nudge response estimates
    // This is an approximation based on nudge counts - values from config
    const nudge1Responded = Math.round(respondedAfterNudge * nudge1ResponseRate);
    const nudge2Responded = Math.round(respondedAfterNudge * nudge2ResponseRate);
    const nudge3Responded = Math.round(respondedAfterNudge * nudge3ResponseRate);

    return {
      totalNudges,
      nudge1Count,
      nudge2Count,
      nudge3Count,
      respondedAfterNudge,
      totalWithNudges,
      overallResponseRate,
      avgReengagementMinutes,
      hourlyData,
      bestHours,
      nudge1ResponseRate: nudge1Count > 0 ? (nudge1Responded / nudge1Count * 100) : 0,
      nudge2ResponseRate: nudge2Count > 0 ? (nudge2Responded / nudge2Count * 100) : 0,
      nudge3ResponseRate: nudge3Count > 0 ? (nudge3Responded / nudge3Count * 100) : 0,
    };
  }, [nudgeMessages, conversas, dateFilter]);

  const formatTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Métricas de Nudges
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Metrics Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-500" />
                Métricas de Nudges
              </CardTitle>
              <CardDescription>
                Taxa de resposta e efetividade dos nudges automáticos
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div className="flex gap-1">
                {DATE_FILTER_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    variant={dateFilter === option.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setDateFilter(option.value)}
                    className="text-xs px-2 py-1 h-7"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {/* Total Nudges */}
            <div className="p-4 border rounded-lg bg-amber-500/5 border-amber-500/20">
              <div className="flex items-center gap-2 text-amber-600 mb-2">
                <Bell className="h-4 w-4" />
                <span className="text-sm font-medium">Nudges Enviados</span>
              </div>
              <p className="text-3xl font-bold">{metrics.totalNudges}</p>
              <div className="flex gap-2 mt-2">
                <Badge variant="outline" className="text-xs">1º: {metrics.nudge1Count}</Badge>
                <Badge variant="outline" className="text-xs">2º: {metrics.nudge2Count}</Badge>
                <Badge variant="outline" className="text-xs">3º: {metrics.nudge3Count}</Badge>
              </div>
            </div>

            {/* Response Rate */}
            <div className="p-4 border rounded-lg bg-green-500/5 border-green-500/20">
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">Taxa de Resposta</span>
              </div>
              <p className="text-3xl font-bold">{metrics.overallResponseRate.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.respondedAfterNudge} de {metrics.totalWithNudges} responderam
              </p>
            </div>

            {/* Avg Re-engagement Time */}
            <div className="p-4 border rounded-lg bg-blue-500/5 border-blue-500/20">
              <div className="flex items-center gap-2 text-blue-600 mb-2">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">Tempo Médio</span>
              </div>
              <p className="text-3xl font-bold">{formatTime(metrics.avgReengagementMinutes)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Para reengajar o lead
              </p>
            </div>

            {/* Best Hours */}
            <div className="p-4 border rounded-lg bg-purple-500/5 border-purple-500/20">
              <div className="flex items-center gap-2 text-purple-600 mb-2">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm font-medium">Melhores Horários</span>
              </div>
              {metrics.bestHours.length > 0 ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {metrics.bestHours.map((h, i) => (
                    <Badge 
                      key={h.hour} 
                      variant={i === 0 ? 'default' : 'secondary'}
                      className={cn(i === 0 && "bg-purple-500")}
                    >
                      {h.hour} ({h.rate}%)
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Dados insuficientes</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-Nudge Response Rate */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Taxa por Nudge
            </CardTitle>
            <CardDescription>
              Efetividade de cada etapa de nudge
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Nudge 1 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center">
                      <span className="text-green-600 font-bold text-xs">1</span>
                    </div>
                    <span className="text-sm font-medium">Primeiro Nudge</span>
                  </div>
                  <Badge variant="outline">{metrics.nudge1ResponseRate.toFixed(0)}%</Badge>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(metrics.nudge1ResponseRate, 100)}%` }}
                  />
                </div>
              </div>

              {/* Nudge 2 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center">
                      <span className="text-amber-600 font-bold text-xs">2</span>
                    </div>
                    <span className="text-sm font-medium">Segundo Nudge</span>
                  </div>
                  <Badge variant="outline">{metrics.nudge2ResponseRate.toFixed(0)}%</Badge>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(metrics.nudge2ResponseRate, 100)}%` }}
                  />
                </div>
              </div>

              {/* Nudge 3 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center">
                      <span className="text-red-600 font-bold text-xs">3</span>
                    </div>
                    <span className="text-sm font-medium">Terceiro Nudge</span>
                  </div>
                  <Badge variant="outline">{metrics.nudge3ResponseRate.toFixed(0)}%</Badge>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-red-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(metrics.nudge3ResponseRate, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hourly Effectiveness Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Respostas por Hora
            </CardTitle>
            <CardDescription>
              Horários com mais respostas aos nudges
            </CardDescription>
          </CardHeader>
          <CardContent>
            {metrics.hourlyData.some(h => h.total > 0) ? (
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={metrics.hourlyData.filter((_, i) => i >= 6 && i <= 22)} // 6h-22h
                    margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="hour" 
                      tick={{ fontSize: 10 }}
                      interval={2}
                    />
                    <YAxis 
                      tick={{ fontSize: 10 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === 'responses') return [value, 'Respostas'];
                        if (name === 'total') return [value, 'Nudges enviados'];
                        return [value, name];
                      }}
                    />
                    <Bar 
                      dataKey="responses" 
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  Dados insuficientes para exibir o gráfico
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
