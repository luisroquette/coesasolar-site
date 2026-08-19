import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  RefreshCw, 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Loader2,
  FileText,
  Zap,
  Users,
  Rocket
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

interface QueueStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
  avg_process_time_ms: number;
  estimated_remaining_minutes: number;
}

interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  documents_scanned: number;
  documents_added: number;
  documents_failed: number;
  documents_skipped: number;
  error_message: string | null;
}

interface QueueItem {
  id: string;
  file_name: string;
  file_path: string;
  category: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  processed_at: string | null;
  worker_id: string | null;
}

interface ActiveWorker {
  worker_id: string;
  items_processing: number;
  last_activity: string;
}

export function RAGSyncMonitor() {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<SyncLog[]>([]);
  const [recentItems, setRecentItems] = useState<QueueItem[]>([]);
  const [activeWorkers, setActiveWorkers] = useState<ActiveWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [processingBatch, setProcessingBatch] = useState(false);
  const [maxConcurrency, setMaxConcurrency] = useState(3);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      // Fetch queue stats
      const { data: statsData, error: statsError } = await supabase
        .rpc('get_rag_sync_queue_stats', { p_sync_log_id: null });
      
      if (statsError) throw statsError;
      if (statsData && statsData.length > 0) {
        setStats(statsData[0] as QueueStats);
      }

      // Fetch active workers
      const { data: workersData } = await supabase
        .rpc('get_active_rag_workers');
      
      if (workersData) {
        setActiveWorkers(workersData as ActiveWorker[]);
      }

      // Fetch concurrency config
      const { data: configData } = await supabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', 'rag_sync_worker_concurrency')
        .maybeSingle();
      
      if (configData?.valor) {
        setMaxConcurrency(parseInt(configData.valor, 10));
      }

      // Fetch recent sync logs
      const { data: logsData } = await supabase
        .from('rag_sync_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(5);
      
      if (logsData) {
        setRecentLogs(logsData as SyncLog[]);
      }

      // Fetch recent queue items
      const { data: itemsData } = await supabase
        .from('rag_sync_queue')
        .select('id, file_name, file_path, category, status, attempts, last_error, created_at, processed_at, worker_id')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (itemsData) {
        setRecentItems(itemsData as QueueItem[]);
      }

    } catch (error: any) {
      console.error('Error fetching sync data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('rag_sync_queue_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rag_sync_queue' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    // Polling as backup
    const interval = setInterval(fetchData, 5000);

    return () => {
      channel.unsubscribe();
      clearInterval(interval);
    };
  }, [fetchData]);

  const startDiscoverySync = async () => {
    try {
      setSyncing(true);
      toast({
        title: 'Iniciando descoberta de arquivos',
        description: 'Listando arquivos do OneDrive e enfileirando para processamento...'
      });

      const { data, error } = await supabase.functions.invoke('onedrive-sync', {
        body: { sync_type: 'incremental', discovery_mode: true }
      });

      if (error) throw error;

      toast({
        title: 'Descoberta concluída',
        description: `${data.queued_count || 0} arquivos enfileirados para processamento`
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: 'Erro na descoberta',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSyncing(false);
    }
  };

  const triggerBatchProcessing = async () => {
    try {
      setProcessingBatch(true);
      toast({
        title: 'Processamento iniciado',
        description: 'Processando próximo lote de arquivos...'
      });

      const { data, error } = await supabase.functions.invoke('rag-batch-processor', {
        body: { batch_size: 10, continue_chain: true }
      });

      if (error) throw error;

      toast({
        title: 'Lote processado',
        description: `${data.stats?.processed || 0} arquivos processados, ${data.stats?.remaining || 0} restantes`
      });

      fetchData();
    } catch (error: any) {
      toast({
        title: 'Erro no processamento',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setProcessingBatch(false);
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-success" />;
      case 'processing': return <Loader2 className="h-4 w-4 text-info animate-spin" />;
      case 'pending': return <Clock className="h-4 w-4 text-warning" />;
      case 'failed': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'skipped': return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
      case 'timeout': return <AlertTriangle className="h-4 w-4 text-warning" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const progressPercentage = stats 
    ? ((stats.completed + stats.skipped + stats.failed) / Math.max(stats.total, 1)) * 100 
    : 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">{stats?.total || 0}</p>
              <p className="text-xs text-muted-foreground">Total na Fila</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-warning" />
            <div>
              <p className="text-2xl font-bold">{stats?.pending || 0}</p>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 text-info animate-spin" />
            <div>
              <p className="text-2xl font-bold">{stats?.processing || 0}</p>
              <p className="text-xs text-muted-foreground">Processando</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-success" />
            <div>
              <p className="text-2xl font-bold">{stats?.completed || 0}</p>
              <p className="text-xs text-muted-foreground">Completos</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-2xl font-bold">{stats?.failed || 0}</p>
              <p className="text-xs text-muted-foreground">Falhas</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-accent-foreground" />
            <div>
              <p className="text-2xl font-bold">{activeWorkers.length}/{maxConcurrency}</p>
              <p className="text-xs text-muted-foreground">Workers Ativos</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">{((stats?.avg_process_time_ms || 0) / 1000).toFixed(1)}s</p>
              <p className="text-xs text-muted-foreground">Média/Arquivo</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Progress Bar + Workers Status */}
      {stats && stats.total > 0 && (
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Progresso do Sync</span>
              <span className="font-bold">{progressPercentage.toFixed(1)}%</span>
            </div>
            <Progress value={progressPercentage} className="h-3" />
            <div className="flex justify-between items-center">
              {stats.estimated_remaining_minutes > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Tempo estimado: <span className="font-medium">{stats.estimated_remaining_minutes.toFixed(0)} min</span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Calculando tempo estimado...</p>
              )}
              {activeWorkers.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Workers:</span>
                  {activeWorkers.map((w, i) => (
                    <Badge key={w.worker_id} variant="secondary" className="text-xs">
                      #{i + 1}: {w.items_processing} itens
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="h-4 w-4" />
            Ações
          </CardTitle>
          <CardDescription>Controle manual do processo de sincronização com suporte a processamento paralelo</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button 
            onClick={startDiscoverySync} 
            disabled={syncing}
            className="gap-2"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {syncing ? 'Descobrindo...' : 'Iniciar Discovery'}
          </Button>
          <Button 
            onClick={triggerBatchProcessing} 
            disabled={processingBatch || (stats?.pending || 0) === 0}
            variant="secondary"
            className="gap-2"
          >
            {processingBatch ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {processingBatch ? 'Iniciando...' : `Processar (até ${maxConcurrency} workers)`}
          </Button>
          <Button 
            onClick={fetchData} 
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </CardContent>
      </Card>

      {/* Recent Sync Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Syncs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Iniciado</TableHead>
                <TableHead>Escaneados</TableHead>
                <TableHead>Adicionados</TableHead>
                <TableHead>Falhas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {statusIcon(log.status)}
                      <Badge variant={
                        log.status === 'completed' ? 'default' : 
                        log.status === 'failed' || log.status === 'timeout' ? 'destructive' : 
                        'secondary'
                      }>
                        {log.status}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>{log.sync_type}</TableCell>
                  <TableCell>
                    {new Date(log.started_at).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </TableCell>
                  <TableCell>{log.documents_scanned || 0}</TableCell>
                  <TableCell>{log.documents_added || 0}</TableCell>
                  <TableCell>{log.documents_failed || 0}</TableCell>
                </TableRow>
              ))}
              {recentLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-4">
                    Nenhum sync registrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Queue Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Itens Recentes na Fila</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Arquivo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {statusIcon(item.status)}
                      <span className="capitalize">{item.status}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={item.file_path}>
                    {item.file_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.category}</Badge>
                  </TableCell>
                  <TableCell>{item.attempts}/3</TableCell>
                  <TableCell className="max-w-[200px] truncate text-destructive" title={item.last_error || ''}>
                    {item.last_error || '-'}
                  </TableCell>
                </TableRow>
              ))}
              {recentItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                    Nenhum item na fila
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
