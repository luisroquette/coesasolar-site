import { useState, useRef, useEffect } from 'react';
import { useUIConfig } from '@/hooks/useUIConfig';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Send, 
  RotateCcw, 
  MessageSquare,
  User,
  Bot,
  Clock,
  Sparkles,
  AlertCircle,
  Loader2,
  Phone
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { VoiceSimulator } from './VoiceSimulator';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  responseTime?: number;
  toolsUsed?: string[];
  intent?: string;
}

interface AIAgent {
  id: string;
  agent_id: string;
  name: string;
  role: string;
  description: string;
  avatar_emoji: string;
  channels?: string[];
  persona: any;
  guardrails: any;
  tools_config: any;
  intents: any;
  kb_sources: any;
  collection_rules: any;
  voice_config?: any;
}

interface AgentSimulatorProps {
  agent: AIAgent;
}

export function AgentSimulator({ agent }: AgentSimulatorProps) {
  const { simulatorMaxHistoryMsgLength } = useUIConfig();
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionStats, setSessionStats] = useState({
    totalMessages: 0,
    avgResponseTime: 0,
    intentsDetected: [] as string[]
  });
  const [voiceStats, setVoiceStats] = useState({ messages: 0, duration: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Add initial greeting
    const greeting: Message = {
      id: 'greeting',
      role: 'assistant',
      content: getAgentGreeting(agent),
      timestamp: new Date()
    };
    setMessages([greeting]);
  }, [agent.agent_id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getAgentGreeting = (agent: AIAgent): string => {
    // Prioridade 1: Greeting template do voice_config
    const voiceConfig = agent.persona?.voice_config || (agent as any).voice_config;
    if (voiceConfig?.inbound?.greeting_template) {
      return voiceConfig.inbound.greeting_template;
    }
    
    // Prioridade 2: Greeting da persona
    const persona = agent.persona || {};
    if (persona.greeting) {
      return persona.greeting;
    }
    
    // Prioridade 3: Fallback baseado no role (usando dados do agent)
    const agentName = agent.name || 'Assistente';
    const description = agent.description || 'assistente virtual';
    
    switch (agent.role) {
      case 'sales':
        return `Olá! 👋 Sou ${agentName}, ${description}. Como posso te ajudar?`;
      case 'customer_support':
        return `Olá! 👋 Sou ${agentName}, ${description}. Em que posso ajudar?`;
      case 'collections':
        return `Olá! Aqui é ${agentName}. Estou entrando em contato para ajudá-lo.`;
      default:
        return `Olá! Sou ${agentName}. Como posso te ajudar?`;
    }
  };

  const buildSystemPrompt = (): string => {
    const persona = agent.persona || {};
    const guardrails = agent.guardrails || {};
    const tools = agent.tools_config || [];
    const intents = agent.intents || [];
    const collectionRules = agent.collection_rules;

    let prompt = `Você é ${agent.name}, ${agent.description || 'uma assistente virtual da COESA'}.

## Personalidade e Tom
- Tom padrão: ${persona.tone?.default || 'consultivo e direto'}
- Tons permitidos: ${persona.tone?.allowed?.join(', ') || 'empático, técnico'}
- Estilo: ${persona.style || 'Profissional mas amigável'}
- Personalidade: ${persona.personality || 'Prestativa e proativa'}

## O que você NUNCA deve fazer:
${guardrails.never_do?.map((item: string) => `- ${item}`).join('\n') || '- Inventar dados\n- Prometer o que não pode cumprir'}

## Quando escalar para humano:
${guardrails.handoff_triggers?.map((item: string) => `- ${item}`).join('\n') || '- Reclamação grave\n- Suspeita de fraude'}

## Ferramentas disponíveis (simule o uso quando apropriado):
${tools.map((t: any) => `- ${t.name}: usado para ${t.required_for?.join(', ')}`).join('\n') || 'Nenhuma ferramenta configurada'}

## Intenções que você reconhece:
${intents.map((i: any) => `- ${i.id}: passos ${i.steps?.join(' → ')}`).join('\n') || 'Intenções genéricas'}`;

    // Add collection rules for Julia
    if (agent.role === 'collections' && collectionRules) {
      prompt += `\n\n## Régua de Cobrança:
${collectionRules.stages?.map((s: any) => `- ${s.id} (${s.days_range}): ${s.tone} - "${s.message_template}"`).join('\n') || ''}

## Exceções:
${collectionRules.exceptions?.map((e: any) => `- ${e.trigger}: ${e.action}`).join('\n') || ''}`;
    }

    prompt += `\n\nMantém respostas curtas e objetivas (máximo 3 parágrafos). Use emojis com moderação.
IMPORTANTE: Você está em modo de SIMULAÇÃO para testes. Simule as ferramentas quando necessário, não execute ações reais.`;

    return prompt;
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const startTime = Date.now();

    try {
      // Build history from previous messages (exclude system messages)
      // Truncate long messages to avoid 400 errors - from config
      const history = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content.length > simulatorMaxHistoryMsgLength 
          ? m.content.substring(0, simulatorMaxHistoryMsgLength) + '...[truncado]'
          : m.content
      }));

      const response = await supabase.functions.invoke('proposal-chatbot', {
        body: {
          message: input,
          history: history,
          proposalContext: {
            agent_id: agent.agent_id
          }
        }
      });

      const responseTime = Date.now() - startTime;

      if (response.error) throw response.error;

      const assistantContent = response.data?.message || response.data?.reply || response.data?.content || 'Desculpe, não consegui processar sua mensagem.';
      
      // Try to detect intent from the response
      const detectedIntent = detectIntent(input, assistantContent);

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
        responseTime,
        intent: detectedIntent,
        toolsUsed: response.data?.toolsUsed
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Update stats
      setSessionStats(prev => {
        const newIntents = detectedIntent && !prev.intentsDetected.includes(detectedIntent)
          ? [...prev.intentsDetected, detectedIntent]
          : prev.intentsDetected;
        
        const totalMessages = prev.totalMessages + 1;
        const avgResponseTime = ((prev.avgResponseTime * (totalMessages - 1)) + responseTime) / totalMessages;
        
        return {
          totalMessages,
          avgResponseTime: Math.round(avgResponseTime),
          intentsDetected: newIntents
        };
      });

    } catch (error: any) {
      console.error('Simulation error:', error);
      
      // Fallback: generate a local mock response
      const mockResponse = generateMockResponse(input, agent);
      const responseTime = Date.now() - startTime;

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: mockResponse.content,
        timestamp: new Date(),
        responseTime,
        intent: mockResponse.intent
      };

      setMessages(prev => [...prev, assistantMessage]);

      toast({
        title: 'Modo offline',
        description: 'Usando respostas simuladas localmente.',
        variant: 'default'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const detectIntent = (userInput: string, response: string): string | undefined => {
    const inputLower = userInput.toLowerCase();
    
    if (inputLower.includes('fatura') || inputLower.includes('boleto') || inputLower.includes('2ª via') || inputLower.includes('segunda via')) {
      return 'segunda_via';
    }
    if (inputLower.includes('economizar') || inputLower.includes('desconto') || inputLower.includes('proposta') || inputLower.includes('simula')) {
      return 'simulacao';
    }
    if (inputLower.includes('conta') && (inputLower.includes('explica') || inputLower.includes('entender'))) {
      return 'explicar_fatura';
    }
    if (inputLower.includes('paguei') || inputLower.includes('pagamento') || inputLower.includes('pagar')) {
      return 'pagamento';
    }
    if (inputLower.includes('cancela') || inputLower.includes('desistir')) {
      return 'cancelamento';
    }
    if (inputLower.includes('reclama') || inputLower.includes('problema')) {
      return 'reclamacao';
    }
    return undefined;
  };

  const generateMockResponse = (input: string, agent: AIAgent): { content: string; intent?: string } => {
    const intent = detectIntent(input, '');
    const agentName = agent.name || 'Assistente';
    
    // Usar configurações do agent quando disponíveis
    const persona = agent.persona || {};
    const tone = persona.tone?.default || 'consultivo';
    
    const responses: Record<string, Record<string, string>> = {
      sales: {
        simulacao: '📊 Claro! Para fazer uma simulação personalizada, preciso de algumas informações:\n\n1. Qual o valor médio da sua conta de luz?\n2. Qual sua cidade e estado?\n3. Qual sua concessionária?',
        segunda_via: 'Para 2ª via, posso te ajudar! Mas primeiro, você já é nosso cliente ou quer saber como funciona nosso serviço? 😊',
        default: `Entendi! ${agentName} está aqui para te ajudar. Quer saber como economizar na conta de luz?`
      },
      customer_support: {
        segunda_via: '📄 Claro, vou te ajudar com a 2ª via!\n\n[🔧 Simulando: busca_fatura]\n\nPor favor, me confirme seu CPF (só os 4 últimos dígitos) para eu localizar sua fatura.',
        explicar_fatura: '📊 Vou te explicar sua fatura!\n\n• **Valor Original**: o que você pagaria à concessionária\n• **Desconto**: sua economia\n• **Valor a Pagar**: o valor com desconto aplicado\n\nQuer que eu explique algum item específico?',
        reclamacao: '😔 Sinto muito que você está tendo problemas. Pode me contar mais detalhes? Vou fazer o possível para resolver.\n\n[Registrando ocorrência...]',
        default: `Olá! ${agentName} aqui. Posso te ajudar com sua conta, fatura, dúvidas sobre o serviço e muito mais!`
      },
      collections: {
        pagamento: '✅ Que bom saber! Você poderia me enviar o comprovante de pagamento? Assim posso atualizar seu cadastro imediatamente.\n\n[🔧 Simulando: verificar_pagamento]',
        default: `Olá, aqui é ${agentName}. Identifiquei uma pendência em sua conta. Posso te ajudar a regularizar? Temos opções de parcelamento disponíveis.`
      }
    };

    const agentResponses = responses[agent.role] || responses.sales;
    const content = intent && agentResponses[intent] ? agentResponses[intent] : agentResponses.default;

    return { content, intent };
  };

  const resetChat = () => {
    const greeting: Message = {
      id: 'greeting-' + Date.now(),
      role: 'assistant',
      content: getAgentGreeting(agent),
      timestamp: new Date()
    };
    setMessages([greeting]);
    setSessionStats({
      totalMessages: 0,
      avgResponseTime: 0,
      intentsDetected: []
    });
    setInput('');
    toast({
      title: '🔄 Chat reiniciado',
      description: 'Conversa limpa e estatísticas zeradas.',
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Check if agent has voice capability
  const hasVoiceChannel = agent.channels?.includes('voice') || 
                          agent.persona?.voice_config || 
                          (agent as any).voice_config;

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as 'text' | 'voice')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="text" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat de Texto
          </TabsTrigger>
          <TabsTrigger value="voice" className="flex items-center gap-2" disabled={!hasVoiceChannel}>
            <Phone className="h-4 w-4" />
            Simulador de Voz
            {!hasVoiceChannel && (
              <Badge variant="outline" className="text-[10px] ml-1">Em breve</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Chat Window */}
            <Card className="lg:col-span-2 flex flex-col h-[600px]">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{agent.avatar_emoji}</span>
                    <div>
                      <CardTitle className="text-lg">{agent.name} - Simulador</CardTitle>
                      <CardDescription>Modo de teste - nenhuma ação real será executada</CardDescription>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={resetChat}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reiniciar
                  </Button>
                </div>
              </CardHeader>
              
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {message.role === 'assistant' && (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm">{agent.avatar_emoji}</span>
                        </div>
                      )}
                      
                      <div className={`max-w-[80%] ${message.role === 'user' ? 'order-first' : ''}`}>
                        <div
                          className={`rounded-lg p-3 ${
                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                        </div>
                        
                        <div className={`flex items-center gap-2 mt-1 text-xs text-muted-foreground ${
                          message.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}>
                          <Clock className="h-3 w-3" />
                          {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          
                          {message.responseTime && (
                            <Badge variant="outline" className="text-xs py-0">
                              {message.responseTime}ms
                            </Badge>
                          )}
                          
                          {message.intent && (
                            <Badge variant="secondary" className="text-xs py-0">
                              <Sparkles className="h-3 w-3 mr-1" />
                              {message.intent}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {message.role === 'user' && (
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                          <User className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {isLoading && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm">{agent.avatar_emoji}</span>
                      </div>
                      <div className="bg-muted rounded-lg p-3">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Digite sua mensagem de teste..."
                    disabled={isLoading}
                    className="flex-1"
                  />
                  <Button onClick={sendMessage} disabled={isLoading || !input.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>

            {/* Session Stats */}
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-base">Estatísticas da Sessão</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Mensagens</span>
                  <Badge variant="outline">{sessionStats.totalMessages}</Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Tempo médio resposta</span>
                  <Badge variant="outline">{sessionStats.avgResponseTime}ms</Badge>
                </div>
                
                <Separator />
                
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Intenções detectadas</p>
                  <div className="flex flex-wrap gap-1">
                    {sessionStats.intentsDetected.length > 0 ? (
                      sessionStats.intentsDetected.map((intent) => (
                        <Badge key={intent} variant="secondary" className="text-xs">
                          {intent}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Nenhuma ainda</span>
                    )}
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-sm font-medium mb-2">Sugestões de teste</p>
                  <div className="space-y-2">
                    {getTestSuggestions(agent).map((suggestion, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-left h-auto py-2 text-xs"
                        onClick={() => setInput(suggestion)}
                      >
                        <MessageSquare className="h-3 w-3 mr-2 flex-shrink-0" />
                        <span className="truncate">{suggestion}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="voice" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <VoiceSimulator 
                agent={agent as any} 
                onStatsUpdate={setVoiceStats}
              />
            </div>

            {/* Voice Stats */}
            <Card className="h-fit">
              <CardHeader>
                <CardTitle className="text-base">Estatísticas da Chamada</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Mensagens</span>
                  <Badge variant="outline">{voiceStats.messages}</Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Duração</span>
                  <Badge variant="outline">
                    {Math.floor(voiceStats.duration / 60).toString().padStart(2, '0')}:
                    {(voiceStats.duration % 60).toString().padStart(2, '0')}
                  </Badge>
                </div>
                
                <Separator />
                
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium mb-2">Sobre o Simulador de Voz</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>Usa TTS para reproduzir respostas</li>
                    <li>Clique nos botões para simular fala</li>
                    <li>Modo de teste - sem ações reais</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function getTestSuggestions(agent: AIAgent): string[] {
  switch (agent.role) {
    case 'sales':
      return [
        'Quanto vou economizar na minha conta?',
        'Como funciona a energia solar?',
        'Quero fazer uma simulação',
        'Preciso instalar algo na minha casa?',
        'Qual o prazo do contrato?'
      ];
    case 'customer_support':
      return [
        'Preciso da 2ª via do boleto',
        'Não entendi minha fatura',
        'Minha conta veio mais cara',
        'Quero alterar meu email',
        'Quero falar com um atendente'
      ];
    case 'collections':
      return [
        'Já paguei essa fatura',
        'Posso parcelar minha dívida?',
        'Estou com dificuldades financeiras',
        'Quando vence o boleto?',
        'Não reconheço essa cobrança'
      ];
    default:
      return [
        'Olá, como funciona?',
        'Quero mais informações',
        'Preciso de ajuda'
      ];
  }
}
