import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { 
  calcularPropostaAssinante, 
  calcularPropostaAssinanteGD2,
  formatCurrency, 
  formatNumber, 
  AssinanteInput,
  AssinanteInputGD2,
  AssinanteOutputGD2,
  getPercentualGD2
} from '@/lib/calculations';
import { PDFPreviewNew } from '@/components/pdf/PDFPreviewNew';
import { downloadPDF } from '@/components/pdf/pdf-utils';
import { useConfiguracoes } from '@/hooks/useConfiguracoes';
import { useParametrosMacro } from '@/hooks/useParametrosMacro';
import { useFormOptions } from '@/hooks/useFormOptions';
import { formatWhatsAppNumber, isValidWhatsAppNumber, formatWhatsAppDisplay } from '@/lib/whatsapp-utils';
import { formatCpfCnpj, isValidCpfCnpj, isDocumentComplete, getDocumentType } from '@/lib/cpf-cnpj-utils';
import { isValidEmail } from '@/lib/email-utils';
import { formatCEP, isCEPComplete, fetchAddressByCEP } from '@/lib/cep-utils';
import { AutomationFieldsConfig } from '@/components/settings/AutomationFieldsConfig';
import { 
  FileText, Save, TrendingUp, Zap, Calculator, User, Download, Check, X, Loader2, 
  Info, Flag, Percent, AlertTriangle, Receipt, Table, Sun, Factory, Settings, ChevronDown
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Badge } from '@/components/ui/badge';
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ZERO HARDCODE: PIS/COFINS fallback - actual value loaded from useCalculationConfigs
const PIS_COFINS_ALIQUOTA_PADRAO = 0.0365; // 3.65%

interface Concessionaria {
  id: string;
  nome: string;
  uf: string | null;
  tarifa_media: number | null;
  tarifa_com_impostos?: number | null;
  tusd: number | null;
  te: number | null;
  tusd_fio_b: number | null;
  pis_cofins: number | null;
}

interface IcmsEstado {
  uf: string;
  nome_estado: string;
  icms_percentual: number;
  icms_isenta_compensacao: boolean | null;
  base_legal: string | null;
}

interface BandeiraTarifaria {
  ano_mes: string;
  bandeira: string;
  valor_kwh: number;
}

export default function Assinantes() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = searchParams.get('edit');
  const { configs } = useConfiguracoes();
  const { inflacaoEnergeticaDecimal } = useParametrosMacro();
  
  // ZERO HARDCODE: Load form options from database
  const { tiposInstalacao } = useFormOptions();
  
  const [saving, setSaving] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [concessionarias, setConcessionarias] = useState<Concessionaria[]>([]);
  
  // Dados tributários
  const [icmsEstados, setIcmsEstados] = useState<IcmsEstado[]>([]);
  const [bandeiraVigente, setBandeiraVigente] = useState<BandeiraTarifaria | null>(null);
  const [icmsEstadoSelecionado, setIcmsEstadoSelecionado] = useState<IcmsEstado | null>(null);
  const [concessionariaSelecionada, setConcessionariaSelecionada] = useState<Concessionaria | null>(null);
  
  // Dados do cliente
  const [clienteNome, setClienteNome] = useState('');
  const [clienteCpfCnpj, setClienteCpfCnpj] = useState('');
  const [clienteEndereco, setClienteEndereco] = useState('');
  const [clienteCidade, setClienteCidade] = useState('');
  const [clienteUf, setClienteUf] = useState('');
  const [clienteCep, setClienteCep] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [clienteEmail, setClienteEmail] = useState('');
  
  // Dados da instalação
  const [concessionaria, setConcessionaria] = useState('');
  const [numeroUcs, setNumeroUcs] = useState(1);
  const [numeroInstalacao, setNumeroInstalacao] = useState('');
  const [tipoInstalacao, setTipoInstalacao] = useState('Monofásico');
  
  // Dados de consumo (estratificados)
  const [te, setTe] = useState(0);
  const [tusd, setTusd] = useState(0);
  const [tusdFioB, setTusdFioB] = useState(0);
  const [tarifa, setTarifa] = useState(0.85);
  const [cip, setCip] = useState(45);
  const [consumoMedio, setConsumoMedio] = useState(500);
  
  // Condições comerciais
  const [fidelidadeMeses, setFidelidadeMeses] = useState(36);
  const [descontoPercentual, setDescontoPercentual] = useState(25);
  
  // Configurações GD e COESA
  const [tipoGeracao, setTipoGeracao] = useState<'GD1' | 'GD2'>('GD2');
  const [quemArcaGD2, setQuemArcaGD2] = useState<'usineiro' | 'assinante'>('usineiro');
  const [tarifaCoesa, setTarifaCoesa] = useState<number | null>(null); // Será preenchido pelo useEffect
  const [taxaBancariaCoesa, setTaxaBancariaCoesa] = useState<number | null>(null); // Será preenchido pelo useEffect
  const [responsavelComercial, setResponsavelComercial] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  // Buscar concessionárias, ICMS e bandeira vigente
  useEffect(() => {
    async function fetchData() {
      const [concessionariasRes, icmsRes, bandeirasRes] = await Promise.all([
        supabase.from('concessionarias').select('*').order('nome'),
        supabase.from('icms_estados').select('uf, nome_estado, icms_percentual, icms_isenta_compensacao, base_legal'),
        supabase.from('bandeiras_tarifarias').select('*').order('ano_mes', { ascending: false }).limit(1)
      ]);
      
      if (!concessionariasRes.error && concessionariasRes.data) {
        setConcessionarias(concessionariasRes.data);
      }
      if (!icmsRes.error && icmsRes.data) {
        setIcmsEstados(icmsRes.data);
      }
      if (!bandeirasRes.error && bandeirasRes.data && bandeirasRes.data.length > 0) {
        setBandeiraVigente(bandeirasRes.data[0]);
      }
    }
    fetchData();
  }, []);

  // Carregar valores padrão das configurações COESA
  useEffect(() => {
    if (configs && tarifaCoesa === null) {
      setTarifaCoesa(parseFloat(configs.tarifa_padrao_coesa) || 0.80);
    }
    if (configs && taxaBancariaCoesa === null) {
      setTaxaBancariaCoesa(parseFloat(configs.taxa_bancaria_coesa) || 4.50);
    }
  }, [configs, tarifaCoesa, taxaBancariaCoesa]);

  // Carregar proposta para edição
  useEffect(() => {
    async function loadProposta() {
      if (!editId) return;
      
      const { data, error } = await supabase
        .from('propostas_assinantes')
        .select('*')
        .eq('id', editId)
        .single();
      
      if (error || !data) {
        toast.error('Proposta não encontrada');
        navigate('/assinantes');
        return;
      }
      
      setIsEditing(true);
      setClienteNome(data.cliente_nome || '');
      setClienteCpfCnpj(data.cliente_cpf_cnpj || '');
      setClienteEndereco(data.cliente_endereco || '');
      setClienteCidade(data.cliente_cidade || '');
      setClienteUf(data.cliente_uf || '');
      setClienteCep(data.cliente_cep || '');
      setClienteTelefone(data.cliente_telefone || '');
      setClienteEmail(data.cliente_email || '');
      setConcessionaria(data.concessionaria || '');
      setNumeroUcs(data.numero_ucs || 1);
      setNumeroInstalacao(data.numero_instalacao || '');
      setTipoInstalacao(data.tipo_instalacao || 'Monofásico');
      setTarifa(data.tarifa || 0.85);
      setCip(data.cip || 45);
      setConsumoMedio(data.consumo_medio || 500);
      setFidelidadeMeses((data.fidelidade_anos || 3) * 12);
      setDescontoPercentual(data.desconto_percentual || 25);
      setResponsavelComercial(data.responsavel_comercial || '');
    }
    
    loadProposta();
  }, [editId, navigate]);

  // Handler para auto-preencher tarifas ao selecionar concessionária
  const handleConcessionariaChange = (nome: string) => {
    setConcessionaria(nome);
    const selected = concessionarias.find(c => c.nome === nome);
    setConcessionariaSelecionada(selected || null);
    
    if (selected) {
      // Auto-preencher TE e TUSD separados
      if (selected.te) setTe(selected.te);
      if (selected.tusd) setTusd(selected.tusd);
      
      // TUSD Fio B - estimar 60% da TUSD se não disponível
      if (selected.tusd_fio_b) {
        setTusdFioB(selected.tusd_fio_b);
      } else if (selected.tusd) {
        setTusdFioB(selected.tusd * 0.6);
      }
      
      // Tarifa (SEMPRE com impostos):
      // 1) Prioriza tarifa_com_impostos se existir no cadastro
      // 2) Se não existir, estima a partir da tarifa base (tarifa_media ou TE+TUSD) usando aproximação "por dentro"
      //    tarifa_com_impostos ~= tarifa_base / (1 - PIS/COFINS - ICMS)
      if (selected.tarifa_com_impostos && selected.tarifa_com_impostos > 0) {
        setTarifa(selected.tarifa_com_impostos);
      } else {
        const tarifaBase =
          selected.tarifa_media ??
          ((selected.te ?? null) !== null && (selected.tusd ?? null) !== null
            ? Number(selected.te) + Number(selected.tusd)
            : null);

        if (tarifaBase !== null && tarifaBase > 0) {
          const icmsRow = selected.uf ? icmsEstados.find(i => i.uf === selected.uf) : undefined;
          const aliqIcms = (icmsRow?.icms_percentual ?? 18) / 100;
          const aliqPisCofins = selected.pis_cofins || PIS_COFINS_ALIQUOTA_PADRAO;
          const denom = 1 - Number(aliqPisCofins) - Number(aliqIcms);
          const tarifaComImpostos = denom > 0 && denom < 1 ? Number(tarifaBase) / denom : Number(tarifaBase);
          setTarifa(tarifaComImpostos);
        }
      }
      
      toast.success('Tarifas atualizadas automaticamente!');
    }
    
    // Buscar ICMS do estado da concessionária
    if (selected?.uf) {
      const icms = icmsEstados.find(i => i.uf === selected.uf);
      setIcmsEstadoSelecionado(icms || null);
    } else {
      setIcmsEstadoSelecionado(null);
    }
  };

  // Converter meses para anos (para cálculos e banco de dados)
  const fidelidadeAnos = Math.ceil(fidelidadeMeses / 12);

  // Cálculos em tempo real (versão simples para compatibilidade)
  const input: AssinanteInput = {
    tarifa,
    cip,
    consumoMedio,
    fidelidadeAnos,
    descontoPercentual,
    tipoInstalacao: tipoInstalacao as 'Monofásico' | 'Bifásico' | 'Trifásico',
    numeroUcs,
  };
  
  const resultado = calcularPropostaAssinante(input, inflacaoEnergeticaDecimal);

  // Cálculo GD2 completo (quando temos TE/TUSD separados)
  const resultadoGD2: AssinanteOutputGD2 | null = useMemo(() => {
    if (te <= 0 || tusd <= 0) return null;
    
    // Se GD1, não tem cobrança de Fio B (percentual GD2 = 0)
    // Se GD2 e usineiro arca, o assinante não paga (custo já está embutido no preço da usina)
    const tusdFioBEfetivo = tipoGeracao === 'GD1' 
      ? 0 
      : (quemArcaGD2 === 'usineiro' ? 0 : (tusdFioB > 0 ? tusdFioB : tusd * 0.6));
    
    const inputGD2: AssinanteInputGD2 = {
      consumoMedio,
      tipoInstalacao: tipoInstalacao as 'Monofásico' | 'Bifásico' | 'Trifásico',
      numeroUcs,
      te,
      tusd,
      tusdFioB: tusdFioBEfetivo,
      aliqIcms: icmsEstadoSelecionado ? icmsEstadoSelecionado.icms_percentual / 100 : 0.18,
      aliqPisCofins: concessionariaSelecionada?.pis_cofins || PIS_COFINS_ALIQUOTA_PADRAO,
      icmsIsentaCompensacao: icmsEstadoSelecionado?.icms_isenta_compensacao ?? false,
      bandeiraNome: bandeiraVigente?.bandeira || 'Verde',
      bandeiraValorKwh: bandeiraVigente?.valor_kwh || 0,
      cip,
      tarifaCoesa: tarifaCoesa ?? 0.80,
      taxaBancariaCoesa: taxaBancariaCoesa ?? 4.50,
      fidelidadeAnos,
      anoReferencia: new Date().getFullYear(),
    };
    
    return calcularPropostaAssinanteGD2(inputGD2, inflacaoEnergeticaDecimal);
  }, [te, tusd, tusdFioB, consumoMedio, tipoInstalacao, numeroUcs, cip, fidelidadeAnos, icmsEstadoSelecionado, bandeiraVigente, tipoGeracao, quemArcaGD2, tarifaCoesa, taxaBancariaCoesa, concessionariaSelecionada, inflacaoEnergeticaDecimal]);

  const handleSave = async () => {
    if (!user) {
      toast.error('Você precisa estar logado');
      return;
    }

    if (!clienteNome.trim()) {
      toast.error('Preencha o nome do cliente');
      return;
    }

    setSaving(true);
    try {
      const economiaFinal = resultadoGD2 ? resultadoGD2.economiaMensal : resultado.economiaMensal;
      const economiaAnualFinal = resultadoGD2 ? resultadoGD2.economiaAnual : resultado.economiaAnual;
      const economiaAcumuladaFinal = resultadoGD2 ? resultadoGD2.economiaAcumulada : resultado.economiaAcumulada;

      const propostaData = {
        user_id: user.id,
        cliente_nome: clienteNome,
        cliente_cpf_cnpj: clienteCpfCnpj,
        cliente_endereco: clienteEndereco,
        cliente_cidade: clienteCidade,
        cliente_uf: clienteUf,
        cliente_cep: clienteCep,
        cliente_telefone: clienteTelefone,
        cliente_email: clienteEmail,
        concessionaria,
        numero_ucs: numeroUcs,
        numero_instalacao: numeroInstalacao,
        tipo_instalacao: tipoInstalacao,
        tarifa,
        cip,
        consumo_medio: consumoMedio,
        fidelidade_anos: fidelidadeAnos,
        desconto_percentual: descontoPercentual,
        responsavel_comercial: responsavelComercial,
        economia_mensal: economiaFinal,
        economia_anual: economiaAnualFinal,
        economia_acumulada: economiaAcumuladaFinal,
        status: 'rascunho',
      };

      if (isEditing && editId) {
        const { error } = await supabase
          .from('propostas_assinantes')
          .update(propostaData)
          .eq('id', editId);
        
        if (error) throw error;
        toast.success('Proposta atualizada com sucesso!');
        navigate('/historico');
      } else {
        const { error } = await supabase.from('propostas_assinantes').insert(propostaData);
        if (error) throw error;
        toast.success('Proposta salva com sucesso!');
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar proposta');
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!clienteNome.trim()) {
      toast.error('Preencha o nome do cliente antes de gerar o PDF');
      return;
    }

    try {
      toast.loading('Gerando PDF...', { id: 'pdf-loading' });
      await downloadPDF('proposta-assinante-pdf', {
        filename: `Proposta_COESA_${clienteNome}.pdf`.replace(/\s+/g, '_'),
        quality: 0.95,
        scale: 2
      });
      toast.dismiss('pdf-loading');
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      toast.dismiss('pdf-loading');
      console.error(error);
      toast.error('Erro ao gerar PDF');
    }
  };

  // Dados para uso no resultado (prioriza GD2 se disponível)
  const economiaMensal = resultadoGD2?.economiaMensal ?? resultado.economiaMensal;
  const economiaAnual = resultadoGD2?.economiaAnual ?? resultado.economiaAnual;
  const economiaAcumulada = resultadoGD2?.economiaAcumulada ?? resultado.economiaAcumulada;
  const valorSemCoesa = resultadoGD2?.contaSemCoesa.total ?? resultado.valorSemCoesa;
  const valorComCoesa = resultadoGD2?.totalComCoesa ?? resultado.valorComCoesa;

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">
              {isEditing ? 'Editar Proposta - Assinante' : 'Proposta para Assinante'}
            </h1>
            <p className="text-muted-foreground mt-1">
              Preencha os dados para gerar a proposta comercial
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Salvando...' : isEditing ? 'Salvar Alterações' : 'Salvar Rascunho'}
            </Button>
            <Button onClick={handleGeneratePDF} className="bg-primary hover:bg-primary/90 shadow-coesa">
              <Download className="mr-2 h-4 w-4" />
              Gerar PDF
            </Button>
          </div>
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
                      <CardTitle className="text-base">Campos Obrigatórios para Solicitar Contrato</CardTitle>
                      <CardDescription>
                        Configure quais campos e documentos são necessários para solicitar o contrato automaticamente
                      </CardDescription>
                    </div>
                  </div>
                  <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${configOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <AutomationFieldsConfig tipo="definitiva" />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Formulário de Input */}
          <div className="space-y-6">
            {/* Dados do Cliente */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  Dados do Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="nome">Nome / Razão Social *</Label>
                  <Input
                    id="nome"
                    value={clienteNome}
                    onChange={(e) => setClienteNome(e.target.value)}
                    placeholder="Nome completo ou razão social"
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label htmlFor="cpfCnpj">CPF / CNPJ</Label>
                  <div className="relative">
                    <Input
                      id="cpfCnpj"
                      value={clienteCpfCnpj}
                      onChange={(e) => setClienteCpfCnpj(formatCpfCnpj(e.target.value))}
                      placeholder="000.000.000-00"
                      className={`bg-coesa-yellow/10 border-coesa-yellow/30 ${isDocumentComplete(clienteCpfCnpj) ? (isValidCpfCnpj(clienteCpfCnpj) ? 'border-green-500 pr-10' : 'border-red-500 pr-10') : ''}`}
                    />
                    {isDocumentComplete(clienteCpfCnpj) && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {isValidCpfCnpj(clienteCpfCnpj) ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <X className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    )}
                  </div>
                  {isDocumentComplete(clienteCpfCnpj) && (
                    <p className={`text-xs mt-1 ${isValidCpfCnpj(clienteCpfCnpj) ? 'text-green-600' : 'text-red-600'}`}>
                      {isValidCpfCnpj(clienteCpfCnpj) 
                        ? `✓ ${getDocumentType(clienteCpfCnpj)} válido` 
                        : `✗ ${getDocumentType(clienteCpfCnpj)} inválido`}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="telefone">Telefone (WhatsApp)</Label>
                  <div className="relative">
                    <Input
                      id="telefone"
                      value={clienteTelefone}
                      onChange={(e) => setClienteTelefone(e.target.value)}
                      onBlur={(e) => {
                        const formatted = formatWhatsAppNumber(e.target.value);
                        setClienteTelefone(formatted);
                      }}
                      placeholder="5531999999999"
                      className={`bg-coesa-yellow/10 border-coesa-yellow/30 ${clienteTelefone ? (isValidWhatsAppNumber(clienteTelefone) ? 'border-green-500 pr-10' : 'border-red-500 pr-10') : ''}`}
                    />
                    {clienteTelefone && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {isValidWhatsAppNumber(clienteTelefone) ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <X className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    )}
                  </div>
                  {clienteTelefone && isValidWhatsAppNumber(clienteTelefone) && (
                    <p className="text-xs text-green-600 mt-1">
                      ✓ {formatWhatsAppDisplay(clienteTelefone)}
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Input
                      id="email"
                      type="email"
                      value={clienteEmail}
                      onChange={(e) => setClienteEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                      className={`bg-coesa-yellow/10 border-coesa-yellow/30 ${clienteEmail ? (isValidEmail(clienteEmail) ? 'border-green-500 pr-10' : 'border-red-500 pr-10') : ''}`}
                    />
                    {clienteEmail && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {isValidEmail(clienteEmail) ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <X className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    )}
                  </div>
                  {clienteEmail && (
                    <p className={`text-xs mt-1 ${isValidEmail(clienteEmail) ? 'text-green-600' : 'text-red-600'}`}>
                      {isValidEmail(clienteEmail) ? '✓ Email válido' : '✗ Email inválido'}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                  <div>
                    <Label htmlFor="cep">CEP</Label>
                    <div className="relative">
                      <Input
                        id="cep"
                        value={clienteCep}
                        onChange={(e) => setClienteCep(formatCEP(e.target.value))}
                        onBlur={async (e) => {
                          const cep = e.target.value;
                          if (isCEPComplete(cep)) {
                            setLoadingCep(true);
                            const address = await fetchAddressByCEP(cep);
                            setLoadingCep(false);
                            if (address) {
                              setClienteEndereco(address.logradouro + (address.bairro ? `, ${address.bairro}` : ''));
                              setClienteCidade(address.localidade);
                              setClienteUf(address.uf);
                              toast.success('Endereço preenchido automaticamente!');
                            } else {
                              toast.error('CEP não encontrado');
                            }
                          }
                        }}
                        placeholder="00000-000"
                        className={`bg-coesa-yellow/10 border-coesa-yellow/30 ${isCEPComplete(clienteCep) ? 'border-green-500' : ''}`}
                      />
                      {loadingCep && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="cidade">Cidade</Label>
                    <Input
                      id="cidade"
                      value={clienteCidade}
                      onChange={(e) => setClienteCidade(e.target.value)}
                      className="bg-coesa-yellow/10 border-coesa-yellow/30"
                    />
                  </div>
                  <div>
                    <Label htmlFor="uf">UF</Label>
                    <Input
                      id="uf"
                      value={clienteUf}
                      onChange={(e) => setClienteUf(e.target.value.toUpperCase())}
                      maxLength={2}
                      className="bg-coesa-yellow/10 border-coesa-yellow/30"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="endereco">Endereço</Label>
                  <Input
                    id="endereco"
                    value={clienteEndereco}
                    onChange={(e) => setClienteEndereco(e.target.value)}
                    placeholder="Rua, número, bairro"
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Dados da Instalação */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-coesa-orange" />
                  Dados da Instalação
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="concessionaria">Concessionária</Label>
                  <Select value={concessionaria} onValueChange={handleConcessionariaChange}>
                    <SelectTrigger className="bg-coesa-yellow/10 border-coesa-yellow/30">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {concessionarias.map((c) => (
                        <SelectItem key={c.id} value={c.nome}>
                          {c.nome} {c.uf ? `(${c.uf})` : ''} {c.tarifa_media ? `- R$ ${c.tarifa_media.toFixed(4)}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tipoInstalacao">Tipo de Instalação</Label>
                  <Select value={tipoInstalacao} onValueChange={(v) => setTipoInstalacao(v as typeof tipoInstalacao)}>
                    <SelectTrigger className="bg-coesa-yellow/10 border-coesa-yellow/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposInstalacao.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="numeroUcs">Número de UCs</Label>
                  <Input
                    id="numeroUcs"
                    type="number"
                    min={1}
                    value={numeroUcs}
                    onChange={(e) => setNumeroUcs(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label htmlFor="numeroInstalacao">Nº Instalação</Label>
                  <Input
                    id="numeroInstalacao"
                    value={numeroInstalacao}
                    onChange={(e) => setNumeroInstalacao(e.target.value)}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Estratificação Tarifária */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-blue-500" />
                  Estratificação Tarifária
                  {concessionariaSelecionada && (
                    <Badge variant="outline" className="ml-auto text-xs">
                      Auto-preenchido
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Componentes tarifários separados (preenchidos automaticamente ao selecionar concessionária)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="te">TE (R$/kWh)</Label>
                    <Input
                      id="te"
                      type="number"
                      step="0.0001"
                      value={te}
                      onChange={(e) => setTe(Number(e.target.value))}
                      placeholder="0,0000"
                      className="font-mono bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Tarifa de Energia</p>
                  </div>
                  <div>
                    <Label htmlFor="tusd">TUSD (R$/kWh)</Label>
                    <Input
                      id="tusd"
                      type="number"
                      step="0.0001"
                      value={tusd}
                      onChange={(e) => setTusd(Number(e.target.value))}
                      placeholder="0,0000"
                      className="font-mono bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Tarifa de Uso do Sistema</p>
                  </div>
                  <div>
                    <Label htmlFor="tusdFioB">TUSD Fio B (R$/kWh)</Label>
                    <Input
                      id="tusdFioB"
                      type="number"
                      step="0.0001"
                      value={tusdFioB}
                      onChange={(e) => setTusdFioB(Number(e.target.value))}
                      placeholder="0,0000"
                      className="font-mono bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Componente GD2 (Lei 14.300)</p>
                  </div>
                </div>

                {te > 0 && tusd > 0 && (
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Subtotal (TE + TUSD):</span>
                      <span className="font-mono font-medium">R$ {(te + tusd).toFixed(4).replace('.', ',')}/kWh</span>
                    </div>
                    {tarifa > 0 && (
                      <div className="flex justify-between text-sm text-primary font-medium">
                        <span>Tarifa Final (com impostos):</span>
                        <span className="font-mono">R$ {tarifa.toFixed(4).replace('.', ',')}/kWh</span>
                      </div>
                    )}
                  </div>
                )}

                {!concessionariaSelecionada && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      Selecione uma concessionária para auto-preencher as tarifas
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Consumo e Condições Comerciais */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-secondary" />
                  Consumo e Condições Comerciais
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="tarifa">Tarifa Final (R$/kWh)</Label>
                  <Input
                    id="tarifa"
                    type="number"
                    step="0.0001"
                    value={tarifa}
                    onChange={(e) => setTarifa(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30 font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="cip">CIP (R$)</Label>
                  <Input
                    id="cip"
                    type="number"
                    step="0.01"
                    value={cip}
                    onChange={(e) => setCip(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label htmlFor="consumoMedio">Consumo Médio (kWh/mês)</Label>
                  <Input
                    id="consumoMedio"
                    type="number"
                    value={consumoMedio}
                    onChange={(e) => setConsumoMedio(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label htmlFor="desconto">Desconto COESA (%)</Label>
                  <Input
                    id="desconto"
                    type="number"
                    step="0.5"
                    min={0}
                    max={30}
                    value={descontoPercentual}
                    onChange={(e) => setDescontoPercentual(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label htmlFor="fidelidade">Fidelidade (meses)</Label>
                  <Input
                    id="fidelidade"
                    type="number"
                    min={12}
                    max={120}
                    step={12}
                    value={fidelidadeMeses}
                    onChange={(e) => setFidelidadeMeses(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    = {fidelidadeAnos} ano{fidelidadeAnos > 1 ? 's' : ''}
                  </p>
                </div>
                <div>
                  <Label htmlFor="responsavel">Responsável Comercial</Label>
                  <Input
                    id="responsavel"
                    value={responsavelComercial}
                    onChange={(e) => setResponsavelComercial(e.target.value)}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>

                {/* Separator para campos COESA */}
                <Separator className="sm:col-span-2" />
                
                <div className="sm:col-span-2">
                  <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Parâmetros do Boleto COESA
                  </h4>
                </div>
                
                <div>
                  <Label htmlFor="tarifaCoesa">Tarifa COESA (R$/kWh)</Label>
                  <Input
                    id="tarifaCoesa"
                    type="number"
                    step="0.01"
                    min={0}
                    value={tarifaCoesa ?? 0.80}
                    onChange={(e) => setTarifaCoesa(Number(e.target.value))}
                    className="font-mono bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Tarifa cobrada pela COESA por kWh compensado
                  </p>
                </div>
                <div>
                  <Label htmlFor="taxaBancariaCoesa">Taxa Bancária (R$)</Label>
                  <Input
                    id="taxaBancariaCoesa"
                    type="number"
                    step="0.50"
                    min={0}
                    value={taxaBancariaCoesa ?? 4.50}
                    onChange={(e) => setTaxaBancariaCoesa(Number(e.target.value))}
                    className="font-mono bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Taxa fixa por boleto emitido
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Tipo de Geração GD1/GD2 */}
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sun className="h-5 w-5 text-yellow-500" />
                  Tipo de Geração Distribuída
                </CardTitle>
                <CardDescription>
                  Define as regras de compensação aplicáveis (Lei 14.300/2022)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Toggle GD1/GD2 */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div className="space-y-1">
                    <Label className="text-base font-medium">Regime de Compensação</Label>
                    <p className="text-xs text-muted-foreground">
                      {tipoGeracao === 'GD1' 
                        ? 'Projetos anteriores a 07/01/2023 - Compensação 1:1 sem cobrança de Fio B'
                        : 'Projetos após 07/01/2023 - Cobrança progressiva de TUSD Fio B'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${tipoGeracao === 'GD1' ? 'text-primary' : 'text-muted-foreground'}`}>
                      GD1
                    </span>
                    <Switch
                      checked={tipoGeracao === 'GD2'}
                      onCheckedChange={(checked) => setTipoGeracao(checked ? 'GD2' : 'GD1')}
                    />
                    <span className={`text-sm font-medium ${tipoGeracao === 'GD2' ? 'text-primary' : 'text-muted-foreground'}`}>
                      GD2
                    </span>
                  </div>
                </div>

                {/* Badges informativos */}
                <div className="flex flex-wrap gap-2">
                  {tipoGeracao === 'GD1' ? (
                    <>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <Check className="h-3 w-3 mr-1" />
                        Sem cobrança de Fio B
                      </Badge>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Compensação integral 1:1
                      </Badge>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                        Lei 14.300/2022
                      </Badge>
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                        GD2: {(getPercentualGD2(new Date().getFullYear()) * 100).toFixed(0)}% em {new Date().getFullYear()}
                      </Badge>
                    </>
                  )}
                </div>

                {/* Quem arca com o custo GD2 */}
                {tipoGeracao === 'GD2' && (
                  <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 space-y-3">
                    <Label className="text-sm font-medium text-orange-800 dark:text-orange-200 flex items-center gap-2">
                      <Factory className="h-4 w-4" />
                      Quem arca com o custo do Fio B (GD2)?
                    </Label>
                    <RadioGroup 
                      value={quemArcaGD2} 
                      onValueChange={(value) => setQuemArcaGD2(value as 'usineiro' | 'assinante')}
                      className="grid grid-cols-2 gap-3"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="usineiro" id="usineiro" />
                        <Label htmlFor="usineiro" className="text-sm cursor-pointer">
                          <span className="font-medium">Usineiro</span>
                          <p className="text-xs text-muted-foreground">Custo absorvido na tarifa da usina</p>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="assinante" id="assinante" />
                        <Label htmlFor="assinante" className="text-sm cursor-pointer">
                          <span className="font-medium">Assinante</span>
                          <p className="text-xs text-muted-foreground">Cliente paga o Fio B na fatura</p>
                        </Label>
                      </div>
                    </RadioGroup>

                    {/* Valor estimado do custo GD2 */}
                    {resultadoGD2 && quemArcaGD2 === 'assinante' && (
                      <div className="mt-2 p-2 rounded bg-orange-100 dark:bg-orange-900/50 text-xs">
                        <span className="text-orange-700 dark:text-orange-300">
                          Custo GD2 estimado: <strong className="font-mono">{formatCurrency(resultadoGD2.contaConcessionaria.gd2FioBValor)}/mês</strong>
                        </span>
                      </div>
                    )}
                    
                    {quemArcaGD2 === 'usineiro' && (
                      <div className="mt-2 p-2 rounded bg-green-100 dark:bg-green-900/50 text-xs">
                        <span className="text-green-700 dark:text-green-300">
                          <Check className="h-3 w-3 inline mr-1" />
                          O assinante não paga Fio B - custo já incluso no preço da locação
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Composição Tributária */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5 text-muted-foreground" />
                  Composição Tributária
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Bandeira Tarifária */}
                {bandeiraVigente && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Flag className={`h-4 w-4 ${
                        bandeiraVigente.bandeira.toLowerCase().includes('verde') ? 'text-green-600' :
                        bandeiraVigente.bandeira.toLowerCase().includes('amarela') ? 'text-yellow-500' :
                        bandeiraVigente.bandeira.toLowerCase().includes('vermelha') ? 'text-red-600' :
                        'text-muted-foreground'
                      }`} />
                      <span className="text-sm">Bandeira {bandeiraVigente.bandeira}</span>
                    </div>
                    <span className="text-sm font-mono">R$ {bandeiraVigente.valor_kwh.toFixed(5).replace('.', ',')}/kWh</span>
                  </div>
                )}

                {/* Impostos com valores calculados */}
                <div className="grid gap-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">PIS/COFINS (incidência por dentro)</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{((concessionariaSelecionada?.pis_cofins || 0.0365) * 100).toFixed(2).replace('.', ',')}%</Badge>
                      {resultadoGD2 && (
                        <span className="font-mono text-xs text-muted-foreground">
                          = {formatCurrency(resultadoGD2.contaSemCoesa.pisCofinsValor)}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {icmsEstadoSelecionado ? (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">ICMS ({icmsEstadoSelecionado.nome_estado})</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{icmsEstadoSelecionado.icms_percentual.toFixed(2).replace('.', ',')}%</Badge>
                          {resultadoGD2 && (
                            <span className="font-mono text-xs text-muted-foreground">
                              = {formatCurrency(resultadoGD2.contaSemCoesa.icmsValor)}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Status da Isenção ICMS na Compensação */}
                      <div className={`flex items-start gap-2 p-3 rounded-lg ${
                        icmsEstadoSelecionado.icms_isenta_compensacao 
                          ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' 
                          : 'bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800'
                      }`}>
                        {icmsEstadoSelecionado.icms_isenta_compensacao ? (
                          <>
                            <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                                ICMS isento na energia compensada
                              </p>
                              <p className="text-xs text-green-600 dark:text-green-400">
                                Convênio ICMS 16/2015 - Compensação 1:1
                              </p>
                              {icmsEstadoSelecionado.base_legal && (
                                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                                  Base legal: {icmsEstadoSelecionado.base_legal}
                                </p>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                                ICMS incide sobre energia compensada
                              </p>
                              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                                Este estado NÃO concede isenção de ICMS na compensação GD
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                      <Info className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">
                        Selecione uma concessionária para ver as alíquotas de ICMS do estado
                      </p>
                    </div>
                  )}

                  {/* GD2 Info */}
                  {resultadoGD2 && (
                    <div className="flex items-center justify-between text-sm p-2 rounded bg-orange-50 dark:bg-orange-950/30">
                      <span className="text-orange-700 dark:text-orange-300">
                        Cobrança GD2 ({new Date().getFullYear()})
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-orange-300 text-orange-700">
                          {resultadoGD2.percentualGD2.toFixed(0)}%
                        </Badge>
                        <span className="font-mono text-xs text-orange-600">
                          = {formatCurrency(resultadoGD2.contaConcessionaria.gd2FioBValor)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Nota explicativa */}
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    <strong>Nota:</strong> PIS/COFINS são aplicados "por dentro" (3,65%) e ICMS "por fora". 
                    A cobrança GD2 (Lei 14.300) incide sobre a energia compensada.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview dos Resultados */}
          <div className="space-y-6">
            {/* Card de Economia */}
            <Card className="gradient-coesa text-primary-foreground overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary-foreground">
                  <TrendingUp className="h-5 w-5" />
                  Economia Projetada
                </CardTitle>
                <CardDescription className="text-primary-foreground/80">
                  Resultados calculados em tempo real
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/10 rounded-lg p-4">
                    <p className="text-sm opacity-80">Economia Mensal</p>
                    <p className="text-2xl font-bold font-heading">
                      {formatCurrency(economiaMensal)}
                    </p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4">
                    <p className="text-sm opacity-80">Economia Anual</p>
                    <p className="text-2xl font-bold font-heading">
                      {formatCurrency(economiaAnual)}
                    </p>
                  </div>
                </div>
                
                <Separator className="bg-white/20" />
                
                <div className="bg-white/10 rounded-lg p-4">
                  <p className="text-sm opacity-80">
                    Economia Acumulada em {fidelidadeAnos} anos
                  </p>
                  <p className="text-3xl font-bold font-heading">
                    {formatCurrency(economiaAcumulada)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Comparativo Detalhado */}
            {resultadoGD2 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Table className="h-5 w-5" />
                    Comparativo Detalhado
                  </CardTitle>
                  <CardDescription>
                    Modelo COESA: Conta Concessionária + Boleto COESA
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Tabela Comparativa */}
                  <div className="rounded-lg border overflow-hidden">
                    <UITable>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold">Componente</TableHead>
                          <TableHead className="text-right font-semibold text-destructive">SEM COESA</TableHead>
                          <TableHead className="text-right font-semibold text-primary">COM COESA</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Seção Concessionária */}
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={3} className="font-semibold text-sm">📄 Boleto Concessionária</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-muted-foreground">Disponibilidade ({resultadoGD2.disponibilidadeKwh} kWh)</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(resultadoGD2.contaSemCoesa.disponibilidadeValor)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(resultadoGD2.contaConcessionaria.disponibilidadeValor)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-muted-foreground">CIP</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(resultadoGD2.contaSemCoesa.cipValor)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(resultadoGD2.contaConcessionaria.cipValor)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-muted-foreground">TE + TUSD (Energia)</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(resultadoGD2.contaSemCoesa.teValor + resultadoGD2.contaSemCoesa.tusdValor)}</TableCell>
                          <TableCell className="text-right font-mono text-green-600">{formatCurrency(resultadoGD2.contaConcessionaria.teValor + resultadoGD2.contaConcessionaria.tusdValor)}</TableCell>
                        </TableRow>
                        <TableRow className="bg-orange-50 dark:bg-orange-950/20">
                          <TableCell className="text-orange-700 dark:text-orange-300">Fio B GD2 ({resultadoGD2.percentualGD2.toFixed(0)}%)</TableCell>
                          <TableCell className="text-right font-mono">-</TableCell>
                          <TableCell className="text-right font-mono text-orange-600">{formatCurrency(resultadoGD2.contaConcessionaria.gd2FioBValor)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-muted-foreground">PIS/COFINS + ICMS</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(resultadoGD2.contaSemCoesa.totalTributos)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(resultadoGD2.contaConcessionaria.totalTributos)}</TableCell>
                        </TableRow>
                        <TableRow className="border-t font-medium">
                          <TableCell>Subtotal Concessionária</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(resultadoGD2.contaSemCoesa.total)}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(resultadoGD2.contaConcessionaria.total)}</TableCell>
                        </TableRow>
                        
                        {/* Seção COESA */}
                        <TableRow className="bg-primary/10">
                          <TableCell colSpan={3} className="font-semibold text-sm">📄 Boleto COESA</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-muted-foreground">Energia ({formatNumber(resultadoGD2.contaCoesa.energiaCompensadaKwh, 0)} kWh × R$ {resultadoGD2.contaCoesa.tarifaCoesa.toFixed(2).replace('.', ',')})</TableCell>
                          <TableCell className="text-right font-mono">-</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(resultadoGD2.contaCoesa.valorEnergia)}</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-muted-foreground">Taxa Bancária</TableCell>
                          <TableCell className="text-right font-mono">-</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(resultadoGD2.contaCoesa.taxaBancaria)}</TableCell>
                        </TableRow>
                        <TableRow className="border-t font-medium">
                          <TableCell>Subtotal COESA</TableCell>
                          <TableCell className="text-right font-mono">-</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(resultadoGD2.contaCoesa.total)}</TableCell>
                        </TableRow>
                        
                        {/* Totais */}
                        <TableRow className="bg-muted/50 border-t-2">
                          <TableCell className="font-bold text-base">TOTAL MENSAL</TableCell>
                          <TableCell className="text-right font-mono font-bold text-base text-destructive">{formatCurrency(resultadoGD2.contaSemCoesa.total)}</TableCell>
                          <TableCell className="text-right font-mono font-bold text-base text-primary">{formatCurrency(resultadoGD2.totalComCoesa)}</TableCell>
                        </TableRow>
                        <TableRow className="bg-green-50 dark:bg-green-950/30">
                          <TableCell className="font-bold text-green-700 dark:text-green-300">ECONOMIA</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-right font-mono font-bold text-lg text-green-600">
                            {formatCurrency(resultadoGD2.economiaMensal)}
                            <span className="text-xs ml-1">({resultadoGD2.economiaPercentual.toFixed(1)}%)</span>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </UITable>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Comparativo Mensal</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-destructive/10">
                    <span className="text-sm font-medium">Sem COESA</span>
                    <span className="text-lg font-bold text-destructive">
                      {formatCurrency(resultado.valorSemCoesa)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-primary/10">
                    <span className="text-sm font-medium">Com COESA</span>
                    <span className="text-lg font-bold text-primary">
                      {formatCurrency(resultado.valorComCoesa)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>Disponibilidade: {formatCurrency(resultado.disponibilidade)}</p>
                    <p>Consumo: {formatNumber(resultado.consumoFaturado, 0)} kWh</p>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                    <Info className="h-4 w-4 text-blue-500" />
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      Selecione uma concessionária para ver a estratificação tarifária completa
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Gráfico de Projeção */}
            <Card>
              <CardHeader>
                <CardTitle>Projeção de Economia</CardTitle>
                <CardDescription>
                  Economia anual ao longo do período de fidelidade
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={resultadoGD2?.projecaoAnual || resultado.projecaoAnual}>
                      <defs>
                        <linearGradient id="colorEconomia" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="ano" 
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => `Ano ${value}`}
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        formatter={(value: number) => [formatCurrency(value), 'Economia']}
                        labelFormatter={(label) => `Ano ${label}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="economia"
                        stroke="hsl(var(--primary))"
                        fill="url(#colorEconomia)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* PDF Preview */}
            <PDFPreviewNew
              data={{
                cliente: {
                  nome: clienteNome,
                  email: clienteEmail,
                  telefone: clienteTelefone,
                  cidade: clienteCidade,
                  uf: clienteUf,
                },
                instalacao: {
                  concessionaria,
                  numeroUcs,
                  numeroInstalacao,
                  tipoInstalacao,
                },
                consumo: {
                  tarifa,
                  tarifaCoesa: tipoGeracao === 'GD2' ? (tarifaCoesa ?? 0.80) : undefined,
                  taxaBancariaCoesa: tipoGeracao === 'GD2' ? (taxaBancariaCoesa ?? 4.50) : undefined,
                  cip,
                  consumoMedio,
                  fidelidadeAnos,
                  descontoPercentual,
                  responsavelComercial,
                },
                resultado: {
                  disponibilidade: resultadoGD2?.disponibilidadeValor ?? resultado.disponibilidade,
                  consumoFaturado: consumoMedio,
                  valorSemCoesa,
                  valorComCoesa,
                  economiaMensal,
                  economiaAnual,
                  economiaAcumulada,
                  projecaoAnual: resultadoGD2?.projecaoAnual || resultado.projecaoAnual,
                },
                resultadoGD2: tipoGeracao === 'GD2' ? resultadoGD2 : undefined,
                configuracoes: configs ? {
                  whatsapp_numero: configs.whatsapp_numero || '',
                  email_contato: configs.email_contato || '',
                  telefone_contato: configs.telefone_contato || '',
                  empresa_nome: configs.empresa_nome || 'COESA Energia',
                  empresa_slogan: configs.empresa_slogan || 'Energia Inteligente',
                } : undefined,
              }}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}