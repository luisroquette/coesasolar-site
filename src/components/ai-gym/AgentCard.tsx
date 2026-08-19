import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Download, 
  Play, 
  Pause, 
  Settings2, 
  TestTube,
  Rocket,
  MessageCircle,
  Mail,
  Globe,
  Loader2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import JSZip from 'jszip';

// Importar código fonte das Edge Functions como texto raw
// @ts-ignore - Vite raw import
import sofiaWebhookSource from '../../../supabase/functions/sofia-webhook/index.ts?raw';

interface AgentCardProps {
  agent: {
    id: string;
    agent_id: string;
    name: string;
    role: string;
    description: string;
    avatar_emoji: string;
    channels: string[];
    status: string;
    version: string;
    updated_at: string;
    published_at: string | null;
    persona?: any;
    guardrails?: any;
    tools_config?: any;
    intents?: any;
    kb_sources?: any;
    collection_rules?: any;
    tests?: any;
    metrics?: any;
  };
  onEdit: () => void;
  onDownload: () => void;
  onStatusChange: (status: string) => void;
  isAdmin: boolean;
}

const roleLabels: Record<string, { label: string; color: string }> = {
  sales: { label: 'Vendas', color: 'bg-blue-500/10 text-blue-600' },
  customer_support: { label: 'SAC', color: 'bg-green-500/10 text-green-600' },
  collections: { label: 'Cobrança', color: 'bg-orange-500/10 text-orange-600' }
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: 'Rascunho', variant: 'outline' },
  testing: { label: 'Em Teste', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'destructive' }
};

const channelIcons: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle className="h-3 w-3" />,
  email: <Mail className="h-3 w-3" />,
  web: <Globe className="h-3 w-3" />
};

export function AgentCard({ agent, onEdit, onDownload, onStatusChange, isAdmin }: AgentCardProps) {
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();
  
  const roleInfo = roleLabels[agent.role] || { label: agent.role, color: 'bg-muted text-muted-foreground' };
  const statusInfo = statusConfig[agent.status] || { label: agent.status, variant: 'outline' as const };

  // Mapa de códigos fonte por agent_id
  const getSourceCode = (agentId: string): string => {
    const sourceMap: Record<string, string> = {
      'sofia': sofiaWebhookSource,
      // Adicionar outros agentes aqui quando necessário
    };
    return sourceMap[agentId] || `// Código fonte não disponível para ${agentId}`;
  };

  const handleDownloadComplete = async () => {
    try {
      setDownloading(true);
      toast({
        title: 'Preparando download...',
        description: 'Gerando pacote completo do agente.'
      });

      // Buscar dados adicionais da edge function (README, prompts, etc)
      const response = await supabase.functions.invoke('agent-source-export', {
        body: { agent_id: agent.agent_id }
      });

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
      
      // CÓDIGO FONTE: usar raw import local (8889 linhas da Sofia!)
      const sourceCode = getSourceCode(agent.agent_id);
      zip.folder('source')?.file('index.ts', sourceCode);
      
      // Adicionar arquivos complementares da edge function
      if (exportData?.files) {
        if (exportData.files['README.md']) {
          zip.file('README.md', exportData.files['README.md']);
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
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="text-4xl">{agent.avatar_emoji}</div>
            <div>
              <CardTitle className="text-xl">{agent.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={statusInfo.variant}>
                  {statusInfo.label}
                </Badge>
                <span className={`text-xs px-2 py-0.5 rounded-full ${roleInfo.color}`}>
                  {roleInfo.label}
                </span>
              </div>
            </div>
          </div>
          <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            v{agent.version}
          </code>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <CardDescription className="line-clamp-2">
          {agent.description}
        </CardDescription>

        {/* Channels */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Canais:</span>
          <div className="flex gap-1">
            {agent.channels.map(channel => (
              <Badge key={channel} variant="outline" className="text-xs gap-1">
                {channelIcons[channel]}
                {channel}
              </Badge>
            ))}
          </div>
        </div>

        {/* Updated at */}
        <p className="text-xs text-muted-foreground">
          Atualizado em {format(new Date(agent.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </p>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
            <Settings2 className="h-4 w-4 mr-2" />
            Editar
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDownloadComplete}
            disabled={downloading}
            title="Download pacote completo (ZIP)"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Rocket className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onStatusChange('testing')}>
                  <TestTube className="h-4 w-4 mr-2" />
                  Colocar em Teste
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onStatusChange('active')}>
                  <Play className="h-4 w-4 mr-2" />
                  Ativar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onStatusChange('paused')}>
                  <Pause className="h-4 w-4 mr-2" />
                  Pausar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
