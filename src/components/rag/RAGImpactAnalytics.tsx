import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Target,
  Zap,
  Database,
  RefreshCw,
  Loader2,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  ThumbsUp,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface RAGUsageLog {
  id: string;
  agent_id: string;
  query_text: string;
  results_count: number;
  top_similarity: number;
  avg_similarity: number | null;
  documents_accessed: string[];
  categories_accessed: string[];
  response_time_ms: number;
  client_phone: string | null;
  funnel_stage: string | null;
  chunks_used: any;
  created_at: string;
}

interface ImpactStats {
  totalQueries: number;
  queriesWithResults: number;
  queriesNoResults: number;
  hitRate: number;
  avgSimilarity: number;
  avgResponseTime: number;
  topCategories: { category: string; count: number }[];
  topDocuments: { document: string; count: number }[];
}

const AGENTS = [
  { id: 'all', name: 'Todos', emoji: '🤖' },
  { id: 'sofia', name: 'sofIA', emoji: '👩‍💼' },
  { id: 'maria', name: 'marIA', emoji: '👩‍🔧' },
  { id: 'julia', name: 'julIA', emoji: '👩‍⚖️' },
];

const TIME_RANGES = [
  { value: '1', label: 'Últimas 24h' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
];

export function RAGImpactAnalytics() {
  const [loading, setLoading] = useState(true);
  const [agentId, setAgentId] = useState('all');
  const [days, setDays] = useState('7');
  const [logs, setLogs] = useState<RAGUsageLog[]>([]);
  const [stats, setStats] = useState<ImpactStats | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, [agentId, days]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));
      
      let query = supabase
        .from('rag_usage_logs')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);
      
      if (agentId !== 'all') {
        query = query.eq('agent_id', agentId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      setLogs(data || []);
      
      // Calculate stats
      if (data && data.length > 0) {
        const withResults = data.filter(l => l.results_count > 0);
        const noResults = data.filter(l => l.results_count === 0);
        
        // Count categories
        const categoryCount: Record<string, number> = {};
        const documentCount: Record<string, number> = {};
        
        data.forEach(log => {
          (log.categories_accessed || []).forEach((cat: string) => {
            categoryCount[cat] = (categoryCount[cat] || 0) + 1;
          });
          (log.documents_accessed || []).forEach((doc: string) => {
            documentCount[doc] = (documentCount[doc] || 0) + 1;
          });
        });
        
        const topCategories = Object.entries(categoryCount)
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
          
        const topDocuments = Object.entries(documentCount)
          .map(([document, count]) => ({ document, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        
        const avgSim = withResults.length > 0
          ? withResults.reduce((sum, l) => sum + (l.top_similarity || 0), 0) / withResults.length
          : 0;
          
        const avgTime = data.reduce((sum, l) => sum + (l.response_time_ms || 0), 0) / data.length;
        
        setStats({
          totalQueries: data.length,
          queriesWithResults: withResults.length,
          queriesNoResults: noResults.length,
          hitRate: (withResults.length / data.length) * 100,
          avgSimilarity: avgSim * 100,
          avgResponseTime: avgTime,
          topCategories,
          topDocuments,
        });
      } else {
        setStats(null);
      }
    } catch (error: any) {
      console.error('Error fetching RAG analytics:', error);
      toast({
        title: 'Erro ao carregar analytics',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 70) return 'text-green-600';
    if (similarity >= 50) return 'text-blue-600';
    if (similarity >= 35) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            RAG Impact Analytics
          </h2>
          <p className="text-sm text-muted-foreground">
            Rastreamento de chunks utilizados e impacto nas conversões
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGENTS.map(agent => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.emoji} {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map(range => (
                <SelectItem key={range.value} value={range.value}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !stats ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Database className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>Nenhum dado de RAG encontrado para o período selecionado</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Search className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.totalQueries}</p>
                    <p className="text-xs text-muted-foreground">Total Queries</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-500/10 rounded-lg">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.hitRate.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">Hit Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Target className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className={cn("text-2xl font-bold", getSimilarityColor(stats.avgSimilarity))}>
                      {stats.avgSimilarity.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground">Similaridade Média</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-500/10 rounded-lg">
                    <Clock className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.avgResponseTime.toFixed(0)}ms</p>
                    <p className="text-xs text-muted-foreground">Tempo Médio</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-500/10 rounded-lg">
                    <XCircle className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.queriesNoResults}</p>
                    <p className="text-xs text-muted-foreground">Sem Resultados</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Categories & Documents */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Top Categorias
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {stats.topCategories.length > 0 ? (
                  stats.topCategories.map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between">
                      <Badge variant="outline" className="capitalize">{cat.category}</Badge>
                      <div className="flex items-center gap-2">
                        <Progress 
                          value={(cat.count / stats.totalQueries) * 100} 
                          className="w-24 h-2"
                        />
                        <span className="text-sm font-medium w-12 text-right">{cat.count}x</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma categoria registrada
                  </p>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Top Documentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[180px]">
                  <div className="space-y-2">
                    {stats.topDocuments.length > 0 ? (
                      stats.topDocuments.map((doc) => (
                        <div key={doc.document} className="flex items-center justify-between text-sm">
                          <span className="truncate max-w-[200px]" title={doc.document}>
                            {doc.document}
                          </span>
                          <Badge variant="secondary">{doc.count}x</Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum documento registrado
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Recent Logs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Logs Recentes de RAG
              </CardTitle>
              <CardDescription>
                Últimas {Math.min(logs.length, 50)} queries ao sistema RAG
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Query</TableHead>
                      <TableHead className="text-center">Agente</TableHead>
                      <TableHead className="text-center">Chunks</TableHead>
                      <TableHead className="text-center">Top Sim.</TableHead>
                      <TableHead className="text-center">Tempo</TableHead>
                      <TableHead>Categorias</TableHead>
                      <TableHead>Hora</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.slice(0, 50).map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="max-w-[200px]">
                          <span className="truncate block" title={log.query_text}>
                            {log.query_text?.substring(0, 60)}...
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {AGENTS.find(a => a.id === log.agent_id)?.emoji || '🤖'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={log.results_count > 0 ? 'default' : 'destructive'}>
                            {log.results_count}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {log.top_similarity ? (
                            <span className={cn(
                              "font-medium",
                              getSimilarityColor(log.top_similarity * 100)
                            )}>
                              {(log.top_similarity * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {log.response_time_ms}ms
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap max-w-[150px]">
                            {(log.categories_accessed || []).slice(0, 2).map((cat: string) => (
                              <Badge key={cat} variant="outline" className="text-xs">
                                {cat}
                              </Badge>
                            ))}
                            {(log.categories_accessed || []).length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{log.categories_accessed.length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
