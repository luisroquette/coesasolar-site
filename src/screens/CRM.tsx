import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/calculations';
import { Users, Search, Download, Filter, Eye, Edit2, Loader2, UserPlus, Phone, Mail, MapPin, Calendar, TrendingUp, MessageSquare, Trash2, CheckSquare, X, AlertTriangle, GitBranch, FileText, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { DocumentsCell } from '@/components/crm/DocumentsCell';
import { Checkbox } from '@/components/ui/checkbox';
import { formatWhatsAppNumber, isValidWhatsAppNumber } from '@/lib/whatsapp-utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { ReprocessBitrixLeadDialog } from '@/components/crm/ReprocessBitrixLeadDialog';
import { ReprocessBitrixBulkButton } from '@/components/crm/ReprocessBitrixBulkButton';
import { BitrixLogDialog } from '@/components/crm/BitrixLogDialog';
import { useBitrixStages } from '@/hooks/useBitrixStages';
import { MissingProposalAlert } from '@/components/crm/MissingProposalAlert';
import { useCRMConfig, getStatusLabel, getOrigemLabel } from '@/hooks/useCRMConfig';
import { useUIConfig } from '@/hooks/useUIConfig';

interface CRMContato {
  id: string;
  user_id: string;
  criado_por_email: string | null;
  criado_por_nome: string | null;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  origem: string | null;
  proposta_id: string | null;
  proposta_tipo: string | null;
  status: string;
  observacoes: string | null;
  ultima_interacao: string | null;
  valor_potencial: number | null;
  created_at: string;
  updated_at: string;
  bitrix24_lead_id: string | null;
  bitrix24_stage: string | null;
  ultimo_erro: string | null;
}

interface PropostaVinculada {
  id: string;
  cliente_nome: string;
  economia_mensal: number | null;
  status: string | null;
  created_at: string;
}

// Status options and origem labels are now loaded from database via useCRMConfig hook

export default function CRM() {
  const { user } = useAuth();
  const { getStageName } = useBitrixStages();
  const { statusOptions, origemLabels } = useCRMConfig();
  const { leadAlertMinAgeHours, sofiaOrigins } = useUIConfig();
  const [contatos, setContatos] = useState<CRMContato[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedContato, setSelectedContato] = useState<CRMContato | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logDialogContato, setLogDialogContato] = useState<CRMContato | null>(null);
  const [propostasVinculadas, setPropostasVinculadas] = useState<PropostaVinculada[]>([]);
  const [loadingPropostas, setLoadingPropostas] = useState(false);

  // Sorting state
  type SortColumn = 'nome' | 'contato' | 'localizacao' | 'etapa' | 'status' | 'origem' | 'valor_potencial' | 'responsavel' | 'created_at';
  type SortDirection = 'asc' | 'desc';
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 ml-1 text-primary" /> 
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  };

  // Edit form state
  const [editStatus, setEditStatus] = useState('');
  const [editObservacoes, setEditObservacoes] = useState('');

  useEffect(() => {
    loadContatos();
  }, [user]);

  const loadContatos = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crm_contatos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContatos((data as CRMContato[]) || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
      toast.error('Erro ao carregar contatos');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateContato = async () => {
    if (!selectedContato) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('crm_contatos')
        .update({
          status: editStatus,
          observacoes: editObservacoes,
          ultima_interacao: new Date().toISOString(),
        })
        .eq('id', selectedContato.id);

      if (error) throw error;

      toast.success('Contato atualizado!');
      setIsEditing(false);
      loadContatos();
      
      // Update local state
      setSelectedContato({
        ...selectedContato,
        status: editStatus,
        observacoes: editObservacoes,
      });
    } catch (error) {
      console.error('Error updating contact:', error);
      toast.error('Erro ao atualizar contato');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContato = async (contato: CRMContato) => {
    try {
      const { error } = await supabase
        .from('crm_contatos')
        .delete()
        .eq('id', contato.id);

      if (error) throw error;

      toast.success('Contato excluído!');
      loadContatos();
      setIsDetailOpen(false);
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast.error('Erro ao excluir contato');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    setIsBulkDeleting(true);
    try {
      const { error } = await supabase
        .from('crm_contatos')
        .delete()
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      toast.success(`${selectedIds.size} contato(s) excluído(s)!`);
      setSelectedIds(new Set());
      loadContatos();
    } catch (error) {
      console.error('Error bulk deleting contacts:', error);
      toast.error('Erro ao excluir contatos');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContatos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContatos.map(c => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleExportExcel = () => {
    const exportData = filteredContatos.map(c => ({
      'Nome': c.nome,
      'CPF/CNPJ': c.cpf_cnpj || '',
      'Email': c.email || '',
      'Telefone': c.telefone || '',
      'Cidade': c.cidade || '',
      'UF': c.uf || '',
      'Endereço': c.endereco || '',
      'CEP': c.cep || '',
      'Status': getStatusLabel(statusOptions, c.status),
      'Origem': getOrigemLabel(origemLabels, c.origem),
      'Valor Potencial': c.valor_potencial || 0,
      'Criado por': c.criado_por_nome || c.criado_por_email || '',
      'Data Cadastro': format(new Date(c.created_at), 'dd/MM/yyyy HH:mm'),
      'Última Interação': c.ultima_interacao ? format(new Date(c.ultima_interacao), 'dd/MM/yyyy HH:mm') : '',
      'Observações': c.observacoes || '',
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CRM Contatos');
    XLSX.writeFile(wb, `CRM_COESA_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Excel exportado com sucesso!');
  };

  const openDetail = async (contato: CRMContato) => {
    setSelectedContato(contato);
    setEditStatus(contato.status);
    setEditObservacoes(contato.observacoes || '');
    setIsDetailOpen(true);
    setIsEditing(false);
    setPropostasVinculadas([]);
    
    // Carregar propostas vinculadas
    setLoadingPropostas(true);
    try {
      const { data, error } = await supabase
        .from('propostas_assinantes')
        .select('id, cliente_nome, economia_mensal, status, created_at')
        .eq('crm_contato_id', contato.id)
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        setPropostasVinculadas(data);
      }
    } catch (err) {
      console.error('Erro ao carregar propostas vinculadas:', err);
    } finally {
      setLoadingPropostas(false);
    }
  };

  const getStatusBadge = (status: string, contato?: CRMContato) => {
    const statusOption = statusOptions.find(s => s.value === status);
    
    // Se for status de erro e tiver contato com bitrix24_lead_id, torna clicável
    if (status === 'erro' && contato?.bitrix24_lead_id) {
      return (
        <Badge 
          className={`${statusOption?.color || 'bg-red-600 text-white'} cursor-pointer hover:opacity-80 flex items-center gap-1`}
          onClick={(e) => {
            e.stopPropagation();
            setLogDialogContato(contato);
            setLogDialogOpen(true);
          }}
        >
          <AlertTriangle className="h-3 w-3" />
          {statusOption?.label || status}
        </Badge>
      );
    }
    
    return (
      <Badge className={statusOption?.color || 'bg-gray-100 text-gray-800'}>
        {statusOption?.label || status}
      </Badge>
    );
  };

  // Filter and sort contacts
  const filteredContatos = contatos
    .filter(c => {
      const matchesSearch = 
        c.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.telefone?.includes(searchTerm) ||
        c.cidade?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.criado_por_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.criado_por_email?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      
      switch (sortColumn) {
        case 'nome':
          return dir * a.nome.localeCompare(b.nome, 'pt-BR');
        case 'contato':
          const aContact = a.email || a.telefone || '';
          const bContact = b.email || b.telefone || '';
          return dir * aContact.localeCompare(bContact, 'pt-BR');
        case 'localizacao':
          const aLoc = [a.cidade, a.uf].filter(Boolean).join(' ');
          const bLoc = [b.cidade, b.uf].filter(Boolean).join(' ');
          return dir * aLoc.localeCompare(bLoc, 'pt-BR');
        case 'etapa':
          const aStage = a.bitrix24_stage || '';
          const bStage = b.bitrix24_stage || '';
          return dir * aStage.localeCompare(bStage);
        case 'status':
          return dir * a.status.localeCompare(b.status);
        case 'origem':
          return dir * (a.origem || '').localeCompare(b.origem || '');
        case 'valor_potencial':
          return dir * ((a.valor_potencial || 0) - (b.valor_potencial || 0));
        case 'responsavel':
          return dir * (a.criado_por_nome || '').localeCompare(b.criado_por_nome || '', 'pt-BR');
        case 'created_at':
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        default:
          return 0;
      }
    });

  // Stats
  const stats = {
    total: contatos.length,
    novos: contatos.filter(c => c.status === 'novo').length,
    negociando: contatos.filter(c => c.status === 'negociando').length,
    fechados: contatos.filter(c => c.status === 'fechado').length,
    erros: contatos.filter(c => c.status === 'erro').length,
    valorTotal: contatos.reduce((sum, c) => sum + (c.valor_potencial || 0), 0),
  };

  // Leads com dados completos mas sem proposta vinculada
  // Critérios: origem Sofia/Bitrix, tem nome, tem telefone ou email, tem valor_potencial, mas não tem proposta_id
  const leadsSemProposta = useMemo(() => {
    const alertMinAgeMs = leadAlertMinAgeHours * 60 * 60 * 1000;
    const minAgeThreshold = new Date(Date.now() - alertMinAgeMs);
    
    return contatos.filter(c => {
      const hasCompleteData = 
        c.nome && 
        (c.telefone || c.email) &&
        c.valor_potencial && 
        c.valor_potencial > 0 &&
        sofiaOrigins.includes(c.origem || '');
      
      const missingProposal = !c.proposta_id;
      const isOldEnough = new Date(c.created_at) < minAgeThreshold;
      const notInErrorStatus = c.status !== 'erro' && c.status !== 'perdido';
      
      return hasCompleteData && missingProposal && isOldEnough && notInErrorStatus;
    }).map(c => ({
      id: c.id,
      nome: c.nome,
      telefone: c.telefone,
      email: c.email,
      valor_potencial: c.valor_potencial,
      bitrix24_lead_id: c.bitrix24_lead_id,
      created_at: c.created_at,
    }));
  }, [contatos, leadAlertMinAgeHours, sofiaOrigins]);

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground flex items-center gap-2">
              <Users className="h-8 w-8 text-primary" />
              Micro CRM
            </h1>
            <p className="text-muted-foreground mt-1">
              Base de contatos para remarketing - atualizada automaticamente a cada proposta
            </p>
          </div>
          <div className="flex gap-2">
            <ReprocessBitrixLeadDialog />
            <Button onClick={handleExportExcel} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Exportar Excel
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Users className="h-8 w-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Novos</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.novos}</p>
                </div>
                <UserPlus className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Negociando</p>
                  <p className="text-2xl font-bold text-orange-600">{stats.negociando}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-orange-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Fechados</p>
                  <p className="text-2xl font-bold text-green-600">{stats.fechados}</p>
                </div>
                <Users className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          {stats.erros > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-red-600 font-medium">Erros Bitrix</p>
                    <p className="text-2xl font-bold text-red-600">{stats.erros}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-red-500 opacity-50" />
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Valor Potencial</p>
                  <p className="text-xl font-bold text-primary">{formatCurrency(stats.valorTotal)}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-primary opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alerta de leads sem proposta */}
        <MissingProposalAlert leads={leadsSemProposta} onReprocessed={loadContatos} />

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, email, telefone, cidade ou responsável..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filtrar status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {statusOptions.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <Card className="border-primary bg-primary/5">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckSquare className="h-5 w-5 text-primary" />
                  <span className="font-medium">
                    {selectedIds.size} contato{selectedIds.size > 1 ? 's' : ''} selecionado{selectedIds.size > 1 ? 's' : ''}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedIds(new Set())}
                    className="text-muted-foreground"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Limpar seleção
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <ReprocessBitrixBulkButton 
                    selectedContatoIds={Array.from(selectedIds)} 
                    onComplete={loadContatos}
                  />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={isBulkDeleting}>
                        {isBulkDeleting ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-1" />
                        )}
                        Excluir selecionados
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                          Excluir {selectedIds.size} contato{selectedIds.size > 1 ? 's' : ''}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-3">
                          <span>Tem certeza que deseja excluir os contatos selecionados?</span>
                          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                            <p className="text-destructive font-medium text-sm">
                              ⚠️ Atenção: Todas as propostas associadas a estes contatos também serão excluídas permanentemente.
                            </p>
                          </div>
                          <span className="text-muted-foreground">Esta ação não pode ser desfeita.</span>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleBulkDelete}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Excluir {selectedIds.size} contato{selectedIds.size > 1 ? 's' : ''}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Contatos ({filteredContatos.length})</CardTitle>
            <CardDescription>
              Lista completa de leads capturados automaticamente das propostas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredContatos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>Nenhum contato encontrado</p>
                <p className="text-sm">Os contatos serão adicionados automaticamente ao criar propostas</p>
              </div>
            ) : (
              <Table containerClassName="max-h-[65vh] overscroll-contain">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 sticky top-0 left-0 bg-background z-30">
                      <Checkbox
                        checked={selectedIds.size === filteredContatos.length && filteredContatos.length > 0}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Selecionar todos"
                      />
                    </TableHead>
                    <TableHead 
                      className="sticky top-0 left-12 bg-background z-30 min-w-[150px] cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('nome')}
                    >
                      <div className="flex items-center">
                        Nome {getSortIcon('nome')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="sticky top-0 bg-background z-20 cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('contato')}
                    >
                      <div className="flex items-center">
                        Contato {getSortIcon('contato')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="sticky top-0 bg-background z-20 cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('localizacao')}
                    >
                      <div className="flex items-center">
                        Localização {getSortIcon('localizacao')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="sticky top-0 bg-background z-20 cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('etapa')}
                    >
                      <div className="flex items-center">
                        Etapa {getSortIcon('etapa')}
                      </div>
                    </TableHead>
                    <TableHead className="sticky top-0 bg-background z-20">Docs</TableHead>
                    <TableHead 
                      className="sticky top-0 bg-background z-20 cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center">
                        Status {getSortIcon('status')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="sticky top-0 bg-background z-20 cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('origem')}
                    >
                      <div className="flex items-center">
                        Origem {getSortIcon('origem')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="sticky top-0 bg-background z-20 cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('valor_potencial')}
                    >
                      <div className="flex items-center">
                        Valor Potencial {getSortIcon('valor_potencial')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="sticky top-0 bg-background z-20 cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('responsavel')}
                    >
                      <div className="flex items-center">
                        Responsável {getSortIcon('responsavel')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="sticky top-0 bg-background z-20 cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('created_at')}
                    >
                      <div className="flex items-center">
                        Cadastro {getSortIcon('created_at')}
                      </div>
                    </TableHead>
                    <TableHead className="sticky top-0 bg-background z-20 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                  <TableBody>
                    {filteredContatos.map((contato) => (
                      <TableRow 
                        key={contato.id} 
                        className={`hover:bg-muted/50 ${selectedIds.has(contato.id) ? 'bg-primary/5' : ''}`}
                      >
                        <TableCell className="sticky left-0 bg-background z-10">
                          <Checkbox
                            checked={selectedIds.has(contato.id)}
                            onCheckedChange={() => toggleSelect(contato.id)}
                            aria-label={`Selecionar ${contato.nome}`}
                          />
                        </TableCell>
                        <TableCell className="sticky left-12 bg-background z-10 min-w-[150px]">
                          <div>
                            <p className="font-medium">{contato.nome}</p>
                            {contato.cpf_cnpj && (
                              <p className="text-xs text-muted-foreground">{contato.cpf_cnpj}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {contato.email && (
                              <div className="flex items-center gap-1 text-sm">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                <span className="truncate max-w-[150px]">{contato.email}</span>
                              </div>
                            )}
                            {contato.telefone && (
                              <div className="flex items-center gap-1 text-sm">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                <span>{contato.telefone}</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {(contato.cidade || contato.uf) && (
                            <div className="flex items-center gap-1 text-sm">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span>{[contato.cidade, contato.uf].filter(Boolean).join(' - ')}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {contato.bitrix24_stage ? (
                            <Badge variant="outline" className="text-xs font-normal">
                              <GitBranch className="h-3 w-3 mr-1" />
                              {getStageName(contato.bitrix24_stage)}
                            </Badge>
                          ) : contato.bitrix24_lead_id ? (
                            <Badge variant="outline" className="text-xs font-normal text-amber-600 border-amber-300">
                              <GitBranch className="h-3 w-3 mr-1" />
                              Sincronizar
                            </Badge>
                          ) : contato.origem === 'proposta_assinante' || contato.origem === 'proposta_usineiro' ? (
                            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                              <FileText className="h-3 w-3 mr-1" />
                              Proposta Inicial
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                              Novo Lead
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <DocumentsCell 
                            telefone={contato.telefone}
                            bitrixLeadId={contato.bitrix24_lead_id}
                            propostaId={contato.proposta_id}
                          />
                        </TableCell>
                        <TableCell>{getStatusBadge(contato.status, contato)}</TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {getOrigemLabel(origemLabels, contato.origem)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {contato.valor_potencial ? (
                            <span className="font-medium text-primary">
                              {formatCurrency(contato.valor_potencial)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p className="font-medium">{contato.criado_por_nome || '-'}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                              {contato.criado_por_email}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>{format(new Date(contato.created_at), 'dd/MM/yy')}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* WhatsApp Button */}
                            {contato.telefone && (() => {
                              const formattedNumber = formatWhatsAppNumber(contato.telefone);
                              const isValid = isValidWhatsAppNumber(formattedNumber);
                              if (!isValid) return null;
                              const message = encodeURIComponent(`Olá ${contato.nome.split(' ')[0]}, tudo bem? Aqui é da COESA Energia.`);
                              return (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => window.open(`https://wa.me/${formattedNumber}?text=${message}`, '_blank')}
                                  title="Abrir WhatsApp"
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </Button>
                              );
                            })()}
                            
                            {/* Email Button */}
                            {contato.email && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => {
                                  const subject = encodeURIComponent('COESA Energia - Contato');
                                  const body = encodeURIComponent(`Olá ${contato.nome.split(' ')[0]},\n\nEspero que esteja bem.\n\nAtenciosamente,\nEquipe COESA Energia`);
                                  window.open(`mailto:${contato.email}?subject=${subject}&body=${body}`, '_blank');
                                }}
                                title="Enviar Email"
                              >
                                <Mail className="h-4 w-4" />
                              </Button>
                            )}
                            
                            {/* View Details Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDetail(contato)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>

                            {/* Delete Button */}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-destructive" />
                                    Excluir contato
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="space-y-3">
                                    <span>Tem certeza que deseja excluir o contato <strong>{contato.nome}</strong>?</span>
                                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                                      <p className="text-destructive font-medium text-sm">
                                        ⚠️ Atenção: Todas as propostas associadas a este contato também serão excluídas permanentemente.
                                      </p>
                                    </div>
                                    <span className="text-muted-foreground">Esta ação não pode ser desfeita.</span>
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteContato(contato)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Excluir
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Detalhes do Contato
              </DialogTitle>
            </DialogHeader>

            {selectedContato && (
              <div className="space-y-6">
                {/* Basic Info */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-muted-foreground">Nome</Label>
                    <p className="font-medium text-lg">{selectedContato.nome}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">CPF/CNPJ</Label>
                    <p className="font-medium">{selectedContato.cpf_cnpj || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Email</Label>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{selectedContato.email || '-'}</p>
                      {selectedContato.email && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => {
                            const subject = encodeURIComponent('COESA Energia - Contato');
                            const body = encodeURIComponent(`Olá ${selectedContato.nome.split(' ')[0]},\n\nEspero que esteja bem.\n\nAtenciosamente,\nEquipe COESA Energia`);
                            window.open(`mailto:${selectedContato.email}?subject=${subject}&body=${body}`, '_blank');
                          }}
                          title="Enviar Email"
                        >
                          <Mail className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Telefone</Label>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{selectedContato.telefone || '-'}</p>
                      {selectedContato.telefone && (() => {
                        const formattedNumber = formatWhatsAppNumber(selectedContato.telefone);
                        const isValid = isValidWhatsAppNumber(formattedNumber);
                        if (!isValid) return null;
                        const message = encodeURIComponent(`Olá ${selectedContato.nome.split(' ')[0]}, tudo bem? Aqui é da COESA Energia.`);
                        return (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => window.open(`https://wa.me/${formattedNumber}?text=${message}`, '_blank')}
                            title="Abrir WhatsApp"
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-muted-foreground">Endereço</Label>
                    <p className="font-medium">
                      {[selectedContato.endereco, selectedContato.cidade, selectedContato.uf, selectedContato.cep]
                        .filter(Boolean)
                        .join(', ') || '-'}
                    </p>
                  </div>
                </div>

                {/* Meta Info */}
                <div className="grid gap-4 md:grid-cols-3 p-4 bg-muted/50 rounded-lg">
                  <div>
                    <Label className="text-muted-foreground">Origem</Label>
                    <p className="font-medium">{getOrigemLabel(origemLabels, selectedContato.origem)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Valor Potencial</Label>
                    <p className="font-medium text-primary">
                      {selectedContato.valor_potencial ? formatCurrency(selectedContato.valor_potencial) : '-'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Responsável</Label>
                    <p className="font-medium">{selectedContato.criado_por_nome || selectedContato.criado_por_email || '-'}</p>
                  </div>
                </div>

                {/* Editable Fields */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Status e Observações</h4>
                    {!isEditing && (
                      <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                        <Edit2 className="h-4 w-4 mr-1" />
                        Editar
                      </Button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-4">
                      <div>
                        <Label>Status</Label>
                        <Select value={editStatus} onValueChange={setEditStatus}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Observações</Label>
                        <Textarea
                          value={editObservacoes}
                          onChange={(e) => setEditObservacoes(e.target.value)}
                          placeholder="Adicione notas sobre este contato..."
                          rows={4}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleUpdateContato} disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                          Salvar
                        </Button>
                        <Button variant="outline" onClick={() => setIsEditing(false)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <Label className="text-muted-foreground">Status</Label>
                        <div className="mt-1">{getStatusBadge(selectedContato.status, selectedContato)}</div>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Observações</Label>
                        <p className="mt-1 text-sm whitespace-pre-wrap">
                          {selectedContato.observacoes || 'Nenhuma observação'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Propostas Vinculadas */}
                <div className="space-y-3 pt-4 border-t">
                  <h4 className="font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Propostas Vinculadas
                  </h4>
                  {loadingPropostas ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : propostasVinculadas.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      Nenhuma proposta vinculada a este contato.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {propostasVinculadas.map(proposta => (
                        <div 
                          key={proposta.id} 
                          className="flex items-center justify-between p-2 bg-muted/50 rounded-md text-sm"
                        >
                          <div className="flex-1">
                            <span className="font-medium">{proposta.cliente_nome}</span>
                            <span className="text-muted-foreground ml-2">
                              {format(new Date(proposta.created_at), 'dd/MM/yy')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {proposta.economia_mensal && (
                              <span className="text-primary font-medium">
                                {formatCurrency(proposta.economia_mensal)}/mês
                              </span>
                            )}
                            <Badge variant={proposta.status === 'aceita' ? 'default' : 'outline'} className="text-xs">
                              {proposta.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Timestamps */}
                <div className="flex gap-6 text-sm text-muted-foreground pt-4 border-t">
                  <span>Cadastrado: {format(new Date(selectedContato.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  {selectedContato.ultima_interacao && (
                    <span>Última interação: {format(new Date(selectedContato.ultima_interacao), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Bitrix Log Dialog */}
        {logDialogContato && (
          <BitrixLogDialog
            open={logDialogOpen}
            onOpenChange={setLogDialogOpen}
            bitrixLeadId={logDialogContato.bitrix24_lead_id || ''}
            contatoNome={logDialogContato.nome}
            ultimoErro={logDialogContato.ultimo_erro}
            onReprocessSuccess={loadContatos}
          />
        )}
      </div>
    </AppLayout>
  );
}
