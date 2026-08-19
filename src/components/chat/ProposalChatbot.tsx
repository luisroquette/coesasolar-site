import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Phone, Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useConfiguracoes } from '@/hooks/useConfiguracoes';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ProposalContext {
  cliente_nome?: string;
  cliente_email?: string;
  economia_mensal?: number;
  economia_anual?: number;
  economia_acumulada?: number;
  desconto_percentual?: number;
  fidelidade_anos?: number;
  consumo_medio?: number;
  concessionaria?: string;
  tipo_proposta?: string;
  proposta_id?: string;
  // Cliente GD fields
  nome_concorrente?: string;
  desconto_concorrente?: number;
  // Lead scoring fields
  lead_source?: 'remarketing' | 'specialist_button' | 'organic';
  has_simulation?: boolean;
}

interface ProposalChatbotProps {
  proposalContext: ProposalContext;
  whatsappNumber?: string;
}

// Quick Replies para Proposta INICIAL (foco em entender antes de avançar)
const QUICK_REPLIES_INICIAL = [
  { label: '📋 Solicitar contrato?', message: 'Como funciona para solicitar o contrato? O que preciso enviar?' },
  { label: '🔢 Valores estimados?', message: 'Esses valores são estimados? Como ficam os valores reais?' },
  { label: '📄 Quais documentos?', message: 'Quais documentos preciso enviar para solicitar o contrato?' },
  { label: '☀️ Como funciona?', message: 'Como funciona a energia solar por assinatura?' },
  { label: '🧮 Simular economia', message: 'Qual seria minha economia se minha conta fosse R$ 400?' },
];

// Quick Replies para fase de Contrato (foco em fechar negócio)
const QUICK_REPLIES_DEFINITIVA = [
  { label: '✅ Posso assinar?', message: 'Posso assinar agora? Como faço para fechar?' },
  { label: '💰 Quanto economizo?', message: 'Quanto vou economizar na minha conta de luz?' },
  { label: '🔒 É seguro?', message: 'É seguro assinar? Quais garantias eu tenho?' },
  { label: '📋 Tem fidelidade?', message: 'Qual o prazo de fidelidade do contrato?' },
  { label: '🧮 Simular cenário', message: 'Se minha conta subir para R$ 500, quanto economizo?' },
];

// Quick Replies para Cliente GD (migração de concorrente)
const QUICK_REPLIES_CLIENTE_GD = [
  { label: '🔄 Vale migrar?', message: 'Vale a pena migrar do meu contrato atual para a COESA?' },
  { label: '📊 Economia adicional?', message: 'Quanto vou economizar a mais migrando para vocês?' },
  { label: '💰 E a multa?', message: 'E se eu tiver multa de rescisão no meu contrato atual?' },
  { label: '🧮 Simular economia', message: 'Qual seria minha economia com uma conta de R$ 600?' },
  { label: '📄 Preciso o quê?', message: 'O que preciso fazer para migrar?' },
];

export function ProposalChatbot({ proposalContext, whatsappNumber: whatsappNumberProp }: ProposalChatbotProps) {
  const { configs } = useConfiguracoes();
  const whatsappNumber = whatsappNumberProp || configs.whatsapp_numero;
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showHumanFallback, setShowHumanFallback] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [leadScore, setLeadScore] = useState(0);
  const [sofiaMode, setSofiaMode] = useState<'standard' | 'closer_premium'>('standard');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Create conversation when chat opens for the first time
  useEffect(() => {
    if (isOpen && !hasInitialized) {
      initializeConversation();
    }
  }, [isOpen, hasInitialized]);

  const initializeConversation = async () => {
    const isPropostaInicial = proposalContext.tipo_proposta === 'inicial';
    const isClienteGD = proposalContext.tipo_proposta === 'cliente_gd';
    const firstName = proposalContext.cliente_nome?.split(' ')[0];
    
    // Calculate initial score based on source
    let initialScore = 0;
    let initialMode: 'standard' | 'closer_premium' = 'standard';
    
    if (proposalContext.lead_source === 'remarketing') {
      initialScore = 20;
    } else if (proposalContext.lead_source === 'specialist_button') {
      initialScore = 25;
      initialMode = 'closer_premium';
    }
    
    if (proposalContext.has_simulation) {
      initialScore += 20;
    }

    // If score >= 60 or special source, start in closer_premium
    if (initialScore >= 60 || proposalContext.lead_source === 'specialist_button') {
      initialMode = 'closer_premium';
    }

    setLeadScore(initialScore);
    setSofiaMode(initialMode);
    
    let greeting: string;
    if (isClienteGD) {
      const nomeConcorrente = proposalContext.nome_concorrente || 'seu atual fornecedor';
      greeting = firstName
        ? `Olá, ${firstName}! 👋 Sou a sofIA, assistente virtual da Coesa Energia. Vi que você está avaliando migrar de ${nomeConcorrente} para a COESA! Estou aqui para esclarecer suas dúvidas sobre a migração e mostrar como você pode economizar ainda mais. Como posso ajudar?`
        : `Olá! 👋 Sou a sofIA, assistente virtual da Coesa Energia. Vi que você está avaliando migrar de ${nomeConcorrente} para a COESA! Estou aqui para esclarecer suas dúvidas sobre a migração e mostrar como você pode economizar ainda mais. Como posso ajudar?`;
    } else if (isPropostaInicial) {
      greeting = firstName
        ? `Olá, ${firstName}! 👋 Sou a sofIA, assistente virtual da Coesa Energia. Vi que você recebeu uma **proposta inicial** com valores estimados. Posso te ajudar a entender melhor e tirar dúvidas antes de solicitar sua proposta definitiva!`
        : `Olá! 👋 Sou a sofIA, assistente virtual da Coesa Energia. Vi que você recebeu uma **proposta inicial** com valores estimados. Posso te ajudar a entender melhor e tirar dúvidas antes de solicitar sua proposta definitiva!`;
    } else {
      // For definitiva or closer_premium mode, use more direct greeting
      if (initialMode === 'closer_premium') {
        greeting = firstName
          ? `Olá, ${firstName}! Sou a sofIA da Coesa. Sua proposta está pronta — vamos resolver isso agora?`
          : `Olá! Sou a sofIA da Coesa. Sua proposta está pronta — vamos resolver isso agora?`;
      } else {
        greeting = firstName
          ? `Olá, ${firstName}! 👋 Sou a sofIA, assistente virtual da Coesa Energia. Sua **proposta definitiva** está pronta! Estou aqui para tirar qualquer dúvida e te ajudar a fechar negócio com total segurança. Como posso te ajudar?`
          : `Olá! 👋 Sou a sofIA, assistente virtual da Coesa Energia. Sua **proposta definitiva** está pronta! Estou aqui para tirar qualquer dúvida e te ajudar a fechar negócio com total segurança. Como posso te ajudar?`;
      }
    }

    try {
      // Create conversation in database with lead scoring fields
      const { data: conversa, error: conversaError } = await supabase
        .from('chatbot_conversas')
        .insert({
          proposta_id: proposalContext.proposta_id || null,
          cliente_nome: proposalContext.cliente_nome || null,
          cliente_email: proposalContext.cliente_email || null,
          session_id: crypto.randomUUID(),
          total_messages: 1,
          lead_score: initialScore,
          sofia_mode: initialMode,
          lead_source: proposalContext.lead_source || 'organic',
          has_simulation: proposalContext.has_simulation || false,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (conversaError) {
        console.error('Error creating conversation:', conversaError);
      } else if (conversa) {
        setConversaId(conversa.id);
        
        // Save greeting message
        await supabase.from('chatbot_mensagens').insert({
          conversa_id: conversa.id,
          role: 'assistant',
          content: greeting,
          is_quick_reply: false,
        });
      }
    } catch (error) {
      console.error('Error initializing conversation:', error);
    }

    setMessages([
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: greeting,
      },
    ]);
    setHasInitialized(true);
  };

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (content: string, isQuickReply = false) => {
    // Hide quick replies after first user message
    setShowQuickReplies(false);
    
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Save user message to database
      if (conversaId) {
        await supabase.from('chatbot_mensagens').insert({
          conversa_id: conversaId,
          role: 'user',
          content,
          is_quick_reply: isQuickReply,
        });
      }

      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke('proposal-chatbot', {
        body: {
          message: content,
          history,
          proposalContext: {
            ...proposalContext,
            conversa_id: conversaId,
            lead_source: proposalContext.lead_source || 'organic',
            has_simulation: proposalContext.has_simulation || false,
            // Add tariff and bill context for simulation
            tarifa: proposalContext.economia_mensal && proposalContext.consumo_medio 
              ? (proposalContext.economia_mensal / (proposalContext.consumo_medio * (proposalContext.desconto_percentual || 20) / 100))
              : undefined,
            valor_conta: proposalContext.economia_mensal && proposalContext.desconto_percentual
              ? (proposalContext.economia_mensal / ((proposalContext.desconto_percentual || 20) / 100))
              : undefined,
          },
        },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.message,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Update local state with new score and mode from backend
      if (data.leadScore !== undefined) {
        setLeadScore(data.leadScore);
      }
      if (data.sofiaMode) {
        setSofiaMode(data.sofiaMode);
      }

      // Log detected objection and events for debugging
      if (data.detectedObjection) {
        console.log('Objection detected:', data.detectedObjection);
      }
      if (data.events) {
        console.log('Funnel events:', data.events);
      }
      if (data.abVariant) {
        console.log('A/B Variant:', data.abVariant);
      }

      // Save assistant message and update conversation
      if (conversaId) {
        await supabase.from('chatbot_mensagens').insert({
          conversa_id: conversaId,
          role: 'assistant',
          content: data.message,
          is_quick_reply: false,
        });

        // Update conversation stats - backend already handles lead_score, sofia_mode, etc.
        await supabase
          .from('chatbot_conversas')
          .update({
            total_messages: messages.length + 2,
            needs_human_fallback: data.needsHumanFallback || false,
          })
          .eq('id', conversaId);
      }

      if (data.needsHumanFallback) {
        setShowHumanFallback(true);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Erro ao enviar mensagem');
      
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Desculpe, estou com dificuldades técnicas. Por favor, fale diretamente com nosso time no WhatsApp!',
      };
      setMessages((prev) => [...prev, errorMessage]);
      setShowHumanFallback(true);

      if (conversaId) {
        await supabase
          .from('chatbot_conversas')
          .update({ needs_human_fallback: true })
          .eq('id', conversaId);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickReply = (message: string) => {
    handleSendMessage(message, true);
  };

  const handleWhatsAppClick = () => {
    const prefilledMessage = encodeURIComponent(
      `Olá! Estou com dúvidas sobre minha proposta de energia solar.${
        proposalContext.cliente_nome ? ` Meu nome é ${proposalContext.cliente_nome}.` : ''
      }${
        proposalContext.economia_mensal
          ? ` Minha proposta tem economia de R$ ${proposalContext.economia_mensal.toFixed(2)}/mês.`
          : ''
      }`
    );
    window.open(`https://wa.me/${whatsappNumber}?text=${prefilledMessage}`, '_blank');
  };

  return (
    <>
      {/* Floating WhatsApp Button - Link to Sofia */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed bottom-4 right-4 z-50"
          >
            <a
              href={`https://wa.me/5531953470438?text=${encodeURIComponent(
                `Olá! Sou ${proposalContext.cliente_nome || 'cliente'} e tenho uma dúvida sobre minha proposta da COESA.`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-full w-14 h-14 shadow-lg bg-[#25D366] hover:bg-[#20BD5A] text-white transition-colors"
              aria-label="Fale com a sofIA no WhatsApp"
            >
              <MessageCircle className="w-6 h-6" fill="white" />
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[500px] max-h-[calc(100vh-2rem)] bg-background rounded-2xl shadow-2xl border flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-[#25D366] text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">sof<span className="text-amber-300">IA</span></h3>
                    {sofiaMode === 'closer_premium' && (
                      <span className="flex items-center gap-1 text-[10px] bg-amber-500/30 px-1.5 py-0.5 rounded-full">
                        <Zap className="w-3 h-3" />
                        PREMIUM
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/80">Coesa Energia</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-white/20 h-8 w-8"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-1">
                {messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    role={message.role}
                    content={message.content}
                  />
                ))}
                
                {/* Quick Replies - Contextuais baseados no tipo de proposta */}
                {showQuickReplies && messages.length > 0 && !isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-wrap gap-2 mt-4 pl-10"
                  >
                    {(proposalContext.tipo_proposta === 'cliente_gd' 
                      ? QUICK_REPLIES_CLIENTE_GD 
                      : proposalContext.tipo_proposta === 'inicial' 
                        ? QUICK_REPLIES_INICIAL 
                        : QUICK_REPLIES_DEFINITIVA
                    ).map((reply) => (
                      <button
                        key={reply.label}
                        onClick={() => handleQuickReply(reply.message)}
                        className="px-3 py-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary rounded-full border border-primary/20 transition-colors whitespace-nowrap"
                      >
                        {reply.label}
                      </button>
                    ))}
                  </motion.div>
                )}
                
                {isLoading && (
                  <div className="flex gap-2 justify-start mb-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    </div>
                    <div className="bg-card text-card-foreground rounded-2xl rounded-tl-sm shadow-sm border px-4 py-2.5">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Human Fallback */}
            {showHumanFallback && (
              <div className="px-4 py-2 bg-muted/50 border-t">
                <Button
                  onClick={handleWhatsAppClick}
                  className="w-full bg-[#25D366] hover:bg-[#20BD5A] text-white gap-2"
                >
                  <Phone className="w-4 h-4" />
                  Falar com Especialista no WhatsApp
                </Button>
              </div>
            )}

            {/* Input */}
            <ChatInput onSend={handleSendMessage} disabled={isLoading} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
