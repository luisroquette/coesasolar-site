import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { formatCurrency, formatNumber } from '@/lib/calculations';
import { useConfiguracoes } from '@/hooks/useConfiguracoes';
import { usePropostasStatusConfig } from '@/hooks/usePropostasStatusConfig';
import { buildPublicProposalUrl } from '@/lib/public-proposal-url';
import { AutomationFieldsConfig } from '@/components/settings/AutomationFieldsConfig';
import { ProposalDefaultsConfig } from '@/components/settings/ProposalDefaultsConfig';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileClock, 
  Search, 
  Eye, 
  Loader2, 
  AlertTriangle,
  Calendar,
  User,
  Zap,
  ExternalLink,
  RefreshCw,
  Filter,
  Settings,
  ChevronDown
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PropostaInicial {
  id: string;
  cliente_nome: string;
  cliente_email: string | null;
  cliente_telefone: string | null;
  cliente_cidade: string | null;
  cliente_uf: string | null;
  concessionaria: string | null;
  consumo_medio: number | null;
  valor_conta_original: number | null;
  tipo_instalacao: string | null;
  economia_mensal: number | null;
  desconto_percentual: number | null;
  status: string | null;
  created_at: string;
  bitrix24_lead_id: string | null;
}

// Status options and badges are now loaded from database via usePropostasStatusConfig hook

export default function AssinantesIniciais() {
  const { user } = useAuth();
  const { configs } = useConfiguracoes();
  const { statusOptions, statusBadges } = usePropostasStatusConfig();
  const [propostas, setPropostas] = useState<PropostaInicial[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [configOpen, setConfigOpen] = useState(false);

  const fetchPropostas = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from('propostas_assinantes')
        .select('*')
        .eq('user_id', user.id)
        .eq('tipo_proposta', 'inicial')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPropostas(data || []);
    } catch (error) {
      console.error('Erro ao carregar propostas:', error);
      toast.error('Erro ao carregar propostas iniciais');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPropostas();
  }, [user, statusFilter]);

  const filteredPropostas = propostas.filter((proposta) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      proposta.cliente_nome.toLowerCase().includes(searchLower) ||
      proposta.cliente_email?.toLowerCase().includes(searchLower) ||
      proposta.cliente_cidade?.toLowerCase().includes(searchLower) ||
      proposta.concessionaria?.toLowerCase().includes(searchLower)
    );
  });

  const handleViewProposta = (id: string) => {
    // Propostas iniciais sempre usam a rota /proposta-inicial
    const url = buildPublicProposalUrl({
      proposalId: id,
      publicAppUrl: configs.public_app_url,
      cacheBust: configs.public_cache_bust,
      tipoProposta: 'inicial',
    });
    window.open(url, '_blank');
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground flex items-center gap-3">
              <FileClock className="h-8 w-8 text-amber-500" />
              Propostas Iniciais
            </h1>
            <p className="text-muted-foreground mt-1">
              Propostas geradas automaticamente com valores estimados
            </p>
          </div>
          <Button onClick={fetchPropostas} variant="outline" disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>

        {/* Configurações de Campos Obrigatórios */}
        <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-base">Configurações de Automação - Proposta Inicial</CardTitle>
                      <CardDescription>
                        Configure campos obrigatórios, presunções de cálculo e regras de geração automática
                      </CardDescription>
                    </div>
                  </div>
                  <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${configOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-6">
                <Tabs defaultValue="campos" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="campos">Campos Obrigatórios</TabsTrigger>
                    <TabsTrigger value="defaults">Presunções e Regras</TabsTrigger>
                  </TabsList>
                  <TabsContent value="campos" className="mt-4">
                    <AutomationFieldsConfig tipo="inicial" />
                  </TabsContent>
                  <TabsContent value="defaults" className="mt-4">
                    <ProposalDefaultsConfig />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Info Banner */}
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <CardContent className="flex items-start gap-3 pt-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-300">
                Propostas com dados estimados
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                Estas propostas foram geradas automaticamente a partir do valor da conta de luz informado no Bitrix24. 
                O consumo e tipo de instalação foram inferidos. Para valores exatos, solicite dados adicionais ao cliente.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, email, cidade ou concessionária..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="w-full sm:w-48">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filtrar status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-foreground">{propostas.length}</div>
              <p className="text-xs text-muted-foreground">Total de Propostas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-amber-600">
                {propostas.filter(p => p.status === 'rascunho').length}
              </div>
              <p className="text-xs text-muted-foreground">Aguardando Envio</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">
                {propostas.filter(p => p.status === 'enviada').length}
              </div>
              <p className="text-xs text-muted-foreground">Enviadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                {propostas.filter(p => p.status === 'aceita').length}
              </div>
              <p className="text-xs text-muted-foreground">Aceitas</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Listagem de Propostas Iniciais</CardTitle>
            <CardDescription>
              {filteredPropostas.length} proposta(s) encontrada(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredPropostas.length === 0 ? (
              <div className="text-center py-12">
                <FileClock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground">Nenhuma proposta inicial encontrada</h3>
                <p className="text-muted-foreground mt-1">
                  Propostas iniciais são geradas automaticamente pelo webhook do Bitrix24
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Localização</TableHead>
                      <TableHead className="text-right">Valor Conta</TableHead>
                      <TableHead className="text-right">Consumo Est.</TableHead>
                      <TableHead className="text-right">Economia Est.</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPropostas.map((proposta) => {
                      const statusConfig = statusBadges[proposta.status || 'rascunho'] || statusBadges.rascunho;
                      return (
                        <TableRow key={proposta.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <div className="font-medium">{proposta.cliente_nome}</div>
                                {proposta.cliente_email && (
                                  <div className="text-xs text-muted-foreground">{proposta.cliente_email}</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {proposta.cliente_cidade && proposta.cliente_uf
                                ? `${proposta.cliente_cidade} - ${proposta.cliente_uf}`
                                : proposta.concessionaria || '-'}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {proposta.valor_conta_original 
                              ? formatCurrency(proposta.valor_conta_original)
                              : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Zap className="h-3 w-3 text-amber-500" />
                              <span>{proposta.consumo_medio ? `${formatNumber(proposta.consumo_medio)} kWh` : '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {proposta.economia_mensal 
                              ? formatCurrency(proposta.economia_mensal)
                              : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusConfig.variant}>
                              {statusConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(proposta.created_at), 'dd/MM/yy', { locale: ptBR })}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewProposta(proposta.id)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {proposta.bitrix24_lead_id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                >
                                  <a
                                    href={`${configs.bitrix24_base_url}/crm/lead/details/${proposta.bitrix24_lead_id}/`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
