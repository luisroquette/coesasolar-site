import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { 
  Bot, 
  Save, 
  Loader2, 
  Clock, 
  Bell, 
  Brain, 
  Zap, 
  Target, 
  Shield,
  RefreshCw,
  Plus,
  Trash2,
  ChevronDown,
  Settings2,
  Copy
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Types
interface Agent {
  id: string;
  agent_id: string;
  name: string;
  role: string;
  status: string;
  avatar_emoji: string | null;
}

interface AgentConfig {
  id: string;
  agent_id: string;
  config_namespace: string;
  config_key: string;
  config_value: unknown;
  value_type: string;
  description: string | null;
  is_secret_reference: boolean | null;
  secret_key_name: string | null;
}

// Namespace definitions with fields
const NAMESPACE_DEFINITIONS: Record<string, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  fields: {
    key: string;
    label: string;
    type: 'number' | 'boolean' | 'string' | 'select';
    default: number | boolean | string;
    description: string;
    min?: number;
    max?: number;
    options?: { value: string; label: string }[];
  }[];
}> = {
  nudges: {
    label: 'Nudges',
    icon: Bell,
    description: 'Configurações de lembretes automáticos',
    fields: [
      { key: 'documento_delay_1_hours', label: 'Delay Doc 1 (horas)', type: 'number', default: 2, description: 'Tempo até 1º lembrete de documento', min: 1, max: 168 },
      { key: 'documento_delay_2_hours', label: 'Delay Doc 2 (horas)', type: 'number', default: 6, description: 'Tempo até 2º lembrete de documento', min: 1, max: 168 },
      { key: 'documento_delay_3_hours', label: 'Delay Doc 3 (horas)', type: 'number', default: 24, description: 'Tempo até 3º lembrete de documento', min: 1, max: 168 },
      { key: 'contrato_delay_1_hours', label: 'Delay Contrato 1 (horas)', type: 'number', default: 4, description: 'Tempo até 1º lembrete de contrato', min: 1, max: 168 },
      { key: 'contrato_delay_2_hours', label: 'Delay Contrato 2 (horas)', type: 'number', default: 24, description: 'Tempo até 2º lembrete de contrato', min: 1, max: 168 },
      { key: 'contrato_delay_3_hours', label: 'Delay Contrato 3 (horas)', type: 'number', default: 48, description: 'Tempo até 3º lembrete de contrato', min: 1, max: 168 },
      { key: 'max_attempts', label: 'Máx. Tentativas', type: 'number', default: 3, description: 'Número máximo de tentativas de nudge', min: 1, max: 10 },
      { key: 'cooldown_minutes', label: 'Cooldown (min)', type: 'number', default: 60, description: 'Tempo mínimo entre nudges', min: 5, max: 1440 },
    ],
  },
  quiet_hours: {
    label: 'Horário Silencioso',
    icon: Clock,
    description: 'Quando o agente não deve enviar mensagens',
    fields: [
      { key: 'enabled', label: 'Ativado', type: 'boolean', default: true, description: 'Ativar horário silencioso' },
      { key: 'start_hour', label: 'Início (hora)', type: 'number', default: 20, description: 'Hora de início do silêncio (0-23)', min: 0, max: 23 },
      { key: 'end_hour', label: 'Fim (hora)', type: 'number', default: 8, description: 'Hora de fim do silêncio (0-23)', min: 0, max: 23 },
      { key: 'weekend_enabled', label: 'Silêncio nos Finais de Semana', type: 'boolean', default: true, description: 'Silenciar durante todo o fim de semana' },
    ],
  },
  llm: {
    label: 'Modelo LLM',
    icon: Brain,
    description: 'Configurações do modelo de linguagem',
    fields: [
      { 
        key: 'model', 
        label: 'Modelo Principal', 
        type: 'select', 
        default: 'google/gemini-2.5-flash',
        description: 'Modelo de IA para respostas',
        options: [
          { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (Rápido)' },
          { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (Preciso)' },
          { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Lite (Econômico)' },
          { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
          { value: 'openai/gpt-5', label: 'GPT-5 (Premium)' },
        ],
      },
      { key: 'temperature', label: 'Temperatura', type: 'number', default: 0.7, description: 'Criatividade do modelo (0=determinístico, 2=criativo)', min: 0, max: 2 },
      { key: 'max_tokens', label: 'Máx. Tokens', type: 'number', default: 1024, description: 'Limite de tokens na resposta', min: 100, max: 8000 },
      { 
        key: 'fallback_model', 
        label: 'Modelo Fallback', 
        type: 'select', 
        default: 'google/gemini-2.5-flash-lite',
        description: 'Modelo alternativo em caso de erro',
        options: [
          { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Lite' },
          { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
          { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano' },
        ],
      },
      { key: 'cost_limit_daily_usd', label: 'Limite Diário (USD)', type: 'number', default: 50, description: 'Limite de custo diário', min: 0, max: 1000 },
    ],
  },
  pipeline: {
    label: 'Pipeline',
    icon: Zap,
    description: 'Configurações do fluxo de processamento',
    fields: [
      { key: 'enable_fast_path', label: 'Fast Path', type: 'boolean', default: true, description: 'Ativar atalhos para respostas rápidas' },
      { key: 'enable_triage', label: 'Triagem', type: 'boolean', default: true, description: 'Ativar classificação de intenção' },
      { key: 'enable_rag', label: 'RAG', type: 'boolean', default: true, description: 'Ativar busca em base de conhecimento' },
      { key: 'enable_guided_script', label: 'Script Guiado', type: 'boolean', default: true, description: 'Ativar fluxos determinísticos' },
      { key: 'enable_rule_memory', label: 'Memória de Regras', type: 'boolean', default: true, description: 'Ativar aprendizado de regras' },
      { key: 'enable_typo_correction', label: 'Correção de Typos', type: 'boolean', default: true, description: 'Ativar correção ortográfica' },
      { key: 'data_collection_timeout_minutes', label: 'Timeout Coleta (min)', type: 'number', default: 10, description: 'Tempo máximo de coleta de dados', min: 1, max: 60 },
      { key: 'max_field_attempts', label: 'Tentativas por Campo', type: 'number', default: 3, description: 'Tentativas máximas por campo', min: 1, max: 10 },
    ],
  },
  followup: {
    label: 'Follow-up',
    icon: Target,
    description: 'Configurações de acompanhamento',
    fields: [
      { key: 'enabled', label: 'Ativado', type: 'boolean', default: true, description: 'Ativar follow-ups automáticos' },
      { key: 'score_alto_threshold', label: 'Score Alto (mín.)', type: 'number', default: 80, description: 'Limiar para leads quentes', min: 0, max: 100 },
      { key: 'score_medio_threshold', label: 'Score Médio (mín.)', type: 'number', default: 60, description: 'Limiar para leads mornos', min: 0, max: 100 },
      { key: 'score_baixo_threshold', label: 'Score Baixo (mín.)', type: 'number', default: 30, description: 'Limiar para leads frios', min: 0, max: 100 },
      { key: 'max_daily_followups', label: 'Máx. Follow-ups/Dia', type: 'number', default: 5, description: 'Limite diário por conversa', min: 0, max: 50 },
      { key: 'interval_hours', label: 'Intervalo (horas)', type: 'number', default: 24, description: 'Tempo entre follow-ups', min: 1, max: 168 },
    ],
  },
  proposal_defaults: {
    label: 'Defaults de Proposta',
    icon: Settings2,
    description: 'Valores padrão para novas propostas',
    fields: [
      { key: 'cip_default', label: 'CIP Padrão (R$)', type: 'number', default: 25, description: 'Valor padrão da CIP', min: 0, max: 200 },
      { key: 'desconto_default', label: 'Desconto Padrão (%)', type: 'number', default: 25, description: 'Desconto padrão oferecido', min: 0, max: 50 },
      { key: 'fidelidade_meses_default', label: 'Fidelidade (meses)', type: 'number', default: 36, description: 'Prazo padrão de fidelidade', min: 0, max: 120 },
      { key: 'consumo_kwh_default', label: 'Consumo Padrão (kWh)', type: 'number', default: 500, description: 'Consumo médio padrão', min: 0, max: 50000 },
      { key: 'unlock_threshold_kwh', label: 'Threshold UNLOCK (kWh)', type: 'number', default: 3000, description: 'Consumo mínimo para UNLOCK', min: 0, max: 100000 },
      { key: 'unlock_desconto', label: 'Desconto UNLOCK (%)', type: 'number', default: 30, description: 'Desconto do plano UNLOCK', min: 0, max: 50 },
    ],
  },
  anti_spam: {
    label: 'Anti-Spam',
    icon: Shield,
    description: 'Proteção contra spam e abusos',
    fields: [
      { key: 'rate_limit_per_minute', label: 'Rate Limit (msg/min)', type: 'number', default: 30, description: 'Máximo de mensagens por minuto por usuário', min: 1, max: 100 },
      { key: 'rate_limit_global_per_minute', label: 'Rate Limit Global (msg/min)', type: 'number', default: 500, description: 'Máximo global de mensagens por minuto', min: 10, max: 1000 },
      { key: 'duplicate_window_seconds', label: 'Janela Duplicados (seg)', type: 'number', default: 30, description: 'Tempo para detectar mensagens duplicadas', min: 1, max: 300 },
      { key: 'fallback_cooldown_minutes', label: 'Cooldown Fallback (min)', type: 'number', default: 60, description: 'Tempo de espera após fallback', min: 5, max: 1440 },
      { key: 'max_fallbacks_per_day', label: 'Máx. Fallbacks/Dia', type: 'number', default: 1, description: 'Limite de fallbacks por dia', min: 0, max: 10 },
    ],
  },
};

export function AgentConfigManager() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load agents
  useEffect(() => {
    loadAgents();
  }, []);

  // Load configs when agent changes
  useEffect(() => {
    if (selectedAgentId) {
      loadAgentConfigs(selectedAgentId);
    }
  }, [selectedAgentId]);

  const loadAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_agents')
        .select('id, agent_id, name, role, status, avatar_emoji')
        .order('name');

      if (error) throw error;
      setAgents(data || []);
      
      // Auto-select first agent if none selected
      if (data && data.length > 0 && !selectedAgentId) {
        setSelectedAgentId(data[0].agent_id);
      }
    } catch (error) {
      console.error('Error loading agents:', error);
      toast.error('Erro ao carregar agentes');
    } finally {
      setLoading(false);
    }
  };

  const loadAgentConfigs = async (agentId: string) => {
    try {
      const { data, error } = await supabase
        .from('agent_configurations')
        .select('*')
        .eq('agent_id', agentId);

      if (error) throw error;

      // Group by namespace
      const grouped: Record<string, Record<string, unknown>> = {};
      (data || []).forEach((config: AgentConfig) => {
        if (!grouped[config.config_namespace]) {
          grouped[config.config_namespace] = {};
        }
        grouped[config.config_namespace][config.config_key] = config.config_value;
      });

      setConfigs(grouped);
      setHasChanges(false);
    } catch (error) {
      console.error('Error loading agent configs:', error);
      toast.error('Erro ao carregar configurações');
    }
  };

  const getFieldValue = (namespace: string, key: string, defaultValue: unknown): unknown => {
    return configs[namespace]?.[key] ?? defaultValue;
  };

  const handleFieldChange = (namespace: string, key: string, value: unknown) => {
    setConfigs(prev => ({
      ...prev,
      [namespace]: {
        ...(prev[namespace] || {}),
        [key]: value,
      },
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selectedAgentId) return;

    setSaving(true);
    try {
      // Prepare upserts
      const upserts: {
        agent_id: string;
        config_namespace: string;
        config_key: string;
        config_value: Json;
        value_type: string;
      }[] = [];

      Object.entries(configs).forEach(([namespace, fields]) => {
        Object.entries(fields).forEach(([key, value]) => {
          const fieldDef = NAMESPACE_DEFINITIONS[namespace]?.fields.find(f => f.key === key);
          upserts.push({
            agent_id: selectedAgentId,
            config_namespace: namespace,
            config_key: key,
            config_value: value as Json,
            value_type: fieldDef?.type === 'number' ? 'number' : fieldDef?.type === 'boolean' ? 'boolean' : 'string',
          });
        });
      });

      // Delete existing and insert new
      const { error: deleteError } = await supabase
        .from('agent_configurations')
        .delete()
        .eq('agent_id', selectedAgentId);

      if (deleteError) throw deleteError;

      if (upserts.length > 0) {
        const { error: insertError } = await supabase
          .from('agent_configurations')
          .insert(upserts);

        if (insertError) throw insertError;
      }

      toast.success('Configurações salvas!');
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving configs:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyFromAgent = async (sourceAgentId: string) => {
    if (!selectedAgentId || sourceAgentId === selectedAgentId) return;

    try {
      const { data, error } = await supabase
        .from('agent_configurations')
        .select('*')
        .eq('agent_id', sourceAgentId);

      if (error) throw error;

      // Group by namespace
      const grouped: Record<string, Record<string, unknown>> = {};
      (data || []).forEach((config: AgentConfig) => {
        if (!grouped[config.config_namespace]) {
          grouped[config.config_namespace] = {};
        }
        grouped[config.config_namespace][config.config_key] = config.config_value;
      });

      setConfigs(grouped);
      setHasChanges(true);
      toast.success('Configurações copiadas! Clique em Salvar para confirmar.');
    } catch (error) {
      console.error('Error copying configs:', error);
      toast.error('Erro ao copiar configurações');
    }
  };

  const handleResetNamespace = (namespace: string) => {
    const defaultValues: Record<string, unknown> = {};
    NAMESPACE_DEFINITIONS[namespace].fields.forEach(field => {
      defaultValues[field.key] = field.default;
    });
    
    setConfigs(prev => ({
      ...prev,
      [namespace]: defaultValues,
    }));
    setHasChanges(true);
    toast.info(`${NAMESPACE_DEFINITIONS[namespace].label} resetado para valores padrão`);
  };

  const selectedAgent = agents.find(a => a.agent_id === selectedAgentId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Nenhum agente encontrado</h3>
          <p className="text-muted-foreground">
            Crie um agente primeiro para configurá-lo.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with agent selector */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-2xl">
                {selectedAgent?.avatar_emoji || '🤖'}
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Configurações por Agente
                </CardTitle>
                <CardDescription>
                  Overrides específicos que sobrescrevem as configurações globais
                </CardDescription>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Select value={selectedAgentId ?? undefined} onValueChange={setSelectedAgentId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Selecione um agente" />
                </SelectTrigger>
                <SelectContent>
                  {agents.filter(agent => agent.agent_id && agent.agent_id !== '').map(agent => (
                    <SelectItem key={agent.agent_id} value={agent.agent_id}>
                      <span className="flex items-center gap-2">
                        <span>{agent.avatar_emoji || '🤖'}</span>
                        <span>{agent.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Select onValueChange={handleCopyFromAgent}>
                      <SelectTrigger className="w-10 h-10 p-0">
                        <Copy className="h-4 w-4" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_placeholder" disabled>Copiar de...</SelectItem>
                        {agents.filter(a => a.agent_id && a.agent_id !== '' && a.agent_id !== selectedAgentId).map(agent => (
                          <SelectItem key={agent.agent_id} value={agent.agent_id}>
                            <span className="flex items-center gap-2">
                              <span>{agent.avatar_emoji || '🤖'}</span>
                              <span>{agent.name}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TooltipTrigger>
                  <TooltipContent>Copiar configs de outro agente</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Namespaces accordion */}
      <Accordion type="multiple" defaultValue={['nudges', 'quiet_hours']} className="space-y-4">
        {Object.entries(NAMESPACE_DEFINITIONS).map(([namespace, def]) => {
          const Icon = def.icon;
          const hasValues = Object.keys(configs[namespace] || {}).length > 0;
          
          return (
            <AccordionItem 
              key={namespace} 
              value={namespace}
              className="border rounded-lg px-4"
            >
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{def.label}</span>
                      {hasValues && (
                        <Badge variant="secondary" className="text-xs">
                          {Object.keys(configs[namespace] || {}).length} configs
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{def.description}</p>
                  </div>
                </div>
              </AccordionTrigger>
              
              <AccordionContent className="pb-4">
                <div className="space-y-4">
                  {/* Reset button */}
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleResetNamespace(namespace)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Resetar para padrão
                    </Button>
                  </div>
                  
                  {/* Fields grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {def.fields.map(field => {
                      const value = getFieldValue(namespace, field.key, field.default);
                      
                      return (
                        <div key={field.key} className="space-y-2">
                          <Label htmlFor={`${namespace}-${field.key}`} className="text-sm">
                            {field.label}
                          </Label>
                          
                          {field.type === 'boolean' ? (
                            <div className="flex items-center gap-2">
                              <Switch
                                id={`${namespace}-${field.key}`}
                                checked={value as boolean}
                                onCheckedChange={(checked) => handleFieldChange(namespace, field.key, checked)}
                              />
                              <span className="text-sm text-muted-foreground">
                                {value ? 'Ativado' : 'Desativado'}
                              </span>
                            </div>
                          ) : field.type === 'select' ? (
                            <Select
                              value={String(value)}
                              onValueChange={(val) => handleFieldChange(namespace, field.key, val)}
                            >
                              <SelectTrigger id={`${namespace}-${field.key}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {field.options?.map(opt => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id={`${namespace}-${field.key}`}
                              type="number"
                              min={field.min}
                              max={field.max}
                              step={field.key === 'temperature' ? 0.1 : 1}
                              value={value as number}
                              onChange={(e) => handleFieldChange(namespace, field.key, parseFloat(e.target.value) || 0)}
                            />
                          )}
                          
                          <p className="text-xs text-muted-foreground">
                            {field.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Save button */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={handleSave} disabled={saving} size="lg" className="shadow-lg">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar Configurações
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
