import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Phone, PhoneOutgoing, PhoneIncoming, Settings } from 'lucide-react';
import { useAgentVoiceConfig } from '@/hooks/useAgentVoiceConfig';
import { VoiceInboundConfig } from './VoiceInboundConfig';
import { VoiceOutboundConfig } from './VoiceOutboundConfig';
import { AgentSecretsManager } from './AgentSecretsManager';

interface VoiceModeConfigProps {
  agentId: string;
  agentDbId: string;
  agentName: string;
  sharedKbSources?: any[];
}

export function VoiceModeConfig({ agentId, agentDbId, agentName, sharedKbSources }: VoiceModeConfigProps) {
  const [activeMode, setActiveMode] = useState<'inbound' | 'outbound'>('inbound');
  const voiceConfig = useAgentVoiceConfig(agentDbId);

  if (voiceConfig.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const inboundEnabled = voiceConfig.config.inbound.enabled;
  const outboundEnabled = voiceConfig.config.outbound.enabled;

  return (
    <div className="space-y-6">
      {/* Header com status */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Configurações de Voz</CardTitle>
                <CardDescription>
                  Configure {agentName} para atender e fazer ligações
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant={inboundEnabled ? 'default' : 'secondary'}>
                <PhoneIncoming className="h-3 w-3 mr-1" />
                Inbound {inboundEnabled ? 'ON' : 'OFF'}
              </Badge>
              <Badge variant={outboundEnabled ? 'default' : 'secondary'}>
                <PhoneOutgoing className="h-3 w-3 mr-1" />
                Outbound {outboundEnabled ? 'ON' : 'OFF'}
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Tabs Inbound/Outbound */}
      <Tabs value={activeMode} onValueChange={(v) => setActiveMode(v as 'inbound' | 'outbound')}>
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="inbound" className="flex items-center gap-2">
            <PhoneIncoming className="h-4 w-4" />
            Receber Ligações
          </TabsTrigger>
          <TabsTrigger value="outbound" className="flex items-center gap-2">
            <PhoneOutgoing className="h-4 w-4" />
            Fazer Ligações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbound" className="mt-6 space-y-6">
          <VoiceInboundConfig
            config={voiceConfig.config.inbound}
            agentId={agentId}
            agentName={agentName}
            onUpdate={(updates) => voiceConfig.updateConfig('inbound', updates)}
            onUpdateSettings={(settings) => voiceConfig.updateSettings('inbound', settings)}
            saving={voiceConfig.saving}
            sharedKbSources={sharedKbSources}
          />
          
          <AgentSecretsManager
            secrets={voiceConfig.secrets.filter(s => s.mode === 'inbound' || s.mode === 'shared')}
            mode="inbound"
            onAdd={(name, key, desc) => voiceConfig.addSecret(name, key, 'inbound', desc)}
            onRemove={voiceConfig.removeSecret}
            onMarkConfigured={voiceConfig.markSecretConfigured}
          />
        </TabsContent>

        <TabsContent value="outbound" className="mt-6 space-y-6">
          <VoiceOutboundConfig
            config={voiceConfig.config.outbound}
            agentId={agentId}
            agentName={agentName}
            onUpdate={(updates) => voiceConfig.updateConfig('outbound', updates)}
            onUpdateSettings={(settings) => voiceConfig.updateSettings('outbound', settings)}
            onUpdateCampaignSettings={voiceConfig.updateCampaignSettings}
            saving={voiceConfig.saving}
            sharedKbSources={sharedKbSources}
          />
          
          <AgentSecretsManager
            secrets={voiceConfig.secrets.filter(s => s.mode === 'outbound' || s.mode === 'shared')}
            mode="outbound"
            onAdd={(name, key, desc) => voiceConfig.addSecret(name, key, 'outbound', desc)}
            onRemove={voiceConfig.removeSecret}
            onMarkConfigured={voiceConfig.markSecretConfigured}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
