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
import { toast } from 'sonner';
import { calcularPropostaUsineiro, formatCurrency, formatNumber, formatPercent, UsineiroInput, getPercentualGD2 } from '@/lib/calculations';
import { useParametrosMacro } from '@/hooks/useParametrosMacro';
import { useFormOptions } from '@/hooks/useFormOptions';
import { useUIConfig } from '@/hooks/useUIConfig';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { generateUsineiroPDF } from '@/lib/pdf-generator';
import { FileText, Save, TrendingUp, Sun, Factory, Building, DollarSign, Percent, Download, Info, Flag, Check, AlertTriangle, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// ZERO HARDCODE: PIS/COFINS is fixed by law (3.65%)
const PIS_COFINS_PERCENTUAL = 3.65;

interface Cidade {
  id: string;
  cidade: string;
  uf: string;
  indice_solarimetrico: number;
}

interface Concessionaria {
  id: string;
  nome: string;
  uf: string | null;
  tarifa_media: number | null;
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

export default function Usineiros() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = searchParams.get('edit');
  const { parametros: parametrosMacro } = useParametrosMacro();
  const { queryLimitCidadesAutocomplete } = useUIConfig();
  
  // ZERO HARDCODE: Load form options from database
  const { tiposGD, tiposComercializacao, regimesTributarios } = useFormOptions();
  
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [concessionarias, setConcessionarias] = useState<Concessionaria[]>([]);
  const [cidadeSelecionada, setCidadeSelecionada] = useState<Cidade | null>(null);
  const [buscaCidade, setBuscaCidade] = useState('');
  
  // Dados tributários
  const [icmsEstados, setIcmsEstados] = useState<IcmsEstado[]>([]);
  const [bandeiraVigente, setBandeiraVigente] = useState<BandeiraTarifaria | null>(null);
  const [icmsEstadoSelecionado, setIcmsEstadoSelecionado] = useState<IcmsEstado | null>(null);
  
  // Dados do projeto
  const [nomeProjeto, setNomeProjeto] = useState('');
  const [spe, setSpe] = useState('');
  const [tipoGd, setTipoGd] = useState('GD II');
  
  // Capacidade
  const [potenciaMwp, setPotenciaMwp] = useState(1);
  const [oversizing, setOversizing] = useState(1.2);
  const [quantidadeModulos, setQuantidadeModulos] = useState(2000);
  const [areaHectares, setAreaHectares] = useState(2);
  
  // Comercialização
  const [concessionaria, setConcessionaria] = useState('');
  const [tipoComercializacao, setTipoComercializacao] = useState('Melhores Esforços');
  const [taxaAdministracao, setTaxaAdministracao] = useState(8);
  const [descontoClienteFinal, setDescontoClienteFinal] = useState(15);
  const [tarifaMedia, setTarifaMedia] = useState(0.85);
  
  // Custos
  const [capexTotal, setCapexTotal] = useState(4000000);
  const [omPercentual, setOmPercentual] = useState(1);
  const [arrendamentoMensal, setArrendamentoMensal] = useState(5000);
  const [seguroAnual, setSeguroAnual] = useState(20000);
  const [contabilidadeMensal, setContabilidadeMensal] = useState(1500);
  
  // Financiamento
  const [temFinanciamento, setTemFinanciamento] = useState(false);
  const [financiamentoValor, setFinanciamentoValor] = useState(0);
  const [financiamentoCarenciaMeses, setFinanciamentoCarenciaMeses] = useState(6);
  const [financiamentoPrazoMeses, setFinanciamentoPrazoMeses] = useState(120);
  const [financiamentoTaxa, setFinanciamentoTaxa] = useState(12);
  
  // Regime tributário
  const [regimeTributario, setRegimeTributario] = useState('Lucro Presumido');
  
  // Parâmetros macro (carregados do banco, configuráveis pelo usuário)
  const [ipca, setIpca] = useState<number | null>(null);
  const [cdi, setCdi] = useState<number | null>(null);
  const [inflacaoEnergetica, setInflacaoEnergetica] = useState<number | null>(null);

  // Inicializar parâmetros macro do banco de dados
  useEffect(() => {
    if (parametrosMacro && ipca === null) {
      setIpca(parametrosMacro.ipca ?? 4.5);
      setCdi(parametrosMacro.cdi ?? 11);
      setInflacaoEnergetica(parametrosMacro.inflacao_energetica ?? 7);
    }
  }, [parametrosMacro, ipca]);

  // Configurações GD1/GD2
  const [tipoGeracao, setTipoGeracao] = useState<'GD1' | 'GD2'>('GD2');
  const [quemArcaGD2, setQuemArcaGD2] = useState<'usineiro' | 'assinante'>('usineiro');

  // Buscar cidades e concessionárias
  useEffect(() => {
    async function fetchData() {
      const [cidadesRes, concessionariasRes, icmsRes, bandeirasRes] = await Promise.all([
        supabase.from('cidades').select('*').order('cidade'),
        supabase.from('concessionarias').select('*').order('nome'),
        supabase.from('icms_estados').select('uf, nome_estado, icms_percentual, icms_isenta_compensacao, base_legal'),
        supabase.from('bandeiras_tarifarias').select('*').order('ano_mes', { ascending: false }).limit(1)
      ]);
      
      if (!cidadesRes.error && cidadesRes.data) {
        setCidades(cidadesRes.data);
      }
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

  // Handler para auto-preencher tarifa ao selecionar concessionária
  const handleConcessionariaChange = (nome: string) => {
    setConcessionaria(nome);
    const selected = concessionarias.find(c => c.nome === nome);
    if (selected?.tarifa_media) {
      setTarifaMedia(selected.tarifa_media);
      toast.success(`Tarifa atualizada: R$ ${selected.tarifa_media.toFixed(4)}/kWh`);
    }
    // Buscar ICMS do estado da concessionária
    if (selected?.uf) {
      const icms = icmsEstados.find(i => i.uf === selected.uf);
      setIcmsEstadoSelecionado(icms || null);
    } else {
      setIcmsEstadoSelecionado(null);
    }
  };

  // Carregar proposta para edição
  useEffect(() => {
    async function loadProposta() {
      if (!editId || cidades.length === 0) return;
      
      const { data, error } = await supabase
        .from('propostas_usineiros')
        .select('*')
        .eq('id', editId)
        .single();
      
      if (error || !data) {
        toast.error('Proposta não encontrada');
        navigate('/usineiros');
        return;
      }
      
      setIsEditing(true);
      setNomeProjeto(data.nome_projeto || '');
      setSpe(data.spe || '');
      setTipoGd(data.tipo_gd || 'GD II');
      setPotenciaMwp(data.potencia_mwp || 1);
      setOversizing(data.oversizing || 1.2);
      setQuantidadeModulos(data.quantidade_modulos || 2000);
      setAreaHectares(data.area_hectares || 2);
      setConcessionaria(data.concessionaria || '');
      setTipoComercializacao(data.tipo_comercializacao || 'Melhores Esforços');
      setTaxaAdministracao(data.taxa_administracao || 8);
      setDescontoClienteFinal(data.desconto_cliente_final || 15);
      setCapexTotal(data.capex_total || 4000000);
      setOmPercentual(data.om_percentual || 1);
      setArrendamentoMensal(data.arrendamento_mensal || 5000);
      setSeguroAnual(data.seguro_anual || 20000);
      setContabilidadeMensal(data.contabilidade_mensal || 1500);
      setRegimeTributario(data.regime_tributario || 'Lucro Presumido');
      
      if (data.financiamento_valor) {
        setTemFinanciamento(true);
        setFinanciamentoValor(data.financiamento_valor);
        setFinanciamentoCarenciaMeses(data.financiamento_carencia_meses || 6);
        setFinanciamentoPrazoMeses(data.financiamento_prazo_meses || 120);
        setFinanciamentoTaxa(data.financiamento_taxa || 12);
      }
      
      // Buscar cidade correspondente
      if (data.cidade && data.uf) {
        const cidadeEncontrada = cidades.find(c => c.cidade === data.cidade && c.uf === data.uf);
        if (cidadeEncontrada) {
          setCidadeSelecionada(cidadeEncontrada);
          setBuscaCidade(`${cidadeEncontrada.cidade} - ${cidadeEncontrada.uf}`);
        }
      }
    }
    
    loadProposta();
  }, [editId, navigate, cidades]);

  // Cidades filtradas
  const cidadesFiltradas = useMemo(() => {
    if (!buscaCidade) return cidades.slice(0, queryLimitCidadesAutocomplete);
    const termo = buscaCidade.toLowerCase();
    return cidades
      .filter(c => 
        c.cidade.toLowerCase().includes(termo) || 
        c.uf.toLowerCase().includes(termo)
      )
      .slice(0, queryLimitCidadesAutocomplete);
  }, [cidades, buscaCidade, queryLimitCidadesAutocomplete]);

  // Índice solarimétrico padrão se não selecionou cidade
  const indiceSolarimetrico = cidadeSelecionada?.indice_solarimetrico || 150;

  // Cálculos em tempo real
  const input: UsineiroInput = {
    potenciaMwp,
    oversizing,
    indiceSolarimetrico,
    tarifaMedia,
    taxaAdministracao,
    descontoClienteFinal,
    capexTotal,
    omPercentual,
    arrendamentoMensal,
    seguroAnual,
    contabilidadeMensal,
    financiamentoValor: temFinanciamento ? financiamentoValor : undefined,
    financiamentoCarenciaMeses: temFinanciamento ? financiamentoCarenciaMeses : undefined,
    financiamentoPrazoMeses: temFinanciamento ? financiamentoPrazoMeses : undefined,
    financiamentoTaxa: temFinanciamento ? financiamentoTaxa : undefined,
    regimeTributario: regimeTributario as 'SIMPLES' | 'Lucro Presumido',
    ipca: ipca ?? parametrosMacro.ipca ?? 4.5,
    cdi: cdi ?? parametrosMacro.cdi ?? 11,
    inflacaoEnergetica: inflacaoEnergetica ?? parametrosMacro.inflacao_energetica ?? 7,
  };
  
  const resultado = calcularPropostaUsineiro(input);

  const handleSave = async () => {
    if (!user) {
      toast.error('Você precisa estar logado');
      return;
    }

    if (!nomeProjeto.trim()) {
      toast.error('Preencha o nome do projeto');
      return;
    }

    setSaving(true);
    try {
      const propostaData = {
        user_id: user.id,
        nome_projeto: nomeProjeto,
        spe,
        cidade: cidadeSelecionada?.cidade || '',
        uf: cidadeSelecionada?.uf || '',
        tipo_gd: tipoGd,
        potencia_mwp: potenciaMwp,
        oversizing,
        quantidade_modulos: quantidadeModulos,
        area_hectares: areaHectares,
        concessionaria,
        tipo_comercializacao: tipoComercializacao,
        taxa_administracao: taxaAdministracao,
        desconto_cliente_final: descontoClienteFinal,
        capex_total: capexTotal,
        capex_por_wp: capexTotal / (potenciaMwp * 1000000),
        om_percentual: omPercentual,
        arrendamento_mensal: arrendamentoMensal,
        seguro_anual: seguroAnual,
        contabilidade_mensal: contabilidadeMensal,
        financiamento_valor: temFinanciamento ? financiamentoValor : null,
        financiamento_carencia_meses: temFinanciamento ? financiamentoCarenciaMeses : null,
        financiamento_prazo_meses: temFinanciamento ? financiamentoPrazoMeses : null,
        financiamento_taxa: temFinanciamento ? financiamentoTaxa : null,
        regime_tributario: regimeTributario,
        geracao_mensal_mwh: resultado.geracaoMensalMwh,
        receita_bruta_anual: resultado.receitaBrutaAnual,
        ebitda_anual: resultado.ebitdaAnual,
        tir: resultado.tir,
        vpl: resultado.vpl,
        payback_anos: resultado.paybackAnos,
        status: 'rascunho',
      };

      if (isEditing && editId) {
        const { error } = await supabase
          .from('propostas_usineiros')
          .update(propostaData)
          .eq('id', editId);
        
        if (error) throw error;
        toast.success('Proposta atualizada com sucesso!');
        navigate('/historico');
      } else {
        const { error } = await supabase.from('propostas_usineiros').insert(propostaData);
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
    if (!nomeProjeto.trim()) {
      toast.error('Preencha o nome do projeto antes de gerar o PDF');
      return;
    }

    try {
      toast.loading('Gerando PDF...', { id: 'pdf-loading' });
      await generateUsineiroPDF({
        projeto: {
          nome: nomeProjeto,
          spe,
          cidade: cidadeSelecionada?.cidade || '',
          uf: cidadeSelecionada?.uf || '',
          tipoGd,
        },
        capacidade: {
          potenciaMwp,
          oversizing,
          quantidadeModulos,
          areaHectares,
        },
        comercializacao: {
          concessionaria,
          tipoComercializacao,
          taxaAdministracao,
          descontoClienteFinal,
          tarifaMedia,
        },
        custos: {
          capexTotal,
          omPercentual,
          arrendamentoMensal,
          seguroAnual,
          contabilidadeMensal,
        },
        financiamento: temFinanciamento ? {
          valor: financiamentoValor,
          carenciaMeses: financiamentoCarenciaMeses,
          prazoMeses: financiamentoPrazoMeses,
          taxa: financiamentoTaxa,
        } : undefined,
        regimeTributario,
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

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">
              {isEditing ? 'Editar Proposta - Usineiro' : 'Invest Teaser - Usineiros'}
            </h1>
            <p className="text-muted-foreground mt-1">
              Preencha os dados da usina para gerar o teaser de investimento
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

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Formulário */}
          <div className="space-y-6">
            {/* Dados do Projeto */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Factory className="h-5 w-5 text-primary" />
                  Dados do Projeto
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="nomeProjeto">Nome do Projeto *</Label>
                  <Input
                    id="nomeProjeto"
                    value={nomeProjeto}
                    onChange={(e) => setNomeProjeto(e.target.value)}
                    placeholder="Ex: UFV Solar Minas"
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label htmlFor="spe">SPE</Label>
                  <Input
                    id="spe"
                    value={spe}
                    onChange={(e) => setSpe(e.target.value)}
                    placeholder="Empresa do projeto"
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label htmlFor="tipoGd">Tipo GD</Label>
                  <Select value={tipoGd} onValueChange={setTipoGd}>
                    <SelectTrigger className="bg-coesa-yellow/10 border-coesa-yellow/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposGD.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="cidade">Cidade (buscar pelo nome)</Label>
                  <Input
                    id="cidade"
                    value={buscaCidade}
                    onChange={(e) => setBuscaCidade(e.target.value)}
                    placeholder="Digite para buscar..."
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                  {buscaCidade && cidadesFiltradas.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-auto border rounded-lg bg-card">
                      {cidadesFiltradas.map((c) => (
                        <button
                          key={c.id}
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                          onClick={() => {
                            setCidadeSelecionada(c);
                            setBuscaCidade(`${c.cidade} - ${c.uf}`);
                          }}
                        >
                          {c.cidade} - {c.uf} (Índice: {c.indice_solarimetrico})
                        </button>
                      ))}
                    </div>
                  )}
                  {cidadeSelecionada && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Índice solarimétrico: {cidadeSelecionada.indice_solarimetrico} kWh/kWp/mês
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Capacidade */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sun className="h-5 w-5 text-coesa-orange" />
                  Capacidade da Usina
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="potencia">Potência (MWp)</Label>
                  <Input
                    id="potencia"
                    type="number"
                    step="0.1"
                    value={potenciaMwp}
                    onChange={(e) => setPotenciaMwp(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label htmlFor="oversizing">Oversizing</Label>
                  <Input
                    id="oversizing"
                    type="number"
                    step="0.05"
                    value={oversizing}
                    onChange={(e) => setOversizing(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label htmlFor="modulos">Qtd. Módulos</Label>
                  <Input
                    id="modulos"
                    type="number"
                    value={quantidadeModulos}
                    onChange={(e) => setQuantidadeModulos(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label htmlFor="area">Área (ha)</Label>
                  <Input
                    id="area"
                    type="number"
                    step="0.1"
                    value={areaHectares}
                    onChange={(e) => setAreaHectares(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Comercialização */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5 text-secondary" />
                  Comercialização
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Concessionária</Label>
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
                  <Label>Tipo</Label>
                  <Select value={tipoComercializacao} onValueChange={setTipoComercializacao}>
                    <SelectTrigger className="bg-coesa-yellow/10 border-coesa-yellow/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposComercializacao.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tarifa Média (R$/kWh)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={tarifaMedia}
                    onChange={(e) => setTarifaMedia(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label>Taxa Administração (%)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={taxaAdministracao}
                    onChange={(e) => setTaxaAdministracao(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Desconto Cliente Final (%)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={descontoClienteFinal}
                    onChange={(e) => setDescontoClienteFinal(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Tipo de Geração GD1/GD2 */}
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sun className="h-5 w-5 text-yellow-500" />
                  Regime de Compensação (GD1/GD2)
                </CardTitle>
                <CardDescription>
                  Define as regras de compensação e quem arca com os custos da Lei 14.300
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Toggle GD1/GD2 */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div className="space-y-1">
                    <Label className="text-base font-medium">Tipo de Geração</Label>
                    <p className="text-xs text-muted-foreground">
                      {tipoGeracao === 'GD1' 
                        ? 'Projetos pré-Lei 14.300 - Compensação 1:1 integral'
                        : 'Projetos pós-Lei 14.300 - Cobrança progressiva do Fio B'}
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
                        Direito adquirido até 2045
                      </Badge>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                        Lei 14.300/2022
                      </Badge>
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                        Fio B: {(getPercentualGD2(new Date().getFullYear()) * 100).toFixed(0)}% em {new Date().getFullYear()} → 100% em 2029
                      </Badge>
                    </>
                  )}
                </div>

                {/* Quem arca com o custo GD2 */}
                {tipoGeracao === 'GD2' && (
                  <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 space-y-3">
                    <Label className="text-sm font-medium text-orange-800 dark:text-orange-200 flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Quem arca com o custo do Fio B (GD2)?
                    </Label>
                    <RadioGroup 
                      value={quemArcaGD2} 
                      onValueChange={(value) => setQuemArcaGD2(value as 'usineiro' | 'assinante')}
                      className="grid grid-cols-2 gap-3"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="usineiro" id="usineiro-usina" />
                        <Label htmlFor="usineiro-usina" className="text-sm cursor-pointer">
                          <span className="font-medium">Usineiro (COESA)</span>
                          <p className="text-xs text-muted-foreground">Custo absorvido na taxa de administração</p>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="assinante" id="assinante-usina" />
                        <Label htmlFor="assinante-usina" className="text-sm cursor-pointer">
                          <span className="font-medium">Assinante</span>
                          <p className="text-xs text-muted-foreground">Cliente final paga o Fio B na fatura</p>
                        </Label>
                      </div>
                    </RadioGroup>

                    {quemArcaGD2 === 'usineiro' && (
                      <div className="mt-2 p-2 rounded bg-yellow-100 dark:bg-yellow-900/50 text-xs">
                        <span className="text-yellow-700 dark:text-yellow-300">
                          <AlertTriangle className="h-3 w-3 inline mr-1" />
                          Considerar o custo do GD2 na precificação da taxa de administração
                        </span>
                      </div>
                    )}
                    
                    {quemArcaGD2 === 'assinante' && (
                      <div className="mt-2 p-2 rounded bg-blue-100 dark:bg-blue-900/50 text-xs">
                        <span className="text-blue-700 dark:text-blue-300">
                          <Info className="h-3 w-3 inline mr-1" />
                          O desconto ao cliente deve compensar o custo do Fio B
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Custos */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-destructive" />
                  Custos
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>CAPEX Total (R$)</Label>
                  <Input
                    type="number"
                    step="10000"
                    value={capexTotal}
                    onChange={(e) => setCapexTotal(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    R$/Wp: {formatNumber(capexTotal / (potenciaMwp * 1000000), 2)}
                  </p>
                </div>
                <div>
                  <Label>O&M (% do CAPEX/ano)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={omPercentual}
                    onChange={(e) => setOmPercentual(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label>Arrendamento (R$/mês)</Label>
                  <Input
                    type="number"
                    step="100"
                    value={arrendamentoMensal}
                    onChange={(e) => setArrendamentoMensal(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label>Seguro (R$/ano)</Label>
                  <Input
                    type="number"
                    step="1000"
                    value={seguroAnual}
                    onChange={(e) => setSeguroAnual(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label>Contabilidade (R$/mês)</Label>
                  <Input
                    type="number"
                    step="100"
                    value={contabilidadeMensal}
                    onChange={(e) => setContabilidadeMensal(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Financiamento */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5 text-coesa-blue" />
                  Financiamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Possui financiamento?</Label>
                  <Switch checked={temFinanciamento} onCheckedChange={setTemFinanciamento} />
                </div>
                {temFinanciamento && (
                  <div className="grid gap-4 sm:grid-cols-2 pt-4">
                    <div>
                      <Label>Valor (R$)</Label>
                      <Input
                        type="number"
                        value={financiamentoValor}
                        onChange={(e) => setFinanciamentoValor(Number(e.target.value))}
                        className="bg-coesa-yellow/10 border-coesa-yellow/30"
                      />
                    </div>
                    <div>
                      <Label>Taxa (% a.a.)</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={financiamentoTaxa}
                        onChange={(e) => setFinanciamentoTaxa(Number(e.target.value))}
                        className="bg-coesa-yellow/10 border-coesa-yellow/30"
                      />
                    </div>
                    <div>
                      <Label>Carência (meses)</Label>
                      <Input
                        type="number"
                        value={financiamentoCarenciaMeses}
                        onChange={(e) => setFinanciamentoCarenciaMeses(Number(e.target.value))}
                        className="bg-coesa-yellow/10 border-coesa-yellow/30"
                      />
                    </div>
                    <div>
                      <Label>Prazo (meses)</Label>
                      <Input
                        type="number"
                        value={financiamentoPrazoMeses}
                        onChange={(e) => setFinanciamentoPrazoMeses(Number(e.target.value))}
                        className="bg-coesa-yellow/10 border-coesa-yellow/30"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Regime Tributário */}
            <Card>
              <CardHeader>
                <CardTitle>Regime Tributário e Premissas</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Regime</Label>
                  <Select value={regimeTributario} onValueChange={(v) => setRegimeTributario(v as typeof regimeTributario)}>
                    <SelectTrigger className="bg-coesa-yellow/10 border-coesa-yellow/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {regimesTributarios.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>IPCA (% a.a.)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={ipca}
                    onChange={(e) => setIpca(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label>CDI (% a.a.)</Label>
                  <Input
                    type="number"
                    step="0.25"
                    value={cdi}
                    onChange={(e) => setCdi(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>
                <div>
                  <Label>Inflação Energética (% a.a.)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={inflacaoEnergetica}
                    onChange={(e) => setInflacaoEnergetica(Number(e.target.value))}
                    className="bg-coesa-yellow/10 border-coesa-yellow/30"
                  />
                </div>

                {/* Separador e Seção de Impostos */}
                <div className="sm:col-span-2 pt-4 border-t mt-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Percent className="h-4 w-4" />
                    Composição Tributária
                  </h4>
                  
                  {/* Bandeira Tarifária */}
                  {bandeiraVigente && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 mb-3">
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

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">PIS/COFINS</span>
                      <Badge variant="secondary">{PIS_COFINS_PERCENTUAL.toFixed(2).replace('.', ',')}%</Badge>
                    </div>
                    
                    {icmsEstadoSelecionado ? (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">ICMS ({icmsEstadoSelecionado.nome_estado})</span>
                          <Badge variant="secondary">{icmsEstadoSelecionado.icms_percentual.toFixed(2).replace('.', ',')}%</Badge>
                        </div>
                        
                        <div className={`flex items-start gap-2 p-2 rounded-lg mt-2 ${
                          icmsEstadoSelecionado.icms_isenta_compensacao 
                            ? 'bg-green-50 dark:bg-green-950/30' 
                            : 'bg-yellow-50 dark:bg-yellow-950/30'
                        }`}>
                          {icmsEstadoSelecionado.icms_isenta_compensacao ? (
                            <>
                              <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                              <p className="text-xs text-green-700 dark:text-green-300">
                                Estado isenta ICMS na energia compensada (SCEE)
                              </p>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                                Estado NÃO confirma isenção de ICMS na compensação GD
                              </p>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                        <Info className="h-4 w-4 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                          Selecione uma concessionária para ver o ICMS
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview dos Resultados */}
          <div className="space-y-6">
            {/* Indicadores Principais */}
            <Card className="gradient-coesa text-primary-foreground overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary-foreground">
                  <TrendingUp className="h-5 w-5" />
                  Indicadores do Investimento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white/10 rounded-lg p-4 text-center">
                    <p className="text-sm opacity-80">TIR</p>
                    <p className="text-2xl font-bold font-heading">
                      {formatNumber(resultado.tir, 1)}%
                    </p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4 text-center">
                    <p className="text-sm opacity-80">VPL</p>
                    <p className="text-xl font-bold font-heading">
                      {formatCurrency(resultado.vpl)}
                    </p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4 text-center">
                    <p className="text-sm opacity-80">Payback</p>
                    <p className="text-2xl font-bold font-heading">
                      {formatNumber(resultado.paybackAnos, 1)} anos
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Geração e Receita */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sun className="h-5 w-5 text-coesa-orange" />
                  Geração e Receita
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-sm text-muted-foreground">Geração Mensal</p>
                    <p className="text-lg font-bold">{formatNumber(resultado.geracaoMensalMwh, 1)} MWh</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-sm text-muted-foreground">Geração Anual</p>
                    <p className="text-lg font-bold">{formatNumber(resultado.geracaoAnualMwh, 0)} MWh</p>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <p className="text-sm text-muted-foreground">Receita Bruta Mensal</p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(resultado.receitaBrutaMensal)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-primary/10">
                    <p className="text-sm text-muted-foreground">Receita Bruta Anual</p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(resultado.receitaBrutaAnual)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-secondary/10">
                    <p className="text-sm text-muted-foreground">Receita Líquida Mensal</p>
                    <p className="text-lg font-bold text-secondary">{formatCurrency(resultado.receitaLiquidaMensal)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/10">
                    <p className="text-sm text-muted-foreground">Receita Líquida Anual</p>
                    <p className="text-lg font-bold text-secondary">{formatCurrency(resultado.receitaLiquidaAnual)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* EBITDA e Lucro */}
            <Card>
              <CardHeader>
                <CardTitle>Resultado Operacional (Ano 1)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                  <span className="font-medium">EBITDA</span>
                  <span className="text-lg font-bold">{formatCurrency(resultado.ebitdaAnual)}</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-primary/10">
                  <span className="font-medium">Lucro Líquido</span>
                  <span className="text-lg font-bold text-primary">{formatCurrency(resultado.lucroLiquidoAnual)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Resumo do Investimento */}
            <Card>
              <CardHeader>
                <CardTitle>Resumo do Investimento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CAPEX Total</span>
                  <span className="font-medium">{formatCurrency(capexTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CAPEX/Wp</span>
                  <span className="font-medium">R$ {formatNumber(capexTotal / (potenciaMwp * 1000000), 2)}</span>
                </div>
                {temFinanciamento && (
                  <>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Financiamento</span>
                      <span className="font-medium">{formatCurrency(financiamentoValor)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Equity</span>
                      <span className="font-medium">{formatCurrency(capexTotal - financiamentoValor)}</span>
                    </div>
                  </>
                )}
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vida útil</span>
                  <span className="font-medium">25 anos</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Degradação anual</span>
                  <span className="font-medium">0.5%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
