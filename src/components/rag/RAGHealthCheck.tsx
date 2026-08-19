import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  TrendingUp,
  Clock,
  RefreshCw,
  Zap,
  Ban,
  Target,
  BarChart3
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RAGHealthStats {
  totalCalls: number;
  ragCalled: number;
  ragSkipped: number;
  callRate: number;
  avgTopSimilarity: number;
  avgResponseTime: number;
  skipReasons: Record<string, number>;
  categoriesReturned: Record<string, number>;
  similarityDistribution: {
    excellent: number; // > 0.7
    good: number;      // 0.5-0.7
    fair: number;      // 0.3-0.5
    poor: number;      // < 0.3
  };
  recentLogs: RAGLogEntry[];
}

interface RAGLogEntry {
  id: string;
  created_at: string;
  agent_id: string;
  query_text: string;
  was_skipped: boolean;
  skip_reason: string | null;
  results_count: number;
  top_similarity: number | null;
  categories_accessed: string[];
  response_time_ms: number;
  trigger_confidence: string | null;
  client_phone: string | null;
}

const SKIP_REASON_LABELS: Record<string, { label: string; color: string }> = {
  'message_too_short': { label: 'Msg muito curta', color: 'bg-gray-500' },
  'trivial_message:rag_skip_trivial': { label: 'Msg trivial', color: 'bg-yellow-500' },
  'trivial_message:rag_skip_greetings': { label: 'Saudação', color: 'bg-blue-500' },
  'trivial_message:rag_skip_confirmations': { label: 'Confirmação', color: 'bg-green-500' },
  'trivial_message:rag_skip_audio': { label: 'Áudio', color: 'bg-purple-500' },
  'trivial_message:rag_skip_short': { label: 'Curta', color: 'bg-gray-400' },
  'no_rag_indicators': { label: 'Sem indicadores', color: 'bg-orange-500' },
  'no_relevant_documents': { label: 'Sem docs relevantes', color: 'bg-red-400' },
  'error': { label: 'Erro', color: 'bg-red-600' },
};

export function RAGHealthCheck() {
  const [stats, setStats] = useState<RAGHealthStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('24h');
  const { toast } = useToast();

  const fetchStats = async () => {
    setLoading(true);
    try {
      // Calculate date range based on period
      const now = new Date();
      let startDate: Date;
      switch (period) {
        case '1h':
          startDate = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }

      // Fetch logs from database
      const { data: logs, error } = await supabase
        .from('rag_usage_logs')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      // Calculate statistics
      const totalCalls = logs?.length || 0;
      const ragCalled = logs?.filter(l => !l.was_skipped).length || 0;
      const ragSkipped = logs?.filter(l => l.was_skipped).length || 0;
      const callRate = totalCalls > 0 ? (ragCalled / totalCalls) * 100 : 0;

      // Average similarity (only for called RAG)
      const calledLogs = logs?.filter(l => !l.was_skipped && l.top_similarity !== null) || [];
      const avgTopSimilarity = calledLogs.length > 0
        ? calledLogs.reduce((sum, l) => sum + (l.top_similarity || 0), 0) / calledLogs.length
        : 0;

      // Average response time
      const logsWithTime = logs?.filter(l => l.response_time_ms !== null) || [];
      const avgResponseTime = logsWithTime.length > 0
        ? logsWithTime.reduce((sum, l) => sum + (l.response_time_ms || 0), 0) / logsWithTime.length
        : 0;

      // Skip reasons breakdown
      const skipReasons: Record<string, number> = {};
      logs?.filter(l => l.was_skipped && l.skip_reason).forEach(l => {
        const reason = l.skip_reason || 'unknown';
        skipReasons[reason] = (skipReasons[reason] || 0) + 1;
      });

      // Categories returned
      const categoriesReturned: Record<string, number> = {};
      logs?.filter(l => !l.was_skipped).forEach(l => {
        const cats = l.categories_accessed || [];
        cats.forEach((cat: string) => {
          categoriesReturned[cat] = (categoriesReturned[cat] || 0) + 1;
        });
      });

      // Similarity distribution
      const similarityDistribution = {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
      };
      calledLogs.forEach(l => {
        const sim = l.top_similarity || 0;
        if (sim > 0.7) similarityDistribution.excellent++;
        else if (sim > 0.5) similarityDistribution.good++;
        else if (sim > 0.3) similarityDistribution.fair++;
        else similarityDistribution.poor++;
      });

      // Recent logs (last 20)
      const recentLogs: RAGLogEntry[] = (logs?.slice(0, 20) || []).map(l => ({
        id: l.id,
        created_at: l.created_at,
        agent_id: l.agent_id,
        query_text: l.query_text,
        was_skipped: l.was_skipped ?? false,
        skip_reason: l.skip_reason,
        results_count: l.results_count || 0,
        top_similarity: l.top_similarity,
        categories_accessed: l.categories_accessed || [],
        response_time_ms: l.response_time_ms || 0,
        trigger_confidence: l.trigger_confidence,
        client_phone: l.client_phone,
      }));

      setStats({
        totalCalls,
        ragCalled,
        ragSkipped,
        callRate,
        avgTopSimilarity,
        avgResponseTime,
        skipReasons,
        categoriesReturned,
        similarityDistribution,
        recentLogs,
      });
    } catch (error: any) {
      console.error('Error fetching RAG health stats:', error);
      toast({
        title: 'Erro ao carregar estatísticas',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [period]);

  const getSimilarityColor = (similarity: number | null) => {
    if (!similarity) return 'text-muted-foreground';
    if (similarity > 0.7) return 'text-green-600';
    if (similarity > 0.5) return 'text-blue-600';
    if (similarity > 0.3) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHealthStatus = () => {
    if (!stats) return { status: 'unknown', color: 'bg-gray-500', label: 'Carregando' };
    
    // Good health: >60% call rate, >0.45 avg similarity, <500ms response
    if (stats.callRate > 60 && stats.avgTopSimilarity > 0.45 && stats.avgResponseTime < 500) {
      return { status: 'healthy', color: 'bg-green-500', label: 'Saudável' };
    }
    if (stats.callRate > 40 && stats.avgTopSimilarity > 0.35) {
      return { status: 'warning', color: 'bg-yellow-500', label: 'Atenção' };
    }
    return { status: 'critical', color: 'bg-red-500', label: 'Crítico' };
  };

  const healthStatus = getHealthStatus();

  return (
    <div className="space-y-4">
      {/* Header with Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${healthStatus.color} animate-pulse`} />
          <h3 className="text-lg font-semibold">RAG Health Check</h3>
          <Badge variant="outline">{healthStatus.label}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Última hora</SelectItem>
              <SelectItem value="24h">Últimas 24h</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.totalCalls || 0}</p>
                <p className="text-xs text-muted-foreground">Total de Consultas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Zap className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.callRate.toFixed(1) || 0}%</p>
                <p className="text-xs text-muted-foreground">Taxa de Chamada RAG</p>
              </div>
            </div>
            <Progress value={stats?.callRate || 0} className="mt-2 h-1.5" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Target className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{((stats?.avgTopSimilarity || 0) * 100).toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">Similaridade Média</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Clock className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{Math.round(stats?.avgResponseTime || 0)}ms</p>
                <p className="text-xs text-muted-foreground">Tempo Médio</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Panels */}
      <div className="grid grid-cols-3 gap-4">
        {/* Skip Reasons */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Ban className="h-4 w-4" />
              Motivos de Skip ({stats?.ragSkipped || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.skipReasons && Object.keys(stats.skipReasons).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(stats.skipReasons)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 6)
                  .map(([reason, count]) => {
                    const config = SKIP_REASON_LABELS[reason] || { label: reason, color: 'bg-gray-400' };
                    const percentage = ((count / stats.ragSkipped) * 100).toFixed(0);
                    return (
                      <div key={reason} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${config.color}`} />
                          <span className="truncate max-w-[140px]" title={config.label}>
                            {config.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{percentage}%</span>
                          <Badge variant="secondary" className="text-xs">{count}</Badge>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum skip registrado
              </p>
            )}
          </CardContent>
        </Card>

        {/* Similarity Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Distribuição de Similaridade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span>Excelente (&gt;70%)</span>
                </div>
                <Badge variant="secondary">{stats?.similarityDistribution?.excellent || 0}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>Bom (50-70%)</span>
                </div>
                <Badge variant="secondary">{stats?.similarityDistribution?.good || 0}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500" />
                  <span>Regular (30-50%)</span>
                </div>
                <Badge variant="secondary">{stats?.similarityDistribution?.fair || 0}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  <span>Baixo (&lt;30%)</span>
                </div>
                <Badge variant="secondary">{stats?.similarityDistribution?.poor || 0}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Categories Returned */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Categorias Retornadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.categoriesReturned && Object.keys(stats.categoriesReturned).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(stats.categoriesReturned)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 6)
                  .map(([category, count]) => (
                    <div key={category} className="flex items-center justify-between text-sm">
                      <span className="truncate max-w-[140px] capitalize" title={category}>
                        {category.replace(/_/g, ' ')}
                      </span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma categoria registrada
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Logs Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Últimas Consultas RAG
          </CardTitle>
          <CardDescription>
            {stats?.ragCalled || 0} chamadas / {stats?.ragSkipped || 0} skips no período
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {stats?.recentLogs.map((log) => (
                <div
                  key={log.id}
                  className={`p-3 rounded-lg border ${
                    log.was_skipped 
                      ? 'bg-muted/30 border-muted' 
                      : 'bg-background border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {log.was_skipped ? (
                          <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                        )}
                        <Badge variant="outline" className="text-xs">
                          {log.agent_id}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.created_at), "HH:mm:ss", { locale: ptBR })}
                        </span>
                        {log.client_phone && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {log.client_phone.slice(-4)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm truncate" title={log.query_text}>
                        {log.query_text?.substring(0, 80)}...
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {log.was_skipped ? (
                        <Badge variant="secondary" className="text-xs">
                          {SKIP_REASON_LABELS[log.skip_reason || '']?.label || log.skip_reason || 'Skip'}
                        </Badge>
                      ) : (
                        <div className="space-y-1">
                          <div className={`text-sm font-medium ${getSimilarityColor(log.top_similarity)}`}>
                            {log.top_similarity ? `${(log.top_similarity * 100).toFixed(0)}%` : '-'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {log.results_count} chunks
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {!log.was_skipped && log.categories_accessed?.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {log.categories_accessed.slice(0, 3).map((cat, i) => (
                        <Badge key={i} variant="outline" className="text-xs capitalize">
                          {cat}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {(!stats?.recentLogs || stats.recentLogs.length === 0) && (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma consulta registrada no período
                </p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
