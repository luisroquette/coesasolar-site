import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  Search, 
  Loader2, 
  FileText, 
  Sparkles,
  Clock,
  Hash,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Copy,
  Zap,
  Target,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
  BarChart3,
  History,
  Bug,
  Database
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ChunkDetail {
  id: string;
  content: string;
  file_name: string;
  category: string;
  subcategory?: string;
  source_path?: string;
  similarity: number;
  chunk_index?: number;
  learning_type?: 'success' | 'failure' | 'neutral';
  is_exemplar?: boolean;
  exemplar_reason?: string;
  metadata?: Record<string, unknown>;
}

interface SearchResponse {
  success: boolean;
  results: ChunkDetail[];
  context: string;
  meta: {
    query_length: number;
    results_count: number;
    execution_time_ms: number;
    agent_id: string;
  };
}

interface QueryHistoryItem {
  id: string;
  query: string;
  agent_id: string;
  results_count: number;
  top_similarity: number;
  execution_time_ms: number;
  timestamp: Date;
}

const AGENTS = [
  { id: 'sofia', name: 'sofIA', emoji: '👩‍💼', description: 'Vendas' },
  { id: 'maria', name: 'marIA', emoji: '👩‍🔧', description: 'SAC' },
  { id: 'julia', name: 'julIA', emoji: '👩‍⚖️', description: 'Cobrança' },
  { id: 'iago', name: 'Iago', emoji: '🧑‍💻', description: 'Suporte' },
  { id: 'jaime', name: 'Jaime', emoji: '📅', description: 'Agendamento' },
];

const TEST_QUERIES = [
  { category: 'Objeções', queries: [
    'Como responder objeção sobre preço alto?',
    'Cliente acha que é golpe, como lidar?',
    'Objeção sobre fidelidade de contrato',
  ]},
  { category: 'Dúvidas Técnicas', queries: [
    'Como funciona a energia solar por assinatura?',
    'Qual a diferença entre GD e mercado livre?',
    'O que acontece se eu mudar de endereço?',
  ]},
  { category: 'Processos', queries: [
    'Quais documentos preciso para assinar?',
    'Quanto tempo demora para começar a economizar?',
    'Como funciona o desconto na conta de luz?',
  ]},
];

export function RAGValidationDashboard() {
  const [query, setQuery] = useState('');
  const [agentId, setAgentId] = useState('sofia');
  const [topK, setTopK] = useState(5);
  const [minSimilarity, setMinSimilarity] = useState(0.35);
  const [searching, setSearching] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [selectedChunk, setSelectedChunk] = useState<ChunkDetail | null>(null);
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState('search');
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const handleSearch = async (searchQuery?: string) => {
    const q = searchQuery || query;
    if (!q.trim()) {
      toast({
        title: 'Digite uma consulta',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSearching(true);
      setResponse(null);
      setSelectedChunk(null);

      const startTime = Date.now();
      const { data, error } = await supabase.functions.invoke('rag-search', {
        body: {
          query: q.trim(),
          agent_id: agentId,
          top_k: topK,
          min_similarity: minSimilarity,
          include_metadata: true,
        }
      });

      if (error) throw error;

      setResponse(data);

      // Add to history
      const historyItem: QueryHistoryItem = {
        id: crypto.randomUUID(),
        query: q.trim(),
        agent_id: agentId,
        results_count: data.results?.length || 0,
        top_similarity: data.results?.length > 0 
          ? Math.max(...data.results.map((r: ChunkDetail) => r.similarity)) 
          : 0,
        execution_time_ms: data.meta?.execution_time_ms || (Date.now() - startTime),
        timestamp: new Date(),
      };
      setQueryHistory(prev => [historyItem, ...prev.slice(0, 19)]);

    } catch (error: any) {
      toast({
        title: 'Erro na busca',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSearching(false);
    }
  };

  const toggleChunkExpanded = (id: string) => {
    setExpandedChunks(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!' });
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.7) return 'text-green-600 bg-green-100 dark:bg-green-900/50 dark:text-green-400';
    if (similarity >= 0.5) return 'text-blue-600 bg-blue-100 dark:bg-blue-900/50 dark:text-blue-400';
    if (similarity >= 0.35) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/50 dark:text-yellow-400';
    return 'text-red-600 bg-red-100 dark:bg-red-900/50 dark:text-red-400';
  };

  const getSimilarityIcon = (similarity: number) => {
    if (similarity >= 0.7) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (similarity >= 0.5) return <Target className="h-4 w-4 text-blue-500" />;
    if (similarity >= 0.35) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const getLearningTypeBadge = (chunk: ChunkDetail) => {
    if (chunk.learning_type === 'success') {
      return (
        <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">
          <ThumbsUp className="h-3 w-3 mr-1" />
          Exemplo Positivo
        </Badge>
      );
    }
    if (chunk.learning_type === 'failure') {
      return (
        <Badge className="bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30">
          <ThumbsDown className="h-3 w-3 mr-1" />
          Exemplo Negativo
        </Badge>
      );
    }
    return null;
  };

  const topSimilarity = response?.results?.length
    ? Math.max(...response.results.map(r => r.similarity))
    : null;

  const avgSimilarity = response?.results?.length
    ? response.results.reduce((sum, r) => sum + r.similarity, 0) / response.results.length
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Bug className="h-5 w-5 text-primary" />
            RAG Validation Dashboard
          </h2>
          <p className="text-sm text-muted-foreground">
            Teste queries e visualize quais documentos são retornados para debugging
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="search" className="gap-2">
            <Search className="h-4 w-4" />
            Testar Query
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            Histórico ({queryHistory.length})
          </TabsTrigger>
          <TabsTrigger value="presets" className="gap-2">
            <Zap className="h-4 w-4" />
            Queries Pré-definidas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="mt-4">
          <div className="grid grid-cols-3 gap-4">
            {/* Search Panel */}
            <Card className="col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Parâmetros de Busca
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Agent Selection */}
                <div className="space-y-2">
                  <Label>Agente</Label>
                  <Select value={agentId} onValueChange={setAgentId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGENTS.map(agent => (
                        <SelectItem key={agent.id} value={agent.id}>
                          <span className="flex items-center gap-2">
                            <span>{agent.emoji}</span>
                            <span>{agent.name}</span>
                            <span className="text-muted-foreground text-xs">({agent.description})</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Query Input */}
                <div className="space-y-2">
                  <Label>Query de Teste</Label>
                  <Textarea
                    placeholder="Ex: Como responder objeção sobre preço alto?"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    rows={3}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.metaKey) {
                        handleSearch();
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">⌘+Enter para buscar</p>
                </div>

                {/* Parameters */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Resultados Máx</Label>
                      <span className="text-sm font-medium">{topK}</span>
                    </div>
                    <Slider
                      value={[topK]}
                      onValueChange={([v]) => setTopK(v)}
                      min={1}
                      max={15}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Similaridade Mínima</Label>
                      <span className="text-sm font-medium">{(minSimilarity * 100).toFixed(0)}%</span>
                    </div>
                    <Slider
                      value={[minSimilarity]}
                      onValueChange={([v]) => setMinSimilarity(v)}
                      min={0.1}
                      max={0.9}
                      step={0.05}
                    />
                    <p className="text-xs text-muted-foreground">
                      Padrão: 45% | Debug: 20-35%
                    </p>
                  </div>
                </div>

                <Button onClick={() => handleSearch()} disabled={searching} className="w-full">
                  {searching ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Executar Busca
                    </>
                  )}
                </Button>

                {/* Quick Stats */}
                {response && (
                  <div className="pt-4 border-t space-y-3">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Métricas da Busca
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-muted rounded-lg p-2">
                        <p className="text-muted-foreground text-xs">Resultados</p>
                        <p className="font-bold">{response.meta.results_count}</p>
                      </div>
                      <div className="bg-muted rounded-lg p-2">
                        <p className="text-muted-foreground text-xs">Tempo</p>
                        <p className="font-bold">{response.meta.execution_time_ms}ms</p>
                      </div>
                      <div className="bg-muted rounded-lg p-2">
                        <p className="text-muted-foreground text-xs">Top Similaridade</p>
                        <p className={cn("font-bold", topSimilarity && topSimilarity >= 0.5 ? "text-green-600" : "text-yellow-600")}>
                          {topSimilarity ? `${(topSimilarity * 100).toFixed(1)}%` : '-'}
                        </p>
                      </div>
                      <div className="bg-muted rounded-lg p-2">
                        <p className="text-muted-foreground text-xs">Média</p>
                        <p className="font-bold">
                          {avgSimilarity ? `${(avgSimilarity * 100).toFixed(1)}%` : '-'}
                        </p>
                      </div>
                    </div>

                    {/* Quality Indicator */}
                    {topSimilarity !== null && (
                      <div className={cn(
                        "rounded-lg p-3 text-sm",
                        topSimilarity >= 0.6 ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" :
                        topSimilarity >= 0.4 ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300" :
                        "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                      )}>
                        {topSimilarity >= 0.6 && (
                          <>
                            <CheckCircle2 className="h-4 w-4 inline mr-2" />
                            <strong>Boa cobertura!</strong> O RAG tem documentos relevantes.
                          </>
                        )}
                        {topSimilarity >= 0.4 && topSimilarity < 0.6 && (
                          <>
                            <AlertTriangle className="h-4 w-4 inline mr-2" />
                            <strong>Cobertura parcial.</strong> Resultados podem ser genéricos.
                          </>
                        )}
                        {topSimilarity < 0.4 && (
                          <>
                            <XCircle className="h-4 w-4 inline mr-2" />
                            <strong>Baixa cobertura!</strong> Faltam documentos sobre este tema.
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Results Panel */}
            <Card className="col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Documentos Retornados
                  </span>
                  {response && (
                    <div className="flex items-center gap-3 text-sm font-normal text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {response.meta.results_count} chunks
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {response.meta.execution_time_ms}ms
                      </span>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!response ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Database className="h-16 w-16 mx-auto mb-4 opacity-20" />
                    <p className="text-lg">Execute uma busca para ver os resultados</p>
                    <p className="text-sm mt-2">
                      Visualize exatamente quais chunks são retornados e sua similaridade
                    </p>
                  </div>
                ) : response.results.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <XCircle className="h-16 w-16 mx-auto mb-4 opacity-20 text-red-400" />
                    <p className="text-lg">Nenhum resultado encontrado</p>
                    <p className="text-sm mt-2">
                      Reduza a similaridade mínima ou verifique se há documentos sobre este tema
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="h-[600px] pr-4">
                    <div className="space-y-3">
                      {response.results.map((chunk, index) => (
                        <Collapsible
                          key={chunk.id}
                          open={expandedChunks.has(chunk.id)}
                          onOpenChange={() => toggleChunkExpanded(chunk.id)}
                        >
                          <div className={cn(
                            "border rounded-lg overflow-hidden transition-all",
                            selectedChunk?.id === chunk.id && "ring-2 ring-primary"
                          )}>
                            {/* Header */}
                            <CollapsibleTrigger asChild>
                              <div 
                                className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => setSelectedChunk(chunk)}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-start gap-3 flex-1">
                                    <span className={cn(
                                      "flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold",
                                      getSimilarityColor(chunk.similarity)
                                    )}>
                                      {index + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-medium text-sm truncate">
                                          {chunk.file_name}
                                        </p>
                                        {chunk.chunk_index !== undefined && (
                                          <Badge variant="outline" className="text-xs">
                                            Chunk #{chunk.chunk_index}
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <Badge variant="secondary" className="text-xs capitalize">
                                          {chunk.category}
                                        </Badge>
                                        {chunk.subcategory && (
                                          <Badge variant="outline" className="text-xs">
                                            {chunk.subcategory}
                                          </Badge>
                                        )}
                                        {getLearningTypeBadge(chunk)}
                                        {chunk.is_exemplar && (
                                          <Badge className="bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30">
                                            ⭐ Exemplar
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="text-right">
                                      <div className={cn(
                                        "px-2 py-1 rounded-lg text-sm font-bold flex items-center gap-1",
                                        getSimilarityColor(chunk.similarity)
                                      )}>
                                        {getSimilarityIcon(chunk.similarity)}
                                        {(chunk.similarity * 100).toFixed(1)}%
                                      </div>
                                    </div>
                                    {expandedChunks.has(chunk.id) ? (
                                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                    )}
                                  </div>
                                </div>
                                
                                {/* Preview */}
                                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                  {chunk.content.substring(0, 200)}...
                                </p>
                              </div>
                            </CollapsibleTrigger>

                            {/* Expanded Content */}
                            <CollapsibleContent>
                              <Separator />
                              <div className="p-4 bg-muted/30 space-y-4">
                                {/* Full Content */}
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                      Conteúdo Completo
                                    </Label>
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => copyToClipboard(chunk.content)}
                                    >
                                      <Copy className="h-3 w-3 mr-1" />
                                      Copiar
                                    </Button>
                                  </div>
                                  <div className="bg-background rounded-lg p-3 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto border">
                                    {chunk.content}
                                  </div>
                                </div>

                                {/* Source Path */}
                                {chunk.source_path && (
                                  <div>
                                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                      Caminho OneDrive
                                    </Label>
                                    <p className="text-sm font-mono bg-background rounded-lg p-2 mt-1 border truncate">
                                      {chunk.source_path}
                                    </p>
                                  </div>
                                )}

                                {/* Exemplar Reason */}
                                {chunk.exemplar_reason && (
                                  <div>
                                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                      Motivo do Exemplar
                                    </Label>
                                    <p className="text-sm bg-purple-100 dark:bg-purple-900/30 rounded-lg p-2 mt-1">
                                      {chunk.exemplar_reason}
                                    </p>
                                  </div>
                                )}

                                {/* Metadata */}
                                {chunk.metadata && Object.keys(chunk.metadata).length > 0 && (
                                  <div>
                                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                      Metadata
                                    </Label>
                                    <pre className="text-xs font-mono bg-background rounded-lg p-2 mt-1 border overflow-x-auto">
                                      {JSON.stringify(chunk.metadata, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                Histórico de Queries
              </CardTitle>
              <CardDescription>
                Últimas {queryHistory.length} buscas realizadas nesta sessão
              </CardDescription>
            </CardHeader>
            <CardContent>
              {queryHistory.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhuma busca realizada ainda</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Query</TableHead>
                      <TableHead>Agente</TableHead>
                      <TableHead className="text-center">Resultados</TableHead>
                      <TableHead className="text-center">Top Sim.</TableHead>
                      <TableHead className="text-center">Tempo</TableHead>
                      <TableHead>Hora</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queryHistory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="max-w-xs truncate font-medium">
                          {item.query}
                        </TableCell>
                        <TableCell>
                          {AGENTS.find(a => a.id === item.agent_id)?.emoji} {item.agent_id}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={item.results_count > 0 ? 'default' : 'destructive'}>
                            {item.results_count}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn(
                            "px-2 py-1 rounded text-xs font-bold",
                            getSimilarityColor(item.top_similarity)
                          )}>
                            {(item.top_similarity * 100).toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {item.execution_time_ms}ms
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {item.timestamp.toLocaleTimeString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setQuery(item.query);
                              setAgentId(item.agent_id);
                              setActiveTab('search');
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="presets" className="mt-4">
          <div className="grid grid-cols-3 gap-4">
            {TEST_QUERIES.map((category) => (
              <Card key={category.category}>
                <CardHeader>
                  <CardTitle className="text-base">{category.category}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {category.queries.map((q) => (
                    <Button
                      key={q}
                      variant="outline"
                      className="w-full justify-start text-left h-auto py-2"
                      onClick={() => {
                        setQuery(q);
                        setActiveTab('search');
                        handleSearch(q);
                      }}
                    >
                      <Search className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="truncate">{q}</span>
                    </Button>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
