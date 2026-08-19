import { useState, useEffect, useMemo } from 'react';
import { useUIConfig } from '@/hooks/useUIConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { 
  Users, 
  RefreshCw, 
  FileText, 
  ArrowRight, 
  TrendingUp,
  MessageSquare,
  Target,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { format, subDays, startOfDay, endOfDay, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface StageMetrics {
  stage: string;
  stageName: string;
  count: number;
}

interface DailyData {
  date: string;
  dateLabel: string;
  leads: number;
  updates: number;
  moves: number;
}

interface ConversaData {
  id: string;
  bitrix24_lead_id: string | null;
  bitrix24_stage: string | null;
  dados_coletados: Record<string, unknown> | null;
  arquivos_anexados: string[] | null;
  created_at: string;
}

interface SofiaMetricsData {
  totalLeadsCreated: number;
  totalLeadsUpdated: number;
  totalStageMoves: number;
  totalConversations: number;
  leadsWithInvoice: number;
  leadsWithDocument: number;
  stageBreakdown: StageMetrics[];
  dailyTrend: DailyData[];
}

type DateFilter = 'today' | 'week' | 'month' | 'all';

const STAGE_NAMES: Record<string, string> = {
  'NEW': 'Novo',
  'UC_9SLRPP': 'Proposta Inicial',
  'UC_JENEX5': 'Proposta Definitiva',
  'UC_XIM123': 'Aguardando Assinatura',
  'WON': 'Fechado Ganho',
  'LOSE': 'Fechado Perdido',
};

const getStageColor = (stage: string): string => {
  switch (stage) {
    case 'NEW': return 'bg-gray-500';
    case 'UC_9SLRPP': return 'bg-blue-500';
    case 'UC_JENEX5': return 'bg-purple-500';
    case 'UC_XIM123': return 'bg-amber-500';
    case 'WON': return 'bg-green-500';
    case 'LOSE': return 'bg-red-500';
    default: return 'bg-muted';
  }
};

const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: '7 dias' },
  { value: 'month', label: '30 dias' },
  { value: 'all', label: 'Tudo' },
];

const getDateRange = (filter: DateFilter): { start: Date; end: Date } => {
  const now = new Date();
  const end = endOfDay(now);
  
  switch (filter) {
    case 'today':
      return { start: startOfDay(now), end };
    case 'week':
      return { start: startOfDay(subDays(now, 6)), end };
    case 'month':
      return { start: startOfDay(subDays(now, 29)), end };
    case 'all':
    default:
      return { start: startOfDay(subDays(now, 365)), end };
  }
};

export function SofiaMetrics() {
  const { intervalSofiaMetricsMs } = useUIConfig();
  const [allConversas, setAllConversas] = useState<ConversaData[]>([]);
  const [totalConversations, setTotalConversations] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('month');

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch all conversations that have Bitrix24 integration
      const { data: conversas, error: conversasError } = await supabase
        .from('chatbot_conversas')
        .select('id, bitrix24_lead_id, bitrix24_stage, dados_coletados, arquivos_anexados, created_at')
        .not('bitrix24_lead_id', 'is', null)
        .order('created_at', { ascending: true });

      if (conversasError) throw conversasError;

      // Get total conversations count
      const { count } = await supabase
        .from('chatbot_conversas')
        .select('*', { count: 'exact', head: true });

      setAllConversas(conversas as ConversaData[] || []);
      setTotalConversations(count || 0);
    } catch (error) {
      console.error('Error fetching Sofia metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Refresh based on config interval
    const interval = setInterval(fetchData, intervalSofiaMetricsMs);
    return () => clearInterval(interval);
  }, [intervalSofiaMetricsMs]);

  // Calculate metrics based on date filter
  const metrics = useMemo((): SofiaMetricsData | null => {
    if (!allConversas.length) return null;

    const { start, end } = getDateRange(dateFilter);
    
    // Filter conversations by date
    const filteredConversas = allConversas.filter(c => {
      const createdAt = parseISO(c.created_at);
      return isWithinInterval(createdAt, { start, end });
    });

    const totalLeadsCreated = filteredConversas.length;
    
    // Count leads that have been updated
    const leadsUpdated = filteredConversas.filter(c => {
      const dados = c.dados_coletados;
      return dados && Object.keys(dados).length > 2;
    }).length;

    // Count leads with invoices
    const leadsWithInvoice = filteredConversas.filter(c => {
      const arquivos = c.arquivos_anexados;
      return arquivos?.includes('fatura');
    }).length;

    // Count leads with documents
    const leadsWithDocument = filteredConversas.filter(c => {
      const arquivos = c.arquivos_anexados;
      return arquivos?.includes('documento_identidade');
    }).length;

    // Count stage moves
    const stageMoves = filteredConversas.filter(c => 
      c.bitrix24_stage && c.bitrix24_stage !== 'NEW'
    ).length;

    // Stage breakdown
    const stageCount: Record<string, number> = {};
    filteredConversas.forEach(c => {
      const stage = c.bitrix24_stage || 'NEW';
      stageCount[stage] = (stageCount[stage] || 0) + 1;
    });

    const stageBreakdown: StageMetrics[] = Object.entries(stageCount)
      .map(([stage, count]) => ({
        stage,
        stageName: STAGE_NAMES[stage] || stage,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    // Daily trend data
    const dailyMap = new Map<string, { leads: number; updates: number; moves: number }>();
    
    // Initialize all days in range
    const daysCount = dateFilter === 'today' ? 1 : dateFilter === 'week' ? 7 : 30;
    for (let i = daysCount - 1; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      dailyMap.set(date, { leads: 0, updates: 0, moves: 0 });
    }

    // Count by day
    filteredConversas.forEach(c => {
      const date = format(parseISO(c.created_at), 'yyyy-MM-dd');
      const existing = dailyMap.get(date);
      if (existing) {
        existing.leads += 1;
        const dados = c.dados_coletados;
        if (dados && Object.keys(dados).length > 2) existing.updates += 1;
        if (c.bitrix24_stage && c.bitrix24_stage !== 'NEW') existing.moves += 1;
      }
    });

    const dailyTrend: DailyData[] = Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      dateLabel: format(parseISO(date), dateFilter === 'today' ? 'HH:mm' : 'dd/MM', { locale: ptBR }),
      ...data,
    }));

    return {
      totalLeadsCreated,
      totalLeadsUpdated: leadsUpdated,
      totalStageMoves: stageMoves,
      totalConversations,
      leadsWithInvoice,
      leadsWithDocument,
      stageBreakdown,
      dailyTrend,
    };
  }, [allConversas, dateFilter, totalConversations]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Métricas da sofIA
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

  if (!metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Métricas da sofIA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum dado disponível ainda
          </p>
        </CardContent>
      </Card>
    );
  }

  const conversionRate = metrics.totalConversations > 0 
    ? ((metrics.totalLeadsCreated / metrics.totalConversations) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      {/* Main Metrics */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Métricas da sofIA
              </CardTitle>
              <CardDescription>
                Leads criados, atualizados e movimentados automaticamente
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
            {/* Leads Created */}
            <div className="p-4 border rounded-lg bg-green-500/5 border-green-500/20">
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <Users className="h-4 w-4" />
                <span className="text-sm font-medium">Leads Criados</span>
              </div>
              <p className="text-3xl font-bold">{metrics.totalLeadsCreated}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Sincronizados com Bitrix24
              </p>
            </div>

            {/* Leads Updated */}
            <div className="p-4 border rounded-lg bg-blue-500/5 border-blue-500/20">
              <div className="flex items-center gap-2 text-blue-600 mb-2">
                <RefreshCw className="h-4 w-4" />
                <span className="text-sm font-medium">Leads Atualizados</span>
              </div>
              <p className="text-3xl font-bold">{metrics.totalLeadsUpdated}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Com dados coletados
              </p>
            </div>

            {/* Stage Moves */}
            <div className="p-4 border rounded-lg bg-purple-500/5 border-purple-500/20">
              <div className="flex items-center gap-2 text-purple-600 mb-2">
                <ArrowRight className="h-4 w-4" />
                <span className="text-sm font-medium">Movimentações</span>
              </div>
              <p className="text-3xl font-bold">{metrics.totalStageMoves}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Leads que avançaram etapa
              </p>
            </div>

            {/* Conversion Rate */}
            <div className="p-4 border rounded-lg bg-amber-500/5 border-amber-500/20">
              <div className="flex items-center gap-2 text-amber-600 mb-2">
                <Target className="h-4 w-4" />
                <span className="text-sm font-medium">Taxa de Conversão</span>
              </div>
              <p className="text-3xl font-bold">{conversionRate}%</p>
              <p className="text-xs text-muted-foreground mt-1">
                Conversas → Leads Bitrix
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Tendência de Leads
          </CardTitle>
          <CardDescription>
            Evolução diária de leads criados pela sofIA
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.dailyTrend.length > 0 ? (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={metrics.dailyTrend}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorMoves" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="dateLabel" 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        leads: 'Leads Criados',
                        moves: 'Movimentações',
                        updates: 'Atualizações',
                      };
                      return [value, labels[name] || name];
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="leads"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#colorLeads)"
                    name="leads"
                  />
                  <Area
                    type="monotone"
                    dataKey="moves"
                    stroke="#a855f7"
                    strokeWidth={2}
                    fill="url(#colorMoves)"
                    name="moves"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum dado no período selecionado
            </p>
          )}
          <div className="flex items-center justify-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-xs text-muted-foreground">Leads Criados</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="text-xs text-muted-foreground">Movimentações</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Documents and Stage Breakdown */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Documents Collected */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documentos Coletados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm">Faturas de Energia</span>
                </div>
                <Badge variant="secondary">{metrics.leadsWithInvoice}</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-sm">Documentos de Identidade</span>
                </div>
                <Badge variant="secondary">{metrics.leadsWithDocument}</Badge>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total de Conversas</span>
                </div>
                <Badge variant="outline">{metrics.totalConversations}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stage Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              Breakdown por Etapa
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.stageBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum lead sincronizado no período
              </p>
            ) : (
              <div className="space-y-3">
                {metrics.stageBreakdown.map((stage) => (
                  <div 
                    key={stage.stage} 
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-3 h-3 rounded-full", getStageColor(stage.stage))} />
                      <span className="text-sm font-medium">{stage.stageName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{stage.count}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {metrics.totalLeadsCreated > 0 
                          ? ((stage.count / metrics.totalLeadsCreated) * 100).toFixed(0)
                          : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
