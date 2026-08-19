import { useState, useRef, useEffect, useCallback } from 'react';
import { RetellWebClient } from 'retell-client-js-sdk';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mic, Phone, PhoneOff, AlertCircle, Loader2, Volume2, Clock, User, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface VoiceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIAgent {
  id: string;
  agent_id: string;
  name: string;
  role: string;
  description: string;
  avatar_emoji: string;
  persona: any;
  guardrails: any;
  voice_config?: any;
}

interface VoiceSimulatorProps {
  agent: AIAgent;
  onStatsUpdate?: (stats: { messages: number; duration: number }) => void;
}

type CallStatus = 'idle' | 'connecting' | 'active' | 'ending' | 'error';

export function VoiceSimulator({ agent, onStatsUpdate }: VoiceSimulatorProps) {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isAgentTalking, setIsAgentTalking] = useState(false);
  const [isUserTalking, setIsUserTalking] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [audioUnlockNeeded, setAudioUnlockNeeded] = useState(false);
  
  const retellClientRef = useRef<RetellWebClient | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update stats when messages/duration change
  useEffect(() => {
    onStatsUpdate?.({ messages: messages.length, duration: callDuration });
  }, [messages.length, callDuration, onStatsUpdate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (retellClientRef.current) {
        retellClientRef.current.stopCall();
      }
    };
  }, []);

  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    const newMessage: VoiceMessage = {
      id: `${Date.now()}-${role}-${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: new Date(),
    };
    setMessages(prev => {
      // Check if last message is same role - update it instead of adding new
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.role === role) {
        // Update the last message content
        return prev.map((m, i) => 
          i === prev.length - 1 ? { ...m, content } : m
        );
      }
      return [...prev, newMessage];
    });
  }, []);

  const startCall = async () => {
    setError(null);
    setCallStatus('connecting');
    setMessages([]);
    setCallDuration(0);
    setAudioUnlocked(false);
    setAudioUnlockNeeded(false);
    
    try {
      // Importante: não mantenha um getUserMedia “extra” aberto.
      // O RetellWebClient já abre o microfone internamente (LiveKit).
      // Alguns navegadores/OS não permitem duas capturas simultâneas e isso faz o agente “não te escutar”.
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionStream.getTracks().forEach((t) => t.stop());
      
      // Get web call token from Edge Function
      const { data, error: fnError } = await supabase.functions.invoke('retell-web-call-token', {
        body: {
          agent_db_id: agent.id,
          agent_id: agent.agent_id,
          mode: 'inbound',
          metadata: {
            simulator: true,
            test_mode: true,
          }
        }
      });
      
      if (fnError) {
        throw new Error(fnError.message || 'Erro ao obter token de chamada');
      }
      
      if (!data?.access_token) {
        throw new Error(data?.error || data?.details || 'Token de acesso não retornado');
      }
      
      console.log('[VoiceSimulator] Web call token obtained:', { call_id: data.call_id });
      
      // Initialize Retell Web Client
      const retellClient = new RetellWebClient();
      retellClientRef.current = retellClient;
      
      // Set up event listeners
      retellClient.on('call_ready', () => {
        console.log('[VoiceSimulator] Call ready (agent audio track subscribed)');
        // Em muitos navegadores, a reprodução de áudio precisa de um gesto do usuário.
        // Tentamos automaticamente e, se falhar, mostramos um botão "Ativar áudio".
        retellClient
          .startAudioPlayback()
          .then(() => {
            setAudioUnlocked(true);
            setAudioUnlockNeeded(false);
          })
          .catch((e: any) => {
            console.warn('[VoiceSimulator] startAudioPlayback blocked/failed:', e);
            setAudioUnlocked(false);
            setAudioUnlockNeeded(true);
            toast.message('Clique em "Ativar áudio" para liberar a voz da sofIA.');
          });
      });

      retellClient.on('call_started', () => {
        console.log('[VoiceSimulator] Call started');
        setCallStatus('active');

        // Start duration timer
        durationIntervalRef.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 1000);
      });

      retellClient.on('call_ended', () => {
        console.log('[VoiceSimulator] Call ended');
        setCallStatus('idle');
        setIsAgentTalking(false);
        setIsUserTalking(false);

        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
      });
      
      retellClient.on('agent_start_talking', () => {
        setIsAgentTalking(true);
        setIsUserTalking(false);
      });
      
      retellClient.on('agent_stop_talking', () => {
        setIsAgentTalking(false);
      });
      
      retellClient.on('update', (update: any) => {
        // Handle transcript updates
        if (update.transcript) {
          // Parse transcript to get messages
          const lines = update.transcript.split('\n').filter((l: string) => l.trim());
          
          for (const line of lines) {
            if (line.startsWith('Agent:')) {
              const content = line.replace('Agent:', '').trim();
              if (content) addMessage('assistant', content);
            } else if (line.startsWith('User:')) {
              const content = line.replace('User:', '').trim();
              if (content) {
                addMessage('user', content);
                setIsUserTalking(true);
                setTimeout(() => setIsUserTalking(false), 500);
              }
            }
          }
        }
      });
      
      retellClient.on('error', (err: any) => {
        console.error('[VoiceSimulator] Retell error:', err);
        setError(`Erro na chamada: ${err.message || 'Erro desconhecido'}`);
        setCallStatus('error');
        
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
          durationIntervalRef.current = null;
        }
      });
      
      // Start the call with the access token
      await retellClient.startCall({
        accessToken: data.access_token,
      });
      
      toast.success('Chamada iniciada com sucesso!');
      
    } catch (err: any) {
      console.error('[VoiceSimulator] Start call error:', err);
      setError(err.message || 'Erro ao iniciar chamada');
      setCallStatus('error');
      toast.error('Erro ao iniciar chamada de teste');
    }
  };

  const stopCall = async () => {
    setCallStatus('ending');
    
    try {
      if (retellClientRef.current) {
        retellClientRef.current.stopCall();
        retellClientRef.current = null;
      }
      
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      
      setCallStatus('idle');
      setIsAgentTalking(false);
      setIsUserTalking(false);
      
      toast.info('Chamada encerrada');
    } catch (err: any) {
      console.error('[VoiceSimulator] Stop call error:', err);
      setCallStatus('idle');
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = () => {
    switch (callStatus) {
      case 'connecting':
        return <Badge variant="secondary" className="animate-pulse">Conectando...</Badge>;
      case 'active':
        return <Badge variant="default" className="bg-green-500">Em chamada</Badge>;
      case 'ending':
        return <Badge variant="secondary">Encerrando...</Badge>;
      case 'error':
        return <Badge variant="destructive">Erro</Badge>;
      default:
        return <Badge variant="outline">Pronto</Badge>;
    }
  };

  // Check if voice is configured
  const voiceConfig = agent.voice_config?.inbound || agent.voice_config?.outbound;
  const hasVoiceConfigured = voiceConfig?.enabled && voiceConfig?.agent_id;
  const isConnected = callStatus === 'active';

  return (
    <div className="space-y-4">
      {/* Connection Mode Badge */}
      {callStatus === 'active' && (
        <div className="flex justify-center">
          <Badge variant="outline" className="gap-1 bg-primary/5">
            <Zap className="h-3 w-3" />
            Retell AI Voice
          </Badge>
        </div>
      )}

      {/* Call Status Bar */}
      <div className={cn(
        "flex items-center justify-between p-4 rounded-lg transition-colors",
        isConnected ? "bg-green-500/10 border border-green-500/30" : "bg-muted"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            isConnected ? "bg-green-500/20" : "bg-muted-foreground/20"
          )}>
            <span className="text-xl">{agent.avatar_emoji}</span>
          </div>
          <div>
            <p className="font-medium">{agent.name}</p>
            <p className="text-xs text-muted-foreground">
              {isConnected ? (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Chamada ativa • {formatDuration(callDuration)}
                </span>
              ) : (
                'Simulador de Voz (Retell AI)'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão para desbloquear áudio quando navegador bloqueia autoplay */}
          {isConnected && audioUnlockNeeded && !audioUnlocked && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (retellClientRef.current) {
                  retellClientRef.current
                    .startAudioPlayback()
                    .then(() => {
                      setAudioUnlocked(true);
                      setAudioUnlockNeeded(false);
                      toast.success('Áudio ativado!');
                    })
                    .catch((e: any) => {
                      console.error('[VoiceSimulator] Manual audio unlock failed:', e);
                      toast.error('Não foi possível ativar o áudio');
                    });
                }
              }}
              className="animate-pulse"
            >
              <Volume2 className="h-4 w-4 mr-1" />
              Ativar áudio
            </Button>
          )}

          {isConnected && (
            <Button
              variant={isAgentTalking ? "secondary" : "outline"}
              size="icon"
              disabled
            >
              {isAgentTalking ? (
                <Volume2 className="h-4 w-4 animate-pulse" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          )}

          <Button
            variant={isConnected ? "destructive" : "default"}
            onClick={isConnected ? stopCall : startCall}
            disabled={callStatus === 'connecting' || callStatus === 'ending' || !hasVoiceConfigured}
          >
            {callStatus === 'connecting' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : isConnected ? (
              <PhoneOff className="h-4 w-4 mr-2" />
            ) : (
              <Phone className="h-4 w-4 mr-2" />
            )}
            {callStatus === 'connecting' ? 'Conectando...' : isConnected ? 'Encerrar' : 'Iniciar Chamada'}
          </Button>
        </div>
      </div>

      {/* Configuration Warning */}
      {!hasVoiceConfigured && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Configuração de Voz Necessária
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Para usar o simulador de voz, configure o <strong>Retell Agent ID</strong> na aba "Voz" 
                  (modo Inbound) e adicione a <strong>RETELL_API_KEY</strong> nos secrets do projeto.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Erro na conexão</p>
            <p className="text-xs opacity-80 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Transcript Area */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[300px] p-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                {callStatus === 'idle' && (
                  <>
                    <Phone className="h-12 w-12 mb-4 opacity-50" />
                    <p className="font-medium">Simulador de Voz Real</p>
                    <p className="text-sm mt-1">
                      Conversa bidirecional usando Retell AI
                    </p>
                    <p className="text-xs mt-2 max-w-xs">
                      Clique em "Iniciar Chamada" para testar o agente com sua voz real.
                    </p>
                  </>
                )}
                {callStatus === 'connecting' && (
                  <>
                    <Loader2 className="h-12 w-12 mb-4 animate-spin opacity-50" />
                    <p className="text-sm">Estabelecendo conexão...</p>
                  </>
                )}
                {callStatus === 'active' && (
                  <>
                    <Mic className="h-12 w-12 mb-4 opacity-50" />
                    <p className="text-sm">Aguardando transcrição...</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-2",
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    {message.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm">{agent.avatar_emoji}</span>
                      </div>
                    )}
                    
                    <div className={cn(
                      "max-w-[80%] rounded-lg p-3",
                      message.role === 'user' 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted"
                    )}>
                      <p className="text-sm">{message.content}</p>
                      <div className={cn(
                        "flex items-center gap-1 mt-1 text-xs opacity-70",
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      )}>
                        <Volume2 className="h-3 w-3" />
                        <Clock className="h-3 w-3" />
                        {message.timestamp.toLocaleTimeString('pt-BR', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </div>
                    </div>

                    {message.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))}
                
                {isAgentTalking && (
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm">{agent.avatar_emoji}</span>
                    </div>
                    <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-xs text-muted-foreground">Falando...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <h4 className="font-medium text-sm mb-2">Como funciona</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Clique em "Iniciar Chamada" e permita acesso ao microfone</li>
            <li>• Fale naturalmente - o agente responderá em tempo real</li>
            <li>• A transcrição aparece automaticamente na tela</li>
            <li>• Você pode interromper o agente falando a qualquer momento</li>
          </ul>
          
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              <strong>Requisitos:</strong> Configure o Retell Agent ID e RETELL_API_KEY nas configurações de voz do agente.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
