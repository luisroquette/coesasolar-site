import { useState } from 'react';
import { useUIConfig } from '@/hooks/useUIConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Loader2, Bot, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CreateAgentDialogProps {
  onAgentCreated: () => void;
}

// Options are now loaded from useUIConfig

export function CreateAgentDialog({ onAgentCreated }: CreateAgentDialogProps) {
  const { agentEmojiOptions, agentRoleOptions, agentChannelOptions } = useUIConfig();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  // Form state
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [description, setDescription] = useState('');
  const [role, setRole] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [avatar, setAvatar] = useState('🤖');
  const [channels, setChannels] = useState<string[]>(['whatsapp']);
  
  // Persona
  const [tone, setTone] = useState('consultivo_direto');
  const [style, setStyle] = useState('');
  const [personality, setPersonality] = useState('');

  const resetForm = () => {
    setName('');
    setAgentId('');
    setDescription('');
    setRole('');
    setCustomRole('');
    setAvatar('🤖');
    setChannels(['whatsapp']);
    setTone('consultivo_direto');
    setStyle('');
    setPersonality('');
  };

  const generateAgentId = (agentName: string) => {
    return agentName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 20);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!agentId || agentId === generateAgentId(name)) {
      setAgentId(generateAgentId(value));
    }
  };

  const toggleChannel = (channel: string) => {
    setChannels(prev => 
      prev.includes(channel) 
        ? prev.filter(c => c !== channel)
        : [...prev, channel]
    );
  };

  const handleCreate = async () => {
    if (!name.trim() || !agentId.trim() || !role) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha o nome, ID e papel do agente.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setCreating(true);

      const finalRole = role === 'custom' ? customRole : role;

      const newAgent = {
        agent_id: agentId,
        name: name.trim(),
        description: description.trim() || `Agente de ${agentRoleOptions.find(r => r.value === role)?.label || finalRole}`,
        role: finalRole,
        avatar_emoji: avatar,
        channels: channels,
        status: 'draft',
        version: '1.0.0',
        persona: {
          tone: {
            default: tone,
            allowed: [tone, 'empatico', 'tecnico']
          },
          style: style || 'Comunicação clara e objetiva',
          personality: personality || 'Profissional, prestativo e empático'
        },
        guardrails: {
          never_do: [
            'Inventar informações não verificadas',
            'Prometer o que não pode cumprir',
            'Compartilhar dados de outros clientes'
          ],
          handoff_triggers: [
            'cliente_solicita_humano',
            'falha_repetida',
            'situacao_complexa'
          ]
        },
        tools_config: [],
        intents: [],
        kb_sources: [],
        collection_rules: role === 'collections' ? {
          max_daily_contacts: 3,
          contact_hours: { start: '08:00', end: '20:00' },
          weekend_allowed: false,
          escalation_after_days: 7
        } : null,
        metrics: {},
        tests: []
      };

      const { data, error } = await supabase
        .from('ai_agents')
        .insert(newAgent)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Agente criado!',
        description: `${name} foi criado com sucesso. Agora você pode configurá-lo.`
      });

      resetForm();
      setOpen(false);
      onAgentCreated();
    } catch (error: any) {
      console.error('Error creating agent:', error);
      toast({
        title: 'Erro ao criar agente',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Agente
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Criar Novo Agente de IA
          </DialogTitle>
          <DialogDescription>
            Configure a identidade e características básicas do seu novo agente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Avatar e Nome */}
          <div className="flex gap-4">
            <div className="space-y-2">
              <Label>Avatar</Label>
              <div className="flex flex-wrap gap-2 p-3 border rounded-lg w-40">
                {agentEmojiOptions.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setAvatar(emoji)}
                    className={`text-2xl p-1 rounded hover:bg-muted transition-colors ${
                      avatar === emoji ? 'bg-primary/20 ring-2 ring-primary' : ''
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Agente *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="ex: Sofia, Luna, Max..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-id">ID do Agente *</Label>
                <Input
                  id="agent-id"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="identificador_unico"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Identificador único usado internamente (sem espaços ou acentos)
                </p>
              </div>
            </div>
          </div>

          {/* Papel */}
          <div className="space-y-2">
            <Label>Papel do Agente *</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o papel principal..." />
              </SelectTrigger>
              <SelectContent>
                {agentRoleOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div>
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-muted-foreground ml-2 text-sm">
                        - {opt.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {role === 'custom' && (
              <Input
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                placeholder="Digite o papel customizado..."
                className="mt-2"
              />
            )}
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o objetivo e responsabilidades deste agente..."
              rows={3}
            />
          </div>

          {/* Canais */}
          <div className="space-y-2">
            <Label>Canais de Atendimento</Label>
            <div className="flex flex-wrap gap-4">
              {agentChannelOptions.map(channel => (
                <div key={channel.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`channel-${channel.value}`}
                    checked={channels.includes(channel.value)}
                    onCheckedChange={() => toggleChannel(channel.value)}
                  />
                  <label
                    htmlFor={`channel-${channel.value}`}
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    {channel.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Persona Básica */}
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
            <h3 className="font-medium flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Personalidade Básica
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tone">Tom de Voz</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultivo_direto">Consultivo e Direto</SelectItem>
                    <SelectItem value="empatico">Empático e Acolhedor</SelectItem>
                    <SelectItem value="tecnico">Técnico e Preciso</SelectItem>
                    <SelectItem value="persuasivo">Persuasivo e Motivador</SelectItem>
                    <SelectItem value="informal">Informal e Descontraído</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="style">Estilo de Comunicação</Label>
              <Input
                id="style"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                placeholder="ex: Mensagens curtas e objetivas, uso de emojis moderado"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="personality">Traços de Personalidade</Label>
              <Input
                id="personality"
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder="ex: Prestativo, paciente, proativo, bem-humorado"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Criar Agente
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}