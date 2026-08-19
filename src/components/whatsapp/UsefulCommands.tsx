import { Terminal, RotateCcw, BarChart3, Copy, Check, Wifi, Volume2, UserCheck, ArrowLeftRight, HelpCircle, MessageSquareWarning, Brain } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Command {
  command: string;
  description: string;
  icon: React.ReactNode;
  variant: 'default' | 'destructive' | 'outline' | 'secondary';
  details: string[];
  category?: 'teste' | 'atendimento' | 'geral';
}

const commands: Command[] = [
  // Comandos Gerais
  {
    command: '#AJUDA',
    description: 'Lista todos os comandos disponíveis e suas funções',
    icon: <HelpCircle className="h-4 w-4" />,
    variant: 'default',
    category: 'geral',
    details: [
      'Mostra todos os comandos de teste',
      'Mostra todos os comandos de atendimento',
      'Explica o que cada comando faz',
      'Funciona para qualquer agente e número',
    ],
  },
  // Comandos de Atendimento
  {
    command: '#ASSUMIR',
    description: 'Atendente toma o controle da conversa - IA para de responder',
    icon: <UserCheck className="h-4 w-4" />,
    variant: 'default',
    category: 'atendimento',
    details: [
      'Enviar dentro do chat do cliente (via ChatApp)',
      'Agente de IA para de responder automaticamente',
      'Conversa fica marcada como "atendimento humano"',
      'Também funciona: #MEU ou #TAKEOVER',
    ],
  },
  {
    command: '#RESOLVIDO',
    description: 'Devolve a conversa para a IA após atendimento humano',
    icon: <ArrowLeftRight className="h-4 w-4" />,
    variant: 'secondary',
    category: 'atendimento',
    details: [
      'Enviar do WhatsApp do atendente (não do cliente)',
      'Agente de IA volta a responder automaticamente',
      'Registra métricas de tempo de resolução',
      'Também funciona: #DEVOLVER ou #SOFIA',
    ],
  },
  {
    command: '#CORRIGIR',
    description: 'Ensina a Sofia qual seria a resposta correta — IA aprende com a correção',
    icon: <Brain className="h-4 w-4" />,
    variant: 'default',
    category: 'atendimento',
    details: [
      'Formato: #CORRIGIR A resposta correta era: [sua correção]',
      'Captura a última mensagem da Sofia automaticamente',
      'IA extrai uma regra generalizável da correção',
      'Regra é salva na memória de regras (rule_memory)',
      'Sofia não repetirá o mesmo erro em conversas futuras',
    ],
  },
  {
    command: '#SAC',
    description: 'Encaminha a conversa para o atendimento SAC (Maria)',
    icon: <MessageSquareWarning className="h-4 w-4" />,
    variant: 'outline',
    category: 'atendimento',
    details: [
      'Transfere o contexto da conversa para a Maria (SAC)',
      'Cliente é notificado sobre a transferência',
      'Útil para questões de suporte pós-venda',
      'Sofia para de atender essa conversa',
    ],
  },
  // Comandos de Teste
  {
    command: '#PING_TESTE',
    description: 'Verifica se o agente está recebendo e processando mensagens',
    icon: <Wifi className="h-4 w-4" />,
    variant: 'outline',
    category: 'teste',
    details: [
      'Confirma recebimento da mensagem',
      'Mostra status dos serviços',
      'Exibe timestamp e dados detectados',
      'Não altera nenhum dado',
    ],
  },
  {
    command: '#VOZ_TESTE',
    description: 'Testa a voz personalizada do agente via ElevenLabs',
    icon: <Volume2 className="h-4 w-4" />,
    variant: 'outline',
    category: 'teste',
    details: [
      'Gera áudio com ElevenLabs TTS',
      'Envia mensagem de voz no WhatsApp',
      'Usa a voz personalizada configurada',
      'Agente também oferece áudio automaticamente para respostas longas',
    ],
  },
  {
    command: '#STATUS_TESTE',
    description: 'Retorna o estado atual da conversa sem apagar nada',
    icon: <BarChart3 className="h-4 w-4" />,
    variant: 'outline',
    category: 'teste',
    details: [
      'Lead Score atual',
      'Dados coletados',
      'Stage no Bitrix24',
      'Status do funil',
    ],
  },
  {
    command: '#RESET_TESTE',
    description: 'Limpa todos os dados da conversa para reiniciar o fluxo do zero',
    icon: <RotateCcw className="h-4 w-4" />,
    variant: 'destructive',
    category: 'teste',
    details: [
      'Exclui lead no Bitrix24',
      'Remove proposta criada',
      'Apaga mensagens e conversa',
      'Limpa contato CRM local',
    ],
  },
];

export function UsefulCommands() {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const handleCopy = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedCommand(command);
    toast.success(`Comando "${command}" copiado!`);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">Palavras Úteis</CardTitle>
        </div>
        <CardDescription>
          Comandos especiais para uso via WhatsApp — funcionam para qualquer número
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Comando Geral - Ajuda */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            Comando Geral
          </h4>
          <div className="space-y-4">
            {commands.filter(cmd => cmd.category === 'geral').map((cmd) => (
              <div
                key={cmd.command}
                className="p-4 border rounded-lg space-y-3 bg-primary/5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      {cmd.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <code className="px-2 py-1 bg-primary/20 rounded text-sm font-mono font-semibold">
                          {cmd.command}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleCopy(cmd.command)}
                        >
                          {copiedCommand === cmd.command ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {cmd.description}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="pl-11">
                  <p className="text-xs text-muted-foreground mb-2">Este comando irá:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {cmd.details.map((detail, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Comandos de Atendimento */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-primary flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            Comandos de Atendimento
          </h4>
          <div className="space-y-4">
            {commands.filter(cmd => cmd.category === 'atendimento').map((cmd) => (
              <div
                key={cmd.command}
                className="p-4 border rounded-lg space-y-3 bg-primary/5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      cmd.variant === 'destructive' 
                        ? 'bg-destructive/10 text-destructive' 
                        : cmd.variant === 'secondary'
                        ? 'bg-secondary text-secondary-foreground'
                        : 'bg-primary/10 text-primary'
                    }`}>
                      {cmd.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <code className="px-2 py-1 bg-primary/20 rounded text-sm font-mono font-semibold">
                          {cmd.command}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleCopy(cmd.command)}
                        >
                          {copiedCommand === cmd.command ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {cmd.description}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="pl-11">
                  <p className="text-xs text-muted-foreground mb-2">Este comando irá:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {cmd.details.map((detail, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Comandos de Teste */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Comandos de Teste
          </h4>
          <div className="space-y-4">
            {commands.filter(cmd => cmd.category === 'teste').map((cmd) => (
              <div
                key={cmd.command}
                className="p-4 border rounded-lg space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      cmd.variant === 'destructive' 
                        ? 'bg-destructive/10 text-destructive' 
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {cmd.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <code className="px-2 py-1 bg-muted rounded text-sm font-mono font-semibold">
                          {cmd.command}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleCopy(cmd.command)}
                        >
                          {copiedCommand === cmd.command ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {cmd.description}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="pl-11">
                  <p className="text-xs text-muted-foreground mb-2">Este comando irá:</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {cmd.details.map((detail, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            💡 Todos os comandos funcionam para qualquer número de WhatsApp.
            Envie <code className="px-1 bg-muted rounded">#AJUDA</code> para ver esta lista diretamente no WhatsApp.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
