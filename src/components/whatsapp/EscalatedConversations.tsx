import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  UserRound, 
  Phone, 
  Clock, 
  MessageSquare,
  ExternalLink,
  UserCheck,
  Undo2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatWhatsAppDisplay } from '@/lib/whatsapp-utils';

interface EscalatedConversation {
  id: string;
  cliente_nome: string | null;
  cliente_telefone: string | null;
  escalated_at: string | null;
  escalation_reason: string | null;
  human_agent_id: string | null;
  human_agent_nome: string | null;
  lead_score: number | null;
  last_message_at: string | null;
  sofia_mode: string | null;
  bitrix24_lead_id: string | null;
}

interface ChatMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export function EscalatedConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<EscalatedConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<EscalatedConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [userProfile, setUserProfile] = useState<{ id: string; nome: string } | null>(null);

  // Fetch user profile
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('id, nome')
        .eq('user_id', user.id)
        .single();
      
      if (data) {
        setUserProfile(data);
      }
    };
    
    fetchProfile();
  }, [user?.id]);

  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('chatbot_conversas')
        .select('id, cliente_nome, cliente_telefone, escalated_at, escalation_reason, human_agent_id, human_agent_nome, lead_score, last_message_at, sofia_mode, bitrix24_lead_id')
        .eq('needs_human_fallback', true)
        .order('escalated_at', { ascending: false });

      if (error) throw error;
      setConversations((data || []) as EscalatedConversation[]);
    } catch (error) {
      console.error('Error fetching escalated conversations:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchConversations();

    // Set up realtime subscription
    const channel = supabase
      .channel('escalated-conversations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chatbot_conversas',
          filter: 'needs_human_fallback=eq.true',
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchMessages = async (conversaId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('chatbot_mensagens')
        .select('id, role, content, created_at')
        .eq('conversa_id', conversaId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Erro ao carregar mensagens');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleViewConversation = (conversation: EscalatedConversation) => {
    setSelectedConversation(conversation);
    fetchMessages(conversation.id);
  };

  const handleAssumirAtendimento = async (conversation: EscalatedConversation) => {
    if (!userProfile) {
      toast.error('Erro ao identificar usuário');
      return;
    }

    try {
      const { error } = await supabase
        .from('chatbot_conversas')
        .update({
          human_agent_id: userProfile.id,
          human_agent_nome: userProfile.nome,
          sofia_mode: 'paused_for_human',
        })
        .eq('id', conversation.id);

      if (error) throw error;

      toast.success('Atendimento assumido com sucesso!');
      fetchConversations();
      
      // Open WhatsApp Web
      if (conversation.cliente_telefone) {
        const phone = conversation.cliente_telefone.replace(/\D/g, '');
        window.open(`https://wa.me/${phone}`, '_blank');
      }
    } catch (error) {
      console.error('Error assuming conversation:', error);
      toast.error('Erro ao assumir atendimento');
    }
  };

  const handleDevolverParaSofia = async (conversation: EscalatedConversation) => {
    try {
      const { error } = await supabase
        .from('chatbot_conversas')
        .update({
          needs_human_fallback: false,
          human_agent_id: null,
          human_agent_nome: null,
          sofia_mode: 'standard',
          escalated_at: null,
          escalation_reason: null,
        })
        .eq('id', conversation.id);

      if (error) throw error;

      toast.success('Conversa devolvida para sofIA');
      fetchConversations();
      setSelectedConversation(null);
    } catch (error) {
      console.error('Error returning to sofia:', error);
      toast.error('Erro ao devolver para sofIA');
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchConversations();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <UserRound className="h-5 w-5 text-orange-500" />
            Aguardando Atendente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <UserRound className="h-5 w-5 text-orange-500" />
                Aguardando Atendente
                {conversations.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {conversations.length}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Conversas escaladas pela sofIA para atendimento humano
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {conversations.length === 0 ? (
            <div className="text-center py-8">
              <UserCheck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhuma conversa aguardando atendimento humano
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={cn(
                    "p-4 border rounded-lg transition-all",
                    conversation.human_agent_id 
                      ? "border-blue-500/50 bg-blue-500/5" 
                      : "border-orange-500/50 bg-orange-500/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">
                          {conversation.cliente_nome || 'Cliente sem nome'}
                        </span>
                        {conversation.human_agent_nome && (
                          <Badge variant="secondary" className="text-xs">
                            <UserCheck className="h-3 w-3 mr-1" />
                            {conversation.human_agent_nome}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        {conversation.cliente_telefone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {formatWhatsAppDisplay(conversation.cliente_telefone)}
                          </span>
                        )}
                        {conversation.escalated_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDistanceToNow(new Date(conversation.escalated_at), { 
                              addSuffix: true,
                              locale: ptBR 
                            })}
                          </span>
                        )}
                      </div>
                      
                      {conversation.escalation_reason && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                          <AlertTriangle className="h-3 w-3 inline mr-1 text-orange-500" />
                          {conversation.escalation_reason}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewConversation(conversation)}
                      >
                        <MessageSquare className="h-4 w-4 mr-1" />
                        Ver
                      </Button>
                      
                      {!conversation.human_agent_id ? (
                        <Button
                          size="sm"
                          onClick={() => handleAssumirAtendimento(conversation)}
                          className="bg-orange-500 hover:bg-orange-600"
                        >
                          <UserCheck className="h-4 w-4 mr-1" />
                          Assumir
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (conversation.cliente_telefone) {
                              const phone = conversation.cliente_telefone.replace(/\D/g, '');
                              window.open(`https://wa.me/${phone}`, '_blank');
                            }
                          }}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          WhatsApp
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conversation Detail Dialog */}
      <Dialog open={!!selectedConversation} onOpenChange={() => setSelectedConversation(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Conversa com {selectedConversation?.cliente_nome || 'Cliente'}
            </DialogTitle>
            <DialogDescription>
              {selectedConversation?.cliente_telefone && formatWhatsAppDisplay(selectedConversation.cliente_telefone)}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {selectedConversation && !selectedConversation.human_agent_id && (
                <Button
                  size="sm"
                  onClick={() => handleAssumirAtendimento(selectedConversation)}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  <UserCheck className="h-4 w-4 mr-1" />
                  Assumir Atendimento
                </Button>
              )}
              {selectedConversation && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDevolverParaSofia(selectedConversation)}
                  >
                    <Undo2 className="h-4 w-4 mr-1" />
                    Devolver para sofIA
                  </Button>
                  {selectedConversation.cliente_telefone && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const phone = selectedConversation.cliente_telefone!.replace(/\D/g, '');
                        window.open(`https://wa.me/${phone}`, '_blank');
                      }}
                    >
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Abrir WhatsApp
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Messages */}
            <ScrollArea className="h-[400px] border rounded-lg p-4">
              {loadingMessages ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-16 w-3/4" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma mensagem encontrada
                </p>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "max-w-[80%] p-3 rounded-lg text-sm",
                        msg.role === 'user'
                          ? "bg-primary text-primary-foreground ml-auto"
                          : "bg-muted"
                      )}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-[10px] opacity-70 mt-1">
                        {new Date(msg.created_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
