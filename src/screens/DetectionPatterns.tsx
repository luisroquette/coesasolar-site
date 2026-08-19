import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft,
  Tag, 
  Search, 
  RefreshCw,
  TrendingUp,
  CheckCircle,
  XCircle,
  Regex,
  BarChart3,
  Zap,
  Filter,
  ChevronDown,
  ChevronRight,
  History
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { AgentDetectionPatterns } from '@/components/ai-gym/AgentDetectionPatterns';
import { PatternVersionHistory } from '@/components/ai-gym/PatternVersionHistory';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface CategoryStats {
  category: string;
  patternCount: number;
  activeCount: number;
  keywordCount: number;
  regexCount: number;
  label: string;
  color: string;
  group: string;
}

// Category groupings for better organization
const CATEGORY_GROUPS: Record<string, { label: string; icon: React.ReactNode; categories: string[] }> = {
  objections: {
    label: 'Objeções',
    icon: <XCircle className="h-4 w-4" />,
    categories: ['objections', 'objection_preco', 'objection_confianca', 'objection_contrato', 'objection_tempo', 'objection_complexidade', 'objection_autoridade', 'discount_objection']
  },
  intent: {
    label: 'Intenção & Scoring',
    icon: <TrendingUp className="h-4 w-4" />,
    categories: ['high_intent', 'score_valor_conta', 'score_contrato', 'score_proposta', 'score_multa']
  },
  feedback: {
    label: 'Feedback',
    icon: <CheckCircle className="h-4 w-4" />,
    categories: ['positive_feedback', 'negative_feedback', 'neutral_feedback', 'hesitation_moderate', 'hesitation_strong']
  },
  funnel: {
    label: 'Funil & Conversão',
    icon: <BarChart3 className="h-4 w-4" />,
    categories: ['funnel_simulation', 'funnel_conversion', 'ab_closing_a', 'ab_closing_b']
  },
  triage: {
    label: 'Triagem',
    icon: <Filter className="h-4 w-4" />,
    categories: ['existing_client', 'confirm_existing', 'confirm_new', 'select_financial', 'select_pos_venda', 'select_fatura', 'select_other']
  },
  audio: {
    label: 'Áudio',
    icon: <Zap className="h-4 w-4" />,
    categories: ['audio_accept', 'audio_reject']
  },
  extraction: {
    label: 'Extração de Dados',
    icon: <Regex className="h-4 w-4" />,
    categories: ['extract_cpf', 'extract_cnpj', 'extract_cep', 'extract_email', 'extract_nome', 'extract_consumo', 'extract_valor', 'extract_valor_mil', 'extract_distribuidora', 'extract_invoice_nome', 'extract_invoice_cpf', 'extract_invoice_cnpj', 'extract_invoice_endereco', 'extract_invoice_cep', 'extract_invoice_consumo', 'extract_invoice_valor', 'extract_invoice_instalacao']
  }
};

// Category definitions with colors
const CATEGORY_DEFINITIONS: Record<string, { label: string; color: string }> = {
  // Objections
  objections: { label: 'Objeções Gerais', color: 'bg-red-500/10 text-red-600' },
  objection_preco: { label: 'Objeção Preço', color: 'bg-red-500/10 text-red-600' },
  objection_confianca: { label: 'Objeção Confiança', color: 'bg-orange-500/10 text-orange-600' },
  objection_contrato: { label: 'Objeção Contrato', color: 'bg-amber-500/10 text-amber-600' },
  objection_tempo: { label: 'Objeção Tempo', color: 'bg-yellow-500/10 text-yellow-600' },
  objection_complexidade: { label: 'Objeção Complexidade', color: 'bg-yellow-500/10 text-yellow-600' },
  objection_autoridade: { label: 'Objeção Autoridade', color: 'bg-orange-500/10 text-orange-600' },
  discount_objection: { label: 'Objeção Desconto', color: 'bg-red-500/10 text-red-600' },
  
  // Intent & Scoring
  high_intent: { label: 'Alta Intenção', color: 'bg-green-500/10 text-green-600' },
  score_valor_conta: { label: 'Score Valor Conta', color: 'bg-emerald-500/10 text-emerald-600' },
  score_contrato: { label: 'Score Contrato', color: 'bg-teal-500/10 text-teal-600' },
  score_proposta: { label: 'Score Proposta', color: 'bg-cyan-500/10 text-cyan-600' },
  score_multa: { label: 'Score Multa', color: 'bg-sky-500/10 text-sky-600' },
  
  // Feedback
  positive_feedback: { label: 'Feedback Positivo', color: 'bg-green-500/10 text-green-600' },
  negative_feedback: { label: 'Feedback Negativo', color: 'bg-red-500/10 text-red-600' },
  neutral_feedback: { label: 'Feedback Neutro', color: 'bg-gray-500/10 text-gray-600' },
  hesitation_moderate: { label: 'Hesitação Moderada', color: 'bg-orange-500/10 text-orange-600' },
  hesitation_strong: { label: 'Hesitação Forte', color: 'bg-red-500/10 text-red-600' },
  
  // Funnel
  funnel_simulation: { label: 'Simulação', color: 'bg-blue-500/10 text-blue-600' },
  funnel_conversion: { label: 'Conversão', color: 'bg-green-500/10 text-green-600' },
  ab_closing_a: { label: 'Fechamento A', color: 'bg-purple-500/10 text-purple-600' },
  ab_closing_b: { label: 'Fechamento B', color: 'bg-indigo-500/10 text-indigo-600' },
  
  // Triage
  existing_client: { label: 'Cliente Existente', color: 'bg-blue-500/10 text-blue-600' },
  confirm_existing: { label: 'Confirma Existente', color: 'bg-blue-500/10 text-blue-600' },
  confirm_new: { label: 'Confirma Novo', color: 'bg-emerald-500/10 text-emerald-600' },
  select_financial: { label: 'Financeiro', color: 'bg-purple-500/10 text-purple-600' },
  select_pos_venda: { label: 'Pós-Venda', color: 'bg-indigo-500/10 text-indigo-600' },
  select_fatura: { label: 'Fatura', color: 'bg-violet-500/10 text-violet-600' },
  select_other: { label: 'Outros', color: 'bg-slate-500/10 text-slate-600' },
  
  // Audio
  audio_accept: { label: 'Aceita Áudio', color: 'bg-green-500/10 text-green-600' },
  audio_reject: { label: 'Rejeita Áudio', color: 'bg-red-500/10 text-red-600' },
  
  // Extraction patterns
  extract_cpf: { label: 'Extração CPF', color: 'bg-cyan-500/10 text-cyan-600' },
  extract_cnpj: { label: 'Extração CNPJ', color: 'bg-cyan-500/10 text-cyan-600' },
  extract_cep: { label: 'Extração CEP', color: 'bg-cyan-500/10 text-cyan-600' },
  extract_email: { label: 'Extração Email', color: 'bg-cyan-500/10 text-cyan-600' },
  extract_nome: { label: 'Extração Nome', color: 'bg-cyan-500/10 text-cyan-600' },
  extract_consumo: { label: 'Extração Consumo', color: 'bg-cyan-500/10 text-cyan-600' },
  extract_valor: { label: 'Extração Valor', color: 'bg-cyan-500/10 text-cyan-600' },
  extract_valor_mil: { label: 'Extração Valor (mil)', color: 'bg-cyan-500/10 text-cyan-600' },
  extract_distribuidora: { label: 'Extração Distribuidora', color: 'bg-cyan-500/10 text-cyan-600' },
  extract_invoice_nome: { label: 'Fatura - Nome', color: 'bg-teal-500/10 text-teal-600' },
  extract_invoice_cpf: { label: 'Fatura - CPF', color: 'bg-teal-500/10 text-teal-600' },
  extract_invoice_cnpj: { label: 'Fatura - CNPJ', color: 'bg-teal-500/10 text-teal-600' },
  extract_invoice_endereco: { label: 'Fatura - Endereço', color: 'bg-teal-500/10 text-teal-600' },
  extract_invoice_cep: { label: 'Fatura - CEP', color: 'bg-teal-500/10 text-teal-600' },
  extract_invoice_consumo: { label: 'Fatura - Consumo', color: 'bg-teal-500/10 text-teal-600' },
  extract_invoice_valor: { label: 'Fatura - Valor', color: 'bg-teal-500/10 text-teal-600' },
  extract_invoice_instalacao: { label: 'Fatura - Instalação', color: 'bg-teal-500/10 text-teal-600' },
};

export default function DetectionPatterns() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['objections', 'intent']));
  const [testInput, setTestInput] = useState('');
  const [testResults, setTestResults] = useState<Array<{ category: string; pattern: string; type: string }>>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [allPatterns, setAllPatterns] = useState<Array<{ category: string; pattern: string; pattern_type: string; is_active: boolean }>>([]);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      
      // Fetch all patterns for stats and testing
      const { data, error } = await supabase
        .from('sofia_detection_patterns')
        .select('category, pattern, pattern_type, is_active')
        .order('category');

      if (error) throw error;

      setAllPatterns(data || []);

      // Calculate stats by category
      const statsMap = new Map<string, CategoryStats>();
      
      (data || []).forEach(pattern => {
        const cat = pattern.category;
        if (!statsMap.has(cat)) {
          const def = CATEGORY_DEFINITIONS[cat] || { label: cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), color: 'bg-muted text-muted-foreground' };
          
          // Find which group this category belongs to
          let group = 'other';
          for (const [groupKey, groupDef] of Object.entries(CATEGORY_GROUPS)) {
            if (groupDef.categories.includes(cat)) {
              group = groupKey;
              break;
            }
          }
          
          statsMap.set(cat, {
            category: cat,
            patternCount: 0,
            activeCount: 0,
            keywordCount: 0,
            regexCount: 0,
            label: def.label,
            color: def.color,
            group
          });
        }
        
        const stats = statsMap.get(cat)!;
        stats.patternCount++;
        if (pattern.is_active) stats.activeCount++;
        if (pattern.pattern_type === 'keyword') stats.keywordCount++;
        else stats.regexCount++;
      });

      setCategoryStats(Array.from(statsMap.values()).sort((a, b) => b.patternCount - a.patternCount));
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar estatísticas',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Test pattern matching in real-time
  const handleTestInput = (input: string) => {
    setTestInput(input);
    if (!input.trim()) {
      setTestResults([]);
      return;
    }

    setIsTesting(true);
    const inputLower = input.toLowerCase();
    const results: Array<{ category: string; pattern: string; type: string }> = [];

    allPatterns.filter(p => p.is_active).forEach(p => {
      let matched = false;
      
      if (p.pattern_type === 'keyword') {
        matched = inputLower.includes(p.pattern.toLowerCase());
      } else {
        try {
          const regex = new RegExp(p.pattern, 'i');
          matched = regex.test(input);
        } catch {
          matched = false;
        }
      }

      if (matched) {
        results.push({
          category: p.category,
          pattern: p.pattern,
          type: p.pattern_type
        });
      }
    });

    setTestResults(results);
    setIsTesting(false);
  };

  // Group stats by category groups
  const groupedStats = useMemo(() => {
    const groups: Record<string, CategoryStats[]> = {};
    
    Object.keys(CATEGORY_GROUPS).forEach(groupKey => {
      groups[groupKey] = categoryStats.filter(s => s.group === groupKey);
    });
    
    // Add "other" group for uncategorized
    groups.other = categoryStats.filter(s => s.group === 'other');
    
    return groups;
  }, [categoryStats]);

  // Calculate totals
  const totals = useMemo(() => {
    return {
      patterns: allPatterns.length,
      active: allPatterns.filter(p => p.is_active).length,
      categories: categoryStats.length,
      keywords: allPatterns.filter(p => p.pattern_type === 'keyword').length,
      regex: allPatterns.filter(p => p.pattern_type === 'regex').length
    };
  }, [allPatterns, categoryStats]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(group)) {
        newSet.delete(group);
      } else {
        newSet.add(group);
      }
      return newSet;
    });
  };

  const getCategoryInfo = (category: string) => {
    return CATEGORY_DEFINITIONS[category] || { 
      label: category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
      color: 'bg-muted text-muted-foreground' 
    };
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-6 px-4 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/ai-gym')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Tag className="h-6 w-6 text-primary" />
                Detection Patterns
              </h1>
              <p className="text-sm text-muted-foreground">
                Gerencie os padrões de detecção usados pelos agentes de IA
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="manager" className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Gerenciar Patterns
            </TabsTrigger>
            <TabsTrigger value="test" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Testar Detecção
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Histórico
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{totals.patterns}</div>
                  <p className="text-xs text-muted-foreground">Total de Patterns</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-green-600">{totals.active}</div>
                  <p className="text-xs text-muted-foreground">Patterns Ativos</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-blue-600">{totals.categories}</div>
                  <p className="text-xs text-muted-foreground">Categorias</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-purple-600">{totals.keywords}</div>
                  <p className="text-xs text-muted-foreground">Keywords</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-orange-600">{totals.regex}</div>
                  <p className="text-xs text-muted-foreground">Regex</p>
                </CardContent>
              </Card>
            </div>

            {/* Category Groups */}
            <Card>
              <CardHeader>
                <CardTitle>Patterns por Categoria</CardTitle>
                <CardDescription>
                  {categoryStats.length} categorias organizadas em {Object.keys(CATEGORY_GROUPS).length} grupos
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(CATEGORY_GROUPS).map(([groupKey, groupDef]) => {
                      const groupCategories = groupedStats[groupKey] || [];
                      if (groupCategories.length === 0) return null;
                      
                      const totalInGroup = groupCategories.reduce((sum, c) => sum + c.patternCount, 0);
                      const activeInGroup = groupCategories.reduce((sum, c) => sum + c.activeCount, 0);
                      
                      return (
                        <Collapsible 
                          key={groupKey} 
                          open={expandedGroups.has(groupKey)}
                          onOpenChange={() => toggleGroup(groupKey)}
                        >
                          <CollapsibleTrigger asChild>
                            <button className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded bg-primary/10 text-primary">
                                  {groupDef.icon}
                                </div>
                                <div className="text-left">
                                  <span className="font-medium">{groupDef.label}</span>
                                  <p className="text-xs text-muted-foreground">
                                    {groupCategories.length} categorias • {totalInGroup} patterns
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <Badge variant="secondary">
                                  {activeInGroup}/{totalInGroup} ativos
                                </Badge>
                                {expandedGroups.has(groupKey) ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </div>
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3 ml-4">
                              {groupCategories.map(stats => (
                                <div 
                                  key={stats.category}
                                  className="p-3 border rounded-lg bg-background"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <Badge className={stats.color}>
                                      {stats.label}
                                    </Badge>
                                    <span className="text-sm text-muted-foreground">
                                      {stats.patternCount}
                                    </span>
                                  </div>
                                  <Progress 
                                    value={(stats.activeCount / stats.patternCount) * 100} 
                                    className="h-1.5 mb-2"
                                  />
                                  <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>{stats.activeCount} ativos</span>
                                    <span>
                                      {stats.keywordCount} kw / {stats.regexCount} rx
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                    
                    {/* Other/Uncategorized */}
                    {groupedStats.other && groupedStats.other.length > 0 && (
                      <Collapsible 
                        open={expandedGroups.has('other')}
                        onOpenChange={() => toggleGroup('other')}
                      >
                        <CollapsibleTrigger asChild>
                          <button className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="p-1.5 rounded bg-muted text-muted-foreground">
                                <Tag className="h-4 w-4" />
                              </div>
                              <div className="text-left">
                                <span className="font-medium">Outras Categorias</span>
                                <p className="text-xs text-muted-foreground">
                                  {groupedStats.other.length} categorias
                                </p>
                              </div>
                            </div>
                            {expandedGroups.has('other') ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3 ml-4">
                            {groupedStats.other.map(stats => (
                              <div 
                                key={stats.category}
                                className="p-3 border rounded-lg bg-background"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <Badge variant="outline">
                                    {stats.label}
                                  </Badge>
                                  <span className="text-sm text-muted-foreground">
                                    {stats.patternCount}
                                  </span>
                                </div>
                                <Progress 
                                  value={(stats.activeCount / stats.patternCount) * 100} 
                                  className="h-1.5"
                                />
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Manager Tab */}
          <TabsContent value="manager">
            <AgentDetectionPatterns agentId="global" agentName="Global" />
          </TabsContent>

          {/* Test Tab */}
          <TabsContent value="test" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Simulador de Detecção
                </CardTitle>
                <CardDescription>
                  Digite uma mensagem para testar quais patterns serão detectados em tempo real
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={testInput}
                    onChange={(e) => handleTestInput(e.target.value)}
                    placeholder="Digite uma mensagem de teste... Ex: 'Olá, já sou cliente e quero saber sobre minha fatura'"
                    className="flex-1"
                  />
                  {testInput && (
                    <Button variant="outline" onClick={() => handleTestInput('')}>
                      Limpar
                    </Button>
                  )}
                </div>

                {testInput && (
                  <div className="p-4 border rounded-lg bg-muted/30">
                    {isTesting ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Testando...
                      </div>
                    ) : testResults.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-500" />
                          <span className="font-medium">
                            {testResults.length} pattern(s) detectado(s)
                          </span>
                        </div>
                        <ScrollArea className="h-[300px]">
                          <div className="space-y-2">
                            {testResults.map((result, idx) => (
                              <div 
                                key={idx}
                                className="flex items-center justify-between p-3 border rounded-lg bg-background"
                              >
                                <div className="flex items-center gap-3">
                                  {result.type === 'keyword' ? (
                                    <Tag className="h-4 w-4 text-blue-500" />
                                  ) : (
                                    <Regex className="h-4 w-4 text-purple-500" />
                                  )}
                                  <div>
                                    <Badge className={getCategoryInfo(result.category).color}>
                                      {getCategoryInfo(result.category).label}
                                    </Badge>
                                    <p className="text-sm mt-1 font-mono text-muted-foreground">
                                      {result.pattern}
                                    </p>
                                  </div>
                                </div>
                                <Badge variant="outline">
                                  {result.type}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <XCircle className="h-5 w-5" />
                        <span>Nenhum pattern detectado para esta mensagem</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Example messages */}
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Exemplos para testar:</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'já sou cliente coesa',
                      'quanto custa o serviço?',
                      'minha fatura veio muito alta',
                      'quero contratar agora',
                      'não tenho interesse obrigado',
                      'preciso falar com o financeiro'
                    ].map((example, idx) => (
                      <Button 
                        key={idx}
                        variant="outline" 
                        size="sm"
                        onClick={() => handleTestInput(example)}
                      >
                        {example}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <PatternVersionHistory onVersionRestored={fetchStats} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
