import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { 
  PhoneOutgoing, 
  Settings, 
  Webhook, 
  BookOpen, 
  Loader2,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  Repeat,
  MessageSquare
} from 'lucide-react';
import { VoiceModeConfig, VoiceSettings, CampaignSettings } from '@/hooks/useAgentVoiceConfig';
import { toast } from 'sonner';
import { OutboundCallQueue } from './OutboundCallQueue';
import { OutboundCallMetrics } from './OutboundCallMetrics';

interface VoiceOutboundConfigProps {
  config: VoiceModeConfig;
  agentId: string;
  agentName: string;
  onUpdate: (updates: Partial<VoiceModeConfig>) => Promise<boolean>;
  onUpdateSettings: (settings: Partial<VoiceSettings>) => Promise<boolean>;
  onUpdateCampaignSettings: (settings: Partial<CampaignSettings>) => Promise<boolean>;
  saving: boolean;
  sharedKbSources?: any[];
}

const WEEKDAYS = [
  { id: 'mon', label: 'Seg' },
  { id: 'tue', label: 'Ter' },
  { id: 'wed', label: 'Qua' },
  { id: 'thu', label: 'Qui' },
  { id: 'fri', label: 'Sex' },
  { id: 'sat', label: 'Sáb' },
  { id: 'sun', label: 'Dom' },
];

export function VoiceOutboundConfig({
  config,
  agentId,
  agentName,
  onUpdate,
  onUpdateSettings,
  onUpdateCampaignSettings,
  saving,
  sharedKbSources
}: VoiceOutboundConfigProps) {
  const [localConfig, setLocalConfig] = useState(config);
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sofia-voice-outbound-webhook`;

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('URL copiada!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleEnabled = async () => {
    const newEnabled = !localConfig.enabled;
    setLocalConfig(prev => ({ ...prev, enabled: newEnabled }));
    await onUpdate({ enabled: newEnabled });
  };

  const handleSaveBasicConfig = async () => {
    await onUpdate({
      provider: localConfig.provider,
      agent_id: localConfig.agent_id,
      from_number: localConfig.from_number,
      kb_mode: localConfig.kb_mode
    });
  };

  const handleSaveSettings = async () => {
    await onUpdateSettings(localConfig.settings);
  };

  const handleSaveCampaignSettings = async () => {
    if (localConfig.campaign_settings) {
      await onUpdateCampaignSettings(localConfig.campaign_settings);
    }
  };

  const handleDayToggle = (dayId: string) => {
    const currentDays = localConfig.campaign_settings?.calling_days || [];
    const newDays = currentDays.includes(dayId)
      ? currentDays.filter(d => d !== dayId)
      : [...currentDays, dayId];
    
    setLocalConfig(prev => ({
      ...prev,
      campaign_settings: {
        ...prev.campaign_settings!,
        calling_days: newDays
      }
    }));
  };

  return (
    <div className="space-y-4">
      {/* Enable/Disable */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PhoneOutgoing className="h-5 w-5 text-blue-500" />
              <div>
                <CardTitle className="text-lg">Modo Outbound</CardTitle>
                <CardDescription>
                  {agentName} liga proativamente para leads
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {localConfig.enabled ? 'Ativo' : 'Desativado'}
              </span>
              <Switch
                checked={localConfig.enabled}
                onCheckedChange={handleToggleEnabled}
                disabled={saving}
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {localConfig.enabled && (
        <>
        <Accordion type="multiple" defaultValue={['provider', 'campaign']} className="space-y-2">
          {/* Provider Configuration */}
          <AccordionItem value="provider" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span>Configurações do Provider</span>
                {localConfig.agent_id ? (
                  <Badge variant="outline" className="ml-2 text-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Configurado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="ml-2 text-yellow-600">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Pendente
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Provider de Voz</Label>
                  <Select
                    value={localConfig.provider}
                    onValueChange={(v) => setLocalConfig(prev => ({ ...prev, provider: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retell">Retell AI</SelectItem>
                      <SelectItem value="vapi" disabled>Vapi (em breve)</SelectItem>
                      <SelectItem value="bland" disabled>Bland AI (em breve)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Agent ID Outbound (no {localConfig.provider})</Label>
                  <Input
                    value={localConfig.agent_id || ''}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, agent_id: e.target.value }))}
                    placeholder="agent_outbound_xxxx"
                  />
                  <p className="text-xs text-muted-foreground">
                    Crie um agente separado no Retell para chamadas de saída
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Número de Origem (Caller ID)</Label>
                  <Input
                    value={localConfig.from_number || ''}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, from_number: e.target.value }))}
                    placeholder="+55 11 99999-9999"
                  />
                  <p className="text-xs text-muted-foreground">
                    Número que aparecerá para o cliente
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Base de Conhecimento</Label>
                  <Select
                    value={localConfig.kb_mode}
                    onValueChange={(v) => setLocalConfig(prev => ({ ...prev, kb_mode: v as 'shared' | 'custom' }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shared">Compartilhada (KB do agente)</SelectItem>
                      <SelectItem value="custom">Personalizada (apenas outbound)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={handleSaveBasicConfig} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Configurações
              </Button>
            </AccordionContent>
          </AccordionItem>

          {/* Campaign Settings */}
          <AccordionItem value="campaign" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>Configurações de Campanha</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Horário de Início
                  </Label>
                  <Input
                    type="time"
                    value={localConfig.campaign_settings?.calling_hours_start || '09:00'}
                    onChange={(e) => setLocalConfig(prev => ({
                      ...prev,
                      campaign_settings: {
                        ...prev.campaign_settings!,
                        calling_hours_start: e.target.value
                      }
                    }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Horário de Término
                  </Label>
                  <Input
                    type="time"
                    value={localConfig.campaign_settings?.calling_hours_end || '18:00'}
                    onChange={(e) => setLocalConfig(prev => ({
                      ...prev,
                      campaign_settings: {
                        ...prev.campaign_settings!,
                        calling_hours_end: e.target.value
                      }
                    }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Repeat className="h-4 w-4" />
                    Máximo de Tentativas
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={localConfig.campaign_settings?.max_attempts || 3}
                    onChange={(e) => setLocalConfig(prev => ({
                      ...prev,
                      campaign_settings: {
                        ...prev.campaign_settings!,
                        max_attempts: parseInt(e.target.value) || 3
                      }
                    }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Intervalo entre Tentativas (horas)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={72}
                    value={localConfig.campaign_settings?.retry_delay_hours || 24}
                    onChange={(e) => setLocalConfig(prev => ({
                      ...prev,
                      campaign_settings: {
                        ...prev.campaign_settings!,
                        retry_delay_hours: parseInt(e.target.value) || 24
                      }
                    }))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Dias de Ligação</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map(day => (
                    <div
                      key={day.id}
                      className={`
                        px-3 py-2 rounded-md border cursor-pointer transition-colors
                        ${localConfig.campaign_settings?.calling_days?.includes(day.id)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted'
                        }
                      `}
                      onClick={() => handleDayToggle(day.id)}
                    >
                      {day.label}
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={handleSaveCampaignSettings} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Configurações de Campanha
              </Button>
            </AccordionContent>
          </AccordionItem>

          {/* Greeting Template */}
          <AccordionItem value="greeting" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                <span>Saudação Inicial</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-6 space-y-4">
              <div className="space-y-2">
                <Label>Template de Saudação</Label>
                <Textarea
                  value={localConfig.settings.greeting_template || ''}
                  onChange={(e) => setLocalConfig(prev => ({
                    ...prev,
                    settings: { ...prev.settings, greeting_template: e.target.value }
                  }))}
                  placeholder="Olá {{customer_name}}, aqui é a {{agent_name}} da COESA Energia."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Variáveis disponíveis: {'{{customer_name}}'}, {'{{agent_name}}'}, {'{{last_proposal_discount}}'}, {'{{days_since_contact}}'}
                </p>
              </div>

              <Button onClick={handleSaveSettings} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Saudação
              </Button>
            </AccordionContent>
          </AccordionItem>

          {/* Webhook Configuration */}
          <AccordionItem value="webhook" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Webhook className="h-4 w-4" />
                <span>Webhook</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-6 space-y-4">
              <div className="space-y-2">
                <Label>URL do Webhook (LLM Function Outbound)</Label>
                <div className="flex gap-2">
                  <Input
                    value={webhookUrl}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button variant="outline" size="icon" onClick={handleCopyWebhook}>
                    {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Configure esta URL no agente Outbound do Retell
                </p>
              </div>

              <Separator />

              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <h4 className="font-medium text-sm">Importante para Outbound:</h4>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>Crie um agente <strong>separado</strong> no Retell para outbound</li>
                  <li>Configure o webhook acima nesse novo agente</li>
                  <li>O prompt será diferente: saudação proativa + contexto do lead</li>
                  <li>O sistema passará variáveis dinâmicas via <code>retell_llm_dynamic_variables</code></li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Voice Settings */}
          <AccordionItem value="settings" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span>Configurações de Voz</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-4 pb-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Idioma</Label>
                  <Select
                    value={localConfig.settings.language}
                    onValueChange={(v) => setLocalConfig(prev => ({
                      ...prev,
                      settings: { ...prev.settings, language: v }
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                      <SelectItem value="en-US">English (US)</SelectItem>
                      <SelectItem value="es-ES">Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Voice ID</Label>
                  <Input
                    value={localConfig.settings.voice_id || ''}
                    onChange={(e) => setLocalConfig(prev => ({
                      ...prev,
                      settings: { ...prev.settings, voice_id: e.target.value }
                    }))}
                    placeholder="voice_id_xxxxx"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Duração máxima (segundos)</Label>
                  <Input
                    type="number"
                    value={localConfig.settings.max_call_duration_seconds}
                    onChange={(e) => setLocalConfig(prev => ({
                      ...prev,
                      settings: { ...prev.settings, max_call_duration_seconds: parseInt(e.target.value) || 300 }
                    }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Recomendado: 300s (5 min) para outbound
                  </p>
                </div>
              </div>

              <Button onClick={handleSaveSettings} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Configurações de Voz
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Metrics and Queue Section */}
        <Separator className="my-6" />
        
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-4">📊 Métricas de Ligações</h3>
            <OutboundCallMetrics />
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-4">📋 Fila de Ligações</h3>
            <OutboundCallQueue />
          </div>
        </div>
        </>
      )}
    </div>
  );
}
