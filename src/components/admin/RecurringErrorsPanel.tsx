import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { 
  Dialog, DialogContent, DialogDescription, DialogHeader, 
  DialogTitle, DialogFooter 
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  AlertTriangle, CheckCircle, FileWarning, Link2Off, 
  MessageSquareOff, DollarSign, RefreshCw, Eye, Check, Shield
} from 'lucide-react';
import { toast } from 'sonner';

interface GuardrailEvent {
  id: string;
  conversa_id: string | null;
  cliente_telefone: string | null;
  cliente_nome: string | null;
  category: string;
  block_type: string | null;
  severity: string | null;
  original_message: string | null;
  corrected_message: string | null;
  context: unknown;
  status: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
}

interface CategoryStats {
  category: string;
  count: number;
  label: string;
  icon: typeof AlertTriangle;
  color: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof AlertTriangle; color: string }> = {
  triagem_indevida: { 
    label: 'Triagem Indevida', 
    icon: MessageSquareOff, 
    color: 'text-orange-500' 
  },
  link_nao_verificado: { 
    label: 'Link Não Verificado', 
    icon: Link2Off, 
    color: 'text-destructive' 
  },
  docs_whatsapp: { 
    label: 'Docs via WhatsApp', 
    icon: FileWarning, 
    color: 'text-yellow-500' 
  },
  abaixo_linha_corte: { 
    label: 'Abaixo R$300', 
    icon: DollarSign, 
    color: 'text-blue-500' 
  },
};

export function RecurringErrorsPanel() {
  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [events, setEvents] = useState<GuardrailEvent[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedEvent, setSelectedEvent] = useState<GuardrailEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');

  async function fetchStats() {
    const { data, error } = await supabase
      .from('sofia_guardrail_events')
      .select('category')
      .eq('status', 'open');

    if (error) {
      console.error('Error fetching stats:', error);
      return;
    }

    const counts = (data || []).reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const statsArray: CategoryStats[] = Object.entries(CATEGORY_CONFIG).map(([key, config]) => ({
      category: key,
      count: counts[key] || 0,
      ...config,
    }));

    setStats(statsArray);
  }

  async function fetchEvents(category?: string) {
    setLoading(true);
    
    let query = supabase
      .from('sofia_guardrail_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching events:', error);
      setLoading(false);
      return;
    }

    setEvents(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchStats();
    fetchEvents();
  }, []);

  useEffect(() => {
    fetchEvents(selectedCategory);
  }, [selectedCategory]);

  async function handleResolve(eventId: string, notes: string) {
    const { error } = await supabase
      .from('sofia_guardrail_events')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolution_notes: notes,
      })
      .eq('id', eventId);

    if (error) {
      toast.error('Erro ao resolver evento');
      return;
    }

    toast.success('Evento marcado como resolvido');
    setResolveDialogOpen(false);
    setResolutionNotes('');
    setSelectedEvent(null);
    fetchStats();
    fetchEvents(selectedCategory);
  }

  async function handleApplyRule(event: GuardrailEvent) {
    const { error } = await supabase
      .from('sofia_guardrail_events')
      .update({
        status: 'rule_applied',
        resolved_at: new Date().toISOString(),
        resolution_notes: 'Regra aplicada via painel de erros',
      })
      .eq('id', event.id);

    if (error) {
      toast.error('Erro ao aplicar regra');
      return;
    }

    toast.success('Regra aplicada - evento resolvido');
    fetchStats();
    fetchEvents(selectedCategory);
  }

  async function handleBulkResolve(category: string) {
    const { error } = await supabase
      .from('sofia_guardrail_events')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        resolution_notes: 'Resolvido em lote',
      })
      .eq('category', category)
      .eq('status', 'open');

    if (error) {
      toast.error('Erro ao resolver eventos');
      return;
    }

    toast.success(`Todos eventos de "${CATEGORY_CONFIG[category]?.label}" resolvidos`);
    fetchStats();
    fetchEvents(selectedCategory);
  }

  const totalOpen = stats.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card 
              key={stat.category}
              className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                selectedCategory === stat.category ? 'ring-2 ring-primary' : ''
              }`}
              onClick={() => setSelectedCategory(stat.category)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.count}</div>
                <p className="text-xs text-muted-foreground">
                  eventos abertos
                </p>
                {stat.count > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2 w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBulkResolve(stat.category);
                    }}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Resolver Todos
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Eventos de Guardrail
              </CardTitle>
              <CardDescription>
                {totalOpen} eventos abertos no total
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => fetchEvents(selectedCategory)}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Atualizar
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setSelectedCategory('all')}
                className={selectedCategory === 'all' ? 'bg-accent' : ''}
              >
                Ver Todos
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhum evento encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((event) => {
                    const config = CATEGORY_CONFIG[event.category];
                    const Icon = config?.icon || AlertTriangle;
                    return (
                      <TableRow key={event.id}>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(event.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{event.cliente_nome || 'Desconhecido'}</p>
                            <p className="text-xs text-muted-foreground">{event.cliente_telefone}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1">
                            <Icon className={`h-3 w-3 ${config?.color}`} />
                            {config?.label || event.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {event.block_type}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={event.status === 'open' ? 'destructive' : 'secondary'}
                          >
                            {event.status === 'open' ? 'Aberto' : 
                             event.status === 'resolved' ? 'Resolvido' : 
                             event.status === 'rule_applied' ? 'Regra Aplicada' : event.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => setSelectedEvent(event)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {event.status === 'open' && (
                              <>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => {
                                    setSelectedEvent(event);
                                    setResolveDialogOpen(true);
                                  }}
                                >
                                  <Check className="h-4 w-4 text-green-500" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  onClick={() => handleApplyRule(event)}
                                >
                                  <Shield className="h-4 w-4 text-blue-500" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedEvent && !resolveDialogOpen} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Evento</DialogTitle>
            <DialogDescription>
              {selectedEvent && format(new Date(selectedEvent.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Cliente</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedEvent.cliente_nome || 'Desconhecido'}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Telefone</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedEvent.cliente_telefone || '-'}
                  </p>
                </div>
              </div>
              
              <div>
                <p className="text-sm font-medium mb-1">Mensagem Original (LLM)</p>
                <div className="p-3 bg-destructive/10 rounded-md border border-destructive/20">
                  <p className="text-sm">{selectedEvent.original_message}</p>
                </div>
              </div>
              
              <div>
                <p className="text-sm font-medium mb-1">Mensagem Corrigida</p>
                <div className="p-3 bg-green-500/10 rounded-md border border-green-500/20">
                  <p className="text-sm">{selectedEvent.corrected_message}</p>
                </div>
              </div>
              
              {selectedEvent.context && Object.keys(selectedEvent.context).length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-1">Contexto</p>
                  <pre className="p-3 bg-muted rounded-md text-xs overflow-auto max-h-32">
                    {JSON.stringify(selectedEvent.context, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver Evento</DialogTitle>
            <DialogDescription>
              Adicione notas sobre a resolução (opcional)
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Ex: Ajustado padrão de detecção, cliente já foi convertido..."
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => selectedEvent && handleResolve(selectedEvent.id, resolutionNotes)}>
              <Check className="h-4 w-4 mr-1" />
              Marcar como Resolvido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
