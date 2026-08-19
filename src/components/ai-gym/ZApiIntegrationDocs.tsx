import { useState, useMemo } from 'react';
import { Check, Copy, ExternalLink, Link2, AlertCircle, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ZApiIntegrationDocsProps {
  agentId: string;
  agentName: string;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://cvcdweqybgfxywcelriq.supabase.co';

// Map agent_id to their dedicated webhook
const AGENT_WEBHOOKS: Record<string, string> = {
  'sofia': '/functions/v1/z-api-webhook', // Sofia uses the original webhook
  'maria': '/functions/v1/maria-webhook',
  'julia': '/functions/v1/julia-webhook',
  'iago': '/functions/v1/iago-webhook',
  'jaime': '/functions/v1/jaime-webhook',
};

interface WebhookField {
  id: string;
  label: string;
  description: string;
  required: boolean;
  icon: string;
}

// Base webhook fields (endpoint is now dynamic based on agent)
const WEBHOOK_FIELDS: WebhookField[] = [
  {
    id: 'on_receive',
    label: 'Ao receber',
    description: 'Webhook principal para receber mensagens dos clientes',
    required: true,
    icon: '📩',
  },
  {
    id: 'on_send',
    label: 'Ao enviar',
    description: 'Notifica quando uma mensagem é enviada',
    required: false,
    icon: '📤',
  },
  {
    id: 'on_status',
    label: 'Receber status da mensagem',
    description: 'Recebe atualizações de status (entregue, lido, etc.)',
    required: false,
    icon: '✓✓',
  },
  {
    id: 'on_connect',
    label: 'Ao conectar',
    description: 'Notifica quando a instância conecta ao WhatsApp',
    required: false,
    icon: '🔗',
  },
  {
    id: 'on_disconnect',
    label: 'Ao desconectar',
    description: 'Notifica quando a instância desconecta',
    required: false,
    icon: '⛓️‍💥',
  },
  {
    id: 'chat_presence',
    label: 'Presença do chat',
    description: 'Notifica sobre digitando/online do contato',
    required: false,
    icon: '👀',
  },
];

export function ZApiIntegrationDocs({ agentId, agentName }: ZApiIntegrationDocsProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [notifySentByMe, setNotifySentByMe] = useState(false);

  // Get the dedicated webhook endpoint for this agent
  const agentWebhookEndpoint = useMemo(() => {
    return AGENT_WEBHOOKS[agentId] || `/functions/v1/${agentId}-webhook`;
  }, [agentId]);

  const getFullUrl = (endpoint: string) => {
    return `${SUPABASE_URL}${endpoint}`;
  };

  const getAgentWebhookUrl = () => {
    return getFullUrl(agentWebhookEndpoint);
  };

  const copyToClipboard = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      toast.success('URL copiada para a área de transferência');
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      toast.error('Falha ao copiar');
    }
  };

  const copyAllWebhooks = async () => {
    const allUrls = WEBHOOK_FIELDS.map(f => `${f.label}: ${getAgentWebhookUrl()}`).join('\n');
    try {
      await navigator.clipboard.writeText(allUrls);
      toast.success('Todas as URLs copiadas');
    } catch (err) {
      toast.error('Falha ao copiar');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-green-600" />
          Integração Z-API
        </CardTitle>
        <CardDescription>
          Configure os webhooks abaixo no painel do Z-API para conectar {agentName} ao WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Agent-specific webhook info */}
        <Alert className="border-primary/50 bg-primary/5">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription>
            Este é o webhook <strong>exclusivo</strong> para <strong>{agentName}</strong>. 
            Cada agente possui seu próprio endpoint para garantir que as configurações corretas sejam aplicadas.
          </AlertDescription>
        </Alert>

        {/* Alert for main webhook */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            O webhook <strong>"Ao receber"</strong> é obrigatório para o funcionamento do agente. 
            Os demais são opcionais mas recomendados para melhor monitoramento.
          </AlertDescription>
        </Alert>

        {/* Webhook Fields */}
        <div className="space-y-4">
          {WEBHOOK_FIELDS.map((field) => (
            <div key={field.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <span>{field.icon}</span>
                  {field.label}
                  {field.required && (
                    <Badge variant="destructive" className="text-[10px] px-1.5">
                      Obrigatório
                    </Badge>
                  )}
                </Label>
              </div>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={getAgentWebhookUrl()}
                  className="font-mono text-xs bg-muted"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => copyToClipboard(getAgentWebhookUrl(), field.id)}
                >
                  {copiedField === field.id ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{field.description}</p>
            </div>
          ))}
        </div>

        {/* Notify sent by me toggle info */}
        <div className="pt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2">
                <span>📱</span>
                Notificar as enviadas por mim também
              </Label>
              <p className="text-xs text-muted-foreground">
                Ative esta opção no Z-API se quiser registrar mensagens enviadas manualmente pelo operador.
              </p>
            </div>
            <Switch
              checked={notifySentByMe}
              onCheckedChange={setNotifySentByMe}
              disabled
            />
          </div>
          <p className="text-xs text-amber-600 mt-2">
            * Esta configuração deve ser feita diretamente no painel do Z-API
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2 pt-4 border-t">
          <Button variant="outline" size="sm" onClick={copyAllWebhooks}>
            <Copy className="h-4 w-4 mr-2" />
            Copiar todas URLs
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <a 
              href="https://developer.z-api.io/webhooks/introduction" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Documentação Z-API
            </a>
          </Button>
        </div>

        {/* Recommended Settings */}
        <div className="pt-4 border-t">
          <h4 className="font-medium mb-3 flex items-center gap-2">
            ⚙️ Configurações Recomendadas no Z-API
          </h4>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span className="text-muted-foreground">Rejeitar chamadas automático: <strong>Ativado</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span className="text-muted-foreground">Ler mensagens automático: <strong>Ativado</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-amber-600">○</span>
              <span className="text-muted-foreground">Ler status automaticamente: <strong>Opcional</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              <span className="text-muted-foreground">Desabilitar enfileiramento quando WhatsApp desconectado: <strong>Ativado</strong></span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
