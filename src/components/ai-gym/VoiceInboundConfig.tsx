import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
  PhoneIncoming, 
  Settings, 
  Webhook, 
  BookOpen, 
  Loader2,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { VoiceModeConfig, VoiceSettings } from '@/hooks/useAgentVoiceConfig';
import { toast } from 'sonner';

interface VoiceInboundConfigProps {
  config: VoiceModeConfig;
  agentId: string;
  agentName: string;
  onUpdate: (updates: Partial<VoiceModeConfig>) => Promise<boolean>;
  onUpdateSettings: (settings: Partial<VoiceSettings>) => Promise<boolean>;
  saving: boolean;
  sharedKbSources?: any[];
}

export function VoiceInboundConfig({
  config,
  agentId,
  agentName,
  onUpdate,
  onUpdateSettings,
  saving,
  sharedKbSources
}: VoiceInboundConfigProps) {
  const [localConfig, setLocalConfig] = useState(config);
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sofia-voice-webhook`;

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

  return (
    <div className="space-y-4">
      {/* Enable/Disable */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PhoneIncoming className="h-5 w-5 text-green-500" />
              <div>
                <CardTitle className="text-lg">Modo Inbound</CardTitle>
                <CardDescription>
                  {agentName} recebe ligações de clientes
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
        <Accordion type="multiple" defaultValue={['provider', 'webhook']} className="space-y-2">
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
                  <Label>Agent ID (no {localConfig.provider})</Label>
                  <Input
                    value={localConfig.agent_id || ''}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, agent_id: e.target.value }))}
                    placeholder="agent_xxxxxxxxxxxx"
                  />
                  <p className="text-xs text-muted-foreground">
                    ID do agente criado no painel do Retell
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Número de Origem</Label>
                  <Input
                    value={localConfig.from_number || ''}
                    onChange={(e) => setLocalConfig(prev => ({ ...prev, from_number: e.target.value }))}
                    placeholder="+55 11 99999-9999"
                  />
                  <p className="text-xs text-muted-foreground">
                    Número configurado no Twilio/Retell
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
                      <SelectItem value="custom">Personalizada (apenas voz)</SelectItem>
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
                <Label>URL do Webhook (LLM Function)</Label>
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
                  Configure esta URL como "Custom LLM Function" no Retell AI
                </p>
              </div>

              <Separator />

              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <h4 className="font-medium text-sm">Como configurar no Retell:</h4>
                <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                  <li>Acesse o painel do Retell AI</li>
                  <li>Vá em "Agents" → seu agente → "LLM"</li>
                  <li>Selecione "Custom LLM"</li>
                  <li>Cole a URL acima no campo "Webhook URL"</li>
                  <li>Configure timeout para 15 segundos</li>
                  <li>Salve as alterações</li>
                </ol>
                <Button variant="link" size="sm" className="p-0 h-auto" asChild>
                  <a href="https://docs.retellai.com" target="_blank" rel="noopener noreferrer">
                    Ver documentação do Retell
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
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
                  <Label>Voice ID (ElevenLabs/Retell)</Label>
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
                  <Label>Delay de Resposta (ms)</Label>
                  <Input
                    type="number"
                    value={localConfig.settings.response_delay_ms}
                    onChange={(e) => setLocalConfig(prev => ({
                      ...prev,
                      settings: { ...prev.settings, response_delay_ms: parseInt(e.target.value) || 0 }
                    }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Silêncio para encerrar (ms)</Label>
                  <Input
                    type="number"
                    value={localConfig.settings.end_call_after_silence_ms || 5000}
                    onChange={(e) => setLocalConfig(prev => ({
                      ...prev,
                      settings: { ...prev.settings, end_call_after_silence_ms: parseInt(e.target.value) || 5000 }
                    }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Duração máxima (segundos)</Label>
                  <Input
                    type="number"
                    value={localConfig.settings.max_call_duration_seconds}
                    onChange={(e) => setLocalConfig(prev => ({
                      ...prev,
                      settings: { ...prev.settings, max_call_duration_seconds: parseInt(e.target.value) || 600 }
                    }))}
                  />
                </div>
              </div>

              <Button onClick={handleSaveSettings} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar Configurações de Voz
              </Button>
            </AccordionContent>
          </AccordionItem>

          {/* KB Section */}
          {localConfig.kb_mode === 'custom' && (
            <AccordionItem value="kb" className="border rounded-lg px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  <span>Base de Conhecimento (Voz)</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4 pb-6">
                <p className="text-sm text-muted-foreground">
                  Configure uma base de conhecimento específica para interações de voz.
                  Isso permite respostas mais concisas e adaptadas para conversas faladas.
                </p>
                {/* Aqui pode integrar um KnowledgeBaseManager específico */}
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      )}
    </div>
  );
}
