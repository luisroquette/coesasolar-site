import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Puzzle, 
  Save, 
  Plus, 
  Trash2, 
  Copy, 
  Eye, 
  EyeOff,
  GripVertical,
  Sparkles,
  Settings2,
  FileText,
  Shield,
  Brain,
  MessageSquare,
  Phone,
  Banknote,
  RefreshCw,
  Play,
  Code
} from 'lucide-react';

interface PromptModule {
  id: string;
  module_key: string;
  module_name: string;
  category: string;
  description: string | null;
  template: string;
  variables: string[] | unknown;
  is_system: boolean | null;
  is_active: boolean | null;
  priority: number | null;
}

interface AgentPromptModule {
  id: string;
  agent_id: string;
  module_id: string;
  is_enabled: boolean | null;
  custom_variables: Record<string, any> | unknown;
  priority_override: number | null;
  module?: PromptModule | null;
}

interface PromptModulesEditorProps {
  agentId: string;
  agentName: string;
}

const CATEGORY_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  identity: { icon: <Sparkles className="h-4 w-4" />, label: 'Identidade', color: 'bg-purple-500/10 text-purple-500' },
  persona: { icon: <MessageSquare className="h-4 w-4" />, label: 'Persona', color: 'bg-blue-500/10 text-blue-500' },
  guardrails: { icon: <Shield className="h-4 w-4" />, label: 'Guardrails', color: 'bg-red-500/10 text-red-500' },
  knowledge: { icon: <Brain className="h-4 w-4" />, label: 'Conhecimento', color: 'bg-green-500/10 text-green-500' },
  context: { icon: <FileText className="h-4 w-4" />, label: 'Contexto', color: 'bg-yellow-500/10 text-yellow-500' },
  flow: { icon: <Settings2 className="h-4 w-4" />, label: 'Fluxo', color: 'bg-orange-500/10 text-orange-500' },
  voice: { icon: <Phone className="h-4 w-4" />, label: 'Voz', color: 'bg-cyan-500/10 text-cyan-500' },
  collections: { icon: <Banknote className="h-4 w-4" />, label: 'Cobrança', color: 'bg-pink-500/10 text-pink-500' },
  custom: { icon: <Puzzle className="h-4 w-4" />, label: 'Customizado', color: 'bg-gray-500/10 text-gray-500' },
};

export function PromptModulesEditor({ agentId, agentName }: PromptModulesEditorProps) {
  const [modules, setModules] = useState<PromptModule[]>([]);
  const [agentModules, setAgentModules] = useState<AgentPromptModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newModule, setNewModule] = useState({
    module_key: '',
    module_name: '',
    category: 'custom',
    description: '',
    template: '',
    priority: 100
  });
  const { toast } = useToast();

  useEffect(() => {
    loadModules();
  }, [agentId]);

  const loadModules = async () => {
    try {
      setLoading(true);
      
      // Load all available modules
      const { data: allModules, error: modulesError } = await supabase
        .from('prompt_modules')
        .select('*')
        .eq('is_active', true)
        .order('priority');

      if (modulesError) throw modulesError;

      // Load agent's configured modules
      const { data: configuredModules, error: configError } = await supabase
        .from('agent_prompt_modules')
        .select('*, module:prompt_modules(*)')
        .eq('agent_id', agentId);

      if (configError) throw configError;

      setModules((allModules || []) as PromptModule[]);
      setAgentModules((configuredModules || []) as AgentPromptModule[]);
    } catch (error: any) {
      console.error('Error loading modules:', error);
      toast({
        title: 'Erro ao carregar módulos',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleModule = async (moduleId: string, enabled: boolean) => {
    const existing = agentModules.find(am => am.module_id === moduleId);

    try {
      if (existing) {
        const { error } = await supabase
          .from('agent_prompt_modules')
          .update({ is_enabled: enabled })
          .eq('id', existing.id);

        if (error) throw error;

        setAgentModules(prev => prev.map(am => 
          am.id === existing.id ? { ...am, is_enabled: enabled } : am
        ));
      } else {
        const { data, error } = await supabase
          .from('agent_prompt_modules')
          .insert({
            agent_id: agentId,
            module_id: moduleId,
            is_enabled: enabled,
            custom_variables: {}
          })
          .select('*, module:prompt_modules(*)')
          .single();

        if (error) throw error;

        setAgentModules(prev => [...prev, data as AgentPromptModule]);
      }

      toast({
        title: enabled ? 'Módulo ativado' : 'Módulo desativado',
        description: `Módulo ${enabled ? 'adicionado ao' : 'removido do'} prompt do agente.`
      });
    } catch (error: any) {
      console.error('Error toggling module:', error);
      toast({
        title: 'Erro ao atualizar módulo',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const updateModuleVariables = async (agentModuleId: string, variables: Record<string, any>) => {
    try {
      const { error } = await supabase
        .from('agent_prompt_modules')
        .update({ custom_variables: variables })
        .eq('id', agentModuleId);

      if (error) throw error;

      setAgentModules(prev => prev.map(am => 
        am.id === agentModuleId ? { ...am, custom_variables: variables } : am
      ));
    } catch (error: any) {
      console.error('Error updating variables:', error);
      toast({
        title: 'Erro ao salvar variáveis',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const generatePreview = () => {
    const enabledModules = agentModules
      .filter(am => am.is_enabled && am.module)
      .sort((a, b) => (a.priority_override ?? a.module!.priority ?? 0) - (b.priority_override ?? b.module!.priority ?? 0));

    let prompt = '';
    
    for (const am of enabledModules) {
      const module = am.module!;
      let rendered = module.template;
      const customVars = (am.custom_variables && typeof am.custom_variables === 'object') ? am.custom_variables as Record<string, any> : {};
      
      // Simple variable replacement
      const vars = customVars;
      for (const [key, value] of Object.entries(vars)) {
        rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
      
      // Remove unset variables
      rendered = rendered.replace(/{{[^}]+}}/g, '');
      rendered = rendered.replace(/{{#if [^}]+}}.*?{{\/if}}/gs, '');
      rendered = rendered.replace(/{{#each [^}]+}}.*?{{\/each}}/gs, '');
      
      if (rendered.trim()) {
        prompt += `\n${rendered.trim()}\n`;
      }
    }

    setPreviewPrompt(prompt.trim() || 'Nenhum módulo ativo configurado.');
    setShowPreview(true);
  };

  const createCustomModule = async () => {
    if (!newModule.module_key || !newModule.module_name || !newModule.template) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha chave, nome e template.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setSaving(true);

      // Extract variables from template
      const variableMatches = newModule.template.match(/{{([^#/}]+)}}/g) || [];
      const variables = [...new Set(variableMatches.map(v => v.replace(/{{|}}/g, '').trim()))];

      const { data, error } = await supabase
        .from('prompt_modules')
        .insert({
          ...newModule,
          variables,
          is_system: false,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      setModules(prev => [...prev, data as PromptModule]);
      setCreateDialogOpen(false);
      setNewModule({
        module_key: '',
        module_name: '',
        category: 'custom',
        description: '',
        template: '',
        priority: 100
      });

      toast({
        title: 'Módulo criado!',
        description: `Módulo "${data.module_name}" criado com sucesso.`
      });
    } catch (error: any) {
      console.error('Error creating module:', error);
      toast({
        title: 'Erro ao criar módulo',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const isModuleEnabled = (moduleId: string) => {
    return agentModules.some(am => am.module_id === moduleId && am.is_enabled);
  };

  const getAgentModule = (moduleId: string) => {
    return agentModules.find(am => am.module_id === moduleId);
  };

  const groupedModules = modules.reduce((acc, module) => {
    if (!acc[module.category]) {
      acc[module.category] = [];
    }
    acc[module.category].push(module);
    return acc;
  }, {} as Record<string, PromptModule[]>);

  const enabledCount = agentModules.filter(am => am.is_enabled).length;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Carregando módulos...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Puzzle className="h-5 w-5" />
            Módulos de Prompt
          </h3>
          <p className="text-sm text-muted-foreground">
            {enabledCount} módulos ativos para {agentName}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generatePreview}>
            <Eye className="h-4 w-4 mr-2" />
            Pré-visualizar
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Módulo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Criar Módulo Customizado</DialogTitle>
                <DialogDescription>
                  Crie um novo módulo de prompt reutilizável.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Chave Única</Label>
                    <Input
                      value={newModule.module_key}
                      onChange={e => setNewModule(prev => ({ 
                        ...prev, 
                        module_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') 
                      }))}
                      placeholder="meu_modulo_custom"
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={newModule.module_name}
                      onChange={e => setNewModule(prev => ({ ...prev, module_name: e.target.value }))}
                      placeholder="Meu Módulo"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select 
                      value={newModule.category} 
                      onValueChange={v => setNewModule(prev => ({ ...prev, category: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              {config.icon}
                              {config.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Prioridade</Label>
                    <Input
                      type="number"
                      value={newModule.priority}
                      onChange={e => setNewModule(prev => ({ ...prev, priority: parseInt(e.target.value) || 100 }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    value={newModule.description}
                    onChange={e => setNewModule(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="O que este módulo faz..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Template</Label>
                  <Textarea
                    value={newModule.template}
                    onChange={e => setNewModule(prev => ({ ...prev, template: e.target.value }))}
                    placeholder="Use {{variavel}} para variáveis dinâmicas..."
                    rows={6}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use {'{{variavel}}'} para variáveis. Suporta {'{{#if}}...{{/if}}'} e {'{{#each}}...{{/each}}'}.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={createCustomModule} disabled={saving}>
                  {saving ? 'Criando...' : 'Criar Módulo'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Modules by Category */}
      <Accordion type="multiple" defaultValue={Object.keys(groupedModules)} className="space-y-2">
        {Object.entries(groupedModules).map(([category, categoryModules]) => {
          const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.custom;
          const activeInCategory = categoryModules.filter(m => isModuleEnabled(m.id)).length;

          return (
            <AccordionItem key={category} value={category} className="border rounded-lg">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${config.color}`}>
                    {config.icon}
                  </div>
                  <div className="text-left">
                    <div className="font-medium">{config.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {activeInCategory}/{categoryModules.length} ativos
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-3">
                  {categoryModules.map(module => {
                    const enabled = isModuleEnabled(module.id);
                    const agentModule = getAgentModule(module.id);

                    return (
                      <Card key={module.id} className={enabled ? 'border-primary/50 bg-primary/5' : ''}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">{module.module_name}</span>
                                {module.is_system && (
                                  <Badge variant="outline" className="text-xs">Sistema</Badge>
                                )}
                                <Badge variant="secondary" className="text-xs font-mono">
                                  {module.module_key}
                                </Badge>
                              </div>
                              {module.description && (
                                <p className="text-sm text-muted-foreground mb-2">
                                  {module.description}
                                </p>
                              )}
                              
                              {/* Variables Editor */}
                              {enabled && agentModule && Array.isArray(module.variables) && module.variables.length > 0 && (
                                <div className="mt-3 p-3 bg-muted/50 rounded-lg space-y-2">
                                  <Label className="text-xs font-medium">Variáveis</Label>
                                  <div className="grid grid-cols-2 gap-2">
                                    {(module.variables as string[]).map(varName => {
                                      const customVars = (agentModule.custom_variables && typeof agentModule.custom_variables === 'object') 
                                        ? agentModule.custom_variables as Record<string, any> 
                                        : {};
                                      return (
                                        <div key={varName} className="space-y-1">
                                          <Label className="text-xs text-muted-foreground">{varName}</Label>
                                          <Input
                                            value={customVars[varName] || ''}
                                            onChange={e => updateModuleVariables(agentModule.id, {
                                              ...customVars,
                                              [varName]: e.target.value
                                            })}
                                            placeholder={`{{${varName}}}`}
                                            className="h-8 text-sm"
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                            <Switch
                              checked={enabled}
                              onCheckedChange={(checked) => toggleModule(module.id, checked)}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Pré-visualização do Prompt
            </DialogTitle>
            <DialogDescription>
              Este é o prompt completo que será enviado ao modelo de IA.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[50vh]">
            <pre className="p-4 bg-muted rounded-lg text-sm whitespace-pre-wrap font-mono">
              {previewPrompt}
            </pre>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(previewPrompt)}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar
            </Button>
            <Button onClick={() => setShowPreview(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
