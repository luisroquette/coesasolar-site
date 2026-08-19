import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  ArrowLeft, 
  Download, 
  Save,
  User,
  Shield,
  Wrench,
  GitBranch,
  BookOpen,
  TestTube,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Play,
  History,
  Package,
  ChevronDown,
  FileJson,
  FolderArchive,
  Database
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CollectionRulesEditor } from './CollectionRulesEditor';
import { AgentSimulator } from './AgentSimulator';
import { AgentTestRunner } from './AgentTestRunner';
import { AgentMetrics } from './AgentMetrics';
import { AgentVersionHistory } from './AgentVersionHistory';
import { KnowledgeBaseManager, KBSource } from './KnowledgeBaseManager';
import { AgentToolsManager, ToolConfig } from './AgentToolsManager';
import { AgentCatalogsEditor } from './AgentCatalogsEditor';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import JSZip from 'jszip';

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

interface AgentEditorProps {
  agent: AIAgent;
  onBack: () => void;
  onDownload: () => void;
  onRefresh?: () => void;
}

export function AgentEditor({ agent, onBack, onDownload, onRefresh }: AgentEditorProps) {
  const [saving, setSaving] = useState(false);
  const [kbSaving, setKbSaving] = useState(false);
  const kbSaveTimerRef = useRef<number | null>(null);

  const [editedAgent, setEditedAgent] = useState<AIAgent>(agent);
  const [activeTab, setActiveTab] = useState('identity');
  const [versionKey, setVersionKey] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      if (kbSaveTimerRef.current) {
        window.clearTimeout(kbSaveTimerRef.current);
      }
    };
  }, []);

  const persistKbSources = async (sources: unknown) => {
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
          tests: editedAgent.tests
        })
        .eq('id', agent.id);

      if (error) throw error;

      toast({
        title: 'Salvo com sucesso',
        description: `Configurações de ${agent.name} atualizadas.`
      });
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

  const handleDownloadComplete = async () => {
    try {
      toast({
        title: 'Preparando download...',
        description: 'Gerando pacote completo do agente.'
      });

      // Buscar dados adicionais da edge function
      const { data: session } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('agent-source-export', {
        body: { agent_id: agent.agent_id }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao exportar dados do agente');
      }

      const exportData = response.data;
      
      // Criar ZIP
      const zip = new JSZip();
      
      // Adicionar brain.json
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
      
      // Adicionar arquivos da edge function
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

      // Gerar e baixar ZIP
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
    setEditedAgent(prev => ({ ...prev, tests }));
  };

  const updatePersona = (key: string, value: any) => {
    setEditedAgent(prev => ({
      ...prev,
      persona: { ...prev.persona, [key]: value }
    }));
  };

  const updateGuardrails = (key: string, value: any) => {
    setEditedAgent(prev => ({
      ...prev,
      guardrails: { ...prev.guardrails, [key]: value }
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-4xl">{agent.avatar_emoji}</span>
            <div>
              <h1 className="text-2xl font-bold">{agent.name}</h1>
              <div className="flex items-center gap-2">
                <Badge variant="outline">v{agent.version}</Badge>
                <Badge>{agent.status}</Badge>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Download
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onDownload}>
                <FileJson className="h-4 w-4 mr-2" />
                Cérebro (JSON)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadComplete}>
                <FolderArchive className="h-4 w-4 mr-2" />
                Pacote Completo (ZIP)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-10 w-full">
          <TabsTrigger value="identity" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="hidden md:inline">Identidade</span>
          </TabsTrigger>
          <TabsTrigger value="policies" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden md:inline">Políticas</span>
          </TabsTrigger>
          <TabsTrigger value="tools" className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            <span className="hidden md:inline">Ferramentas</span>
          </TabsTrigger>
          <TabsTrigger value="flows" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            <span className="hidden md:inline">Fluxos</span>
          </TabsTrigger>
          <TabsTrigger value="catalogs" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <span className="hidden md:inline">Catálogos</span>
          </TabsTrigger>
          <TabsTrigger value="kb" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span className="hidden md:inline">KB</span>
          </TabsTrigger>
          <TabsTrigger value="simulator" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden md:inline">Simulador</span>
          </TabsTrigger>
          <TabsTrigger value="tests" className="flex items-center gap-2">
            <TestTube className="h-4 w-4" />
            <span className="hidden md:inline">Testes</span>
          </TabsTrigger>
          <TabsTrigger value="versions" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="hidden md:inline">Versões</span>
          </TabsTrigger>
          <TabsTrigger value="metrics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden md:inline">Métricas</span>
          </TabsTrigger>
        </TabsList>

        {/* Identity Tab */}
        <TabsContent value="identity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Identidade e Personalidade</CardTitle>
              <CardDescription>
                Defina quem é {agent.name}, seu tom de voz e estilo de comunicação.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={editedAgent.description || ''}
                  onChange={(e) => setEditedAgent(prev => ({ ...prev, description: e.target.value }))}
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Policies Tab */}
        <TabsContent value="policies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Guardrails e Políticas
              </CardTitle>
              <CardDescription>
                Defina o que o agente NUNCA deve fazer e quando escalar para humano.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>

          {/* Supervisor Configuration Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-blue-500" />
                Configuração de Escalação
              </CardTitle>
              <CardDescription>
                Configure o supervisor que será notificado quando o agente precisar de ajuda humana.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>

          {/* Collection Rules for Julia */}
          {agent.role === 'collections' && (
            <CollectionRulesEditor
              rules={editedAgent.collection_rules}
              onChange={(rules) => setEditedAgent(prev => ({ ...prev, collection_rules: rules }))}
            />
          )}
        </TabsContent>

        {/* Tools Tab */}
        <TabsContent value="tools" className="space-y-4">
          <AgentToolsManager
            tools={(editedAgent.tools_config || []) as ToolConfig[]}
            onChange={(tools) => setEditedAgent(prev => ({ ...prev, tools_config: tools }))}
          />
        </TabsContent>

        {/* Flows Tab */}
        <TabsContent value="flows" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Intenções e Fluxos</CardTitle>
              <CardDescription>
                Árvores de intenção e passos de cada fluxo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(editedAgent.intents || []).map((intent: any, idx: number) => (
                  <div key={idx} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <GitBranch className="h-4 w-4 text-primary" />
                      <p className="font-semibold">{intent.id}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {intent.steps?.map((step: string, stepIdx: number) => (
                        <Badge key={stepIdx} variant="outline" className="text-xs">
                          {stepIdx + 1}. {step}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Catalogs Tab */}
        <TabsContent value="catalogs" className="space-y-4">
          <AgentCatalogsEditor agentId={agent.id} agentName={agent.name} />
        </TabsContent>

        {/* KB Tab */}
        <TabsContent value="kb" className="space-y-4">
          <KnowledgeBaseManager
            sources={editedAgent.kb_sources || []}
            onChange={(sources) => {
              setEditedAgent((prev) => ({ ...prev, kb_sources: sources }));

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

        {/* Simulator Tab */}
        <TabsContent value="simulator" className="space-y-4">
          <AgentSimulator agent={editedAgent} />
        </TabsContent>

        {/* Tests Tab */}
        <TabsContent value="tests" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="h-5 w-5" />
                Testes Automatizados
              </CardTitle>
              <CardDescription>
                Valide o comportamento de {agent.name} com casos de teste automatizados.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AgentTestRunner 
                agent={editedAgent} 
                onTestsUpdate={handleTestsUpdate}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Versions Tab */}
        <TabsContent value="versions" className="space-y-4">
          <AgentVersionHistory 
            key={versionKey}
            agent={editedAgent} 
            onVersionRestored={() => {
              setVersionKey(prev => prev + 1);
              onRefresh?.();
            }}
          />
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="space-y-4">
          <AgentMetrics agent={editedAgent} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
