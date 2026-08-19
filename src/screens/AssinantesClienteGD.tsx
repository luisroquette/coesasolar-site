import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  calcularPropostaClienteGD, 
  ClienteGDInput,
  ClienteGDOutput
} from '@/lib/calculations-cliente-gd';
import { formatCurrency, formatNumber } from '@/lib/calculations';
import { formatCpfCnpj, isValidCpfCnpj, isDocumentComplete } from '@/lib/cpf-cnpj-utils';
import { formatCEP, fetchAddressByCEP, isCEPComplete } from '@/lib/cep-utils';
import { ComparativoConcorrente } from '@/components/ComparativoConcorrente';
import { FluxoCaixaMulta } from '@/components/FluxoCaixaMulta';
import { PropostaClienteGDPDF, ClienteGDPDFData } from '@/components/pdf';
import { generatePDFFromElement, downloadPDF } from '@/components/pdf/pdf-utils';
import { 
  FileText, Save, User, Building2, ArrowRightLeft, 
  TrendingUp, Zap, Calculator, Check, X, Loader2,
  AlertTriangle, Download, Eye, Sparkles, RefreshCw
} from 'lucide-react';
import { useParametrosMacro } from '@/hooks/useParametrosMacro';
import { motion, AnimatePresence } from 'framer-motion';

const TIPO_INSTALACAO = ['Monofásico', 'Bifásico', 'Trifásico'] as const;

const PLANOS_COESA = [
  { anos: 1, desconto: 15, label: '1 Ano' },
  { anos: 2, desconto: 20, label: '2 Anos' },
  { anos: 3, desconto: 25, label: '3 Anos' },
  { anos: 4, desconto: 30, label: '4 Anos', unlock: true },
];

const UNLOCK_THRESHOLD = 3000; // kWh - consumo mínimo para UNLOCK ser default

interface Concessionaria {
  id: string;
  nome: string;
  uf: string | null;
  tarifa_media: number | null;
}

export default function AssinantesClienteGD() {
  const { user } = useAuth();
  const { inflacaoEnergeticaDecimal } = useParametrosMacro();
  
  const [saving, setSaving] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [concessionarias, setConcessionarias] = useState<Concessionaria[]>([]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showAnimatedPreview, setShowAnimatedPreview] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  
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
  const [tipoInstalacao, setTipoInstalacao] = useState<typeof TIPO_INSTALACAO[number]>('Bifásico');
  const [tarifa, setTarifa] = useState(0.85);
  const [cip, setCip] = useState(45);
  const [consumoMedio, setConsumoMedio] = useState(500);
  
  // Dados do concorrente
  const [nomeConcorrente, setNomeConcorrente] = useState('');
  const [descontoConcorrente, setDescontoConcorrente] = useState(20);
  const [multaRescisoria, setMultaRescisoria] = useState(0);
  const [mesesRestantesConcorrente, setMesesRestantesConcorrente] = useState(12);
  
  // Proposta COESA - padrão baseado no consumo
  const [planoSelecionado, setPlanoSelecionado] = useState(() => {
    return consumoMedio > UNLOCK_THRESHOLD ? PLANOS_COESA[3] : PLANOS_COESA[2];
  });
  const [descontoCoesaCustom, setDescontoCoesaCustom] = useState<number | null>(null);
  
  // Atualizar plano automaticamente quando consumo ultrapassa/fica abaixo do threshold UNLOCK
  useEffect(() => {
    const planoIdeal = consumoMedio > UNLOCK_THRESHOLD ? PLANOS_COESA[3] : PLANOS_COESA[2];
    // Só atualiza automaticamente se o usuário não customizou o desconto
    if (descontoCoesaCustom === null && planoSelecionado.anos !== planoIdeal.anos) {
      setPlanoSelecionado(planoIdeal);
    }
  }, [consumoMedio, descontoCoesaCustom]);
  
  // Buscar concessionárias
  useEffect(() => {
    async function fetchConcessionarias() {
      const { data, error } = await supabase
        .from('concessionarias')
        .select('id, nome, uf, tarifa_media')
        .order('nome');
      
      if (!error && data) {
        setConcessionarias(data);
      }
    }
    fetchConcessionarias();
  }, []);

  // Handler para auto-preencher tarifa ao selecionar concessionária
  const handleConcessionariaChange = (nome: string) => {
    setConcessionaria(nome);
    const selected = concessionarias.find(c => c.nome === nome);
    if (selected?.tarifa_media) {
      setTarifa(selected.tarifa_media);
      toast.success('Tarifa atualizada automaticamente!');
    }
  };

  // Handler para buscar endereço por CEP
  const handleCepChange = async (cep: string) => {
    const formatted = formatCEP(cep);
    setClienteCep(formatted);
    
    if (isCEPComplete(formatted)) {
      setLoadingCep(true);
      try {
        const address = await fetchAddressByCEP(formatted);
        if (address) {
          setClienteEndereco(address.logradouro || '');
          setClienteCidade(address.localidade || '');
          setClienteUf(address.uf || '');
        }
      } finally {
        setLoadingCep(false);
      }
    }
  };

  // Desconto COESA efetivo (custom ou do plano)
  const descontoCoesa = descontoCoesaCustom ?? planoSelecionado.desconto;

  // Cálculos em tempo real
  const resultado: ClienteGDOutput | null = useMemo(() => {
    if (consumoMedio <= 0 || tarifa <= 0) return null;
    
    const input: ClienteGDInput = {
      nomeConcorrente,
      descontoConcorrente,
      multaRescisoria,
      mesesRestantesConcorrente,
      descontoCoesa,
      fidelidadeAnos: planoSelecionado.anos,
      tarifa,
      cip,
      consumoMedio,
      tipoInstalacao,
      numeroUcs,
    };
    
    return calcularPropostaClienteGD(input, inflacaoEnergeticaDecimal);
  }, [
    nomeConcorrente, descontoConcorrente, multaRescisoria, mesesRestantesConcorrente,
    descontoCoesa, planoSelecionado, tarifa, cip, consumoMedio, tipoInstalacao, numeroUcs,
    inflacaoEnergeticaDecimal
  ]);

  // Dados para o PDF
  const pdfData: ClienteGDPDFData | null = useMemo(() => {
    if (!resultado) return null;
    return {
      cliente: {
        nome: clienteNome,
        cpfCnpj: clienteCpfCnpj,
        cidade: clienteCidade,
        uf: clienteUf,
        email: clienteEmail,
        telefone: clienteTelefone,
      },
      instalacao: {
        concessionaria,
        tipoInstalacao,
        numeroUcs,
        consumoMedio,
        tarifa,
        cip,
      },
      concorrente: {
        nome: nomeConcorrente,
        descontoPercentual: descontoConcorrente,
        multaRescisoria,
        mesesRestantes: mesesRestantesConcorrente,
      },
      coesa: {
        descontoPercentual: descontoCoesa,
        fidelidadeAnos: planoSelecionado.anos,
      },
      resultado,
    };
  }, [
    clienteNome, clienteCpfCnpj, clienteCidade, clienteUf, clienteEmail, clienteTelefone,
    concessionaria, tipoInstalacao, numeroUcs, consumoMedio, tarifa, cip,
    nomeConcorrente, descontoConcorrente, multaRescisoria, mesesRestantesConcorrente,
    descontoCoesa, planoSelecionado.anos, resultado
  ]);

  // Download PDF
  const handleDownloadPDF = useCallback(async () => {
    if (!pdfData) return;
    setIsGeneratingPDF(true);
    try {
      await downloadPDF('proposta-cliente-gd-pdf', {
        filename: `Proposta_Migracao_COESA_${clienteNome || 'Cliente'}.pdf`.replace(/\s+/g, '_'),
        quality: 0.95,
        scale: 2
      });
      toast.success('PDF gerado com sucesso!');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Erro ao gerar PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [pdfData, clienteNome]);
  // Salvar proposta
  const handleSave = async () => {
    if (!user) {
      toast.error('Você precisa estar logado');
      return;
    }

    if (!clienteNome.trim()) {
      toast.error('Preencha o nome do cliente');
      return;
    }

    if (!nomeConcorrente.trim()) {
      toast.error('Preencha o nome do concorrente');
      return;
    }

    setSaving(true);
    try {
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
        fidelidade_anos: planoSelecionado.anos,
        desconto_percentual: descontoCoesa,
        economia_mensal: resultado?.diferencaMensal || 0,
        economia_anual: resultado?.economiaAdicionalAnual || 0,
        economia_acumulada: resultado?.economiaAdicionalAcumulada || 0,
        status: 'rascunho',
        tipo_proposta: 'inicial',
        tipo_proposta_sub: 'cliente_gd',
        nome_concorrente: nomeConcorrente,
        desconto_concorrente: descontoConcorrente,
        multa_rescisoria: multaRescisoria,
        meses_restantes_concorrente: mesesRestantesConcorrente,
        payback_multa_meses: resultado?.paybackMeses || null,
        economia_adicional_mensal: resultado?.diferencaMensal || 0,
      };

      const { data: insertedProposta, error } = await supabase
        .from('propostas_assinantes')
        .insert(propostaData)
        .select('id')
        .single();
        
      if (error) throw error;
      
      // Sincronizar com Bitrix24
      try {
        const syncResponse = await supabase.functions.invoke('bitrix24-sync-cliente-gd', {
          body: {
            propostaId: insertedProposta.id,
            dados: {
              nome_concorrente: nomeConcorrente,
              desconto_concorrente: descontoConcorrente,
              multa_rescisoria: multaRescisoria,
              meses_restantes_concorrente: mesesRestantesConcorrente,
              payback_multa_meses: resultado?.paybackMeses || null,
              economia_adicional_mensal: resultado?.diferencaMensal || 0,
              cliente_nome: clienteNome,
              cliente_email: clienteEmail,
              cliente_telefone: clienteTelefone,
              cliente_cpf_cnpj: clienteCpfCnpj,
              cliente_endereco: clienteEndereco,
              cliente_cidade: clienteCidade,
              cliente_uf: clienteUf,
              desconto_coesa: descontoCoesa,
              fidelidade_anos: planoSelecionado.anos,
              consumo_medio: consumoMedio,
              tarifa,
              concessionaria,
            },
          },
        });
        
        if (syncResponse.data?.synced) {
          toast.success('Proposta salva e sincronizada com Bitrix24!');
        } else {
          toast.success('Proposta salva! (Bitrix24 não habilitado)');
        }
      } catch (syncError) {
        console.error('Erro ao sincronizar com Bitrix24:', syncError);
        toast.success('Proposta salva! (Erro na sincronização Bitrix24)');
      }
      
      // Limpar formulário
      setClienteNome('');
      setClienteCpfCnpj('');
      setNomeConcorrente('');
      setDescontoConcorrente(20);
      setMultaRescisoria(0);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar proposta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground flex items-center gap-3">
              <ArrowRightLeft className="h-8 w-8 text-primary" />
              Proposta Cliente com GD
            </h1>
            <p className="text-muted-foreground mt-1">
              Migração de clientes que já possuem contrato com concorrentes
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowAnimatedPreview(true)}
              disabled={!pdfData}
            >
              <Eye className="mr-2 h-4 w-4" />
              Preview PDF
            </Button>
            <Button
              variant="secondary"
              onClick={handleDownloadPDF}
              disabled={!pdfData || isGeneratingPDF}
            >
              {isGeneratingPDF ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isGeneratingPDF ? 'Gerando...' : 'Baixar PDF'}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 shadow-coesa">
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar Proposta'}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Coluna de Formulários */}
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
                </div>
                <div>
                  <Label htmlFor="cep">CEP</Label>
                  <div className="relative">
                    <Input
                      id="cep"
                      value={clienteCep}
                      onChange={(e) => handleCepChange(e.target.value)}
                      placeholder="00000-000"
                    />
                    {loadingCep && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="endereco">Endereço</Label>
                  <Input
                    id="endereco"
                    value={clienteEndereco}
                    onChange={(e) => setClienteEndereco(e.target.value)}
                    placeholder="Rua, número, complemento"
                  />
                </div>
                <div>
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input
                    id="cidade"
                    value={clienteCidade}
                    onChange={(e) => setClienteCidade(e.target.value)}
                    placeholder="Cidade"
                  />
                </div>
                <div>
                  <Label htmlFor="uf">UF</Label>
                  <Input
                    id="uf"
                    value={clienteUf}
                    onChange={(e) => setClienteUf(e.target.value.toUpperCase())}
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Dados da Instalação */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Dados da Instalação
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Concessionária</Label>
                  <Select value={concessionaria} onValueChange={handleConcessionariaChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a concessionária" />
                    </SelectTrigger>
                    <SelectContent>
                      {concessionarias.map((c) => (
                        <SelectItem key={c.id} value={c.nome}>
                          {c.nome} {c.uf && `(${c.uf})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de Instalação</Label>
                  <Select 
                    value={tipoInstalacao} 
                    onValueChange={(v) => setTipoInstalacao(v as typeof TIPO_INSTALACAO[number])}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPO_INSTALACAO.map((tipo) => (
                        <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
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
                    onChange={(e) => setNumeroUcs(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div>
                  <Label htmlFor="consumo">Consumo Médio (kWh)</Label>
                  <Input
                    id="consumo"
                    type="number"
                    value={consumoMedio}
                    onChange={(e) => setConsumoMedio(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="tarifa">Tarifa (R$/kWh)</Label>
                  <Input
                    id="tarifa"
                    type="number"
                    step="0.01"
                    value={tarifa}
                    onChange={(e) => setTarifa(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="cip">CIP (R$)</Label>
                  <Input
                    id="cip"
                    type="number"
                    step="0.01"
                    value={cip}
                    onChange={(e) => setCip(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Dados do Concorrente */}
            <Card className="border-2 border-orange-500/30 bg-orange-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                  <Building2 className="h-5 w-5" />
                  Contrato Atual (Concorrente)
                </CardTitle>
                <CardDescription>
                  Informe os dados do contrato atual do cliente com outro consórcio/cooperativa
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="nomeConcorrente">Nome do Concorrente *</Label>
                  <Input
                    id="nomeConcorrente"
                    value={nomeConcorrente}
                    onChange={(e) => setNomeConcorrente(e.target.value)}
                    placeholder="Ex: Consórcio Solar XYZ"
                    className="bg-orange-500/10 border-orange-500/30"
                  />
                </div>
                <div>
                  <Label>
                    Desconto Atual: <span className="font-bold text-orange-600">{descontoConcorrente}%</span>
                  </Label>
                  <Slider
                    value={[descontoConcorrente]}
                    onValueChange={(v) => setDescontoConcorrente(v[0])}
                    min={5}
                    max={35}
                    step={1}
                    className="mt-3"
                  />
                </div>
                <div>
                  <Label htmlFor="mesesRestantes">Meses Restantes Contrato</Label>
                  <Input
                    id="mesesRestantes"
                    type="number"
                    min={0}
                    value={mesesRestantesConcorrente}
                    onChange={(e) => setMesesRestantesConcorrente(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="multaRescisoria">Multa Rescisória (R$)</Label>
                  <Input
                    id="multaRescisoria"
                    type="number"
                    step="0.01"
                    value={multaRescisoria}
                    onChange={(e) => setMultaRescisoria(parseFloat(e.target.value) || 0)}
                    placeholder="0,00 (deixe em branco se não houver)"
                    className="bg-orange-500/10 border-orange-500/30"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Deixe em 0 se não houver multa ou se já foi cumprido o período mínimo
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Proposta COESA */}
            <Card className="border-2 border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <TrendingUp className="h-5 w-5" />
                  Proposta COESA
                </CardTitle>
                <CardDescription>
                  Configure a proposta de migração para a COESA
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Seletor de Plano */}
                <div className="grid grid-cols-3 gap-3">
                  {PLANOS_COESA.map((plano) => (
                    <motion.button
                      key={plano.anos}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setPlanoSelecionado(plano);
                        setDescontoCoesaCustom(null);
                      }}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        planoSelecionado.anos === plano.anos && descontoCoesaCustom === null
                          ? 'border-primary bg-primary/10 shadow-lg'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <p className="text-lg font-bold">{plano.label}</p>
                      <p className="text-2xl font-bold text-primary">{plano.desconto}%</p>
                      <p className="text-xs text-muted-foreground">desconto</p>
                    </motion.button>
                  ))}
                </div>

                {/* Desconto customizado */}
                <div>
                  <Label className="flex items-center gap-2">
                    Desconto Customizado (opcional)
                    <Badge variant="outline" className="text-xs">Override</Badge>
                  </Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      type="number"
                      min={descontoConcorrente + 1}
                      max={40}
                      step={1}
                      value={descontoCoesaCustom ?? ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setDescontoCoesaCustom(isNaN(val) ? null : val);
                      }}
                      placeholder={`Mínimo: ${descontoConcorrente + 1}%`}
                      className="max-w-32"
                    />
                    {descontoCoesaCustom !== null && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setDescontoCoesaCustom(null)}
                      >
                        <X className="h-4 w-4" />
                        Limpar
                      </Button>
                    )}
                  </div>
                  {descontoCoesaCustom !== null && descontoCoesaCustom <= descontoConcorrente && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      O desconto COESA deve ser maior que o do concorrente ({descontoConcorrente}%)
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Coluna de Resultados */}
          <div className="space-y-6">
            <AnimatePresence mode="wait">
              {resultado && (
                <motion.div
                  key="resultado"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  {/* Comparativo Visual */}
                  <ComparativoConcorrente
                    nomeConcorrente={nomeConcorrente}
                    descontoConcorrente={descontoConcorrente}
                    descontoCoesa={descontoCoesa}
                    resultado={resultado}
                  />

                  {/* Análise da Multa */}
                  <FluxoCaixaMulta
                    multaRescisoria={multaRescisoria}
                    paybackMeses={resultado.paybackMeses}
                    multaJustificada={resultado.multaJustificada}
                    fluxoCaixa={resultado.fluxoCaixaMigracao}
                    fidelidadeAnos={planoSelecionado.anos}
                  />

                  {/* Resumo Final */}
                  <Card className={resultado.migracaoRecomendada 
                    ? "border-2 border-green-500/50 bg-green-500/5" 
                    : "border-2 border-destructive/50 bg-destructive/5"
                  }>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {resultado.migracaoRecomendada ? (
                          <>
                            <Check className="h-6 w-6 text-green-500" />
                            <span className="text-green-600 dark:text-green-400">
                              Migração Recomendada
                            </span>
                          </>
                        ) : (
                          <>
                            <X className="h-6 w-6 text-destructive" />
                            <span className="text-destructive">
                              Migração Não Recomendada
                            </span>
                          </>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-center">
                        <div className="bg-background/50 rounded-lg p-4">
                          <p className="text-sm text-muted-foreground mb-1">
                            Economia Adicional Total
                          </p>
                          <p className="text-2xl font-bold text-primary">
                            {formatCurrency(resultado.economiaAdicionalAcumulada)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            em {planoSelecionado.anos} {planoSelecionado.anos === 1 ? 'ano' : 'anos'}
                          </p>
                        </div>
                        <div className="bg-background/50 rounded-lg p-4">
                          <p className="text-sm text-muted-foreground mb-1">
                            ROI da Migração
                          </p>
                          <p className="text-2xl font-bold text-primary">
                            {resultado.roiMigracao.toFixed(0)}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            retorno sobre investimento
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {!resultado && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Calculator className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">
                    Preencha os dados para visualizar a análise comparativa
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Dialog de Preview Animado */}
        <Dialog open={showAnimatedPreview} onOpenChange={setShowAnimatedPreview}>
          <DialogContent className="max-w-4xl max-h-[90vh] p-0">
            <DialogHeader className="p-4 pb-2">
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Preview da Proposta de Migração
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[calc(90vh-80px)]">
              <div className="p-4">
                {pdfData && (
                  <div className="transform scale-[0.5] origin-top">
                    <PropostaClienteGDPDF data={pdfData} animated />
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="p-4 pt-2 border-t flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAnimatedPreview(false)}>
                Fechar
              </Button>
              <Button onClick={handleDownloadPDF} disabled={isGeneratingPDF}>
                {isGeneratingPDF ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Baixar PDF
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* PDF oculto para geração */}
        <div
          ref={previewContainerRef}
          className="fixed left-[-9999px] top-0"
          style={{ width: '210mm' }}
        >
          {pdfData && (
            <div id="proposta-cliente-gd-pdf">
              <PropostaClienteGDPDF data={pdfData} animated={false} />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
