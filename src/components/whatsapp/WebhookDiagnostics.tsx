import { useState, useEffect } from 'react';
import { useUIConfig } from '@/hooks/useUIConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Send, 
  AlertTriangle,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  Trash2,
  Copy
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface WebhookEvent {
  id: string;
  received_at: string;
  provider: string;
  request_method: string | null;
  content_type: string | null;
  body_raw: string | null;
  body_parsed: Record<string, unknown> | null;
  parsed_ok: boolean;
  event_type: string | null;
  phone: string | null;
  chat_id: string | null;
  message_preview: string | null;
  error_message: string | null;
  processing_status: string | null;
}

export function WebhookDiagnostics() {
  const { queryLimitWebhookEvents, intervalWebhookDiagnosticsMs } = useUIConfig();
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingOutbound, setSendingOutbound] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [setupResult, setSetupResult] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<WebhookEvent | null>(null);
  const [clearingLogs, setClearingLogs] = useState(false);

  const webhookUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/z-api-webhook`;

  const fetchEvents = async () => {
    try {
      // Using type assertion to work around type generation delay
      const { data, error } = await (supabase
        .from('whatsapp_webhook_events' as any)
        .select('*')
        .order('received_at', { ascending: false })
        .limit(queryLimitWebhookEvents) as any);

      if (error) {
        console.error('Error fetching webhook events:', error);
        return;
      }

      setEvents((data || []) as WebhookEvent[]);
    } catch (err) {
      console.error('Exception fetching events:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    
    // Auto-refresh based on config
    const interval = setInterval(fetchEvents, intervalWebhookDiagnosticsMs);
    return () => clearInterval(interval);
  }, [intervalWebhookDiagnosticsMs]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchEvents();
  };

  const handleShowInstructions = () => {
    // Z-API requires manual configuration - show instructions
    setSetupResult({ 
      success: true, 
      message: 'Z-API requer configuração manual. Cole a URL no campo "Ao receber" nas configurações da sua instância em z-api.io'
    });
    toast.info('Veja as instruções de configuração abaixo');
  };

  const handleTestOutbound = async () => {
    if (!testPhone) {
      toast.error('Digite um número de telefone para teste');
      return;
    }

    setSendingOutbound(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('z-api-send-message', {
        body: {
          phone: testPhone.replace(/\D/g, ''),
          message: `🔧 Teste de envio WhatsApp\n\n📅 ${format(new Date(), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}\n\n✅ Se você recebeu esta mensagem, o envio (outbound) está funcionando!`
        }
      });

      if (error) {
        toast.error(`Erro no envio: ${error.message}`);
      } else if (data?.success) {
        toast.success('Mensagem de teste enviada com sucesso!');
      } else {
        toast.error(data?.error || 'Falha no envio');
      }
    } catch (err) {
      toast.error('Erro ao enviar mensagem de teste');
    } finally {
      setSendingOutbound(false);
    }
  };

  const handleClearLogs = async () => {
    setClearingLogs(true);
    try {
      // Delete all events (RLS allows admin deletion)
      const { error } = await (supabase
        .from('whatsapp_webhook_events' as any)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') as any); // Delete all

      if (error) {
        toast.error('Erro ao limpar logs');
        console.error('Error clearing logs:', error);
      } else {
        setEvents([]);
        toast.success('Logs limpos com sucesso!');
      }
    } catch (err) {
      toast.error('Erro ao limpar logs');
    } finally {
      setClearingLogs(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  // Stats
  const totalEvents = events.length;
  const successfulEvents = events.filter(e => e.parsed_ok).length;
  const failedEvents = events.filter(e => !e.parsed_ok && e.event_type !== 'ping').length;
  const pingEvents = events.filter(e => e.event_type === 'ping').length;
  const messageEvents = events.filter(e => e.event_type === 'message').length;

  const lastEvent = events[0];
  const lastMessageEvent = events.find(e => e.event_type === 'message');

  const getStatusBadge = (event: WebhookEvent) => {
    if (event.event_type === 'ping') {
      return <Badge variant="outline" className="text-muted-foreground">Ping</Badge>;
    }
    if (event.parsed_ok) {
      return <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">OK</Badge>;
    }
    return <Badge variant="destructive">Erro</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Eventos</p>
                <p className="text-2xl font-bold">{totalEvents}</p>
              </div>
              <Activity className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Mensagens Recebidas</p>
                <p className="text-2xl font-bold">{messageEvents}</p>
              </div>
              <ArrowDownToLine className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pings (Validação)</p>
                <p className="text-2xl font-bold">{pingEvents}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Erros</p>
                <p className="text-2xl font-bold">{failedEvents}</p>
              </div>
              {failedEvents > 0 ? (
                <XCircle className="h-8 w-8 text-destructive" />
              ) : (
                <CheckCircle className="h-8 w-8 text-green-500" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* CONFIGURAÇÃO MANUAL - Instruções importantes */}
      {messageEvents === 0 && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="h-5 w-5" />
              Ação Necessária: Configurar Webhook no Z-API
            </CardTitle>
            <CardDescription>
              O Z-API (z-api.io) precisa de configuração manual para enviar mensagens ao sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-background p-4 rounded-lg border space-y-3">
              <p className="font-medium">📋 Passo a passo:</p>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Acesse o painel do Z-API em <span className="font-mono text-foreground">z-api.io</span></li>
                <li>Vá em <strong>Instâncias Mobile</strong> e selecione sua instância</li>
                <li>Na seção <strong>"Configure webhooks"</strong>, localize o campo <strong>"Ao receber"</strong></li>
                <li>Cole a URL abaixo nesse campo:</li>
              </ol>
              
              <div className="flex items-center gap-2 mt-3">
                <code className="text-xs bg-muted p-3 rounded flex-1 overflow-x-auto font-mono">
                  {webhookUrl}
                </code>
                <Button variant="secondary" size="sm" onClick={() => copyToClipboard(webhookUrl)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar
                </Button>
              </div>
              
              <p className="text-xs text-muted-foreground mt-3">
                ⚠️ Após salvar, envie uma mensagem de teste para o WhatsApp corporativo e verifique se aparece nesta página.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diagnostic Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Diagnóstico de Conexão
          </CardTitle>
          <CardDescription>
            Status da integração com Z-API (z-api.io)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Inbound Status */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <ArrowDownToLine className="h-5 w-5" />
              <div>
                <p className="font-medium">Recebimento (Inbound)</p>
                <p className="text-sm text-muted-foreground">
                  {lastMessageEvent 
                    ? `Última mensagem: ${format(new Date(lastMessageEvent.received_at), "dd/MM HH:mm:ss", { locale: ptBR })}`
                    : 'Nenhuma mensagem recebida ainda'}
                </p>
              </div>
            </div>
            {messageEvents > 0 ? (
              <Badge className="bg-green-500/10 text-green-600">Funcionando</Badge>
            ) : pingEvents > 0 ? (
              <Badge variant="outline" className="text-yellow-600 border-yellow-500">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Apenas Pings
              </Badge>
            ) : (
              <Badge variant="destructive">Sem Dados</Badge>
            )}
          </div>

          {/* Webhook URL */}
          <div className="p-4 rounded-lg border bg-muted/50">
            <p className="text-sm font-medium mb-2">URL do Webhook (para colar no Z-API):</p>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-background p-2 rounded flex-1 overflow-x-auto">
                {webhookUrl}
              </code>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(webhookUrl)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Cole esta URL no campo "Ao receber" das configurações do Z-API
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <Button 
              variant="outline" 
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>

            <Button 
              onClick={handleShowInstructions}
              variant="secondary"
            >
              <Activity className="h-4 w-4 mr-2" />
              Ver Instruções de Configuração
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive" disabled={events.length === 0}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Limpar Logs
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar todos os logs?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso removerá permanentemente todos os registros de eventos do webhook.
                    Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearLogs} disabled={clearingLogs}>
                    {clearingLogs ? 'Limpando...' : 'Limpar'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {setupResult && (
            <div className={`p-3 rounded-lg text-sm ${setupResult.success ? 'bg-green-500/10 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
              {setupResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Outbound Test */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpFromLine className="h-5 w-5" />
            Teste de Envio (Outbound)
          </CardTitle>
          <CardDescription>
            Enviar mensagem de teste para validar que o envio está funcionando
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              placeholder="Número de telefone (ex: 5531999999999)"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleTestOutbound} disabled={sendingOutbound}>
              {sendingOutbound ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Enviar Teste
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Events Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Eventos Recebidos
          </CardTitle>
          <CardDescription>
            Últimos 50 eventos do webhook (atualiza automaticamente)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum evento registrado ainda.</p>
              <p className="text-sm mt-1">
                Envie uma mensagem para o número do WhatsApp corporativo para testar.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Data/Hora</TableHead>
                    <TableHead className="w-[80px]">Status</TableHead>
                    <TableHead className="w-[100px]">Tipo</TableHead>
                    <TableHead className="w-[130px]">Telefone</TableHead>
                    <TableHead>Preview</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="text-xs">
                        {format(new Date(event.received_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                      </TableCell>
                      <TableCell>{getStatusBadge(event)}</TableCell>
                      <TableCell className="text-xs">{event.event_type || '-'}</TableCell>
                      <TableCell className="text-xs font-mono">{event.phone || '-'}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">
                        {event.message_preview || event.error_message || '-'}
                      </TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedEvent(event)}
                            >
                              Ver
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[80vh]">
                            <DialogHeader>
                              <DialogTitle>Detalhes do Evento</DialogTitle>
                              <DialogDescription>
                                {format(new Date(event.received_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                              </DialogDescription>
                            </DialogHeader>
                            <ScrollArea className="h-[60vh]">
                              <div className="space-y-4 p-1">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">Tipo</p>
                                    <p>{event.event_type || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                                    {getStatusBadge(event)}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">Telefone</p>
                                    <p className="font-mono">{event.phone || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">Chat ID</p>
                                    <p className="font-mono text-xs">{event.chat_id || '-'}</p>
                                  </div>
                                </div>

                                {event.error_message && (
                                  <div>
                                    <p className="text-sm font-medium text-destructive">Erro</p>
                                    <p className="text-sm bg-destructive/10 p-2 rounded">{event.error_message}</p>
                                  </div>
                                )}

                                {event.message_preview && (
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">Mensagem</p>
                                    <p className="bg-muted p-2 rounded">{event.message_preview}</p>
                                  </div>
                                )}

                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-sm font-medium text-muted-foreground">Body Raw</p>
                                    {event.body_raw && (
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        onClick={() => copyToClipboard(event.body_raw || '')}
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                  <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-[200px]">
                                    {event.body_raw || '(vazio)'}
                                  </pre>
                                </div>

                                {event.body_parsed && (
                                  <div>
                                    <p className="text-sm font-medium text-muted-foreground">Body Parsed (JSON)</p>
                                    <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-[200px]">
                                      {JSON.stringify(event.body_parsed, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </ScrollArea>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
