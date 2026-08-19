import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Database, 
  FileText, 
  Upload, 
  RefreshCw, 
  Cloud, 
  Settings,
  Search,
  BookOpen,
  Users,
  BarChart3,
  CheckCircle,
  XCircle,
  Clock,
  Folder,
  ChevronRight,
  MessageSquare,
  Play,
  Activity
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RAGDocumentsList } from '@/components/rag/RAGDocumentsList';
import { RAGPermissionsMatrix } from '@/components/rag/RAGPermissionsMatrix';
import { RAGUploadDialog } from '@/components/rag/RAGUploadDialog';
import { RAGOneDriveConfig } from '@/components/rag/RAGOneDriveConfig';
import { RAGSearchTest } from '@/components/rag/RAGSearchTest';
import { RAGQualityAlerts } from '@/components/rag/RAGQualityAlerts';
import { RAGOneDriveBrowser } from '@/components/rag/RAGOneDriveBrowser';
import { RAGChunkSearch } from '@/components/rag/RAGChunkSearch';
import { RAGValidationDashboard } from '@/components/rag/RAGValidationDashboard';
import { RAGImpactAnalytics } from '@/components/rag/RAGImpactAnalytics';
import { RAGHealthCheck } from '@/components/rag/RAGHealthCheck';
import { RAGSyncMonitor } from '@/components/rag/RAGSyncMonitor';

interface RAGStats {
  total_documents: number;
  total_chunks: number;
  total_tokens: number;
  documents_by_category: Record<string, number>;
  documents_by_status: Record<string, number>;
  avg_chunks_per_doc: number;
  last_sync_at: string | null;
}

export default function RAGDashboard() {
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [processingScripts, setProcessingScripts] = useState(false);
  const [scriptProgress, setScriptProgress] = useState<{ processed: number; total: number; } | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const { toast } = useToast();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_rag_stats');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        const row = data[0];
        setStats({
          total_documents: row.total_documents,
          total_chunks: row.total_chunks,
          total_tokens: row.total_tokens,
          documents_by_category: (row.documents_by_category || {}) as Record<string, number>,
          documents_by_status: (row.documents_by_status || {}) as Record<string, number>,
          avg_chunks_per_doc: row.avg_chunks_per_doc,
          last_sync_at: row.last_sync_at,
        });
      }
    } catch (error: any) {
      console.error('Error fetching RAG stats:', error);
      toast({
        title: 'Erro ao carregar estatísticas',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      toast({
        title: 'Sincronização iniciada',
        description: 'Os documentos do OneDrive estão sendo sincronizados...'
      });

      const { data, error } = await supabase.functions.invoke('onedrive-sync', {
        body: { sync_type: 'incremental' }
      });

      if (error) throw error;

      toast({
        title: 'Sincronização concluída',
        description: `${data.stats?.added || 0} adicionados, ${data.stats?.updated || 0} atualizados`
      });

      fetchStats();
    } catch (error: any) {
      toast({
        title: 'Erro na sincronização',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSyncing(false);
    }
  };

  const processAllScripts = async () => {
    try {
      setProcessingScripts(true);
      setScriptProgress({ processed: 0, total: 446 });
      
      toast({
        title: 'Processando Scripts de Vendas',
        description: 'Iniciando indexação de todas as conversas reais...'
      });

      let totalProcessed = 0;
      let hasMore = true;
      let batchCount = 0;
      const maxBatches = 20; // Safety limit

      while (hasMore && batchCount < maxBatches) {
        batchCount++;
        
        const { data, error } = await supabase.functions.invoke('rag-conversation-processor', {
          body: { 
            folder_path: 'Consórcio INKA II/RAG COESA/Knowledge Base. Vendas/Scripts',
            max_conversations: 30,
            skip_existing: true,
            dry_run: false
          }
        });

        if (error) throw error;

        const stats = data?.stats || {};
        totalProcessed = stats.already_processed + stats.processed_this_batch;
        hasMore = stats.has_more;

        setScriptProgress({ 
          processed: totalProcessed, 
          total: stats.total_in_folder || 446 
        });

        console.log(`[Script Processing] Batch ${batchCount}: ${stats.processed_this_batch} processed, ${totalProcessed}/${stats.total_in_folder} total, hasMore=${hasMore}`);

        if (stats.processed_this_batch === 0 && !hasMore) {
          break;
        }

        // Small delay between batches
        if (hasMore) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      toast({
        title: 'Processamento Concluído!',
        description: `${totalProcessed} scripts de vendas indexados com sucesso.`
      });

      fetchStats();
    } catch (error: any) {
      console.error('Error processing scripts:', error);
      toast({
        title: 'Erro no processamento',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setProcessingScripts(false);
      setScriptProgress(null);
    }
  };

  const categoryColors: Record<string, string> = {
    vendas: 'bg-blue-500',
    sac: 'bg-green-500',
    cobranca: 'bg-orange-500',
    geral: 'bg-gray-500',
    treinamento: 'bg-purple-500',
    regulatorio: 'bg-red-500',
  };

  const statusIcons: Record<string, React.ReactNode> = {
    completed: <CheckCircle className="h-4 w-4 text-green-500" />,
    processing: <Clock className="h-4 w-4 text-yellow-500 animate-spin" />,
    pending: <Clock className="h-4 w-4 text-gray-400" />,
    failed: <XCircle className="h-4 w-4 text-red-500" />,
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-background">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Database className="h-6 w-6 text-primary" />
              RAG Knowledge Base
            </h1>
            <p className="text-sm text-muted-foreground">
              Base de conhecimento centralizada para todos os agentes
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="default" 
              size="sm" 
              onClick={processAllScripts}
              disabled={processingScripts}
              className="gap-2"
            >
              <MessageSquare className={`h-4 w-4 ${processingScripts ? 'animate-pulse' : ''}`} />
              {processingScripts 
                ? `Processando ${scriptProgress?.processed || 0}/${scriptProgress?.total || '...'}` 
                : 'Processar Scripts'
              }
            </Button>
            <RAGUploadDialog onUploadComplete={fetchStats} />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSync}
              disabled={syncing}
            >
              <Cloud className={`h-4 w-4 mr-2 ${syncing ? 'animate-pulse' : ''}`} />
              {syncing ? 'Sincronizando...' : 'Sync OneDrive'}
            </Button>
            <Button variant="ghost" size="sm" onClick={fetchStats} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-5 gap-4 p-4 border-b bg-muted/30">
          <Card className="p-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total_documents || 0}</p>
                <p className="text-xs text-muted-foreground">Documentos</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <BookOpen className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total_chunks || 0}</p>
                <p className="text-xs text-muted-foreground">Chunks</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <BarChart3 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{((stats?.total_tokens || 0) / 1000).toFixed(1)}K</p>
                <p className="text-xs text-muted-foreground">Tokens</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Users className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.avg_chunks_per_doc?.toFixed(1) || 0}</p>
                <p className="text-xs text-muted-foreground">Chunks/Doc</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Clock className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {stats?.last_sync_at 
                    ? new Date(stats.last_sync_at).toLocaleDateString('pt-BR', { 
                        day: '2-digit', 
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'Nunca'
                  }
                </p>
                <p className="text-xs text-muted-foreground">Último Sync</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="border-b px-4">
            <TabsList className="h-12">
              <TabsTrigger value="overview" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Visão Geral
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-2">
                <FileText className="h-4 w-4" />
                Documentos
              </TabsTrigger>
              <TabsTrigger value="permissions" className="gap-2">
                <Users className="h-4 w-4" />
                Permissões
              </TabsTrigger>
              <TabsTrigger value="search" className="gap-2">
                <Search className="h-4 w-4" />
                Testar Busca
              </TabsTrigger>
              <TabsTrigger value="validation" className="gap-2">
                <Play className="h-4 w-4" />
                Validação RAG
              </TabsTrigger>
              <TabsTrigger value="onedrive" className="gap-2">
                <Cloud className="h-4 w-4" />
                OneDrive
              </TabsTrigger>
              <TabsTrigger value="audit" className="gap-2">
                <Search className="h-4 w-4" />
                Auditoria
              </TabsTrigger>
              <TabsTrigger value="browse" className="gap-2">
                <Folder className="h-4 w-4" />
                Navegar
              </TabsTrigger>
              <TabsTrigger value="analytics" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </TabsTrigger>
              <TabsTrigger value="sync" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Sync Monitor
              </TabsTrigger>
              <TabsTrigger value="health" className="gap-2">
                <Activity className="h-4 w-4" />
                Health Check
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <TabsContent value="overview" className="mt-0 space-y-4">
              {/* Quality Alerts */}
              <RAGQualityAlerts onAlertResolved={fetchStats} />

              <div className="grid grid-cols-2 gap-4">
                {/* Documentos por Categoria */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Folder className="h-4 w-4" />
                      Documentos por Categoria
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {stats?.documents_by_category && Object.entries(stats.documents_by_category).map(([category, count]) => (
                      <div key={category} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${categoryColors[category] || 'bg-gray-400'}`} />
                          <span className="capitalize">{category}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={(count / (stats?.total_documents || 1)) * 100} 
                            className="w-24 h-2"
                          />
                          <span className="text-sm font-medium w-8 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                    {(!stats?.documents_by_category || Object.keys(stats.documents_by_category).length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum documento indexado ainda
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Documentos por Status */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Status de Processamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {stats?.documents_by_status && Object.entries(stats.documents_by_status).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {statusIcons[status] || <Clock className="h-4 w-4 text-muted-foreground" />}
                          <span className="capitalize">{status}</span>
                        </div>
                        <Badge variant={status === 'completed' ? 'default' : status === 'failed' ? 'destructive' : 'secondary'}>
                          {count}
                        </Badge>
                      </div>
                    ))}
                    {(!stats?.documents_by_status || Object.keys(stats.documents_by_status).length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum documento processado ainda
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Ações Rápidas</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-3">
                  <Button variant="outline" onClick={() => setActiveTab('documents')} className="gap-2">
                    <FileText className="h-4 w-4" />
                    Ver Documentos
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={() => setActiveTab('search')} className="gap-2">
                    <Search className="h-4 w-4" />
                    Testar Busca
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={() => setActiveTab('onedrive')} className="gap-2">
                    <Cloud className="h-4 w-4" />
                    Configurar OneDrive
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="mt-0">
              <RAGDocumentsList onRefresh={fetchStats} />
            </TabsContent>

            <TabsContent value="permissions" className="mt-0">
              <RAGPermissionsMatrix />
            </TabsContent>

            <TabsContent value="search" className="mt-0">
              <RAGSearchTest />
            </TabsContent>

            <TabsContent value="validation" className="mt-0">
              <RAGValidationDashboard />
            </TabsContent>

            <TabsContent value="onedrive" className="mt-0">
              <RAGOneDriveConfig onConfigSaved={fetchStats} />
            </TabsContent>

            <TabsContent value="audit" className="mt-0">
              <RAGChunkSearch />
            </TabsContent>

            <TabsContent value="browse" className="mt-0">
              <RAGOneDriveBrowser 
                onSyncFolder={(folderPath) => {
                  toast({
                    title: 'Sincronização iniciada',
                    description: `Sincronizando pasta: ${folderPath || 'Raiz'}`
                  });
                  supabase.functions.invoke('onedrive-sync', {
                    body: { sync_type: 'incremental', folder_path: folderPath }
                  }).then(() => {
                    toast({ title: 'Sincronização concluída' });
                    fetchStats();
                  }).catch((error) => {
                    toast({ 
                      title: 'Erro na sincronização', 
                      description: error.message,
                      variant: 'destructive'
                    });
                  });
                }}
              />
            </TabsContent>

            <TabsContent value="analytics" className="mt-0">
              <RAGImpactAnalytics />
            </TabsContent>

            <TabsContent value="sync" className="mt-0">
              <RAGSyncMonitor />
            </TabsContent>

            <TabsContent value="health" className="mt-0">
              <RAGHealthCheck />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </AppLayout>
  );
}
