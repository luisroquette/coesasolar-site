import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Bot, 
  Play, 
  Pause, 
  TestTube,
  RefreshCw,
  Upload,
  FileCode,
  Grid3X3,
  List,
  MessageSquare,
  Mic,
  Layers,
  Tag
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AgentsGrid } from '@/components/ai-gym/AgentsGrid';
import { AgentsTable } from '@/components/ai-gym/AgentsTable';
import { AgentCategorySidebar, AgentCategory } from '@/components/ai-gym/AgentCategorySidebar';
import { CreateAgentDialog } from '@/components/ai-gym/CreateAgentDialog';
import { ImportAgentDialog } from '@/components/ai-gym/ImportAgentDialog';
import { useUserRole } from '@/hooks/useUserRole';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AIAgent {
  id: string;
  agent_id: string;
  name: string;
  role: string;
  description: string;
  avatar_emoji: string;
  channels: string[];
  status: string;
  version: string;
  persona: any;
  guardrails: any;
  tools_config: any;
  intents: any;
  kb_sources: any;
  collection_rules: any;
  metrics: any;
  tests: any;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

// Helper to determine agent type based on channels
const getAgentType = (agent: AIAgent): 'text' | 'voice' | 'image' | 'multimodal' => {
  const hasVoice = agent.channels?.includes('voice');
  const hasText = agent.channels?.includes('whatsapp') || agent.channels?.includes('web') || agent.channels?.includes('email');
  const hasImage = agent.channels?.includes('image');
  
  if (hasVoice && hasText) return 'multimodal';
  if (hasVoice) return 'voice';
  if (hasImage) return 'image';
  return 'text';
};

export default function AIGym() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedAgentForUpload, setSelectedAgentForUpload] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<AgentCategory>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [agentToDelete, setAgentToDelete] = useState<AIAgent | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { isAdmin } = useUserRole();

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ai_agents')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setAgents(data || []);
    } catch (error: any) {
      console.error('Error fetching agents:', error);
      toast({
        title: 'Erro ao carregar agentes',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Filter agents by category
  const filteredAgents = useMemo(() => {
    if (selectedCategory === 'all') return agents;
    
    return agents.filter(agent => {
      const agentType = getAgentType(agent);
      return agentType === selectedCategory;
    });
  }, [agents, selectedCategory]);

  // Calculate category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<AgentCategory, number> = {
      all: agents.length,
      text: 0,
      voice: 0,
      image: 0,
      multimodal: 0,
    };
    
    agents.forEach(agent => {
      const type = getAgentType(agent);
      counts[type] = (counts[type] || 0) + 1;
    });
    
    return counts;
  }, [agents]);

  // Get category title
  const getCategoryTitle = (category: AgentCategory) => {
    const titles: Record<string, string> = {
      all: 'Todos os Agentes',
      text: 'Agentes de Texto',
      voice: 'Agentes de Voz',
      image: 'Agentes de Imagem',
      multimodal: 'Agentes Multimodal',
    };
    return titles[category] || 'Agentes';
  };

  const handleDownloadBrain = async (agent: AIAgent) => {
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

  const handleStatusChange = async (agent: AIAgent, newStatus: string) => {
    try {
      const { data, error } = await supabase
        .from('ai_agents')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString(),
          published_at: newStatus === 'active' ? new Date().toISOString() : agent.published_at
        })
        .eq('id', agent.id)
        .select('id, status');

      if (error) throw error;

      // Detect silent RLS failure — update returned no rows
      if (!data || data.length === 0) {
        throw new Error('Sem permissão para alterar o status deste agente. Verifique se você tem acesso de administrador.');
      }

      // Verify the status actually changed
      if (data[0].status !== newStatus) {
        throw new Error(`Status não foi alterado. Esperado "${newStatus}" mas o banco retornou "${data[0].status}".`);
      }

      toast({
        title: 'Status atualizado',
        description: `${agent.name} agora está ${getStatusLabel(newStatus)}.`
      });

      fetchAgents();
    } catch (error: any) {
      console.error('[AI_GYM] Status change failed:', error);
      toast({
        title: 'Erro ao atualizar status',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: 'Rascunho',
      testing: 'Em Teste',
      active: 'Ativo',
      paused: 'Pausado'
    };
    return labels[status] || status;
  };

  const handleSourceUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedAgentForUpload) return;

    try {
      setUploading(true);
      const sourceCode = await file.text();
      
      const agent = agents.find(a => a.agent_id === selectedAgentForUpload);
      const webhookName = `${selectedAgentForUpload}-webhook`;

      const response = await supabase.functions.invoke('agent-source-upload', {
        body: { 
          agent_id: selectedAgentForUpload, 
          source_code: sourceCode,
          webhook_name: webhookName
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao fazer upload');
      }

      toast({
        title: 'Upload concluído!',
        description: `Código fonte de ${agent?.name || selectedAgentForUpload} salvo (${(sourceCode.length / 1024).toFixed(1)} KB).`
      });

      setUploadDialogOpen(false);
      setSelectedAgentForUpload('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: 'Erro no upload',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  // Navigate to unified agent settings page
  const handleEditAgent = (agent: AIAgent) => {
    navigate(`/ai-gym/${agent.agent_id}`);
  };

  const handleDeleteAgent = (agent: AIAgent) => {
    setAgentToDelete(agent);
  };

  const confirmDelete = async () => {
    if (!agentToDelete) return;

    try {
      const { error } = await supabase
        .from('ai_agents')
        .delete()
        .eq('id', agentToDelete.id);

      if (error) throw error;

      toast({
        title: 'Agente excluído',
        description: `${agentToDelete.name} foi removido com sucesso.`
      });

      setAgents(prev => prev.filter(a => a.id !== agentToDelete.id));
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setAgentToDelete(null);
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-background">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              AI Gym
            </h1>
            <p className="text-sm text-muted-foreground">
              Central de treinamento e configuração dos agentes de IA
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'grid' | 'table')}>
              <TabsList className="h-9">
                <TabsTrigger value="table" className="px-3">
                  <List className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="grid" className="px-3">
                  <Grid3X3 className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
            
            <Button variant="outline" size="sm" onClick={() => navigate('/ai-gym/patterns')}>
              <Tag className="h-4 w-4 mr-2" />
              Detection Patterns
            </Button>
            
            <ImportAgentDialog onAgentImported={fetchAgents} />
            <CreateAgentDialog onAgentCreated={fetchAgents} />
            
            {isAdmin && (
              <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Código
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <FileCode className="h-5 w-5" />
                      Upload Código Fonte
                    </DialogTitle>
                    <DialogDescription>
                      Faça upload do arquivo index.ts da Edge Function do agente.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>Selecione o Agente</Label>
                      <Select 
                        value={selectedAgentForUpload} 
                        onValueChange={setSelectedAgentForUpload}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha um agente..." />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.map(agent => (
                            <SelectItem key={agent.agent_id} value={agent.agent_id}>
                              {agent.avatar_emoji} {agent.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Arquivo do Código Fonte</Label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".ts,.tsx,.js"
                        onChange={handleSourceUpload}
                        disabled={!selectedAgentForUpload || uploading}
                        className="block w-full text-sm text-muted-foreground
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-md file:border-0
                          file:text-sm file:font-medium
                          file:bg-primary file:text-primary-foreground
                          hover:file:bg-primary/90
                          file:cursor-pointer
                          disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    {uploading && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Fazendo upload...
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}
            
            <Button variant="outline" size="sm" onClick={fetchAgents} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center gap-4 px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-medium">{agents.length}</span>
            <span className="text-sm text-muted-foreground">Total</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-500/10 rounded">
              <Play className="h-4 w-4 text-green-500" />
            </div>
            <span className="text-sm font-medium">{agents.filter(a => a.status === 'active').length}</span>
            <span className="text-sm text-muted-foreground">Ativos</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-yellow-500/10 rounded">
              <TestTube className="h-4 w-4 text-yellow-500" />
            </div>
            <span className="text-sm font-medium">{agents.filter(a => a.status === 'testing').length}</span>
            <span className="text-sm text-muted-foreground">Em Teste</span>
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-4 ml-auto text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{categoryCounts.text} Texto</span>
            </div>
            <div className="flex items-center gap-1">
              <Mic className="h-3.5 w-3.5" />
              <span>{categoryCounts.voice} Voz</span>
            </div>
            <div className="flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" />
              <span>{categoryCounts.multimodal} Multi</span>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <AgentCategorySidebar
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            categoryCounts={categoryCounts}
          />

          {/* Content */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : viewMode === 'table' ? (
            <AgentsTable
              agents={filteredAgents}
              onEdit={handleEditAgent}
              onDownload={handleDownloadBrain}
              onStatusChange={handleStatusChange}
              onDelete={handleDeleteAgent}
              isAdmin={isAdmin}
              categoryTitle={getCategoryTitle(selectedCategory)}
            />
          ) : (
            <div className="flex-1 p-4 overflow-auto">
              <h2 className="text-xl font-semibold mb-4">{getCategoryTitle(selectedCategory)}</h2>
              <AgentsGrid
                agents={filteredAgents}
                onAgentsChange={setAgents}
                onEdit={handleEditAgent}
                onDownload={handleDownloadBrain}
                onStatusChange={handleStatusChange}
                onDelete={handleDeleteAgent}
                isAdmin={isAdmin}
              />
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!agentToDelete} onOpenChange={() => setAgentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {agentToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O agente e todas as suas configurações serão permanentemente removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
