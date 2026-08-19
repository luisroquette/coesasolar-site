import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUIConfig } from '@/hooks/useUIConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  MessageCircle, 
  TrendingUp, 
  AlertCircle, 
  Clock,
  ChevronDown,
  ChevronUp,
  User,
  HelpCircle,
  Target,
  Zap,
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { DocumentMetrics } from './DocumentMetrics';

interface Conversa {
  id: string;
  proposta_id: string | null;
  cliente_nome: string | null;
  cliente_email: string | null;
  session_id: string;
  created_at: string;
  ended_at: string | null;
  total_messages: number;
  needs_human_fallback: boolean;
  lead_score: number | null;
  sofia_mode: string | null;
  detected_objection: string | null;
  ab_variant: string | null;
  event_simulation: boolean | null;
  event_proposal_sent: boolean | null;
  event_objection_detected: boolean | null;
  event_drop: boolean | null;
  event_conversion: boolean | null;
}

interface Mensagem {
  id: string;
  conversa_id: string;
  role: string;
  content: string;
  is_quick_reply: boolean;
  created_at: string;
}

interface QuestionFrequency {
  question: string;
  count: number;
  isQuickReply: boolean;
}

interface ObjectionStats {
  type: string;
  count: number;
  percentage: number;
}

interface ABTestResult {
  variant: string;
  totalConversas: number;
  conversions: number;
  conversionRate: number;
}

interface FunnelStats {
  simulation: number;
  proposalSent: number;
  objectionDetected: number;
  drop: number;
  conversion: number;
  total: number;
}

export function ChatbotAnalytics() {
  const { queryLimitConversas, analyticsTopQuestionsLimit } = useUIConfig();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [mensagens, setMensagens] = useState<Record<string, Mensagem[]>>({});
  const [questionFrequency, setQuestionFrequency] = useState<QuestionFrequency[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedConversas, setExpandedConversas] = useState<Set<string>>(new Set());
  const [objectionStats, setObjectionStats] = useState<ObjectionStats[]>([]);
  const [abTestResults, setABTestResults] = useState<ABTestResult[]>([]);
  const [funnelStats, setFunnelStats] = useState<FunnelStats>({
    simulation: 0,
    proposalSent: 0,
    objectionDetected: 0,
    drop: 0,
    conversion: 0,
    total: 0,
  });
  const [stats, setStats] = useState({
    totalConversas: 0,
    totalMensagens: 0,
    fallbackRate: 0,
    avgMessagesPerConversation: 0,
    avgLeadScore: 0,
    premiumModeRate: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch conversas
      const { data: conversasData, error: conversasError } = await supabase
        .from('chatbot_conversas')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(queryLimitConversas);

      if (conversasError) throw conversasError;

      // Fetch all mensagens
      const { data: mensagensData, error: mensagensError } = await supabase
        .from('chatbot_mensagens')
        .select('*')
        .order('created_at', { ascending: true });

      if (mensagensError) throw mensagensError;

      // Group mensagens by conversa
      const mensagensByConversa: Record<string, Mensagem[]> = {};
      mensagensData?.forEach((msg) => {
        if (!mensagensByConversa[msg.conversa_id]) {
          mensagensByConversa[msg.conversa_id] = [];
        }
        mensagensByConversa[msg.conversa_id].push(msg);
      });

      // Calculate question frequency (only user messages)
      const questionCounts: Record<string, { count: number; isQuickReply: boolean }> = {};
      mensagensData?.filter(m => m.role === 'user').forEach((msg) => {
        const normalizedQuestion = msg.content.toLowerCase().trim();
        if (!questionCounts[normalizedQuestion]) {
          questionCounts[normalizedQuestion] = { count: 0, isQuickReply: msg.is_quick_reply || false };
        }
        questionCounts[normalizedQuestion].count++;
      });

      const sortedQuestions = Object.entries(questionCounts)
        .map(([question, data]) => ({
          question,
          count: data.count,
          isQuickReply: data.isQuickReply,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, analyticsTopQuestionsLimit);

      // Calculate objection stats
      const objectionCounts: Record<string, number> = {};
      conversasData?.forEach((c) => {
        if (c.detected_objection) {
          objectionCounts[c.detected_objection] = (objectionCounts[c.detected_objection] || 0) + 1;
        }
      });
      const totalWithObjections = Object.values(objectionCounts).reduce((sum, count) => sum + count, 0);
      const objections: ObjectionStats[] = Object.entries(objectionCounts)
        .map(([type, count]) => ({
          type,
          count,
          percentage: totalWithObjections > 0 ? (count / totalWithObjections) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // Calculate A/B test results
      const abCounts: Record<string, { total: number; conversions: number }> = {
        A: { total: 0, conversions: 0 },
        B: { total: 0, conversions: 0 },
      };
      conversasData?.forEach((c) => {
        const variant = c.ab_variant || 'A';
        if (abCounts[variant]) {
          abCounts[variant].total++;
          if (c.event_conversion) {
            abCounts[variant].conversions++;
          }
        }
      });
      const abResults: ABTestResult[] = Object.entries(abCounts).map(([variant, data]) => ({
        variant,
        totalConversas: data.total,
        conversions: data.conversions,
        conversionRate: data.total > 0 ? (data.conversions / data.total) * 100 : 0,
      }));

      // Calculate funnel stats
      const funnel: FunnelStats = {
        simulation: conversasData?.filter(c => c.event_simulation).length || 0,
        proposalSent: conversasData?.filter(c => c.event_proposal_sent).length || 0,
        objectionDetected: conversasData?.filter(c => c.event_objection_detected).length || 0,
        drop: conversasData?.filter(c => c.event_drop).length || 0,
        conversion: conversasData?.filter(c => c.event_conversion).length || 0,
        total: conversasData?.length || 0,
      };

      // Calculate stats
      const totalConversas = conversasData?.length || 0;
      const totalMensagens = mensagensData?.length || 0;
      const fallbackCount = conversasData?.filter(c => c.needs_human_fallback).length || 0;
      const fallbackRate = totalConversas > 0 ? (fallbackCount / totalConversas) * 100 : 0;
      const avgMessages = totalConversas > 0 ? totalMensagens / totalConversas : 0;
      const avgLeadScore = totalConversas > 0 
        ? conversasData.reduce((sum, c) => sum + (c.lead_score || 0), 0) / totalConversas 
        : 0;
      const premiumCount = conversasData?.filter(c => c.sofia_mode === 'closer_premium').length || 0;
      const premiumModeRate = totalConversas > 0 ? (premiumCount / totalConversas) * 100 : 0;

      setConversas(conversasData || []);
      setMensagens(mensagensByConversa);
      setQuestionFrequency(sortedQuestions);
      setObjectionStats(objections);
      setABTestResults(abResults);
      setFunnelStats(funnel);
      setStats({
        totalConversas,
        totalMensagens,
        fallbackRate,
        avgMessagesPerConversation: avgMessages,
        avgLeadScore,
        premiumModeRate,
      });
    } catch (error) {
      console.error('Error fetching chatbot data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleConversa = (id: string) => {
    setExpandedConversas(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getObjectionLabel = (type: string) => {
    const labels: Record<string, string> = {
      PRECO: '💰 Preço',
      CONFIANCA: '🔒 Confiança',
      CONTRATO: '📋 Contrato/Multa',
      TEMPO: '⏰ Tempo',
      COMPLEXIDADE: '🤔 Complexidade',
      AUTORIDADE: '👥 Autoridade',
    };
    return labels[type] || type;
  };

  const getObjectionSuggestion = (type: string) => {
    const suggestions: Record<string, string> = {
      PRECO: 'Reforçar economia vs custo atual',
      CONFIANCA: 'Mostrar cases e CNPJ antes',
      CONTRATO: 'Antecipar multa no discurso',
      TEMPO: 'Criar urgência genuína',
      COMPLEXIDADE: 'Simplificar explicação inicial',
      AUTORIDADE: 'Oferecer material para compartilhar',
    };
    return suggestions[type] || 'Analisar caso a caso';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Conversas</CardTitle>
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalConversas}</div>
            <p className="text-xs text-muted-foreground">
              Conversas iniciadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Lead Score</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgLeadScore.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">
              Score médio (0-100)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Modo Premium</CardTitle>
            <Zap className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.premiumModeRate.toFixed(0)}%</div>
            <p className="text-xs text-muted-foreground">
              Conversas em modo closer
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Fallback</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.fallbackRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              Precisaram de humano
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversões</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{funnelStats.conversion}</div>
            <p className="text-xs text-muted-foreground">
              {funnelStats.total > 0 ? ((funnelStats.conversion / funnelStats.total) * 100).toFixed(1) : 0}% do total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Objeções</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{funnelStats.objectionDetected}</div>
            <p className="text-xs text-muted-foreground">
              Leads com objeção
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="funil" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="funil" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Funil
          </TabsTrigger>
          <TabsTrigger value="documentos" className="gap-2">
            <FileText className="h-4 w-4" />
            Documentos
          </TabsTrigger>
          <TabsTrigger value="objecoes" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Objeções
          </TabsTrigger>
          <TabsTrigger value="ab-test" className="gap-2">
            <FlaskConical className="h-4 w-4" />
            A/B Test
          </TabsTrigger>
          <TabsTrigger value="frequentes" className="gap-2">
            <HelpCircle className="h-4 w-4" />
            Perguntas
          </TabsTrigger>
          <TabsTrigger value="conversas" className="gap-2">
            <MessageCircle className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* Funnel Tab */}
        <TabsContent value="funil">
          <Card>
            <CardHeader>
              <CardTitle>Funil de Conversão</CardTitle>
              <CardDescription>
                Acompanhamento dos leads em cada etapa do funil
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Visual Funnel */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <MessageCircle className="h-4 w-4" />
                      Conversas Iniciadas
                    </span>
                    <span className="text-sm text-muted-foreground">{funnelStats.total} (100%)</span>
                  </div>
                  <Progress value={100} className="h-3" />
                </div>

                <div className="flex items-center justify-center text-muted-foreground">
                  <ArrowRight className="h-4 w-4 rotate-90" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Pediram Simulação
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {funnelStats.simulation} ({funnelStats.total > 0 ? ((funnelStats.simulation / funnelStats.total) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                  <Progress 
                    value={funnelStats.total > 0 ? (funnelStats.simulation / funnelStats.total) * 100 : 0} 
                    className="h-3" 
                  />
                </div>

                <div className="flex items-center justify-center text-muted-foreground">
                  <ArrowRight className="h-4 w-4 rotate-90" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      Apresentaram Objeção
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {funnelStats.objectionDetected} ({funnelStats.total > 0 ? ((funnelStats.objectionDetected / funnelStats.total) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                  <Progress 
                    value={funnelStats.total > 0 ? (funnelStats.objectionDetected / funnelStats.total) * 100 : 0} 
                    className="h-3 [&>div]:bg-orange-500" 
                  />
                </div>

                <div className="flex items-center justify-center text-muted-foreground">
                  <ArrowRight className="h-4 w-4 rotate-90" />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Converteram
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {funnelStats.conversion} ({funnelStats.total > 0 ? ((funnelStats.conversion / funnelStats.total) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                  <Progress 
                    value={funnelStats.total > 0 ? (funnelStats.conversion / funnelStats.total) * 100 : 0} 
                    className="h-3 [&>div]:bg-green-500" 
                  />
                </div>
              </div>

              {/* Funnel Insights */}
              <div className="grid gap-4 md:grid-cols-3 mt-6">
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">
                        {funnelStats.total > 0 ? ((funnelStats.conversion / funnelStats.total) * 100).toFixed(1) : 0}%
                      </p>
                      <p className="text-sm text-muted-foreground">Taxa de Conversão</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-orange-600">
                        {funnelStats.objectionDetected > 0 && funnelStats.conversion > 0 
                          ? ((funnelStats.conversion / funnelStats.objectionDetected) * 100).toFixed(1) 
                          : 0}%
                      </p>
                      <p className="text-sm text-muted-foreground">Objeção → Conversão</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600">
                        {funnelStats.simulation > 0 && funnelStats.conversion > 0 
                          ? ((funnelStats.conversion / funnelStats.simulation) * 100).toFixed(1) 
                          : 0}%
                      </p>
                      <p className="text-sm text-muted-foreground">Simulação → Conversão</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Metrics Tab */}
        <TabsContent value="documentos">
          <DocumentMetrics />
        </TabsContent>

        {/* Objections Tab */}
        <TabsContent value="objecoes">
          <Card>
            <CardHeader>
              <CardTitle>Análise de Objeções</CardTitle>
              <CardDescription>
                Identificação das principais barreiras de conversão
              </CardDescription>
            </CardHeader>
            <CardContent>
              {objectionStats.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhuma objeção detectada ainda.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Objeção</TableHead>
                      <TableHead className="text-center">Ocorrências</TableHead>
                      <TableHead className="text-center">% do Total</TableHead>
                      <TableHead>Ação Sugerida</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {objectionStats.map((objection) => (
                      <TableRow key={objection.type}>
                        <TableCell className="font-medium">
                          {getObjectionLabel(objection.type)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{objection.count}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center gap-2 justify-center">
                            <Progress 
                              value={objection.percentage} 
                              className="w-16 h-2" 
                            />
                            <span className="text-sm text-muted-foreground w-12">
                              {objection.percentage.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {getObjectionSuggestion(objection.type)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* A/B Test Tab */}
        <TabsContent value="ab-test">
          <Card>
            <CardHeader>
              <CardTitle>Resultados A/B Test</CardTitle>
              <CardDescription>
                Comparação entre variantes de fechamento
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2 mb-6">
                {abTestResults.map((result) => (
                  <Card key={result.variant} className={result.conversionRate > (abTestResults.find(r => r.variant !== result.variant)?.conversionRate || 0) ? 'border-green-500 border-2' : ''}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center justify-between">
                        <span>Variante {result.variant}</span>
                        {result.conversionRate > (abTestResults.find(r => r.variant !== result.variant)?.conversionRate || 0) && (
                          <Badge className="bg-green-500">Vencendo</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {result.variant === 'A' 
                          ? '"Você prefere 20% com mais flexibilidade ou 30% com máxima economia?"'
                          : '"Ficar como está custa mais caro do que entrar agora. Quer 20% ou 30%?"'
                        }
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Total de Conversas</span>
                          <span className="text-lg font-bold">{result.totalConversas}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Conversões</span>
                          <span className="text-lg font-bold text-green-600">{result.conversions}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Taxa de Conversão</span>
                          <span className="text-2xl font-bold">{result.conversionRate.toFixed(1)}%</span>
                        </div>
                        <Progress value={result.conversionRate} className="h-3" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-medium mb-2">📊 Recomendação</h4>
                <p className="text-sm text-muted-foreground">
                  {(() => {
                    const total = abTestResults.reduce((sum, r) => sum + r.totalConversas, 0);
                    if (total < 100) {
                      return `Amostra insuficiente (${total}/100). Aguarde mais conversas para resultados confiáveis.`;
                    }
                    const winner = abTestResults.reduce((a, b) => a.conversionRate > b.conversionRate ? a : b);
                    const loser = abTestResults.find(r => r.variant !== winner.variant);
                    const diff = loser ? (winner.conversionRate - loser.conversionRate).toFixed(1) : 0;
                    return `Variante ${winner.variant} está ${diff}% acima. ${Number(diff) > 5 ? 'Considere torná-la padrão.' : 'Diferença ainda pequena.'}`;
                  })()}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Questions Tab */}
        <TabsContent value="frequentes">
          <Card>
            <CardHeader>
              <CardTitle>Top 20 Perguntas Mais Frequentes</CardTitle>
              <CardDescription>
                Análise das principais dúvidas dos clientes sobre as propostas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {questionFrequency.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhuma pergunta registrada ainda.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Pergunta</TableHead>
                      <TableHead className="w-24 text-center">Vezes</TableHead>
                      <TableHead className="w-32">Tipo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {questionFrequency.map((item, index) => (
                      <TableRow key={item.question}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell className="max-w-md truncate">
                          {item.question}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{item.count}</Badge>
                        </TableCell>
                        <TableCell>
                          {item.isQuickReply ? (
                            <Badge variant="outline" className="text-xs">
                              Resposta Rápida
                            </Badge>
                          ) : (
                            <Badge variant="default" className="text-xs">
                              Digitada
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Conversations Tab */}
        <TabsContent value="conversas">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Conversas</CardTitle>
              <CardDescription>
                Últimas 100 conversas com o chatbot
              </CardDescription>
            </CardHeader>
            <CardContent>
              {conversas.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhuma conversa registrada ainda.
                </p>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {conversas.map((conversa) => (
                      <Collapsible
                        key={conversa.id}
                        open={expandedConversas.has(conversa.id)}
                        onOpenChange={() => toggleConversa(conversa.id)}
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            className="w-full justify-between p-4 h-auto hover:bg-muted/50"
                          >
                            <div className="flex items-center gap-4 text-left">
                              <div className="flex-shrink-0">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                  <User className="h-5 w-5 text-primary" />
                                </div>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">
                                    {conversa.cliente_nome || 'Cliente Anônimo'}
                                  </span>
                                  {conversa.sofia_mode === 'closer_premium' && (
                                    <Badge className="bg-amber-500/20 text-amber-700 text-[10px]">
                                      <Zap className="w-3 h-3 mr-1" />
                                      PREMIUM
                                    </Badge>
                                  )}
                                  {conversa.detected_objection && (
                                    <Badge variant="outline" className="text-[10px]">
                                      {getObjectionLabel(conversa.detected_objection)}
                                    </Badge>
                                  )}
                                  {conversa.event_conversion && (
                                    <Badge className="bg-green-500/20 text-green-700 text-[10px]">
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                      CONVERTEU
                                    </Badge>
                                  )}
                                  {conversa.needs_human_fallback && (
                                    <Badge variant="destructive" className="text-xs">
                                      Fallback
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                  <Clock className="h-3 w-3" />
                                  {format(new Date(conversa.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                  <span>•</span>
                                  <span>{conversa.total_messages || 0} msgs</span>
                                  <span>•</span>
                                  <span>Score: {conversa.lead_score || 0}</span>
                                  {conversa.ab_variant && (
                                    <>
                                      <span>•</span>
                                      <span>Var: {conversa.ab_variant}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            {expandedConversas.has(conversa.id) ? (
                              <ChevronUp className="h-5 w-5" />
                            ) : (
                              <ChevronDown className="h-5 w-5" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-4 pb-4 pt-2 bg-muted/30 rounded-b-lg ml-14 mr-4">
                            <div className="space-y-3">
                              {mensagens[conversa.id]?.map((msg) => (
                                <div
                                  key={msg.id}
                                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                  <div
                                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                                      msg.role === 'user'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-card border'
                                    }`}
                                  >
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                    <p className={`text-xs mt-1 ${
                                      msg.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                                    }`}>
                                      {format(new Date(msg.created_at), 'HH:mm')}
                                      {msg.is_quick_reply && ' • Resposta Rápida'}
                                    </p>
                                  </div>
                                </div>
                              )) || (
                                <p className="text-sm text-muted-foreground text-center py-4">
                                  Nenhuma mensagem encontrada.
                                </p>
                              )}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={fetchData} variant="outline">
          Atualizar Dados
        </Button>
      </div>
    </div>
  );
}
