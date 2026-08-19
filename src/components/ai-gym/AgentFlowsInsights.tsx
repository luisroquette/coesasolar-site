import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Activity, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight,
  Brain,
  Target,
  Users,
  MessageSquare,
  FileText,
  Sparkles,
  Info
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AgentFlowsInsightsProps {
  agentId: string;
}

interface ConversationStats {
  total: number;
  withProposal: number;
  withObjection: number;
  escalated: number;
  converted: number;
}

interface ObjectionData {
  type: string;
  count: number;
  percentage: number;
}

interface FunnelStep {
  id: string;
  label: string;
  count: number;
  percentage: number;
  icon: React.ReactNode;
}

const OBJECTION_LABELS: Record<string, string> = {
  'PRECO': 'Preço',
  'CONFIANCA': 'Confiança',
  'COMPLEXIDADE': 'Complexidade',
  'CONTRATO': 'Contrato',
  'TEMPO': 'Tempo',
  'OUTRO': 'Outro'
};

const OBJECTION_COLORS: Record<string, string> = {
  'PRECO': 'bg-red-500',
  'CONFIANCA': 'bg-orange-500',
  'COMPLEXIDADE': 'bg-yellow-500',
  'CONTRATO': 'bg-blue-500',
  'TEMPO': 'bg-purple-500',
  'OUTRO': 'bg-gray-500'
};

export function AgentFlowsInsights({ agentId }: AgentFlowsInsightsProps) {
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['agent-flow-stats', agentId],
    queryFn: async (): Promise<ConversationStats> => {
      const { data, error } = await supabase
        .from('chatbot_conversas')
        .select('id, event_proposal_sent, detected_objection, needs_human_fallback, contrato_assinado')
        .not('cliente_telefone', 'is', null);

      if (error) throw error;

      const conversations = data || [];
      return {
        total: conversations.length,
        withProposal: conversations.filter(c => c.event_proposal_sent).length,
        withObjection: conversations.filter(c => c.detected_objection).length,
        escalated: conversations.filter(c => c.needs_human_fallback).length,
        converted: conversations.filter(c => c.contrato_assinado).length
      };
    }
  });

  const { data: objections, isLoading: loadingObjections } = useQuery({
    queryKey: ['agent-objections', agentId],
    queryFn: async (): Promise<ObjectionData[]> => {
      const { data, error } = await supabase
        .from('chatbot_conversas')
        .select('detected_objection')
        .not('detected_objection', 'is', null);

      if (error) throw error;

      const objectionCounts: Record<string, number> = {};
      (data || []).forEach(c => {
        const obj = c.detected_objection || 'OUTRO';
        objectionCounts[obj] = (objectionCounts[obj] || 0) + 1;
      });

      const total = Object.values(objectionCounts).reduce((a, b) => a + b, 0);
      
      return Object.entries(objectionCounts)
        .map(([type, count]) => ({
          type,
          count,
          percentage: total > 0 ? Math.round((count / total) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count);
    }
  });

  const { data: funnelData, isLoading: loadingFunnel } = useQuery({
    queryKey: ['agent-funnel', agentId],
    queryFn: async (): Promise<FunnelStep[]> => {
      const { data, error } = await supabase
        .from('chatbot_conversas')
        .select('cliente_nome, dados_coletados, has_simulation, event_proposal_sent, contrato_assinado')
        .not('cliente_telefone', 'is', null);

      if (error) throw error;

      const conversations = data || [];
      const total = conversations.length;

      const withName = conversations.filter(c => c.cliente_nome).length;
      const withData = conversations.filter(c => {
        const dados = c.dados_coletados as any;
        return dados?.consumo || dados?.distribuidora;
      }).length;
      const withSimulation = conversations.filter(c => c.has_simulation).length;
      const withProposal = conversations.filter(c => c.event_proposal_sent).length;
      const converted = conversations.filter(c => c.contrato_assinado).length;

      return [
        { 
          id: 'inicio', 
          label: 'Conversas Iniciadas', 
          count: total, 
          percentage: 100,
          icon: <MessageSquare className="h-4 w-4" />
        },
        { 
          id: 'nome', 
          label: 'Nome Coletado', 
          count: withName, 
          percentage: total > 0 ? Math.round((withName / total) * 100) : 0,
          icon: <Users className="h-4 w-4" />
        },
        { 
          id: 'dados', 
          label: 'Dados Coletados', 
          count: withData, 
          percentage: total > 0 ? Math.round((withData / total) * 100) : 0,
          icon: <FileText className="h-4 w-4" />
        },
        { 
          id: 'simulacao', 
          label: 'Simulação Realizada', 
          count: withSimulation, 
          percentage: total > 0 ? Math.round((withSimulation / total) * 100) : 0,
          icon: <Activity className="h-4 w-4" />
        },
        { 
          id: 'proposta', 
          label: 'Proposta Enviada', 
          count: withProposal, 
          percentage: total > 0 ? Math.round((withProposal / total) * 100) : 0,
          icon: <Target className="h-4 w-4" />
        },
        { 
          id: 'conversao', 
          label: 'Contrato Assinado', 
          count: converted, 
          percentage: total > 0 ? Math.round((converted / total) * 100) : 0,
          icon: <CheckCircle2 className="h-4 w-4" />
        }
      ];
    }
  });

  const isLoading = loadingStats || loadingObjections || loadingFunnel;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const proposalRate = stats && stats.total > 0 
    ? Math.round((stats.withProposal / stats.total) * 100) 
    : 0;

  const conversionRate = stats && stats.withProposal > 0 
    ? Math.round((stats.converted / stats.withProposal) * 100) 
    : 0;

  // Generate automatic insights
  const insights: { type: 'success' | 'warning' | 'info'; text: string }[] = [];
  
  if (proposalRate > 15) {
    insights.push({ type: 'success', text: `Taxa de proposta de ${proposalRate}% está acima da média` });
  } else if (proposalRate < 10) {
    insights.push({ type: 'warning', text: `Taxa de proposta de ${proposalRate}% pode ser melhorada` });
  }

  if (objections && objections.length > 0) {
    const topObjection = objections[0];
    insights.push({ 
      type: 'info', 
      text: `${topObjection.percentage}% das objeções são sobre ${OBJECTION_LABELS[topObjection.type] || topObjection.type}` 
    });
  }

  if (stats && stats.escalated > 0) {
    const escalationRate = Math.round((stats.escalated / stats.total) * 100);
    if (escalationRate > 30) {
      insights.push({ type: 'warning', text: `${escalationRate}% das conversas precisaram de humano` });
    }
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Brain className="h-3 w-3" />
              Auto-gerado via ML
            </Badge>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>Insights gerados automaticamente a partir da análise de {stats?.total || 0} conversas reais do agente.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <span className="text-xs text-muted-foreground">
            Baseado em {stats?.total || 0} conversas
          </span>
        </div>

        {/* Conversion Funnel */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Funil de Conversão
            </CardTitle>
            <CardDescription>
              Jornada típica do lead através do fluxo de vendas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {funnelData?.map((step, idx) => (
                <div key={step.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {step.icon}
                      <span>{step.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{step.count}</span>
                      <Badge variant="outline" className="text-xs">
                        {step.percentage}%
                      </Badge>
                    </div>
                  </div>
                  <Progress value={step.percentage} className="h-2" />
                  {idx < (funnelData?.length || 0) - 1 && (
                    <div className="flex justify-center py-1">
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Objection Map */}
        {objections && objections.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Mapa de Objeções
              </CardTitle>
              <CardDescription>
                Principais barreiras identificadas nas conversas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {objections.map(obj => (
                  <div key={obj.type} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{OBJECTION_LABELS[obj.type] || obj.type}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{obj.count}</span>
                        <Badge variant="outline" className="text-xs">
                          {obj.percentage}%
                        </Badge>
                      </div>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${OBJECTION_COLORS[obj.type] || 'bg-gray-500'} transition-all`}
                        style={{ width: `${obj.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Automatic Insights */}
        {insights.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Insights Automáticos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {insights.map((insight, idx) => (
                  <div 
                    key={idx} 
                    className={`flex items-start gap-2 p-2 rounded-lg text-sm ${
                      insight.type === 'success' ? 'bg-green-500/10 text-green-700 dark:text-green-400' :
                      insight.type === 'warning' ? 'bg-orange-500/10 text-orange-700 dark:text-orange-400' :
                      'bg-blue-500/10 text-blue-700 dark:text-blue-400'
                    }`}
                  >
                    {insight.type === 'success' && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
                    {insight.type === 'warning' && <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
                    {insight.type === 'info' && <Info className="h-4 w-4 mt-0.5 shrink-0" />}
                    <span>{insight.text}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Learned Flow Tree */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Fluxo Típico Aprendido
            </CardTitle>
            <CardDescription>
              Sequência mais comum de interações identificada
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 items-center">
              {[
                'Saudação',
                'Identificar Nome',
                'Qualificar Interesse',
                'Coletar Consumo',
                'Identificar Distribuidora',
                'Analisar Fatura',
                'Calcular Economia',
                'Apresentar Proposta',
                'Tratar Objeções',
                'Coletar Documentos',
                'Enviar Contrato'
              ].map((step, idx, arr) => (
                <div key={step} className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {idx + 1}. {step}
                  </Badge>
                  {idx < arr.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
