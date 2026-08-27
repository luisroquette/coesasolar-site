import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ArrowLeft,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  FileJson,
  FolderArchive,
  GitBranch,
  History,
  Info,
  Link2,
  MessageSquare,
  Pause,
  Phone,
  Play,
  Puzzle,
  RefreshCw,
  Route,
  Save,
  Shield,
  Sparkles,
  TestTube,
  User,
  Volume2,
  Wifi,
  WifiOff,
  Wrench,
  AlertTriangle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import JSZip from 'jszip';

// Sofia-specific components
import { useSofiaWhatsAppStatus } from '@/hooks/useSofiaWhatsAppStatus';
import { SofiaMetrics } from '@/components/whatsapp/SofiaMetrics';
import { NudgeConfig } from '@/components/whatsapp/NudgeConfig';
import { NudgeMetrics } from '@/components/whatsapp/NudgeMetrics';
import { SofiaCapabilitiesConfig } from '@/components/whatsapp/SofiaCapabilitiesConfig';
import { SofiaAudioConfig } from '@/components/whatsapp/SofiaAudioConfig';
import { ElevenLabsFallbackAlert } from '@/components/whatsapp/ElevenLabsFallbackAlert';
import { StuckLeadsRescueConfig } from '@/components/whatsapp/StuckLeadsRescueConfig';

// Agent editor components
import { CollectionRulesEditor } from '@/components/ai-gym/CollectionRulesEditor';
import { AgentSimulator } from '@/components/ai-gym/AgentSimulator';
import { AgentTestRunner } from '@/components/ai-gym/AgentTestRunner';
import { AgentMetrics } from '@/components/ai-gym/AgentMetrics';
import { AgentVersionHistory } from '@/components/ai-gym/AgentVersionHistory';
import { KnowledgeBaseManager } from '@/components/ai-gym/KnowledgeBaseManager';
import { VoiceModeConfig } from '@/components/ai-gym/VoiceModeConfig';
import { AgentToolsManager, ToolConfig } from '@/components/ai-gym/AgentToolsManager';
import { AgentFlowsInsights } from '@/components/ai-gym/AgentFlowsInsights';
import { ZApiIntegrationDocs } from '@/components/ai-gym/ZApiIntegrationDocs';
import { ZApiCredentialsConfig } from '@/components/ai-gym/ZApiCredentialsConfig';
import { AgentTriageConfig, TriageConfig } from '@/components/ai-gym/AgentTriageConfig';
import { LLMModelSelector } from '@/components/ai-gym/LLMModelSelector';
import { AgentSecretsManager } from '@/components/ai-gym/AgentSecretsManager';
import { AgentRAGMetrics } from '@/components/ai-gym/AgentRAGMetrics';
import { AgentDetectionPatterns } from '@/components/ai-gym/AgentDetectionPatterns';
import { PromptModulesEditor } from '@/components/ai-gym/PromptModulesEditor';
import { AgentCatalogsEditor } from '@/components/ai-gym/AgentCatalogsEditor';

interface AIAgent {
  id: string;
  agent_id: string;
  name: string;
  role: string;
  status: string;
  avatar_emoji: string | null;
  description: string | null;
  version: string;
  channels: string[];
  persona: any;
  guardrails: any;
  tools_config: any;
  intents: any;
  kb_sources: any;
  collection_rules: any;
  triage_config: any;
  metrics: any;
  tests: any;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  bitrix24_user_id: string | null;
}

const agentConfig: Record<string, { 
  color: string; 
  icon: string;
  statusKey?: string;
}> = {
  sofia: { 
    color: 'green', 
    icon: '🤖',
    statusKey: 'sofia_whatsapp_enabled'
  },
  maria: { 
    color: 'blue', 
    icon: '👩‍💼',
    statusKey: 'maria_whatsapp_enabled'
  },
  julia: { 
    color: 'purple', 
    icon: '💼',
    statusKey: 'julia_whatsapp_enabled'
  },
};

export default function AgentSettings() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [agent, setAgent] = useState<AIAgent | null>(null);
  const [editedAgent, setEditedAgent] = useState<AIAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [kbSaving, setKbSaving] = useState(false);
  const kbSaveTimerRef = useRef<number | null>(null);
  const [versionKey, setVersionKey] = useState(0);
  const [activeTab, setActiveTab] = useState('brain');
  
  // Sofia-specific hooks (only used when agentId is 'sofia')
  const sofiaStatus = useSofiaWhatsAppStatus();
  
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<boolean | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const config = agentId ? agentConfig[agentId] || { color: 'gray', icon: '🤖' } : { color: 'gray', icon: '🤖' };

  const fetchAgent = useCallback(async () => {
    if (!agentId) return;
    
    try {
      const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .eq('agent_id', agentId)
        .single();

      if (error) throw error;
      // Normalize the data to include triage_config
      const normalizedData = {
        ...data,
        triage_config: (data as any).triage_config || null,
      };
      setAgent(normalizedData as AIAgent);
      setEditedAgent(normalizedData as AIAgent);
    } catch (error) {
      console.error('Erro ao buscar agente:', error);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  useEffect(() => {
    return () => {
      if (kbSaveTimerRef.current) {
        window.clearTimeout(kbSaveTimerRef.current);
      }
    };
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (agentId === 'sofia') {
        sofiaStatus.refresh();
      }
      setLastRefresh(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [agentId, sofiaStatus.refresh]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchAgent();
    if (agentId === 'sofia') {
      await sofiaStatus.refresh();
    }
    setLastRefresh(new Date());
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleToggle = (newValue: boolean) => {
    if (!newValue) {
      setPendingAction(false);
      setShowConfirmDialog(true);
    } else {
      if (agentId === 'sofia') {
        sofiaStatus.setEnabled(true);
      }
    }
  };

  const confirmAction = () => {
    if (pendingAction !== null && agentId === 'sofia') {
      sofiaStatus.setEnabled(pendingAction);
    }
    setShowConfirmDialog(false);
    setPendingAction(null);
  };

  const persistKbSources = async (sources: unknown) => {
    if (!agent) return;
    try {
      setKbSaving(true);
      const { error } = await supabase
        .from('ai_agents')
        .update({ kb_sources: sources as any })
        .eq('id', agent.id);

      if (error) throw error;
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar KB',
        description: error.message || 'Não foi possível salvar as mudanças da base de conhecimento.',
        variant: 'destructive',
      });
    } finally {
      setKbSaving(false);
    }
  };

  const handleSave = async () => {
    if (!editedAgent || !agent) return;
    
    try {
      setSaving(true);
      
      const { error } = await supabase
        .from('ai_agents')
        .update({
          description: editedAgent.description,
          persona: editedAgent.persona,
          guardrails: editedAgent.guardrails,
          tools_config: editedAgent.tools_config,
          intents: editedAgent.intents,
          kb_sources: editedAgent.kb_sources,
          collection_rules: editedAgent.collection_rules,
          tests: editedAgent.tests,
          bitrix24_user_id: editedAgent.bitrix24_user_id
        })
        .eq('id', agent.id);

      if (error) throw error;

      toast({
        title: 'Salvo com sucesso',
        description: `Configurações de ${agent.name} atualizadas.`
      });
      
      setAgent(editedAgent);
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadBrain = async () => {
    if (!agent) return;
    
    try {
      const brain = {
        agent_id: agent.agent_id,
        name: agent.name,
        role: agent.role,
        version: agent.version,
        channels: agent.channels,
        tone: agent.persona?.tone,
        style: agent.persona?.style,
        personality: agent.persona?.personality,
        guardrails: agent.guardrails,
        tools: agent.tools_config,
        intents: agent.intents,
        kb: { sources: agent.kb_sources },
        collection_rules: agent.collection_rules,
        exported_at: new Date().toISOString(),
        exported_by: 'ai_gym'
      };

      const blob = new Blob([JSON.stringify(brain, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${agent.agent_id}-brain-v${agent.version}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Download concluído',
        description: `Cérebro de ${agent.name} v${agent.version} exportado com sucesso.`
      });
    } catch (error: any) {
      toast({
        title: 'Erro no download',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleDownloadComplete = async () => {
    if (!agent) return;
    
    try {
      toast({
        title: 'Preparando download...',
        description: 'Gerando pacote completo do agente.'
      });

      const response = await supabase.functions.invoke('agent-source-export', {
        body: { agent_id: agent.agent_id }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao exportar dados do agente');
      }

      const exportData = response.data;
      
      const zip = new JSZip();
      
      const brainData = {
        agent_id: agent.agent_id,
        name: agent.name,
        version: agent.version,
        role: agent.role,
        description: agent.description,
        avatar_emoji: agent.avatar_emoji,
        channels: agent.channels,
        status: agent.status,
        persona: agent.persona,
        guardrails: agent.guardrails,
        tools_config: agent.tools_config,
        intents: agent.intents,
        kb_sources: agent.kb_sources,
        collection_rules: agent.collection_rules,
        tests: agent.tests,
        metrics: agent.metrics,
        exported_at: new Date().toISOString()
      };
      
      zip.file('brain.json', JSON.stringify(brainData, null, 2));
      
      if (exportData?.files) {
        if (exportData.files['README.md']) {
          zip.file('README.md', exportData.files['README.md']);
        }
        if (exportData.files['source/webhook.ts']) {
          zip.folder('source')?.file('webhook.ts', exportData.files['source/webhook.ts']);
        }
        if (exportData.files['prompts/system-prompt.md']) {
          zip.folder('prompts')?.file('system-prompt.md', exportData.files['prompts/system-prompt.md']);
        }
        if (exportData.files['config/capabilities.json']) {
          zip.folder('config')?.file('capabilities.json', exportData.files['config/capabilities.json']);
        }
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${agent.agent_id}-brain-v${agent.version}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Download concluído!',
        description: `Pacote completo de ${agent.name} baixado.`
      });
    } catch (error: any) {
      console.error('Error downloading complete package:', error);
      toast({
        title: 'Erro no download',
        description: error.message || 'Não foi possível gerar o pacote completo.',
        variant: 'destructive'
      });
    }
  };

  const handleTestsUpdate = (tests: any[]) => {
    if (!editedAgent) return;
    setEditedAgent(prev => prev ? { ...prev, tests } : null);
  };

  const updatePersona = (key: string, value: any) => {
    if (!editedAgent) return;
    setEditedAgent(prev => prev ? {
      ...prev,
      persona: { ...prev.persona, [key]: value }
    } : null);
  };

  const updateGuardrails = (key: string, value: any) => {
    if (!editedAgent) return;
    setEditedAgent(prev => prev ? {
      ...prev,
      guardrails: { ...prev.guardrails, [key]: value }
    } : null);
  };

  const enabled = agentId === 'sofia' ? sofiaStatus.enabled : false;
  const statusLoading = agentId === 'sofia' ? sofiaStatus.loading : false;
  const updating = agentId === 'sofia' ? sofiaStatus.updating : false;
  const isSofia = agentId === 'sofia';

  if (loading) {
    return (
      <AppLayout>
        <div className="container mx-auto py-6 px-4 max-w-5xl">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-32 w-full mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!agent || !editedAgent) {
    return (
      <AppLayout>
        <div className="container mx-auto py-6 px-4 max-w-5xl">
          <div className="text-center py-12">
            <Bot className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Agente não encontrado</h2>
            <p className="text-muted-foreground mb-4">O agente "{agentId}" não existe no sistema.</p>
            <Button onClick={() => navigate('/ai-gym')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para AI Gym
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="container mx-auto py-6 px-4 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/ai-gym')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className={cn(
              "p-2 rounded-lg",
              config.color === 'green' && "bg-green-500/10",
              config.color === 'blue' && "bg-blue-500/10",
              config.color === 'purple' && "bg-purple-500/10",
              config.color === 'gray' && "bg-muted"
            )}>
              <span className="text-2xl">{agent.avatar_emoji || config.icon}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{agent.name}</h1>
                <Badge variant="outline" className="text-xs">v{agent.version}</Badge>
                <Badge variant={agent.status === 'active' ? 'default' : 'secondary'}>
                  {agent.status}
                </Badge>
              </div>
              <p className="text-muted-foreground">{agent.role}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleManualRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
              Atualizar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDownloadBrain}>
                  <FileJson className="h-4 w-4 mr-2" />
                  Cérebro (JSON)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadComplete}>
                  <FolderArchive className="h-4 w-4 mr-2" />
                  Pacote Completo (ZIP)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={handleSave} disabled={saving} size="sm">
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>

        {/* Sofia ElevenLabs Alert */}
        {isSofia && <ElevenLabsFallbackAlert />}

        {/* Sofia Heartbeat Status Card */}
        {isSofia && (
          <Card className={cn(
            "mb-6 border-2 transition-all duration-300",
            enabled ? "border-green-500/50 bg-green-500/5" : "border-destructive/50 bg-destructive/5"
          )}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center",
                      enabled ? "bg-green-500" : "bg-destructive"
                    )}>
                      {statusLoading ? (
                        <Skeleton className="w-6 h-6 rounded-full" />
                      ) : enabled ? (
                        <Wifi className="h-6 w-6 text-white" />
                      ) : (
                        <WifiOff className="h-6 w-6 text-white" />
                      )}
                    </div>
                    {enabled && !statusLoading && (
                      <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-30" />
                    )}
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold">
                        {statusLoading ? <Skeleton className="h-6 w-24" /> : (enabled ? 'Online' : 'Offline')}
                      </h2>
                      {!statusLoading && (
                        <Badge 
                          variant={enabled ? 'default' : 'destructive'}
                          className={cn("text-xs", enabled && "bg-green-500 hover:bg-green-600")}
                        >
                          {enabled ? 'ATIVA' : 'PAUSADA'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Última verificação: {lastRefresh.toLocaleTimeString('pt-BR')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {statusLoading ? (
                    <Skeleton className="h-6 w-11" />
                  ) : (
                    <Switch
                      checked={enabled}
                      onCheckedChange={handleToggle}
                      disabled={updating}
                      className="data-[state=checked]:bg-green-500"
                    />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isSofia && !enabled && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Atendimento Pausado</AlertTitle>
            <AlertDescription>
              As mensagens recebidas no WhatsApp estão sendo registradas, mas a sofIA não está 
              respondendo automaticamente. Ative o switch acima para reativar.
            </AlertDescription>
          </Alert>
        )}

        {/* Unified Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex flex-wrap gap-1 h-auto p-1">
            <TabsTrigger value="brain" className="flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Cérebro</span>
            </TabsTrigger>
            <TabsTrigger value="prompts" className="flex items-center gap-1">
              <Puzzle className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Prompts</span>
            </TabsTrigger>
            <TabsTrigger value="kb" className="flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">KB</span>
            </TabsTrigger>
            <TabsTrigger value="voice" className="flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Voz</span>
            </TabsTrigger>
            {isSofia && (
              <TabsTrigger value="nudges" className="flex items-center gap-1">
                <Bell className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Nudges</span>
              </TabsTrigger>
            )}
            {isSofia && (
              <TabsTrigger value="patterns" className="flex items-center gap-1">
                <Wrench className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Patterns</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="integration" className="flex items-center gap-1">
              <Link2 className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Integração</span>
            </TabsTrigger>
            <TabsTrigger value="catalogs" className="flex items-center gap-1">
              <Database className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Catálogos</span>
            </TabsTrigger>
            <TabsTrigger value="tests" className="flex items-center gap-1">
              <TestTube className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Testes</span>
            </TabsTrigger>
            <TabsTrigger value="versions" className="flex items-center gap-1">
              <History className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Versões</span>
            </TabsTrigger>
            <TabsTrigger value="metrics" className="flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Métricas</span>
            </TabsTrigger>
          </TabsList>

          {/* Brain Tab - Unified with Accordion Sections */}
          <TabsContent value="brain" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Configuração do Cérebro
                </CardTitle>
                <CardDescription>
                  Status, identidade, políticas e ferramentas de {agent.name}.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Accordion type="multiple" defaultValue={isSofia ? ["status", "identity"] : ["identity"]} className="w-full">
                  {/* Status Section - Sofia Only */}
                  {isSofia && (
                    <AccordionItem value="status">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4 text-muted-foreground" />
                          <span>Status e Controle</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-4 pt-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="p-4 border rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <Play className="h-4 w-4 text-green-500" />
                              <span className="font-medium text-green-600">Quando Ativa</span>
                            </div>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              <li>• Responde automaticamente às mensagens</li>
                              <li>• Qualifica leads e coleta informações</li>
                              <li>• Envia follow-ups e nudges programados</li>
                              <li>• Registra conversas no sistema</li>
                            </ul>
                          </div>
                          <div className="p-4 border rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <Pause className="h-4 w-4 text-destructive" />
                              <span className="font-medium text-destructive">Quando Pausada</span>
                            </div>
                            <ul className="text-sm text-muted-foreground space-y-1">
                              <li>• Mensagens são registradas no sistema</li>
                              <li>• Nenhuma resposta automática é enviada</li>
                              <li>• Follow-ups e nudges são suspendos</li>
                              <li>• Atendimento manual necessário</li>
                            </ul>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 pt-2">
                          <Button 
                            variant={enabled ? 'destructive' : 'default'}
                            size="sm"
                            onClick={() => handleToggle(!enabled)}
                            disabled={statusLoading || updating}
                            className={!enabled ? 'bg-green-500 hover:bg-green-600' : ''}
                          >
                            {enabled ? (
                              <>
                                <Pause className="h-4 w-4 mr-2" />
                                Pausar Atendimento
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4 mr-2" />
                                Reativar Atendimento
                              </>
                            )}
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Identity Section */}
                  <AccordionItem value="identity">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>Identidade e Personalidade</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      {/* LLM Model Selector */}
                      <div className="p-4 border rounded-lg bg-muted/30">
                        <LLMModelSelector
                          value={editedAgent.persona?.llm_model || 'google/gemini-3-flash-preview'}
                          onChange={(model) => updatePersona('llm_model', model)}
                          customConfig={{
                            provider: editedAgent.persona?.llm_custom_provider,
                            baseUrl: editedAgent.persona?.llm_custom_base_url,
                            modelId: editedAgent.persona?.llm_custom_model_id,
                            apiKeyConfigured: editedAgent.persona?.llm_api_key_configured,
                          }}
                          onCustomConfigChange={(config) => {
                            setEditedAgent(prev => prev ? {
                              ...prev,
                              persona: {
                                ...prev.persona,
                                llm_custom_provider: config.provider,
                                llm_custom_base_url: config.baseUrl,
                                llm_custom_model_id: config.modelId,
                              }
                            } : null);
                          }}
                          onApiKeyRequest={async (provider) => {
                            // Show toast with instructions for adding the API key
                            const secretName = ['openai-direct', 'deepseek'].includes(provider)
                              ? 'OPENROUTER_API_KEY'
                              : `${provider.toUpperCase().replace('-', '_')}_API_KEY`;
                            toast({
                              title: 'Configurar API Key',
                              description: (
                                <div className="space-y-2">
                                  <p>Para usar o provedor <strong>{provider}</strong>, adicione a secret:</p>
                                  <code className="block bg-muted p-2 rounded text-sm">{secretName}</code>
                                  <p className="text-xs text-muted-foreground">
                                    Vá em Configurações → Cloud → Secrets e adicione esta chave.
                                    Após adicionar, salve as configurações do agente.
                                  </p>
                                </div>
                              ),
                              duration: 10000,
                            });
                          }}
                        />
                        
                        {/* Info about native vs custom models */}
                        <div className="mt-3 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                          <p>
                            <strong>💡 Dica:</strong> Modelos nativos (Google/OpenAI via Lovable AI) 
                            não precisam de API key — o custo é cobrado diretamente na sua conta Lovable.
                            Modelos externos (Claude, Groq, etc.) requerem sua própria API key.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Descrição</Label>
                        <Textarea
                          value={editedAgent.description || ''}
                          onChange={(e) => setEditedAgent(prev => prev ? { ...prev, description: e.target.value } : null)}
                          placeholder="Descreva o papel e objetivo deste agente..."
                          rows={3}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Tom Padrão</Label>
                          <Input
                            value={editedAgent.persona?.tone?.default || ''}
                            onChange={(e) => updatePersona('tone', { ...editedAgent.persona?.tone, default: e.target.value })}
                            placeholder="ex: consultivo_direto"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Tons Permitidos (separados por vírgula)</Label>
                          <Input
                            value={editedAgent.persona?.tone?.allowed?.join(', ') || ''}
                            onChange={(e) => updatePersona('tone', { 
                              ...editedAgent.persona?.tone, 
                              allowed: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                            })}
                            placeholder="empatico, tecnico, persuasivo"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Estilo de Comunicação</Label>
                        <Textarea
                          value={editedAgent.persona?.style || ''}
                          onChange={(e) => updatePersona('style', e.target.value)}
                          placeholder="Como o agente deve se comunicar..."
                          rows={2}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Personalidade</Label>
                        <Textarea
                          value={editedAgent.persona?.personality || ''}
                          onChange={(e) => updatePersona('personality', e.target.value)}
                          placeholder="Traços de personalidade do agente..."
                          rows={2}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Policies Section */}
                  <AccordionItem value="policies">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span>Guardrails e Políticas</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>O que NUNCA fazer (um por linha)</Label>
                        <Textarea
                          value={editedAgent.guardrails?.never_do?.join('\n') || ''}
                          onChange={(e) => updateGuardrails('never_do', e.target.value.split('\n'))}
                          onBlur={(e) => updateGuardrails('never_do', e.target.value.split('\n').filter(Boolean))}
                          placeholder="inventar dados&#10;prometer descontos não autorizados&#10;expor dados pessoais"
                          rows={5}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Gatilhos de Escalação (um por linha)</Label>
                        <Textarea
                          value={editedAgent.guardrails?.handoff_triggers?.join('\n') || ''}
                          onChange={(e) => updateGuardrails('handoff_triggers', e.target.value.split('\n'))}
                          onBlur={(e) => updateGuardrails('handoff_triggers', e.target.value.split('\n').filter(Boolean))}
                          placeholder="suspeita_fraude&#10;reclamacao_grave&#10;falha_tool"
                          rows={5}
                        />
                      </div>

                      {/* Supervisor Configuration */}
                      <div className="pt-4 border-t space-y-4">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-blue-500" />
                          <Label className="text-base font-medium">Configuração de Escalação</Label>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Configure o supervisor que será notificado quando o agente precisar de ajuda humana.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Nome do Supervisor</Label>
                            <Input
                              value={editedAgent.guardrails?.supervisor_nome || ''}
                              onChange={(e) => updateGuardrails('supervisor_nome', e.target.value)}
                              placeholder="ex: Chris, Maria..."
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>WhatsApp do Supervisor</Label>
                            <Input
                              value={editedAgent.guardrails?.supervisor_telefone || ''}
                              onChange={(e) => updateGuardrails('supervisor_telefone', e.target.value)}
                              placeholder="ex: 5531991234567 (com DDI e DDD)"
                            />
                            <p className="text-xs text-muted-foreground">
                              Formato: DDI + DDD + Número (ex: 5531991234567)
                            </p>
                          </div>
                        </div>
                        
                        <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                          <p className="text-sm font-medium">Como funciona:</p>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            <li>• Quando o agente detectar necessidade de escalação, ele enviará uma mensagem <strong>diretamente ao supervisor</strong></li>
                            <li>• O supervisor receberá: "Preciso de ajuda na conversa com número X. Você está online?"</li>
                            <li>• O supervisor deve usar <code className="bg-muted px-1 rounded">#ASSUMIR</code> na conversa do cliente para tomar controle</li>
                          </ul>
                        </div>
                      </div>

                      {agent.role === 'collections' && (
                        <div className="pt-4 border-t">
                          <CollectionRulesEditor
                            rules={editedAgent.collection_rules}
                            onChange={(rules) => setEditedAgent(prev => prev ? { ...prev, collection_rules: rules } : null)}
                          />
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  {/* CRM Integration Section */}
                  <AccordionItem value="crm-integration">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-muted-foreground" />
                        <span>Integração CRM (Bitrix24)</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>ID do Usuário no Bitrix24</Label>
                        <Input
                          value={editedAgent.bitrix24_user_id || ''}
                          onChange={(e) => setEditedAgent(prev => prev ? { ...prev, bitrix24_user_id: e.target.value } : null)}
                          placeholder="ex: 123"
                        />
                        <p className="text-xs text-muted-foreground">
                          ID do usuário/atendente no Bitrix24 que representa este agente.
                          Este ID será usado para atribuir todas as atividades e movimentações no CRM.
                        </p>
                      </div>
                      
                      <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                        <p className="text-sm font-medium">Como obter o ID:</p>
                        <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                          <li>Acesse o Bitrix24 e vá em <strong>Funcionários</strong></li>
                          <li>Clique no perfil do usuário criado para o agente</li>
                          <li>O ID estará na URL: <code className="bg-muted px-1 rounded">company/personal/user/<strong>123</strong>/</code></li>
                        </ol>
                      </div>

                      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-2">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <Info className="h-4 w-4 text-blue-500" />
                          Como funciona:
                        </p>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          <li>• <strong>Atividades:</strong> Ligações, tarefas e comentários serão criados em nome deste usuário</li>
                          <li>• <strong>Responsável:</strong> Leads e negócios criados pelo agente terão este usuário como responsável</li>
                          <li>• <strong>Timeline:</strong> Todas as movimentações aparecerão com o nome do agente no histórico</li>
                        </ul>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="flows">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-muted-foreground" />
                        <span>Fluxos Aprendidos (ML)</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <AgentFlowsInsights agentId={agent.id} />
                    </AccordionContent>
                  </AccordionItem>

                  {/* Capabilities Section */}
                  <AccordionItem value="capabilities">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Volume2 className="h-4 w-4 text-muted-foreground" />
                        <span>Capacidades e Ferramentas</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4 space-y-6">
                      {isSofia && (
                        <>
                          <SofiaCapabilitiesConfig />
                          <StuckLeadsRescueConfig />
                          <SofiaAudioConfig />
                        </>
                      )}
                      <AgentToolsManager
                        tools={(editedAgent.tools_config || []) as ToolConfig[]}
                        onChange={(tools) => setEditedAgent(prev => prev ? { ...prev, tools_config: tools } : null)}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* Triage Section */}
                  <AccordionItem value="triage">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Route className="h-4 w-4 text-muted-foreground" />
                        <span>Triagem e Redirecionamento</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <AgentTriageConfig
                        config={editedAgent.triage_config as TriageConfig | null}
                        onChange={(triageConfig) => setEditedAgent(prev => prev ? { ...prev, triage_config: triageConfig } : null)}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Prompt Modules Tab */}
          <TabsContent value="prompts" className="space-y-4">
            <Card>
              <CardContent className="p-6">
                <PromptModulesEditor 
                  agentId={agent.id} 
                  agentName={agent.name} 
                />
              </CardContent>
            </Card>
          </TabsContent>


          {/* KB Tab */}
          <TabsContent value="kb" className="space-y-4">
            <KnowledgeBaseManager
              sources={editedAgent.kb_sources || []}
              onChange={(sources) => {
                setEditedAgent((prev) => prev ? { ...prev, kb_sources: sources } : null);

                if (kbSaveTimerRef.current) {
                  window.clearTimeout(kbSaveTimerRef.current);
                }

                kbSaveTimerRef.current = window.setTimeout(() => {
                  persistKbSources(sources);
                }, 300);
              }}
              agentName={agent.name}
            />
          </TabsContent>

          {/* Voice Tab */}
          <TabsContent value="voice" className="space-y-4">
            <VoiceModeConfig
              agentId={agent.agent_id}
              agentDbId={agent.id}
              agentName={agent.name}
              sharedKbSources={editedAgent.kb_sources}
            />
          </TabsContent>

          {/* Nudges Tab - Sofia Only */}
          {isSofia && (
            <TabsContent value="nudges" className="space-y-6">
              <NudgeMetrics />
              <NudgeConfig />
            </TabsContent>
          )}

          {/* Detection Patterns Tab - Sofia Only */}
          {isSofia && (
            <TabsContent value="patterns" className="space-y-4">
              <AgentDetectionPatterns 
                agentId={agent.agent_id} 
                agentName={agent.name}
              />
            </TabsContent>
          )}

          {/* Tests Tab */}
          <TabsContent value="tests" className="space-y-4">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Simulador
                  </CardTitle>
                  <CardDescription>
                    Teste conversas em tempo real com {agent.name}.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AgentSimulator agent={editedAgent} />
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TestTube className="h-5 w-5" />
                    Testes Automatizados
                  </CardTitle>
                  <CardDescription>
                    Valide o comportamento de {agent.name} com casos de teste.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AgentTestRunner 
                    agent={editedAgent} 
                    onTestsUpdate={handleTestsUpdate}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Versions Tab */}
          <TabsContent value="versions" className="space-y-4">
            <AgentVersionHistory 
              key={versionKey}
              agent={editedAgent} 
              onVersionRestored={() => {
                setVersionKey(prev => prev + 1);
                handleManualRefresh();
              }}
            />
          </TabsContent>

          {/* Integration Tab - Z-API Webhooks and Credentials */}
          <TabsContent value="integration" className="space-y-4">
            {/* Z-API Credentials - Each agent has their own instance */}
            <ZApiCredentialsConfig 
              agentId={agent.agent_id} 
              agentName={agent.name} 
            />
            
            {/* Webhook URLs */}
            <ZApiIntegrationDocs 
              agentId={agent.agent_id} 
              agentName={agent.name} 
            />
          </TabsContent>

          {/* Catalogs Tab - Entity catalogs for rules and actions */}
          <TabsContent value="catalogs" className="space-y-4">
            <AgentCatalogsEditor 
              agentId={agent.id} 
              agentName={agent.name} 
            />
          </TabsContent>

          {/* Metrics Tab */}
          <TabsContent value="metrics" className="space-y-6">
            {isSofia ? (
              <SofiaMetrics />
            ) : (
              <AgentMetrics agent={editedAgent} />
            )}
            
            {/* RAG Usage Metrics */}
            <AgentRAGMetrics 
              agentId={agent.agent_id} 
              agentName={agent.name} 
            />
          </TabsContent>
        </Tabs>

        {/* Confirmation Dialog */}
        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Pausar Atendimento?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>
                  Ao pausar o atendimento, {agent.name} <strong>não responderá automaticamente</strong> às 
                  mensagens recebidas no WhatsApp.
                </p>
                <p>
                  As mensagens continuarão sendo registradas no sistema para consulta posterior.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmAction}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Sim, Pausar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
