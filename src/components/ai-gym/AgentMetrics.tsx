import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  TrendingUp, 
  TrendingDown, 
  MessageSquare, 
  Clock, 
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Phone,
  Loader2,
  HelpCircle,
  BarChart3,
  Info
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';

interface AIAgent {
  id: string;
  agent_id: string;
  name: string;
  role: string;
}

interface AgentMetricsProps {
  agent: AIAgent;
}

interface MetricsData {
  fcr: number;
  fcrChange: number;
  handoffRate: number;
  handoffRateChange: number;
  nps: number;
  npsChange: number;
  avgResolutionTime: number;
  avgResolutionTimeChange: number;
  totalInteractions: number;
  totalInteractionsChange: number;
  conversoes: number;
  conversoesChange: number;
}

interface DailyMetric {
  date: string;
  interactions: number;
  resolved: number;
  avgResponseTime: number;
}

interface IntentMetric {
  intent: string;
  count: number;
  successRate: number;
}

export function AgentMetrics({ agent }: AgentMetricsProps) {
  const [period, setPeriod] = useState('7');
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [intentMetrics, setIntentMetrics] = useState<IntentMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    fetchMetrics();
    
    // Real-time subscription for agent interactions
    const channel = supabase
      .channel(`agent-metrics-${agent.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_agent_interactions',
          filter: `agent_id=eq.${agent.id}`
        },
        () => {
          fetchMetrics();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [period, agent.id]);

  const fetchMetrics = async () => {
    setLoading(true);
    const days = parseInt(period);
    const previousDays = days * 2;

    try {
      // Fetch interactions for this specific agent
      const { data: currentInteractions } = await supabase
        .from('ai_agent_interactions')
        .select(`
          *,
          chatbot_conversas (
            id,
            created_at,
            escalated_at,
            ended_at,
            human_resolved_at,
            human_resolution_time_seconds,
            event_conversion,
            detected_objection
          )
        `)
        .eq('agent_id', agent.id)
        .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

      const { data: previousInteractions } = await supabase
        .from('ai_agent_interactions')
        .select(`
          *,
          chatbot_conversas (
            id,
            escalated_at,
            ended_at,
            human_resolved_at,
            human_resolution_time_seconds,
            event_conversion
          )
        `)
        .eq('agent_id', agent.id)
        .gte('created_at', new Date(Date.now() - previousDays * 24 * 60 * 60 * 1000).toISOString())
        .lt('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

      const currentData = currentInteractions || [];
      const previousData = previousInteractions || [];

      setHasData(currentData.length > 0 || previousData.length > 0);

      if (currentData.length === 0 && previousData.length === 0) {
        // No data for this agent - set empty metrics
        setMetrics({
          fcr: 0,
          fcrChange: 0,
          handoffRate: 0,
          handoffRateChange: 0,
          nps: 0,
          npsChange: 0,
          avgResolutionTime: 0,
          avgResolutionTimeChange: 0,
          totalInteractions: 0,
          totalInteractionsChange: 0,
          conversoes: 0,
          conversoesChange: 0
        });
        setDailyMetrics([]);
        setIntentMetrics([]);
        return;
      }

      // Calculate metrics from agent interactions
      const current = calculateMetrics(currentData);
      const previous = calculateMetrics(previousData);

      setMetrics({
        fcr: current.fcr,
        fcrChange: current.fcr - previous.fcr,
        handoffRate: current.handoffRate,
        handoffRateChange: current.handoffRate - previous.handoffRate,
        nps: current.nps,
        npsChange: current.nps - previous.nps,
        avgResolutionTime: current.avgResolutionTime,
        avgResolutionTimeChange: current.avgResolutionTime - previous.avgResolutionTime,
        totalInteractions: current.totalInteractions,
        totalInteractionsChange: previous.totalInteractions > 0 
          ? ((current.totalInteractions - previous.totalInteractions) / previous.totalInteractions) * 100 
          : 0,
        conversoes: current.conversoes,
        conversoesChange: previous.conversoes > 0 
          ? ((current.conversoes - previous.conversoes) / previous.conversoes) * 100 
          : 0
      });

      // Daily breakdown
      const dailyData = groupByDay(currentData);
      setDailyMetrics(dailyData);

      // Intent breakdown
      const intents = groupByIntent(currentData);
      setIntentMetrics(intents);

    } catch (error) {
      console.error('Error fetching agent metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateMetrics = (data: any[]) => {
    const total = data.length;
    if (total === 0) {
      return {
        fcr: 0,
        handoffRate: 0,
        nps: 0,
        avgResolutionTime: 0,
        totalInteractions: 0,
        conversoes: 0
      };
    }

    // Get linked conversations
    const conversations = data
      .map(d => d.chatbot_conversas)
      .filter(Boolean);

    const escalated = conversations.filter(c => c?.escalated_at).length;
    const resolved = data.filter(d => d.resolution_status === 'resolved').length;
    const conversions = conversations.filter(c => c?.event_conversion).length;
    
    // FCR: Interactions resolved without escalation
    const fcr = ((total - escalated) / total) * 100;
    
    // Handoff rate
    const handoffRate = (escalated / total) * 100;
    
    // NPS based on resolution and response time
    const avgResponseMs = data.reduce((sum, d) => sum + (d.response_time_ms || 0), 0) / total;
    const nps = Math.round((resolved / total) * 100 - (escalated / total) * 30 - (avgResponseMs > 5000 ? 10 : 0));
    
    // Average response time from interactions
    const avgTime = avgResponseMs / 1000; // Convert to seconds

    return {
      fcr: Math.round(fcr * 10) / 10,
      handoffRate: Math.round(handoffRate * 10) / 10,
      nps: Math.max(-100, Math.min(100, nps)),
      avgResolutionTime: Math.round(avgTime * 10) / 10,
      totalInteractions: total,
      conversoes: conversions
    };
  };

  const groupByDay = (data: any[]): DailyMetric[] => {
    const grouped: Record<string, { 
      interactions: number; 
      resolved: number; 
      responseTimes: number[] 
    }> = {};
    
    data.forEach(d => {
      const date = new Date(d.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (!grouped[date]) {
        grouped[date] = { interactions: 0, resolved: 0, responseTimes: [] };
      }
      grouped[date].interactions++;
      if (d.resolution_status === 'resolved') grouped[date].resolved++;
      if (d.response_time_ms) grouped[date].responseTimes.push(d.response_time_ms);
    });

    return Object.entries(grouped)
      .map(([date, data]) => ({
        date,
        interactions: data.interactions,
        resolved: data.resolved,
        avgResponseTime: data.responseTimes.length > 0 
          ? Math.round(data.responseTimes.reduce((a, b) => a + b, 0) / data.responseTimes.length / 1000 * 10) / 10
          : 0
      }))
      .sort((a, b) => {
        const [dayA, monthA] = a.date.split('/').map(Number);
        const [dayB, monthB] = b.date.split('/').map(Number);
        return monthA - monthB || dayA - dayB;
      });
  };

  const groupByIntent = (data: any[]): IntentMetric[] => {
    const grouped: Record<string, { total: number; success: number }> = {};
    
    data.forEach(d => {
      const intent = d.intent_detected || d.chatbot_conversas?.detected_objection || 'geral';
      if (!grouped[intent]) {
        grouped[intent] = { total: 0, success: 0 };
      }
      grouped[intent].total++;
      if (d.resolution_status === 'resolved') {
        grouped[intent].success++;
      }
    });

    return Object.entries(grouped)
      .map(([intent, data]) => ({
        intent: formatIntent(intent),
        count: data.total,
        successRate: data.total > 0 ? Math.round((data.success / data.total) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };

  const formatIntent = (intent: string): string => {
    const labels: Record<string, string> = {
      'geral': 'Geral',
      'preco': 'Preço',
      'PRECO': 'Preço',
      'confianca': 'Confiança',
      'CONFIANCA': 'Confiança',
      'tempo': 'Tempo',
      'TEMPO': 'Tempo',
      'concorrencia': 'Concorrência',
      'contrato': 'Contrato',
      'CONTRATO': 'Contrato',
      'complexidade': 'Complexidade',
      'COMPLEXIDADE': 'Complexidade'
    };
    return labels[intent] || intent.charAt(0).toUpperCase() + intent.slice(1).toLowerCase();
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const getRoleLabel = (role: string): string => {
    const labels: Record<string, string> = {
      'sales': 'Vendas',
      'sac': 'Atendimento',
      'collections': 'Cobrança',
      'support': 'Suporte'
    };
    return labels[role] || role;
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Empty state when no data for this specific agent
  if (!hasData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <span className="font-medium">Métricas de {agent.name}</span>
          </div>
          <Badge variant="outline" className="gap-1">
            <Info className="h-3 w-3" />
            {getRoleLabel(agent.role)}
          </Badge>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-lg mb-2">Sem dados ainda para {agent.name}</h3>
            <p className="text-muted-foreground text-sm max-w-md mb-4">
              As métricas aparecerão aqui assim que o agente começar a processar interações.
              Cada agente tem suas próprias métricas independentes.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <Badge variant="secondary">
                <MessageSquare className="h-3 w-3 mr-1" />
                0 interações
              </Badge>
              <Badge variant="secondary">
                <Target className="h-3 w-3 mr-1" />
                0 conversões
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Como gerar métricas
            </h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Use a aba "Testes" para simular interações com o agente</li>
              <li>• As métricas são registradas automaticamente quando o agente processa conversas</li>
              <li>• Cada agente (sofIA, marIA, julIA) tem métricas independentes</li>
              <li>• A tabela <code className="bg-muted px-1 rounded">ai_agent_interactions</code> armazena os dados</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Agent Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <span className="font-medium">Métricas de {agent.name}</span>
          <Badge variant="outline" className="text-xs">
            {getRoleLabel(agent.role)}
          </Badge>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Hoje</SelectItem>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard
            title="FCR"
            subtitle="Resolução 1º Contato"
            value={`${metrics?.fcr || 0}%`}
            change={metrics?.fcrChange || 0}
            icon={<CheckCircle2 className="h-4 w-4" />}
            positive={true}
            tooltip={`Resolução no Primeiro Contato para ${agent.name}: Percentual de interações resolvidas sem escalar para humano.`}
          />
          <MetricCard
            title="Handoff"
            subtitle="Taxa Escalação"
            value={`${metrics?.handoffRate || 0}%`}
            change={metrics?.handoffRateChange || 0}
            icon={<Phone className="h-4 w-4" />}
            positive={false}
            tooltip={`Taxa de Escalação de ${agent.name}: Percentual de interações transferidas para atendimento humano.`}
          />
          <MetricCard
            title="NPS"
            subtitle="Satisfação"
            value={metrics?.nps || 0}
            change={metrics?.npsChange || 0}
            icon={<Target className="h-4 w-4" />}
            positive={true}
            tooltip={`Net Promoter Score de ${agent.name}: Índice de satisfação calculado com base na resolução e tempo de resposta.`}
          />
          <MetricCard
            title="Resposta"
            subtitle="Tempo Médio"
            value={formatTime(metrics?.avgResolutionTime || 0)}
            change={-(metrics?.avgResolutionTimeChange || 0)}
            icon={<Clock className="h-4 w-4" />}
            positive={false}
            suffix="s"
            tooltip={`Tempo Médio de Resposta de ${agent.name}: Quanto tempo o agente leva para responder cada interação.`}
          />
          <MetricCard
            title="Interações"
            subtitle="Total no período"
            value={metrics?.totalInteractions || 0}
            change={metrics?.totalInteractionsChange || 0}
            icon={<MessageSquare className="h-4 w-4" />}
            positive={true}
            tooltip={`Total de Interações processadas por ${agent.name} no período selecionado.`}
          />
          <MetricCard
            title="Conversões"
            subtitle="Total no período"
            value={metrics?.conversoes || 0}
            change={metrics?.conversoesChange || 0}
            icon={<Target className="h-4 w-4" />}
            positive={true}
            tooltip={`Conversões geradas por ${agent.name}: Interações que resultaram em objetivo alcançado.`}
          />
        </div>
      </TooltipProvider>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tendência Diária - {agent.name}</CardTitle>
            <CardDescription>Interações e resoluções por dia</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {dailyMetrics.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyMetrics}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      className="text-muted-foreground"
                    />
                    <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                    <RechartsTooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="interactions" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={false}
                      name="Interações"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="resolved" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={false}
                      name="Resolvidas"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p className="text-sm">Sem dados diários para exibir</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Intent Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Distribuição por Intenção</CardTitle>
            <CardDescription>Tipos de interação detectados por {agent.name}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              {intentMetrics.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={intentMetrics} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis 
                      type="category" 
                      dataKey="intent" 
                      tick={{ fontSize: 12 }} 
                      width={80}
                    />
                    <RechartsTooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(value: number, name: string) => [
                        name === 'count' ? value : `${value}%`,
                        name === 'count' ? 'Quantidade' : 'Sucesso'
                      ]}
                    />
                    <Bar 
                      dataKey="count" 
                      fill="hsl(var(--primary))" 
                      radius={[0, 4, 4, 0]}
                      name="Quantidade"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p className="text-sm">Sem intenções detectadas ainda</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {metrics && metrics.handoffRate > 30 && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-700 dark:text-yellow-400">
                  Taxa de Handoff Alta para {agent.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  A taxa de escalação está em {metrics.handoffRate}%. Considere revisar os guardrails
                  e expandir a base de conhecimento deste agente.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface MetricCardProps {
  title: string;
  subtitle: string;
  value: string | number;
  change: number;
  icon: React.ReactNode;
  positive: boolean;
  suffix?: string;
  tooltip?: string;
}

function MetricCard({ title, subtitle, value, change, icon, positive, suffix, tooltip }: MetricCardProps) {
  const isPositiveChange = positive ? change > 0 : change < 0;
  const showChange = Math.abs(change) > 0.1;

  const cardContent = (
    <Card className="cursor-help hover:border-primary/50 transition-colors">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            {icon}
            <span className="text-xs font-medium">{title}</span>
          </div>
          {tooltip && (
            <HelpCircle className="h-3 w-3 text-muted-foreground/50" />
          )}
        </div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-muted-foreground truncate">{subtitle}</span>
          {showChange && (
            <Badge 
              variant="outline" 
              className={`text-xs py-0 ${
                isPositiveChange 
                  ? 'text-green-600 border-green-600/30' 
                  : 'text-red-600 border-red-600/30'
              }`}
            >
              {isPositiveChange ? (
                <ArrowUpRight className="h-3 w-3 mr-0.5" />
              ) : (
                <ArrowDownRight className="h-3 w-3 mr-0.5" />
              )}
              {Math.abs(change).toFixed(1)}{suffix || '%'}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (tooltip) {
    return (
      <ShadcnTooltip>
        <TooltipTrigger asChild>
          {cardContent}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-sm">
          <p>{tooltip}</p>
        </TooltipContent>
      </ShadcnTooltip>
    );
  }

  return cardContent;
}
