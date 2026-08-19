import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Download, 
  FileJson, 
  Upload, 
  AlertCircle, 
  CheckCircle2,
  Mic,
  MessageSquare,
  Bot,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ImportAgentDialogProps {
  onAgentImported: () => void;
}

type JsonType = 'retell' | 'aigym' | 'unknown';

interface ParsedAgent {
  type: JsonType;
  name: string;
  description: string;
  channels: string[];
  hasVoiceConfig: boolean;
  hasPersona: boolean;
  hasTools: boolean;
  rawData: any;
}

// Generate a valid agent_id from name
const generateAgentId = (name: string): string => {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 20);
};

// Detect JSON type based on structure
const detectJsonType = (json: any): JsonType => {
  // Retell AI indicators
  if (json.llm_websocket_url || json.voice_id || json.response_engine || json.agent_id?.startsWith('agent_')) {
    return 'retell';
  }
  
  // AI Gym indicators
  if (json.agent_id && (json.persona || json.kb_sources || json.guardrails) && json.exported_by === 'ai_gym') {
    return 'aigym';
  }
  
  // Check for AI Gym structure without exported_by
  if (json.agent_id && json.channels && (json.persona || json.role)) {
    return 'aigym';
  }
  
  return 'unknown';
};

// Map Retell JSON to AI Gym structure
const mapRetellToAIGym = (retellJson: any): any => {
  const name = retellJson.agent_name || 'Agente Importado';
  
  return {
    agent_id: generateAgentId(name),
    name: name,
    description: `Agente de voz importado do Retell AI`,
    role: 'sales',
    channels: ['voice'],
    status: 'draft',
    version: '1.0.0',
    avatar_emoji: '📞',
    voice_config: {
      inbound: {
        enabled: true,
        provider: 'retell',
        agent_id: retellJson.agent_id || null,
        from_number: null,
        webhook_url: retellJson.llm_websocket_url || null,
        kb_mode: 'shared',
        custom_kb_sources: [],
        settings: {
          language: retellJson.language || 'pt-BR',
          voice_id: retellJson.voice_id || null,
          response_delay_ms: retellJson.response_latency_threshold || 800,
          max_call_duration_seconds: retellJson.max_call_duration_seconds || 1800,
          greeting_template: retellJson.begin_message || null,
        },
        secrets: {
          api_key_ref: null,
        }
      },
      outbound: {
        enabled: false,
        provider: 'retell',
        agent_id: null,
        from_number: null,
        webhook_url: null,
        kb_mode: 'shared',
        custom_kb_sources: [],
        settings: {
          language: 'pt-BR',
          voice_id: null,
          response_delay_ms: 800,
          max_call_duration_seconds: 1800,
        },
        campaign_settings: {
          max_attempts: 3,
          retry_delay_hours: 24,
          calling_hours_start: '09:00',
          calling_hours_end: '18:00',
          calling_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
        },
        secrets: {
          api_key_ref: null,
        }
      }
    },
    persona: {
      tone: { default: 'consultivo_direto' },
      style: 'Comunicação por voz, natural e fluente',
      personality: 'Profissional e atencioso',
      system_prompt: retellJson.general_prompt || null,
    },
    tools_config: (retellJson.functions || []).map((fn: any) => ({
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters,
      enabled: true,
    })),
    guardrails: {
      never_do: [],
      handoff_triggers: ['cliente_solicita_humano'],
      rules: [],
    },
    kb_sources: [],
    intents: [],
    tests: [],
    metrics: {},
    collection_rules: null,
  };
};

// Map AI Gym JSON (restore backup)
const mapAIGymToAgent = (gymJson: any): any => {
  return {
    agent_id: gymJson.agent_id,
    name: gymJson.name,
    description: gymJson.description || `Agente restaurado de backup`,
    role: gymJson.role || 'sales',
    channels: gymJson.channels || ['whatsapp'],
    status: 'draft',
    version: gymJson.version || '1.0.0',
    avatar_emoji: gymJson.avatar_emoji || '🤖',
    voice_config: gymJson.voice_config || null,
    persona: gymJson.persona || {
      tone: gymJson.tone || { default: 'amigavel' },
      style: gymJson.style || 'Comunicação clara e objetiva',
      personality: gymJson.personality || 'Profissional',
    },
    tools_config: gymJson.tools_config || gymJson.tools || [],
    guardrails: gymJson.guardrails || { never_do: [], handoff_triggers: [] },
    kb_sources: gymJson.kb_sources || gymJson.kb?.sources || [],
    intents: gymJson.intents || [],
    tests: gymJson.tests || [],
    metrics: gymJson.metrics || {},
    collection_rules: gymJson.collection_rules || null,
  };
};

export function ImportAgentDialog({ onAgentImported }: ImportAgentDialogProps) {
  const [open, setOpen] = useState(false);
  const [parsedAgent, setParsedAgent] = useState<ParsedAgent | null>(null);
  const [agentName, setAgentName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const resetState = () => {
    setParsedAgent(null);
    setAgentName('');
    setAgentId('');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      const content = await file.text();
      const json = JSON.parse(content);
      
      const type = detectJsonType(json);
      
      if (type === 'unknown') {
        setError('Formato de JSON não reconhecido. Por favor, use um JSON exportado do Retell AI ou do AI Gym.');
        return;
      }

      let mapped: any;
      if (type === 'retell') {
        mapped = mapRetellToAIGym(json);
      } else {
        mapped = mapAIGymToAgent(json);
      }

      setParsedAgent({
        type,
        name: mapped.name,
        description: mapped.description,
        channels: mapped.channels,
        hasVoiceConfig: !!mapped.voice_config?.inbound?.enabled || !!mapped.voice_config?.outbound?.enabled,
        hasPersona: !!mapped.persona?.system_prompt || !!mapped.persona?.style,
        hasTools: (mapped.tools_config?.length || 0) > 0,
        rawData: mapped,
      });

      setAgentName(mapped.name);
      setAgentId(mapped.agent_id);
    } catch (err: any) {
      console.error('Error parsing JSON:', err);
      setError('Erro ao processar arquivo JSON. Verifique se o arquivo é válido.');
    }
  };

  const handleImport = async () => {
    if (!parsedAgent) return;

    try {
      setImporting(true);
      setError(null);

      // Check if agent_id already exists
      const { data: existing } = await supabase
        .from('ai_agents')
        .select('id')
        .eq('agent_id', agentId)
        .single();

      if (existing) {
        setError(`Já existe um agente com o ID "${agentId}". Por favor, escolha outro ID.`);
        return;
      }

      // Prepare agent data
      const agentData = {
        ...parsedAgent.rawData,
        agent_id: agentId,
        name: agentName,
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Insert into database
      const { error: insertError } = await supabase
        .from('ai_agents')
        .insert(agentData);

      if (insertError) throw insertError;

      toast({
        title: 'Agente importado!',
        description: `${agentName} foi importado com sucesso e está pronto para configuração.`,
      });

      setOpen(false);
      resetState();
      onAgentImported();
    } catch (err: any) {
      console.error('Error importing agent:', err);
      setError(err.message || 'Erro ao importar agente.');
      toast({
        title: 'Erro na importação',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const getTypeLabel = (type: JsonType) => {
    if (type === 'retell') return 'Retell AI';
    if (type === 'aigym') return 'AI Gym';
    return 'Desconhecido';
  };

  const getTypeBadgeVariant = (type: JsonType) => {
    if (type === 'retell') return 'secondary';
    if (type === 'aigym') return 'default';
    return 'destructive';
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetState();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Importar Agente
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Importar Agente
          </DialogTitle>
          <DialogDescription>
            Importe um agente a partir de um JSON do Retell AI ou de um backup do AI Gym.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Upload */}
          {!parsedAgent && (
            <div className="space-y-2">
              <Label>Selecione o arquivo JSON</Label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="json-upload"
                />
                <label htmlFor="json-upload" className="cursor-pointer">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Clique para selecionar ou arraste um arquivo JSON
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Suporta: Retell AI JSON, AI Gym Backup
                  </p>
                </label>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Parsed Agent Preview */}
          {parsedAgent && (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-4">
                {/* Type Badge */}
                <div className="flex items-center gap-2">
                  <Badge variant={getTypeBadgeVariant(parsedAgent.type)}>
                    {getTypeLabel(parsedAgent.type)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">detectado</span>
                </div>

                <Separator />

                {/* Editable Fields */}
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="agent-name">Nome do Agente</Label>
                    <Input
                      id="agent-name"
                      value={agentName}
                      onChange={(e) => {
                        setAgentName(e.target.value);
                        setAgentId(generateAgentId(e.target.value));
                      }}
                      placeholder="Nome do agente"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="agent-id">ID do Agente</Label>
                    <Input
                      id="agent-id"
                      value={agentId}
                      onChange={(e) => setAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                      placeholder="agent_id"
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Identificador único usado internamente
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Preview Info */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Configurações detectadas:</h4>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {/* Channels */}
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                      {parsedAgent.channels.includes('voice') ? (
                        <Mic className="h-4 w-4 text-primary" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-primary" />
                      )}
                      <span className="text-sm">
                        {parsedAgent.channels.join(', ')}
                      </span>
                    </div>

                    {/* Voice Config */}
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                      {parsedAgent.hasVoiceConfig ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm">
                        {parsedAgent.hasVoiceConfig ? 'Voz configurada' : 'Sem voz'}
                      </span>
                    </div>

                    {/* Persona */}
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                      {parsedAgent.hasPersona ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm">
                        {parsedAgent.hasPersona ? 'Persona definida' : 'Sem persona'}
                      </span>
                    </div>

                    {/* Tools */}
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                      {parsedAgent.hasTools ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm">
                        {parsedAgent.hasTools ? 'Ferramentas' : 'Sem ferramentas'}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  {parsedAgent.description && (
                    <p className="text-sm text-muted-foreground bg-muted/30 p-2 rounded">
                      {parsedAgent.description}
                    </p>
                  )}
                </div>

                {/* Change File */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetState}
                  className="text-muted-foreground"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Escolher outro arquivo
                </Button>
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              resetState();
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={!parsedAgent || importing || !agentName || !agentId}
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Bot className="h-4 w-4 mr-2" />
                Importar Agente
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
