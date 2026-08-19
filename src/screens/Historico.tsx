import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency, calcularPropostaAssinante, calcularPropostaUsineiro } from '@/lib/calculations';
import { generateUsineiroPDF } from '@/lib/pdf-generator';
import { PropostaAssinantePDF } from '@/components/pdf/PropostaAssinantePDF';
import type { AssinantePDFData } from '@/components/pdf/PropostaAssinantePDF';
import { downloadPDF } from '@/components/pdf/pdf-utils';
import { useConfiguracoes } from '@/hooks/useConfiguracoes';
import { buildPublicProposalUrl, buildWhatsappText, buildEmailBody } from '@/lib/public-proposal-url';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search, Users, Factory, Eye, Copy, Trash2, X, Pencil, Download, Filter, Calendar, FileSpreadsheet, MessageSquare, Mail, Link, ExternalLink, CheckSquare, XCircle, UserCircle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO } from 'date-fns';
import * as XLSX from 'xlsx';

interface PropostaAssinante {
  id: string;
  cliente_nome: string;
  cliente_cidade: string;
  cliente_uf: string;
  cliente_telefone: string | null;
  cliente_email: string | null;
  economia_mensal: number;
  economia_acumulada: number;
  status: string;
  created_at: string;
  crm_contato_id: string | null;
  tipo_proposta: string | null;
}

interface PropostaUsineiro {
  id: string;
  nome_projeto: string;
  cidade: string;
  uf: string;
  potencia_mwp: number;
  receita_bruta_anual: number;
  tir: number;
  status: string;
  created_at: string;
}

export default function Historico() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { configs } = useConfiguracoes();

  const [assinantes, setAssinantes] = useState<PropostaAssinante[]>([]);
  const [usineiros, setUsineiros] = useState<PropostaUsineiro[]>([]);
  const [busca, setBusca] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [periodoFilter, setPeriodoFilter] = useState<string>('todos');
  const [loading, setLoading] = useState(true);
  const [viewingAssinante, setViewingAssinante] = useState<PropostaAssinante | null>(null);
  const [viewingUsineiro, setViewingUsineiro] = useState<PropostaUsineiro | null>(null);
  const [detailsAssinante, setDetailsAssinante] = useState<any>(null);
  const [detailsUsineiro, setDetailsUsineiro] = useState<any>(null);
  const [assinantePdfData, setAssinantePdfData] = useState<AssinantePDFData | null>(null);
  
  // Bulk selection state
  const [selectedAssinantes, setSelectedAssinantes] = useState<Set<string>>(new Set());
  const [selectedUsineiros, setSelectedUsineiros] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchPropostas() {
      if (!user) return;

      try {
        const [resAssinantes, resUsineiros] = await Promise.all([
          supabase
            .from('propostas_assinantes')
            .select('id, cliente_nome, cliente_cidade, cliente_uf, cliente_telefone, cliente_email, economia_mensal, economia_acumulada, status, created_at, crm_contato_id, tipo_proposta')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('propostas_usineiros')
            .select('id, nome_projeto, cidade, uf, potencia_mwp, receita_bruta_anual, tir, status, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
        ]);

        if (resAssinantes.error) throw resAssinantes.error;
        if (resUsineiros.error) throw resUsineiros.error;

        setAssinantes(resAssinantes.data || []);
        setUsineiros(resUsineiros.data || []);
      } catch (error) {
        console.error('Erro ao carregar propostas:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchPropostas();
  }, [user]);

  const getTipoProposta = (tipo: string | null): 'inicial' | 'definitiva' => {
    return tipo === 'definitiva' ? 'definitiva' : 'inicial';
  };

  const getPublicPropostaUrl = (proposalId: string, tipoProposta?: string | null, autoDownload = false) => {
    return buildPublicProposalUrl({
      proposalId,
      publicAppUrl: configs.public_app_url,
      cacheBust: configs.public_cache_bust,
      autoDownload,
      tipoProposta: getTipoProposta(tipoProposta ?? null),
    });
  };

  const handleCopyLink = (proposalId: string, tipoProposta: string | null | undefined, tipo: 'visualizar' | 'download') => {
    const url = getPublicPropostaUrl(proposalId, tipoProposta, tipo === 'download');
    navigator.clipboard.writeText(url);
    toast.success(tipo === 'download' 
      ? 'Link de download copiado!' 
      : 'Link de visualização copiado!');
  };

  const buildWhatsappTextAssinante = (nome: string, proposalId: string, tipoProposta?: string | null) => {
    const url = getPublicPropostaUrl(proposalId, tipoProposta);
    return buildWhatsappText(nome, url, configs.empresa_nome);
  };

  const buildEmailBodyAssinante = (nome: string, proposalId: string, tipoProposta?: string | null) => {
    const url = getPublicPropostaUrl(proposalId, tipoProposta);
    return buildEmailBody(nome, url, 'COESA');
  };

  const handleViewAssinante = async (proposta: PropostaAssinante) => {
    try {
      const { data, error } = await supabase
        .from('propostas_assinantes')
        .select('*')
        .eq('id', proposta.id)
        .single();
      
      if (error) throw error;
      setDetailsAssinante(data);
      setViewingAssinante(proposta);
    } catch (error) {
      toast.error('Erro ao carregar detalhes da proposta');
    }
  };

  const handleViewUsineiro = async (proposta: PropostaUsineiro) => {
    try {
      const { data, error } = await supabase
        .from('propostas_usineiros')
        .select('*')
        .eq('id', proposta.id)
        .single();
      
      if (error) throw error;
      setDetailsUsineiro(data);
      setViewingUsineiro(proposta);
    } catch (error) {
      toast.error('Erro ao carregar detalhes da proposta');
    }
  };

  const handleGeneratePDFAssinante = async (id: string) => {
    try {
      toast.loading('Gerando PDF...', { id: 'pdf-loading' });

      const { data, error } = await supabase
        .from('propostas_assinantes')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) throw new Error('Proposta não encontrada');

      const resultado = calcularPropostaAssinante({
        tarifa: data.tarifa || 0.85,
        cip: data.cip || 15,
        consumoMedio: data.consumo_medio || 300,
        fidelidadeAnos: data.fidelidade_anos || 5,
        descontoPercentual: data.desconto_percentual || 15,
        tipoInstalacao: (data.tipo_instalacao as 'Monofásico' | 'Bifásico' | 'Trifásico') || 'Monofásico',
        numeroUcs: data.numero_ucs || 1,
      });

      const pdfData: AssinantePDFData = {
        cliente: {
          nome: data.cliente_nome || '',
          email: data.cliente_email || '',
          telefone: data.cliente_telefone || '',
          cidade: data.cliente_cidade || '',
          uf: data.cliente_uf || '',
        },
        instalacao: {
          concessionaria: data.concessionaria || '',
          numeroUcs: data.numero_ucs || 1,
          numeroInstalacao: data.numero_instalacao || '',
          tipoInstalacao: data.tipo_instalacao || 'Monofásico',
        },
        consumo: {
          tarifa: data.tarifa || 0.85,
          cip: data.cip || 15,
          consumoMedio: data.consumo_medio || 300,
          fidelidadeAnos: data.fidelidade_anos || 5,
          descontoPercentual: data.desconto_percentual || 15,
          responsavelComercial: data.responsavel_comercial || '',
        },
        resultado,
        configuracoes: configs,
      };

      setAssinantePdfData(pdfData);
      await new Promise((resolve) => setTimeout(resolve, 150));

      const fileName = `Proposta_Assinante_${(data.cliente_nome || 'Cliente').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

      await downloadPDF('proposta-assinante-pdf', {
        filename: fileName,
        quality: 0.95,
        scale: 2,
      });

      toast.dismiss('pdf-loading');
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      toast.dismiss('pdf-loading');
      console.error(error);
      toast.error('Erro ao gerar PDF');
    } finally {
      setAssinantePdfData(null);
    }
  };

  const handleGeneratePDFUsineiro = async (id: string) => {
    try {
      toast.loading('Gerando PDF...', { id: 'pdf-loading' });
      
      const { data, error } = await supabase
        .from('propostas_usineiros')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error || !data) throw new Error('Proposta não encontrada');
      
      const resultado = calcularPropostaUsineiro({
        potenciaMwp: data.potencia_mwp || 1,
        oversizing: data.oversizing || 1.2,
        indiceSolarimetrico: 150,
        tarifaMedia: 0.85,
        taxaAdministracao: data.taxa_administracao || 8,
        descontoClienteFinal: data.desconto_cliente_final || 15,
        capexTotal: data.capex_total || 4000000,
        omPercentual: data.om_percentual || 1,
        arrendamentoMensal: data.arrendamento_mensal || 5000,
        seguroAnual: data.seguro_anual || 20000,
        contabilidadeMensal: data.contabilidade_mensal || 1500,
        financiamentoValor: data.financiamento_valor || undefined,
        financiamentoCarenciaMeses: data.financiamento_carencia_meses || undefined,
        financiamentoPrazoMeses: data.financiamento_prazo_meses || undefined,
        financiamentoTaxa: data.financiamento_taxa || undefined,
        regimeTributario: (data.regime_tributario as 'Lucro Presumido' | 'SIMPLES') || 'Lucro Presumido',
        ipca: 4.5,
        cdi: 11,
        inflacaoEnergetica: 7,
      });
      
      await generateUsineiroPDF({
        projeto: {
          nome: data.nome_projeto,
          spe: data.spe || '',
          cidade: data.cidade || '',
          uf: data.uf || '',
          tipoGd: data.tipo_gd || 'GD II',
        },
        capacidade: {
          potenciaMwp: data.potencia_mwp || 1,
          oversizing: data.oversizing || 1.2,
          quantidadeModulos: data.quantidade_modulos || 2000,
          areaHectares: data.area_hectares || 2,
        },
        comercializacao: {
          concessionaria: data.concessionaria || '',
          tipoComercializacao: data.tipo_comercializacao || 'Melhores Esforços',
          taxaAdministracao: data.taxa_administracao || 8,
          descontoClienteFinal: data.desconto_cliente_final || 15,
          tarifaMedia: 0.85,
        },
        custos: {
          capexTotal: data.capex_total || 4000000,
          omPercentual: data.om_percentual || 1,
          arrendamentoMensal: data.arrendamento_mensal || 5000,
          seguroAnual: data.seguro_anual || 20000,
          contabilidadeMensal: data.contabilidade_mensal || 1500,
        },
        financiamento: data.financiamento_valor ? {
          valor: data.financiamento_valor,
          carenciaMeses: data.financiamento_carencia_meses || 6,
          prazoMeses: data.financiamento_prazo_meses || 120,
          taxa: data.financiamento_taxa || 12,
        } : undefined,
        regimeTributario: data.regime_tributario || 'Lucro Presumido',
        resultado,
      });
      
      toast.dismiss('pdf-loading');
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      toast.dismiss('pdf-loading');
      console.error(error);
      toast.error('Erro ao gerar PDF');
    }
  };

  const handleDuplicateAssinante = async (id: string) => {
    try {
      const { data: original, error: fetchError } = await supabase
        .from('propostas_assinantes')
        .select('*')
        .eq('id', id)
        .single();
      
      if (fetchError) throw fetchError;
      
      const { id: _, created_at, updated_at, ...duplicateData } = original;
      duplicateData.cliente_nome = `${duplicateData.cliente_nome} (cópia)`;
      duplicateData.status = 'rascunho';
      
      const { data: newProposta, error: insertError } = await supabase
        .from('propostas_assinantes')
        .insert(duplicateData)
        .select()
        .single();
      
      if (insertError) throw insertError;
      
      setAssinantes(prev => [newProposta, ...prev]);
      toast.success('Proposta duplicada com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao duplicar proposta');
    }
  };

  const handleDuplicateUsineiro = async (id: string) => {
    try {
      const { data: original, error: fetchError } = await supabase
        .from('propostas_usineiros')
        .select('*')
        .eq('id', id)
        .single();
      
      if (fetchError) throw fetchError;
      
      const { id: _, created_at, updated_at, ...duplicateData } = original;
      duplicateData.nome_projeto = `${duplicateData.nome_projeto} (cópia)`;
      duplicateData.status = 'rascunho';
      
      const { data: newProposta, error: insertError } = await supabase
        .from('propostas_usineiros')
        .insert(duplicateData)
        .select()
        .single();
      
      if (insertError) throw insertError;
      
      setUsineiros(prev => [newProposta, ...prev]);
      toast.success('Proposta duplicada com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao duplicar proposta');
    }
  };

  const handleDelete = async (tipo: 'assinante' | 'usineiro', id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta proposta?')) return;
    
    try {
      const tabela = tipo === 'assinante' ? 'propostas_assinantes' : 'propostas_usineiros';
      const { error } = await supabase.from(tabela).delete().eq('id', id);
      if (error) throw error;
      
      if (tipo === 'assinante') {
        setAssinantes(prev => prev.filter(p => p.id !== id));
      } else {
        setUsineiros(prev => prev.filter(p => p.id !== id));
      }
      toast.success('Proposta excluída com sucesso');
    } catch (error) {
      toast.error('Erro ao excluir proposta');
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      rascunho: 'outline',
      enviada: 'secondary',
      aceita: 'default',
      recusada: 'destructive',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const getDateRange = () => {
    const now = new Date();
    switch (periodoFilter) {
      case 'este_mes':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'mes_passado':
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case 'ultimos_3_meses':
        return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
      case 'ultimos_6_meses':
        return { start: startOfMonth(subMonths(now, 5)), end: endOfMonth(now) };
      default:
        return null;
    }
  };

  const filterByDateAndStatus = <T extends { status: string; created_at: string }>(items: T[]) => {
    const dateRange = getDateRange();
    
    return items.filter(item => {
      // Filtro por status
      if (statusFilter !== 'todos' && item.status !== statusFilter) {
        return false;
      }
      
      // Filtro por período
      if (dateRange) {
        const itemDate = parseISO(item.created_at);
        if (!isWithinInterval(itemDate, { start: dateRange.start, end: dateRange.end })) {
          return false;
        }
      }
      
      return true;
    });
  };

  const filteredAssinantes = filterByDateAndStatus(assinantes).filter(p =>
    p.cliente_nome?.toLowerCase().includes(busca.toLowerCase()) ||
    p.cliente_cidade?.toLowerCase().includes(busca.toLowerCase())
  );

  const filteredUsineiros = filterByDateAndStatus(usineiros).filter(p =>
    p.nome_projeto?.toLowerCase().includes(busca.toLowerCase()) ||
    p.cidade?.toLowerCase().includes(busca.toLowerCase())
  );

  // Bulk selection helpers
  const toggleSelectAssinante = (id: string) => {
    setSelectedAssinantes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectUsineiro = (id: string) => {
    setSelectedUsineiros(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAllAssinantes = () => {
    if (selectedAssinantes.size === filteredAssinantes.length) {
      setSelectedAssinantes(new Set());
    } else {
      setSelectedAssinantes(new Set(filteredAssinantes.map(p => p.id)));
    }
  };

  const selectAllUsineiros = () => {
    if (selectedUsineiros.size === filteredUsineiros.length) {
      setSelectedUsineiros(new Set());
    } else {
      setSelectedUsineiros(new Set(filteredUsineiros.map(p => p.id)));
    }
  };

  const clearSelectionAssinantes = () => setSelectedAssinantes(new Set());
  const clearSelectionUsineiros = () => setSelectedUsineiros(new Set());

  // Bulk actions
  const handleBulkDeleteAssinantes = async () => {
    if (selectedAssinantes.size === 0) return;
    if (!confirm(`Tem certeza que deseja excluir ${selectedAssinantes.size} proposta(s)?`)) return;
    
    try {
      const ids = Array.from(selectedAssinantes);
      const { error } = await supabase
        .from('propostas_assinantes')
        .delete()
        .in('id', ids);
      
      if (error) throw error;
      
      setAssinantes(prev => prev.filter(p => !selectedAssinantes.has(p.id)));
      setSelectedAssinantes(new Set());
      toast.success(`${ids.length} proposta(s) excluída(s)`);
    } catch (error) {
      toast.error('Erro ao excluir propostas');
    }
  };

  const handleBulkDeleteUsineiros = async () => {
    if (selectedUsineiros.size === 0) return;
    if (!confirm(`Tem certeza que deseja excluir ${selectedUsineiros.size} proposta(s)?`)) return;
    
    try {
      const ids = Array.from(selectedUsineiros);
      const { error } = await supabase
        .from('propostas_usineiros')
        .delete()
        .in('id', ids);
      
      if (error) throw error;
      
      setUsineiros(prev => prev.filter(p => !selectedUsineiros.has(p.id)));
      setSelectedUsineiros(new Set());
      toast.success(`${ids.length} proposta(s) excluída(s)`);
    } catch (error) {
      toast.error('Erro ao excluir propostas');
    }
  };

  const handleBulkStatusAssinantes = async (newStatus: string) => {
    if (selectedAssinantes.size === 0) return;
    
    try {
      const ids = Array.from(selectedAssinantes);
      const { error } = await supabase
        .from('propostas_assinantes')
        .update({ status: newStatus })
        .in('id', ids);
      
      if (error) throw error;
      
      setAssinantes(prev => prev.map(p => 
        selectedAssinantes.has(p.id) ? { ...p, status: newStatus } : p
      ));
      setSelectedAssinantes(new Set());
      toast.success(`Status atualizado para "${newStatus}"`);
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleBulkStatusUsineiros = async (newStatus: string) => {
    if (selectedUsineiros.size === 0) return;
    
    try {
      const ids = Array.from(selectedUsineiros);
      const { error } = await supabase
        .from('propostas_usineiros')
        .update({ status: newStatus })
        .in('id', ids);
      
      if (error) throw error;
      
      setUsineiros(prev => prev.map(p => 
        selectedUsineiros.has(p.id) ? { ...p, status: newStatus } : p
      ));
      setSelectedUsineiros(new Set());
      toast.success(`Status atualizado para "${newStatus}"`);
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
  };

  const exportSelectedAssinantesToExcel = () => {
    const selectedItems = filteredAssinantes.filter(p => selectedAssinantes.has(p.id));
    if (selectedItems.length === 0) {
      toast.error('Nenhuma proposta selecionada');
      return;
    }

    const dataToExport = selectedItems.map(p => ({
      'Cliente': p.cliente_nome,
      'Cidade': p.cliente_cidade || '',
      'UF': p.cliente_uf || '',
      'Economia Mensal': p.economia_mensal || 0,
      'Economia Acumulada': p.economia_acumulada || 0,
      'Status': p.status,
      'Data': format(new Date(p.created_at), 'dd/MM/yyyy', { locale: ptBR }),
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assinantes');
    XLSX.writeFile(wb, `propostas_selecionadas_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Exportação concluída!');
  };

  const exportSelectedUsineirosToExcel = () => {
    const selectedItems = filteredUsineiros.filter(p => selectedUsineiros.has(p.id));
    if (selectedItems.length === 0) {
      toast.error('Nenhuma proposta selecionada');
      return;
    }

    const dataToExport = selectedItems.map(p => ({
      'Projeto': p.nome_projeto,
      'Cidade': p.cidade || '',
      'UF': p.uf || '',
      'Potência (MWp)': p.potencia_mwp || 0,
      'Receita Anual': p.receita_bruta_anual || 0,
      'TIR (%)': p.tir || 0,
      'Status': p.status,
      'Data': format(new Date(p.created_at), 'dd/MM/yyyy', { locale: ptBR }),
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usineiros');
    XLSX.writeFile(wb, `propostas_selecionadas_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Exportação concluída!');
  };

  const exportAssinantesToExcel = () => {
    if (filteredAssinantes.length === 0) {
      toast.error('Nenhuma proposta para exportar');
      return;
    }

    const dataToExport = filteredAssinantes.map(p => ({
      'Cliente': p.cliente_nome,
      'Cidade': p.cliente_cidade || '',
      'UF': p.cliente_uf || '',
      'Economia Mensal': p.economia_mensal || 0,
      'Economia Acumulada': p.economia_acumulada || 0,
      'Status': p.status,
      'Data': format(new Date(p.created_at), 'dd/MM/yyyy', { locale: ptBR }),
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Assinantes');
    XLSX.writeFile(wb, `propostas_assinantes_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Exportação concluída!');
  };

  const exportUsineirosToExcel = () => {
    if (filteredUsineiros.length === 0) {
      toast.error('Nenhuma proposta para exportar');
      return;
    }

    const dataToExport = filteredUsineiros.map(p => ({
      'Projeto': p.nome_projeto,
      'Cidade': p.cidade || '',
      'UF': p.uf || '',
      'Potência (MWp)': p.potencia_mwp || 0,
      'Receita Anual': p.receita_bruta_anual || 0,
      'TIR (%)': p.tir || 0,
      'Status': p.status,
      'Data': format(new Date(p.created_at), 'dd/MM/yyyy', { locale: ptBR }),
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usineiros');
    XLSX.writeFile(wb, `propostas_usineiros_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Exportação concluída!');
  };

  return (
    <AppLayout>
      {/* Hidden container used to render the premium PDF layout for download */}
      <div className="fixed -left-[9999px] top-0 z-[-1]" style={{ width: '210mm' }}>
        {assinantePdfData && <PropostaAssinantePDF data={assinantePdfData} animated={false} />}
      </div>

      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">
              Histórico de Propostas
            </h1>
            <p className="text-muted-foreground mt-1">
              Visualize e gerencie todas as suas propostas
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou cidade..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex gap-2 items-center">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="rascunho">Rascunho</SelectItem>
                <SelectItem value="enviada">Enviada</SelectItem>
                <SelectItem value="aceita">Aceita</SelectItem>
                <SelectItem value="recusada">Recusada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex gap-2 items-center">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Select value={periodoFilter} onValueChange={setPeriodoFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todo período</SelectItem>
                <SelectItem value="este_mes">Este mês</SelectItem>
                <SelectItem value="mes_passado">Mês passado</SelectItem>
                <SelectItem value="ultimos_3_meses">Últimos 3 meses</SelectItem>
                <SelectItem value="ultimos_6_meses">Últimos 6 meses</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="assinantes" className="space-y-4">
          <TabsList>
            <TabsTrigger value="assinantes" className="gap-2">
              <Users className="h-4 w-4" />
              Assinantes ({filteredAssinantes.length})
            </TabsTrigger>
            <TabsTrigger value="usineiros" className="gap-2">
              <Factory className="h-4 w-4" />
              Usineiros ({filteredUsineiros.length})
            </TabsTrigger>
          </TabsList>

          {/* Assinantes */}
          <TabsContent value="assinantes">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Propostas para Assinantes</CardTitle>
                  <CardDescription>
                    Propostas de economia de energia para consumidores
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={exportAssinantesToExcel}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Exportar Excel
                </Button>
              </CardHeader>
              <CardContent>
                {/* Bulk Actions Bar */}
                {selectedAssinantes.size > 0 && (
                  <div className="mb-4 p-3 bg-primary/10 rounded-lg flex items-center justify-between gap-4 animate-fade-in">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="h-5 w-5 text-primary" />
                      <span className="font-medium text-sm">
                        {selectedAssinantes.size} proposta(s) selecionada(s)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            Alterar Status
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleBulkStatusAssinantes('rascunho')}>
                            Rascunho
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleBulkStatusAssinantes('enviada')}>
                            Enviada
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleBulkStatusAssinantes('aceita')}>
                            Aceita
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleBulkStatusAssinantes('recusada')}>
                            Recusada
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={exportSelectedAssinantesToExcel}
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Exportar Selecionados
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={handleBulkDeleteAssinantes}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={clearSelectionAssinantes}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Limpar
                      </Button>
                    </div>
                  </div>
                )}

                {filteredAssinantes.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    Nenhuma proposta encontrada
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedAssinantes.size === filteredAssinantes.length && filteredAssinantes.length > 0}
                            onCheckedChange={selectAllAssinantes}
                          />
                        </TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Localização</TableHead>
                        <TableHead className="text-right">Economia Mensal</TableHead>
                        <TableHead className="text-right">Economia Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-center">Contato</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAssinantes.map((p) => (
                        <TableRow key={p.id} className={selectedAssinantes.has(p.id) ? 'bg-primary/5' : ''}>
                          <TableCell>
                            <Checkbox
                              checked={selectedAssinantes.has(p.id)}
                              onCheckedChange={() => toggleSelectAssinante(p.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{p.cliente_nome}</TableCell>
                          <TableCell>{p.cliente_cidade && p.cliente_uf ? `${p.cliente_cidade}/${p.cliente_uf}` : '-'}</TableCell>
                          <TableCell className="text-right text-primary font-medium">
                            {formatCurrency(p.economia_mensal || 0)}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {formatCurrency(p.economia_acumulada || 0)}
                          </TableCell>
                          <TableCell>{getStatusBadge(p.status)}</TableCell>
                          <TableCell>
                            {format(new Date(p.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-center gap-1">
                              {p.cliente_telefone && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  title="Chamar no WhatsApp"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  asChild
                                >
                                  <a 
                                    href={`https://wa.me/${p.cliente_telefone.replace(/\D/g, '')}?text=${encodeURIComponent(buildWhatsappTextAssinante(p.cliente_nome, p.id, p.tipo_proposta))}`}
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                  >
                                    <MessageSquare className="h-4 w-4" />
                                  </a>
                                </Button>
                              )}
                              {p.cliente_email && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  title="Enviar Email"
                                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  asChild
                                >
                                  <a 
                                    href={`mailto:${p.cliente_email}?subject=${encodeURIComponent('Proposta COESA Energia')}&body=${encodeURIComponent(buildEmailBodyAssinante(p.cliente_nome, p.id, p.tipo_proposta))}`}
                                  >
                                    <Mail className="h-4 w-4" />
                                  </a>
                                </Button>
                              )}
                              {!p.cliente_telefone && !p.cliente_email && (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {p.crm_contato_id && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  title="Ver contato no CRM"
                                  onClick={() => navigate(`/crm?contato=${p.crm_contato_id}`)}
                                  className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                >
                                  <UserCircle className="h-4 w-4" />
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Visualizar"
                                onClick={() => handleViewAssinante(p)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Gerar PDF"
                                onClick={() => handleGeneratePDFAssinante(p.id)}
                              >
                                <Download className="h-4 w-4 text-secondary" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    title="Copiar link"
                                  >
                                    <Link className="h-4 w-4 text-blue-600" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleCopyLink(p.id, p.tipo_proposta, 'visualizar')}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Link para visualizar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleCopyLink(p.id, p.tipo_proposta, 'download')}>
                                    <Download className="h-4 w-4 mr-2" />
                                    Link para download
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Editar"
                                onClick={() => navigate(`/assinantes?edit=${p.id}`)}
                              >
                                <Pencil className="h-4 w-4 text-primary" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Duplicar"
                                onClick={() => handleDuplicateAssinante(p.id)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Excluir"
                                onClick={() => handleDelete('assinante', p.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Usineiros */}
          <TabsContent value="usineiros">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Propostas para Usineiros</CardTitle>
                  <CardDescription>
                    Teasers de investimento para usinas fotovoltaicas
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={exportUsineirosToExcel}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Exportar Excel
                </Button>
              </CardHeader>
              <CardContent>
                {/* Bulk Actions Bar */}
                {selectedUsineiros.size > 0 && (
                  <div className="mb-4 p-3 bg-primary/10 rounded-lg flex items-center justify-between gap-4 animate-fade-in">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="h-5 w-5 text-primary" />
                      <span className="font-medium text-sm">
                        {selectedUsineiros.size} proposta(s) selecionada(s)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            Alterar Status
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleBulkStatusUsineiros('rascunho')}>
                            Rascunho
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleBulkStatusUsineiros('enviada')}>
                            Enviada
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleBulkStatusUsineiros('aceita')}>
                            Aceita
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleBulkStatusUsineiros('recusada')}>
                            Recusada
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={exportSelectedUsineirosToExcel}
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Exportar Selecionados
                      </Button>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={handleBulkDeleteUsineiros}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={clearSelectionUsineiros}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Limpar
                      </Button>
                    </div>
                  </div>
                )}

                {filteredUsineiros.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    Nenhuma proposta encontrada
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedUsineiros.size === filteredUsineiros.length && filteredUsineiros.length > 0}
                            onCheckedChange={selectAllUsineiros}
                          />
                        </TableHead>
                        <TableHead>Projeto</TableHead>
                        <TableHead>Localização</TableHead>
                        <TableHead className="text-right">Potência</TableHead>
                        <TableHead className="text-right">Receita Anual</TableHead>
                        <TableHead className="text-right">TIR</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsineiros.map((p) => (
                        <TableRow key={p.id} className={selectedUsineiros.has(p.id) ? 'bg-primary/5' : ''}>
                          <TableCell>
                            <Checkbox
                              checked={selectedUsineiros.has(p.id)}
                              onCheckedChange={() => toggleSelectUsineiro(p.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{p.nome_projeto}</TableCell>
                          <TableCell>{p.cidade && p.uf ? `${p.cidade}/${p.uf}` : '-'}</TableCell>
                          <TableCell className="text-right">{p.potencia_mwp} MWp</TableCell>
                          <TableCell className="text-right text-primary font-medium">
                            {formatCurrency(p.receita_bruta_anual || 0)}
                          </TableCell>
                          <TableCell className="text-right font-bold">
                            {p.tir?.toFixed(1)}%
                          </TableCell>
                          <TableCell>{getStatusBadge(p.status)}</TableCell>
                          <TableCell>
                            {format(new Date(p.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Visualizar"
                                onClick={() => handleViewUsineiro(p)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Gerar PDF"
                                onClick={() => handleGeneratePDFUsineiro(p.id)}
                              >
                                <Download className="h-4 w-4 text-secondary" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Editar"
                                onClick={() => navigate(`/usineiros?edit=${p.id}`)}
                              >
                                <Pencil className="h-4 w-4 text-primary" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Duplicar"
                                onClick={() => handleDuplicateUsineiro(p.id)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                title="Excluir"
                                onClick={() => handleDelete('usineiro', p.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal Visualizar Assinante */}
        <Dialog open={!!viewingAssinante} onOpenChange={() => setViewingAssinante(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalhes da Proposta - Assinante</DialogTitle>
              <DialogDescription>
                {viewingAssinante?.cliente_nome}
              </DialogDescription>
            </DialogHeader>
            {detailsAssinante && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Cliente</p>
                    <p className="font-medium">{detailsAssinante.cliente_nome}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">CPF/CNPJ</p>
                    <p className="font-medium">{detailsAssinante.cliente_cpf_cnpj || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cidade/UF</p>
                    <p className="font-medium">{detailsAssinante.cliente_cidade}/{detailsAssinante.cliente_uf}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Telefone</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{detailsAssinante.cliente_telefone || '-'}</p>
                      {detailsAssinante.cliente_telefone && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                          asChild
                        >
                          <a 
                            href={`https://wa.me/${detailsAssinante.cliente_telefone.replace(/\D/g, '')}?text=${encodeURIComponent(buildWhatsappTextAssinante(detailsAssinante.cliente_nome, detailsAssinante.id, detailsAssinante.tipo_proposta))}`}
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            <MessageSquare className="h-4 w-4 mr-1" />
                            WhatsApp
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{detailsAssinante.cliente_email || '-'}</p>
                      {detailsAssinante.cliente_email && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          asChild
                        >
                          <a 
                            href={`mailto:${detailsAssinante.cliente_email}?subject=${encodeURIComponent('Proposta COESA Energia')}&body=${encodeURIComponent(buildEmailBodyAssinante(detailsAssinante.cliente_nome, detailsAssinante.id, detailsAssinante.tipo_proposta))}`}
                          >
                            <Mail className="h-4 w-4 mr-1" />
                            Email
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Concessionária</p>
                    <p className="font-medium">{detailsAssinante.concessionaria || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Consumo Médio</p>
                    <p className="font-medium">{detailsAssinante.consumo_medio} kWh</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tarifa</p>
                    <p className="font-medium">R$ {detailsAssinante.tarifa?.toFixed(4)}/kWh</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Desconto</p>
                    <p className="font-medium">{detailsAssinante.desconto_percentual}%</p>
                  </div>
                </div>
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-2">Economia</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg text-center">
                      <p className="text-sm text-muted-foreground">Mensal</p>
                      <p className="text-lg font-bold text-primary">{formatCurrency(detailsAssinante.economia_mensal || 0)}</p>
                    </div>
                    <div className="p-3 bg-primary/10 rounded-lg text-center">
                      <p className="text-sm text-muted-foreground">Anual</p>
                      <p className="text-lg font-bold text-primary">{formatCurrency(detailsAssinante.economia_anual || 0)}</p>
                    </div>
                    <div className="p-3 bg-primary/10 rounded-lg text-center">
                      <p className="text-sm text-muted-foreground">Total ({detailsAssinante.fidelidade_anos} anos)</p>
                      <p className="text-lg font-bold text-primary">{formatCurrency(detailsAssinante.economia_acumulada || 0)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal Visualizar Usineiro */}
        <Dialog open={!!viewingUsineiro} onOpenChange={() => setViewingUsineiro(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalhes da Proposta - Usineiro</DialogTitle>
              <DialogDescription>
                {viewingUsineiro?.nome_projeto}
              </DialogDescription>
            </DialogHeader>
            {detailsUsineiro && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Projeto</p>
                    <p className="font-medium">{detailsUsineiro.nome_projeto}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">SPE</p>
                    <p className="font-medium">{detailsUsineiro.spe || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Localização</p>
                    <p className="font-medium">{detailsUsineiro.cidade}/{detailsUsineiro.uf}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Potência</p>
                    <p className="font-medium">{detailsUsineiro.potencia_mwp} MWp</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tipo GD</p>
                    <p className="font-medium">{detailsUsineiro.tipo_gd}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">CAPEX Total</p>
                    <p className="font-medium">{formatCurrency(detailsUsineiro.capex_total || 0)}</p>
                  </div>
                </div>
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-2">Indicadores Financeiros</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 bg-primary/10 rounded-lg text-center">
                      <p className="text-sm text-muted-foreground">TIR</p>
                      <p className="text-lg font-bold text-primary">{detailsUsineiro.tir?.toFixed(1)}%</p>
                    </div>
                    <div className="p-3 bg-primary/10 rounded-lg text-center">
                      <p className="text-sm text-muted-foreground">VPL</p>
                      <p className="text-lg font-bold text-primary">{formatCurrency(detailsUsineiro.vpl || 0)}</p>
                    </div>
                    <div className="p-3 bg-primary/10 rounded-lg text-center">
                      <p className="text-sm text-muted-foreground">Payback</p>
                      <p className="text-lg font-bold text-primary">{detailsUsineiro.payback_anos?.toFixed(1)} anos</p>
                    </div>
                  </div>
                </div>
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-2">Receitas</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Receita Bruta Anual</p>
                      <p className="font-medium">{formatCurrency(detailsUsineiro.receita_bruta_anual || 0)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">EBITDA Anual</p>
                      <p className="font-medium">{formatCurrency(detailsUsineiro.ebitda_anual || 0)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
