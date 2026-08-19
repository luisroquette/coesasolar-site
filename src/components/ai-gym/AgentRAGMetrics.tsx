import { useState, useEffect } from 'react';
import { useUIConfig } from '@/hooks/useUIConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { 
  BookOpen, 
  Search, 
  FileText, 
  Clock, 
  TrendingUp,
  Zap,
  FolderOpen
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface RAGMetrics {
  total_queries: number;
  queries_with_results: number;
  avg_results_count: number;
  avg_similarity: number;
  avg_response_time_ms: number;
  total_tokens_used: number;
  top_categories: Record<string, number> | null;
  top_documents: Record<string, number> | null;
  queries_by_day: Record<string, number> | null;
}

interface Props {
  agentId: string;
  agentName: string;
}

export function AgentRAGMetrics({ agentId, agentName }: Props) {
  const { defaultPreviewLimit } = useUIConfig();
  const [metrics, setMetrics] = useState<RAGMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  useEffect(() => {
    fetchMetrics();
  }, [agentId, period]);

  const fetchMetrics = async () => {
    try {
      const { data, error } = await supabase.rpc('get_rag_agent_metrics', {
        p_agent_id: agentId,
        p_days: period
      });

      if (error) throw error;

      if (data && data.length > 0) {
        setMetrics(data[0] as RAGMetrics);
      } else {
        setMetrics({
          total_queries: 0,
          queries_with_results: 0,
          avg_results_count: 0,
          avg_similarity: 0,
          avg_response_time_ms: 0,
          total_tokens_used: 0,
          top_categories: null,
          top_documents: null,
          queries_by_day: null
        });
      }
    } catch (err) {
      console.error('Error fetching RAG metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const hitRate = metrics && metrics.total_queries > 0 
    ? ((metrics.queries_with_results / metrics.total_queries) * 100).toFixed(1)
    : '0';

  const chartData = metrics?.queries_by_day 
    ? Object.entries(metrics.queries_by_day)
        .map(([day, count]) => ({ day: day.slice(5), queries: count }))
        .reverse()
    : [];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Uso da Base de Conhecimento</h3>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map(days => (
            <Badge 
              key={days}
              variant={period === days ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setPeriod(days)}
            >
              {days}d
            </Badge>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Search className="h-4 w-4" />
              <span className="text-xs">Consultas</span>
            </div>
            <p className="text-2xl font-bold">{metrics?.total_queries || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">Taxa de Acerto</span>
            </div>
            <p className="text-2xl font-bold text-primary">{hitRate}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs">Tempo Médio</span>
            </div>
            <p className="text-2xl font-bold">
              {metrics?.avg_response_time_ms?.toFixed(0) || 0}
              <span className="text-sm font-normal text-muted-foreground">ms</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Zap className="h-4 w-4" />
              <span className="text-xs">Tokens Usados</span>
            </div>
            <p className="text-2xl font-bold">
              {((metrics?.total_tokens_used || 0) / 1000).toFixed(1)}k
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Similarity Score */}
      {metrics && metrics.avg_similarity > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Similaridade Média</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Progress 
                value={(metrics.avg_similarity || 0) * 100} 
                className="flex-1"
              />
              <span className="text-lg font-semibold">
                {((metrics.avg_similarity || 0) * 100).toFixed(1)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Quanto maior, mais relevantes são os documentos retornados
            </p>
          </CardContent>
        </Card>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Consultas por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="day" 
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="queries" 
                    stroke="hsl(var(--primary))" 
                    fill="hsl(var(--primary) / 0.2)"
                    name="Consultas"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Categories & Documents */}
      <div className="grid md:grid-cols-2 gap-4">
        {metrics?.top_categories && Object.keys(metrics.top_categories).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Categorias Mais Acessadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(metrics.top_categories)
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, defaultPreviewLimit)
                  .map(([category, count]) => (
                    <div key={category} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{category}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {metrics?.top_documents && Object.keys(metrics.top_documents).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documentos Mais Consultados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(metrics.top_documents)
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, defaultPreviewLimit)
                  .map(([doc, count]) => (
                    <div key={doc} className="flex items-center justify-between gap-2">
                      <span className="text-sm truncate flex-1" title={doc}>{doc}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Empty state */}
      {metrics?.total_queries === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h4 className="font-medium mb-2">Sem consultas registradas</h4>
            <p className="text-sm text-muted-foreground">
              {agentName} ainda não realizou consultas à base de conhecimento nos últimos {period} dias.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
