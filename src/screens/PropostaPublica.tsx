import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useProposalHeartbeat } from '@/hooks/useProposalHeartbeat';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { CheckCircle2, XCircle } from 'lucide-react';
import { formatCurrency, calcularPropostaAssinante, AssinanteInput } from '@/lib/calculations';
import { PlanoConfig, PLANOS_DISPONIVEIS } from '@/components/PlanSelector';
import { ProposalChatbot } from '@/components/chat/ProposalChatbot';

// New redesigned components
import { PropostaHeader } from '@/components/proposta/PropostaHeader';
import { PropostaHero } from '@/components/proposta/PropostaHero';
import { ComoFunciona } from '@/components/proposta/ComoFunciona';
import { EconomiaDetalhes } from '@/components/proposta/EconomiaDetalhes';
import { ProjecaoEconomia } from '@/components/proposta/ProjecaoEconomia';
import { ProvaSocial } from '@/components/proposta/ProvaSocial';
import { Transparencia } from '@/components/proposta/Transparencia';
import { FormaPagamento } from '@/components/proposta/FormaPagamento';
import { PlanoRecomendado } from '@/components/proposta/PlanoRecomendado';
import { Confianca } from '@/components/proposta/Confianca';
import { Timeline } from '@/components/proposta/Timeline';
import { CTAFinal } from '@/components/proposta/CTAFinal';
import { SofIABlock } from '@/components/proposta/SofIABlock';
import { PropostaFooter } from '@/components/proposta/PropostaFooter';
import { FABButton } from '@/components/proposta/FABButton';

/**
 * Returns the max discount based on bill value.
 * < R$200: max 20%, >= R$3000: max 30% (Unlock), otherwise: max 25% (Premium)
 */
function getMaxDesconto(valorConta: number): number {
  if (valorConta < 200) return 20;
  if (valorConta >= 3000) return 30;
  return 25;
}

/**
 * Returns the best plan for the client based on their bill value.
 */
function getPlanoRecomendado(valorConta: number, planos: PlanoConfig[] = PLANOS_DISPONIVEIS): PlanoConfig {
  const maxDesconto = getMaxDesconto(valorConta);
  const eligible = planos.filter(p => p.descontoPercentual <= maxDesconto);
  return eligible.reduce((best, p) => p.descontoPercentual > best.descontoPercentual ? p : best, eligible[0]);
}

/**
 * Filter plans to only show those eligible for the client's bill value.
 */
function getPlanosElegiveis(valorConta: number, planos: PlanoConfig[] = PLANOS_DISPONIVEIS): PlanoConfig[] {
  const maxDesconto = getMaxDesconto(valorConta);
  return planos.filter(p => p.descontoPercentual <= maxDesconto);
}

interface PropostaData {
  id: string;
  cliente_nome: string;
  cliente_email: string;
  cliente_telefone: string;
  cliente_cidade: string;
  cliente_uf: string;
  cliente_cpf_cnpj: string;
  cliente_endereco: string;
  cliente_cep: string;
  consumo_medio: number;
  valor_conta_original?: number | null;
  tarifa: number;
  cip: number;
  desconto_percentual: number;
  fidelidade_anos: number;
  economia_mensal: number;
  economia_anual: number;
  economia_acumulada: number;
  status: string;
  created_at: string;
  responsavel_comercial: string;
  concessionaria: string;
  tipo_instalacao: string;
  numero_instalacao: string;
  numero_ucs: number;
  bitrix24_lead_id: string | null;
  dados_inferidos: boolean;
  tipo_proposta: string;
  tipo_proposta_sub: string | null;
  nome_concorrente: string | null;
  desconto_concorrente: number | null;
  multa_rescisoria: number | null;
  meses_restantes_concorrente: number | null;
  payback_multa_meses: number | null;
  economia_adicional_mensal: number | null;
  validade?: string | null;
}

export default function PropostaPublica() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [proposta, setProposta] = useState<PropostaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionCompleted, setActionCompleted] = useState<'aceita' | 'recusada' | null>(null);
  const [showFAB, setShowFAB] = useState(false);
  const [viewId, setViewId] = useState<string | undefined>();

  // Track viewing duration
  useProposalHeartbeat(id, viewId);

  const heroRef = useRef<HTMLDivElement>(null);
  const ctaFinalRef = useRef<HTMLElement>(null);

  const [concessionariaData, setConcessionariaData] = useState<{
    te: number; tusd: number; tusd_fio_b: number; pis_cofins: number; uf: string;
    tarifa_media?: number; tarifa_com_impostos?: number;
  } | null>(null);
  const [icmsData, setIcmsData] = useState<{ icms_percentual: number; icms_isenta_compensacao: boolean } | null>(null);

  const [planoSelecionado, setPlanoSelecionado] = useState<PlanoConfig>(() => getPlanoRecomendado(500));

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      if (!id) return;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        toast.error('Link de proposta inválido');
        setLoading(false);
        return;
      }

      const { data: result, error } = await supabase.functions.invoke('public-proposal', {
        body: { action: 'get', proposalId: id }
      });

      if (error || !result?.proposal) {
        toast.error('Proposta não encontrada');
        setLoading(false);
        return;
      }

      const data = result.proposal;
      setProposta(data);
      if (result.viewId) setViewId(result.viewId);
      if (data.status === 'aceita') setActionCompleted('aceita');
      else if (data.status === 'recusada') setActionCompleted('recusada');

      // Fetch concessionaria
      if (data.concessionaria) {
        const { data: concData } = await supabase
          .from('concessionarias')
          .select('te, tusd, tusd_fio_b, pis_cofins, uf, tarifa_media, tarifa_com_impostos')
          .ilike('nome', `%${data.concessionaria}%`)
          .limit(1)
          .maybeSingle();

        if (concData && concData.te !== null && concData.tusd !== null) {
          setConcessionariaData({
            te: Number(concData.te) || 0, tusd: Number(concData.tusd) || 0,
            tusd_fio_b: Number(concData.tusd_fio_b) || 0, pis_cofins: Number(concData.pis_cofins) || 0.0365,
            uf: concData.uf || '',
            tarifa_media: concData.tarifa_media != null ? Number(concData.tarifa_media) : undefined,
            tarifa_com_impostos: concData.tarifa_com_impostos != null ? Number(concData.tarifa_com_impostos) : undefined,
          });

          if (concData.uf) {
            const { data: icms } = await supabase
              .from('icms_estados')
              .select('icms_percentual, icms_isenta_compensacao')
              .eq('uf', concData.uf).limit(1).maybeSingle();
            if (icms) setIcmsData({ icms_percentual: Number(icms.icms_percentual) || 0, icms_isenta_compensacao: icms.icms_isenta_compensacao ?? true });
          }
        }
      }
      setLoading(false);
    }
    fetchData();
  }, [id]);

  // Compute tarifa and consumo
  const { tarifaEfetiva, cipEfetivo, consumoEfetivo } = useMemo(() => {
    if (!proposta) return { tarifaEfetiva: 0.85, cipEfetivo: 45, consumoEfetivo: 500 };
    const tarifaProposta = Number(proposta.tarifa || 0);
    const cip = proposta.cip || 45;
    const tarifaBase = concessionariaData ? Number(concessionariaData.te || 0) + Number(concessionariaData.tusd || 0) : null;
    const aliqPisCofins = Number(concessionariaData?.pis_cofins ?? 0.0365);
    const aliqIcms = Number(icmsData?.icms_percentual ?? 18) / 100;
    const tarifaComImpostosConcessionaria = (() => {
      const stored = Number(concessionariaData?.tarifa_com_impostos ?? 0);
      if (stored > 0) return stored;
      if (!tarifaBase || tarifaBase <= 0) return null;
      const denomIcms = 1 - aliqIcms;
      const denomPis = 1 - aliqPisCofins;
      if (denomIcms <= 0 || denomPis <= 0) return null;
      return tarifaBase / denomIcms / denomPis;
    })();
    const tarifa = tarifaComImpostosConcessionaria && tarifaComImpostosConcessionaria > 0 ? tarifaComImpostosConcessionaria : tarifaProposta > 0 ? tarifaProposta : 0.85;
    let consumo: number;
    if (proposta.consumo_medio && proposta.consumo_medio > 0) consumo = proposta.consumo_medio;
    else if (proposta.valor_conta_original && proposta.valor_conta_original > 0 && tarifa > 0) consumo = Math.round(Math.max(30, (proposta.valor_conta_original - cip) / tarifa));
    else consumo = 500;
    return { tarifaEfetiva: tarifa, cipEfetivo: cip, consumoEfetivo: consumo };
  }, [proposta, concessionariaData, icmsData]);

  // Init plan based on bill value (>= R$3000 → max 30%, < R$3000 → max 25%)
  useEffect(() => {
    if (proposta) {
      const valor = proposta.valor_conta_original || valorContaOriginal || 0;
      setPlanoSelecionado(getPlanoRecomendado(valor));
    }
  }, [proposta]);

  // Calculate results
  const resultado = useMemo(() => {
    if (!proposta) return null;
    const tipoInstalacao = (['Monofásico', 'Bifásico', 'Trifásico'].includes(proposta.tipo_instalacao || '') ? proposta.tipo_instalacao : 'Trifásico') as 'Monofásico' | 'Bifásico' | 'Trifásico';
    const input: AssinanteInput = {
      tarifa: tarifaEfetiva, cip: cipEfetivo, consumoMedio: consumoEfetivo,
      fidelidadeAnos: planoSelecionado.fidelidadeAnos, descontoPercentual: planoSelecionado.descontoPercentual,
      tipoInstalacao, numeroUcs: proposta.numero_ucs || 1,
    };
    return calcularPropostaAssinante(input);
  }, [proposta, planoSelecionado, tarifaEfetiva, cipEfetivo, consumoEfetivo]);

  // Derived values
  const valorContaOriginal = proposta?.valor_conta_original || (resultado?.valorSemCoesa || 0);
  const economiaMensal = resultado?.economiaMensal || 0;
  const valorComCoesa = resultado?.valorComCoesa || 0;
  const economiaAcumulada = resultado?.economiaAcumulada || 0;

  const planoNomes: Record<number, string> = { 1: 'Básico', 2: 'Smart', 3: 'Premium', 4: 'Unlock' };
  const planoLabel = planoNomes[planoSelecionado.fidelidadeAnos] || planoSelecionado.label;

  // Date calculations
  const validadeDate = proposta?.validade ? new Date(proposta.validade) : new Date(Date.now() + 30 * 86400000);
  const diasRestantes = Math.max(0, Math.ceil((validadeDate.getTime() - Date.now()) / 86400000));
  const validadeFormatada = validadeDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  const emissaoFormatada = proposta?.created_at ? new Date(proposta.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

  const tarifaComDesconto = tarifaEfetiva * (1 - planoSelecionado.descontoPercentual / 100);

  // FAB visibility: show after hero exits, hide when CTA final visible
  useEffect(() => {
    if (!proposta || actionCompleted) return;
    const handleScroll = () => {
      const heroEl = heroRef.current;
      const ctaEl = ctaFinalRef.current;
      if (!heroEl) return;
      const heroBottom = heroEl.getBoundingClientRect().bottom;
      const ctaVisible = ctaEl ? ctaEl.getBoundingClientRect().top < window.innerHeight : false;
      setShowFAB(heroBottom < 0 && !ctaVisible);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [proposta, actionCompleted]);

  const handleCTAClick = () => {
    const params = new URLSearchParams({
      desconto: String(planoSelecionado.descontoPercentual),
      fidelidade: String(planoSelecionado.fidelidadeAnos),
    });
    navigate(`/solicitar-contrato/${proposta?.id}?${params.toString()}`);
  };

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
      </div>
    );
  }

  if (!proposta || !resultado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8">
            <XCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Proposta não encontrada</h2>
            <p className="text-gray-500">O link pode estar incorreto ou a proposta foi removida.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (actionCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-4">
        <Card className="max-w-md w-full text-center shadow-xl">
          <CardContent className="pt-8 pb-8">
            {actionCompleted === 'aceita' ? (
              <>
                <CheckCircle2 className="h-20 w-20 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2 text-green-600">Dados Enviados!</h2>
                <p className="text-gray-500 mb-4">
                  Obrigado, {proposta.cliente_nome}! Em breve você receberá o contrato por WhatsApp e e-mail para assinatura digital.
                </p>
                <div className="inline-block bg-green-100 text-green-800 rounded-full px-4 py-2 font-semibold">
                  Economia de {formatCurrency(economiaMensal)}/mês
                </div>
              </>
            ) : (
              <>
                <XCircle className="h-20 w-20 text-gray-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">Proposta Recusada</h2>
                <p className="text-gray-500">
                  Lamentamos que não tenha sido possível. Se mudar de ideia, entre em contato.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const tipoInstalacao = (['Monofásico', 'Bifásico', 'Trifásico'].includes(proposta.tipo_instalacao || '') ? proposta.tipo_instalacao : 'Trifásico') as 'Monofásico' | 'Bifásico' | 'Trifásico';

  return (
    <div className="min-h-screen bg-white">
      <PropostaHeader validadeFormatada={validadeFormatada} emissaoFormatada={emissaoFormatada} />

      <div ref={heroRef}>
        <PropostaHero
          clienteNome={proposta.cliente_nome}
          concessionaria={proposta.concessionaria || 'CEMIG'}
          uf={proposta.cliente_uf || 'MG'}
          economiaMensal={economiaMensal}
          descontoPercentual={planoSelecionado.descontoPercentual}
          planoLabel={planoLabel}
          valorContaOriginal={valorContaOriginal}
          valorComCoesa={valorComCoesa}
          diasRestantes={diasRestantes}
          validadeFormatada={validadeFormatada}
          onCTAClick={handleCTAClick}
        />
      </div>

      <ComoFunciona />

      <EconomiaDetalhes
        valorContaOriginal={valorContaOriginal}
        valorComCoesa={valorComCoesa}
        economiaMensal={economiaMensal}
        economiaAcumulada={economiaAcumulada}
        descontoPercentual={planoSelecionado.descontoPercentual}
        planoLabel={planoLabel}
        fidelidadeAnos={planoSelecionado.fidelidadeAnos}
        tarifa={tarifaEfetiva}
        tarifaComDesconto={tarifaComDesconto}
      />

      <ProjecaoEconomia
        economiaMensal={economiaMensal}
        economiaAcumulada={economiaAcumulada}
        fidelidadeAnos={planoSelecionado.fidelidadeAnos}
        planoLabel={planoLabel}
      />

      {/* ProvaSocial removed - social proof kept in footer area */}
      <Transparencia />
      <FormaPagamento />

      <PlanoRecomendado
        planoAtual={planoSelecionado}
        planos={getPlanosElegiveis(valorContaOriginal)}
        consumoMedio={consumoEfetivo}
        tarifa={tarifaEfetiva}
        cip={cipEfetivo}
        tipoInstalacao={tipoInstalacao}
        numeroUcs={proposta.numero_ucs || 1}
        onSelectPlano={setPlanoSelecionado}
      />

      <Confianca />
      <Timeline />

      <CTAFinal
        ref={ctaFinalRef}
        planoLabel={planoLabel}
        descontoPercentual={planoSelecionado.descontoPercentual}
        economiaMensal={economiaMensal}
        validadeFormatada={validadeFormatada}
        onCTAClick={handleCTAClick}
      />

      <SofIABlock />
      <PropostaFooter />

      <FABButton visible={showFAB} onClick={handleCTAClick} />

      <ProposalChatbot
        proposalContext={{
          cliente_nome: proposta.cliente_nome,
          economia_mensal: economiaMensal,
          economia_anual: resultado.economiaAnual,
          economia_acumulada: economiaAcumulada,
          desconto_percentual: planoSelecionado.descontoPercentual,
          fidelidade_anos: planoSelecionado.fidelidadeAnos,
          consumo_medio: consumoEfetivo,
          concessionaria: proposta.concessionaria,
          tipo_proposta: proposta.tipo_proposta,
        }}
      />
    </div>
  );
}
