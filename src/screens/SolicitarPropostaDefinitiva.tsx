import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useConfiguracoes } from '@/hooks/useConfiguracoes';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, FileText, Building2, User, Zap, ArrowLeft, Sparkles, Edit3, ShieldX } from 'lucide-react';
import { formatCpfCnpj, isValidCpfCnpj, getDocumentType } from '@/lib/cpf-cnpj-utils';
import { formatCEP, isCEPComplete, fetchAddressByCEP } from '@/lib/cep-utils';
import { DocumentUploadWithAI } from '@/components/DocumentUploadWithAI';
import { DocumentUploadPJ } from '@/components/DocumentUploadPJ';
import { motion, AnimatePresence } from 'framer-motion';
import { CoesaLogo } from '@/components/CoesaLogo';
import { cn } from '@/lib/utils';
import { useDataComparison } from '@/hooks/useDataComparison';
import { DataDivergenceAlert } from '@/components/DataDivergenceAlert';
import type { ExtractedDataForComparison, DataDivergence } from '@/types/data-comparison';
import { ProposalChatbot } from '@/components/chat/ProposalChatbot';
import { FraudAlert, PJWarningAlert } from '@/components/FraudAlert';
import { useTitularidadeValidation } from '@/hooks/useTitularidadeValidation';

interface PropostaInicial {
  id: string;
  cliente_nome: string;
  cliente_email: string;
  cliente_telefone: string;
  cliente_cidade: string;
  cliente_uf: string;
  cliente_cpf_cnpj: string;
  cliente_endereco: string;
  cliente_cep: string;
  tipo_instalacao: string;
  consumo_medio: number;
  numero_ucs: number;
  desconto_percentual: number;
  fidelidade_anos: number;
}

interface HistoricoConsumoItem {
  mes_ano: string;
  consumo_kwh: number;
}

interface ExtractedData {
  // Dados principais do RG/CNH
  nome_completo: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  
  // Dados adicionais do RG
  rg_numero: string | null;
  rg_orgao_emissor: string | null;
  rg_data_emissao: string | null;
  
  // Dados adicionais da CNH
  cnh_numero: string | null;
  cnh_categoria: string | null;
  cnh_validade: string | null;
  
  // Filiação e naturalidade
  nome_mae: string | null;
  nome_pai: string | null;
  naturalidade: string | null;
  nacionalidade: string | null;
  
  // Dados da conta de luz
  numero_uc: string | null;
  cpf_cnpj_titular: string | null;
  endereco: string | null;
  logradouro?: string | null;
  numero_endereco?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cep: string | null;
  cidade: string | null;
  uf: string | null;
  tipo_instalacao: string | null;
  classe_consumo: string | null;
  tipo_pessoa: 'PF' | 'PJ' | null;
  concessionaria: string | null;
  
  // Dados adicionais da fatura
  telefone_contato: string | null;
  email_contato: string | null;
  numero_cliente: string | null;
  data_vencimento: string | null;
  valor_fatura: number | null;
  
  // Campos especiais CEMIG
  cip_valor: number | null;
  recebe_energia_externa: boolean | null;
  energia_scee_kwh: number | null;
  tem_saldo_geracao: boolean | null;
  saldo_geracao_kwh: number | null;
  
  // Histórico de consumo
  historico_consumo?: HistoricoConsumoItem[];
  consumo_media_anual: number | null;
  consumo_media_trimestral: number | null;
  consumo_ultimo_mes: number | null;
  // Retrocompatibilidade
  consumo_kwh?: number | null;
}

export default function SolicitarPropostaDefinitiva() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { configs } = useConfiguracoes();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [propostaInicial, setPropostaInicial] = useState<PropostaInicial | null>(null);

  // AI extraction state
  const [showManualForm, setShowManualForm] = useState(false);
  const [aiExtracted, setAiExtracted] = useState(false);
  const [extractedFields, setExtractedFields] = useState<Set<string>>(new Set());
  const [documentUrls, setDocumentUrls] = useState<{ identificacao: string; contaLuz: string } | null>(null);

  // Form state
  const [tipoPessoa, setTipoPessoa] = useState<'PF' | 'PJ'>('PF');
  const [isPJFromPropostaInicial, setIsPJFromPropostaInicial] = useState(false);
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [numeroInstalacao, setNumeroInstalacao] = useState('');
  const [numeroUcs, setNumeroUcs] = useState(1);
  const [tipoInstalacao, setTipoInstalacao] = useState('Monofásico');
  const [consumoMedioReal, setConsumoMedioReal] = useState<number | undefined>();
  const [consumoMediaAnual, setConsumoMediaAnual] = useState<number | undefined>();
  const [consumoMediaTrimestral, setConsumoMediaTrimestral] = useState<number | undefined>();
  const [consumoUltimoMes, setConsumoUltimoMes] = useState<number | undefined>();
  const [historicoConsumo, setHistoricoConsumo] = useState<HistoricoConsumoItem[]>([]);
  const [concessionaria, setConcessionaria] = useState<string | undefined>();
  const [nomeRetificado, setNomeRetificado] = useState<string | undefined>();
  
  // Novos campos extraídos dos documentos
  const [dataNascimento, setDataNascimento] = useState<string | undefined>();
  const [rgNumero, setRgNumero] = useState<string | undefined>();
  const [rgOrgaoEmissor, setRgOrgaoEmissor] = useState<string | undefined>();
  const [rgDataEmissao, setRgDataEmissao] = useState<string | undefined>();
  const [cnhNumero, setCnhNumero] = useState<string | undefined>();
  const [cnhCategoria, setCnhCategoria] = useState<string | undefined>();
  const [cnhValidade, setCnhValidade] = useState<string | undefined>();
  const [nomeMae, setNomeMae] = useState<string | undefined>();
  const [nomePai, setNomePai] = useState<string | undefined>();
  const [naturalidade, setNaturalidade] = useState<string | undefined>();
  const [nacionalidade, setNacionalidade] = useState<string | undefined>();
  const [telefoneContato, setTelefoneContato] = useState<string | undefined>();
  const [emailContato, setEmailContato] = useState<string | undefined>();
  const [numeroCliente, setNumeroCliente] = useState<string | undefined>();
  const [valorFatura, setValorFatura] = useState<number | undefined>();
  const [classeConsumo, setClasseConsumo] = useState<string | undefined>();
  
  // Campos especiais CEMIG
  const [cipValor, setCipValor] = useState<number | undefined>();
  const [recebeEnergiaExterna, setRecebeEnergiaExterna] = useState<boolean | undefined>();
  const [energiaSceeKwh, setEnergiaSceeKwh] = useState<number | undefined>();
  const [temSaldoGeracao, setTemSaldoGeracao] = useState<boolean | undefined>();
  const [saldoGeracaoKwh, setSaldoGeracaoKwh] = useState<number | undefined>();

  // Document uploads (for manual mode)
  const [documentoIdentificacaoUrl, setDocumentoIdentificacaoUrl] = useState('');
  const [contaLuzUrl, setContaLuzUrl] = useState('');
  const [contratoSocialUrl, setContratoSocialUrl] = useState('');
  const [dadosEmpresaPjId, setDadosEmpresaPjId] = useState<string | null>(null);

  // Data comparison state
  const [extractedDataForComparison, setExtractedDataForComparison] = useState<ExtractedDataForComparison | null>(null);
  const [divergencesToSubmit, setDivergencesToSubmit] = useState<DataDivergence[]>([]);

  // Fraud detection state
  const [fraudDetected, setFraudDetected] = useState(false);
  const [fraudData, setFraudData] = useState<{
    cpfIdentificacao: string | null;
    cpfCnpjConta: string | null;
  } | null>(null);
  const [isPJWarning, setIsPJWarning] = useState(false);

  // Use data comparison hook
  const comparison = useDataComparison(
    propostaInicial ? {
      cliente_nome: propostaInicial.cliente_nome,
      cliente_cpf_cnpj: propostaInicial.cliente_cpf_cnpj,
      cliente_endereco: propostaInicial.cliente_endereco,
      cliente_cep: propostaInicial.cliente_cep,
      cliente_cidade: propostaInicial.cliente_cidade,
      cliente_uf: propostaInicial.cliente_uf,
      consumo_medio: propostaInicial.consumo_medio,
      tipo_instalacao: propostaInicial.tipo_instalacao,
    } : null,
    extractedDataForComparison
  );

  // Fetch proposal data via edge function (no direct DB access needed for anonymous users)
  useEffect(() => {
    async function fetchProposta() {
      if (!id) return;

      // Validate UUID format
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
        console.error('Error fetching proposal:', error);
        toast.error('Proposta não encontrada');
        setLoading(false);
        return;
      }

      const data = result.proposal;
      setPropostaInicial(data);
      
      // Pre-fill form with existing data (but don't mark as AI extracted)
      if (data.cliente_cpf_cnpj) {
        setCpfCnpj(data.cliente_cpf_cnpj);
        const docType = getDocumentType(data.cliente_cpf_cnpj);
        if (docType === 'CNPJ') {
          setTipoPessoa('PJ');
          setIsPJFromPropostaInicial(true);
        }
      }
      if (data.cliente_cep) setCep(data.cliente_cep);
      if (data.cliente_endereco) setEndereco(data.cliente_endereco);
      if (data.cliente_cidade) setCidade(data.cliente_cidade);
      if (data.cliente_uf) setUf(data.cliente_uf);
      if (data.tipo_instalacao) setTipoInstalacao(data.tipo_instalacao);
      if (data.numero_ucs) setNumeroUcs(data.numero_ucs);

      setLoading(false);
    }

    fetchProposta();
  }, [id]);

  // Auto-fill address from CEP
  useEffect(() => {
    async function buscarEndereco() {
      if (isCEPComplete(cep)) {
        const address = await fetchAddressByCEP(cep);
        if (address) {
          const logradouroCep = address.logradouro?.trim();
          const bairroCep = address.bairro?.trim();
          const cidadeCep = address.localidade?.trim();
          const ufCep = address.uf?.trim();

          // Preserva endereço extraído da conta de luz e só preenche com CEP quando estiver vazio
          if (logradouroCep) {
            setEndereco((prev) => (prev?.trim() ? prev : logradouroCep));
          } else if (bairroCep) {
            setEndereco((prev) => (prev?.trim() ? prev : bairroCep));
          }

          if (cidadeCep) setCidade(cidadeCep);
          if (ufCep) setUf(ufCep);
        }
      }
    }
    buscarEndereco();
  }, [cep]);

  // Handle AI extraction complete
  const handleExtractionComplete = (data: ExtractedData, urls: { identificacao: string; contaLuz: string }) => {
    const newExtractedFields = new Set<string>();

    // Set tipo_pessoa first
    if (data.tipo_pessoa) {
      setTipoPessoa(data.tipo_pessoa);
      newExtractedFields.add('tipoPessoa');
    }

    // Set CPF/CNPJ
    if (data.cpf_cnpj_titular || data.cpf) {
      const doc = data.cpf_cnpj_titular || data.cpf || '';
      setCpfCnpj(formatCpfCnpj(doc));
      newExtractedFields.add('cpfCnpj');
    }

    // Set address fields
    if (data.cep) {
      setCep(formatCEP(data.cep));
      newExtractedFields.add('cep');
    }
    const enderecoPartesFallback = [
      [data.logradouro?.trim(), data.numero_endereco?.trim()].filter(Boolean).join(', '),
      data.complemento?.trim(),
      data.bairro?.trim(),
    ].filter((parte): parte is string => Boolean(parte && parte.length > 0));

    const enderecoFinal = data.endereco?.trim()
      || (enderecoPartesFallback.length > 0 ? enderecoPartesFallback.join(' - ') : null);

    if (enderecoFinal) {
      setEndereco(enderecoFinal);
      newExtractedFields.add('endereco');
    }
    if (data.cidade) {
      setCidade(data.cidade);
      newExtractedFields.add('cidade');
    }
    if (data.uf) {
      setUf(data.uf.toUpperCase());
      newExtractedFields.add('uf');
    }

    // Set installation data
    if (data.numero_uc) {
      setNumeroInstalacao(data.numero_uc);
      newExtractedFields.add('numeroInstalacao');
    }
    if (data.tipo_instalacao) {
      setTipoInstalacao(data.tipo_instalacao);
      newExtractedFields.add('tipoInstalacao');
    }

    // Novos campos de consumo
    if (data.historico_consumo && data.historico_consumo.length > 0) {
      setHistoricoConsumo(data.historico_consumo);
      newExtractedFields.add('historicoConsumo');
      
      // Calcular médias localmente se a IA não calculou (fallback)
      const consumos = data.historico_consumo.map(h => h.consumo_kwh);
      
      // Último mês (mais recente = último do array)
      const ultimoMes = consumos[consumos.length - 1];
      if (!data.consumo_ultimo_mes && ultimoMes) {
        data.consumo_ultimo_mes = ultimoMes;
      }
      
      // Média anual (todos os meses disponíveis)
      if (!data.consumo_media_anual && consumos.length > 0) {
        const soma = consumos.reduce((acc, val) => acc + val, 0);
        data.consumo_media_anual = Math.round(soma / consumos.length);
      }
      
      // Média trimestral (últimos 3 meses)
      if (!data.consumo_media_trimestral && consumos.length >= 3) {
        const ultimos3 = consumos.slice(-3);
        const somaTri = ultimos3.reduce((acc, val) => acc + val, 0);
        data.consumo_media_trimestral = Math.round(somaTri / 3);
      }
    }

    if (data.consumo_media_anual) {
      setConsumoMediaAnual(data.consumo_media_anual);
      newExtractedFields.add('consumoMediaAnual');
    }

    if (data.consumo_media_trimestral) {
      setConsumoMediaTrimestral(data.consumo_media_trimestral);
      newExtractedFields.add('consumoMediaTrimestral');
    }

    if (data.consumo_ultimo_mes) {
      setConsumoUltimoMes(data.consumo_ultimo_mes);
      // IMPORTANTE: O campo de consumo médio é preenchido com o consumo do último mês
      setConsumoMedioReal(data.consumo_ultimo_mes);
      newExtractedFields.add('consumoUltimoMes');
      newExtractedFields.add('consumoMedioReal');
    }

    // Retrocompatibilidade: se não tiver consumo_ultimo_mes mas tiver consumo_kwh
    if (!data.consumo_ultimo_mes && data.consumo_kwh) {
      setConsumoMedioReal(data.consumo_kwh);
      newExtractedFields.add('consumoMedioReal');
    }

    // Concessionária extraída do logo/nome
    if (data.concessionaria) {
      setConcessionaria(data.concessionaria);
      newExtractedFields.add('concessionaria');
    }

    // Nome completo retificado (para enviar ao Bitrix24)
    if (data.nome_completo) {
      setNomeRetificado(data.nome_completo);
      newExtractedFields.add('nomeRetificado');
    }

    // ========== NOVOS CAMPOS EXTRAÍDOS ==========
    
    // Dados adicionais do RG/CNH
    if (data.data_nascimento) {
      setDataNascimento(data.data_nascimento);
      newExtractedFields.add('dataNascimento');
    }
    if (data.rg_numero) {
      setRgNumero(data.rg_numero);
      newExtractedFields.add('rgNumero');
    }
    if (data.rg_orgao_emissor) {
      setRgOrgaoEmissor(data.rg_orgao_emissor);
      newExtractedFields.add('rgOrgaoEmissor');
    }
    if (data.rg_data_emissao) {
      setRgDataEmissao(data.rg_data_emissao);
      newExtractedFields.add('rgDataEmissao');
    }
    if (data.cnh_numero) {
      setCnhNumero(data.cnh_numero);
      newExtractedFields.add('cnhNumero');
    }
    if (data.cnh_categoria) {
      setCnhCategoria(data.cnh_categoria);
      newExtractedFields.add('cnhCategoria');
    }
    if (data.cnh_validade) {
      setCnhValidade(data.cnh_validade);
      newExtractedFields.add('cnhValidade');
    }
    if (data.nome_mae) {
      setNomeMae(data.nome_mae);
      newExtractedFields.add('nomeMae');
    }
    if (data.nome_pai) {
      setNomePai(data.nome_pai);
      newExtractedFields.add('nomePai');
    }
    if (data.naturalidade) {
      setNaturalidade(data.naturalidade);
      newExtractedFields.add('naturalidade');
    }
    if (data.nacionalidade) {
      setNacionalidade(data.nacionalidade);
      newExtractedFields.add('nacionalidade');
    }
    
    // Dados adicionais da fatura
    if (data.telefone_contato) {
      setTelefoneContato(data.telefone_contato);
      newExtractedFields.add('telefoneContato');
    }
    if (data.email_contato) {
      setEmailContato(data.email_contato);
      newExtractedFields.add('emailContato');
    }
    if (data.numero_cliente) {
      setNumeroCliente(data.numero_cliente);
      newExtractedFields.add('numeroCliente');
    }
    if (data.valor_fatura) {
      setValorFatura(data.valor_fatura);
      newExtractedFields.add('valorFatura');
    }
    if (data.classe_consumo) {
      setClasseConsumo(data.classe_consumo);
      newExtractedFields.add('classeConsumo');
    }
    
    // ========== CAMPOS ESPECIAIS CEMIG ==========
    if (data.cip_valor !== undefined && data.cip_valor !== null) {
      setCipValor(data.cip_valor);
      newExtractedFields.add('cipValor');
    }
    if (data.recebe_energia_externa !== undefined && data.recebe_energia_externa !== null) {
      setRecebeEnergiaExterna(data.recebe_energia_externa);
      newExtractedFields.add('recebeEnergiaExterna');
    }
    if (data.energia_scee_kwh !== undefined && data.energia_scee_kwh !== null) {
      setEnergiaSceeKwh(data.energia_scee_kwh);
      newExtractedFields.add('energiaSceeKwh');
    }
    if (data.tem_saldo_geracao !== undefined && data.tem_saldo_geracao !== null) {
      setTemSaldoGeracao(data.tem_saldo_geracao);
      newExtractedFields.add('temSaldoGeracao');
    }
    if (data.saldo_geracao_kwh !== undefined && data.saldo_geracao_kwh !== null) {
      setSaldoGeracaoKwh(data.saldo_geracao_kwh);
      newExtractedFields.add('saldoGeracaoKwh');
    }

    // Set document URLs
    setDocumentUrls(urls);
    setDocumentoIdentificacaoUrl(urls.identificacao);
    setContaLuzUrl(urls.contaLuz);

    setExtractedFields(newExtractedFields);
    setAiExtracted(true);
    setShowManualForm(true);

    // Store extracted data for comparison
    setExtractedDataForComparison(data as ExtractedDataForComparison);
    
    // Check for PJ warning from extracted data
    if (data.tipo_pessoa === 'PJ') {
      setIsPJWarning(true);
    }
  };

  // Handle PJ extraction complete (from DocumentUploadPJ)
  const handlePJExtractionComplete = useCallback(async (data: {
    empresa: {
      razao_social: string | null;
      cnpj: string | null;
      nire: string | null;
      inscricao_estadual: string | null;
      natureza_juridica: string | null;
      objeto_social: string | null;
      data_constituicao: string | null;
      sede_logradouro: string | null;
      sede_numero: string | null;
      sede_complemento: string | null;
      sede_bairro: string | null;
      sede_cidade: string | null;
      sede_uf: string | null;
      sede_cep: string | null;
      quadro_societario: any[];
      admin_nome_completo: string | null;
      admin_cpf: string | null;
      admin_rg: string | null;
      admin_rg_orgao: string | null;
      admin_data_nascimento: string | null;
      admin_estado_civil: string | null;
      admin_profissao: string | null;
      admin_nacionalidade: string | null;
      admin_endereco: string | null;
      admin_cidade: string | null;
      admin_uf: string | null;
      admin_cep: string | null;
    };
    contaLuz: {
      numero_uc: string | null;
      cpf_cnpj_titular: string | null;
      endereco: string | null;
      cep: string | null;
      cidade: string | null;
      uf: string | null;
      tipo_instalacao: string | null;
      concessionaria: string | null;
      consumo_media_anual: number | null;
      consumo_media_trimestral: number | null;
      consumo_ultimo_mes: number | null;
      cip_valor: number | null;
    };
    adminValidado: boolean;
    documentUrls: {
      contratoSocial: string;
      identificacaoAdmin: string;
      contaLuz: string;
    };
  }) => {
    const newExtractedFields = new Set<string>();

    // Set tipo_pessoa to PJ
    setTipoPessoa('PJ');
    newExtractedFields.add('tipoPessoa');

    // Set CNPJ from contract
    if (data.empresa.cnpj) {
      setCpfCnpj(formatCpfCnpj(data.empresa.cnpj));
      newExtractedFields.add('cpfCnpj');
    }

    // Set address from bill (priority) or company sede
    if (data.contaLuz.cep) {
      setCep(formatCEP(data.contaLuz.cep));
      newExtractedFields.add('cep');
    } else if (data.empresa.sede_cep) {
      setCep(formatCEP(data.empresa.sede_cep));
      newExtractedFields.add('cep');
    }

    if (data.contaLuz.endereco) {
      setEndereco(data.contaLuz.endereco);
      newExtractedFields.add('endereco');
    } else if (data.empresa.sede_logradouro) {
      const enderecoPJ = [
        data.empresa.sede_logradouro,
        data.empresa.sede_numero,
        data.empresa.sede_bairro
      ].filter(Boolean).join(', ');
      setEndereco(enderecoPJ);
      newExtractedFields.add('endereco');
    }

    if (data.contaLuz.cidade) {
      setCidade(data.contaLuz.cidade);
      newExtractedFields.add('cidade');
    } else if (data.empresa.sede_cidade) {
      setCidade(data.empresa.sede_cidade);
      newExtractedFields.add('cidade');
    }

    if (data.contaLuz.uf) {
      setUf(data.contaLuz.uf.toUpperCase());
      newExtractedFields.add('uf');
    } else if (data.empresa.sede_uf) {
      setUf(data.empresa.sede_uf.toUpperCase());
      newExtractedFields.add('uf');
    }

    // Set installation data from bill
    if (data.contaLuz.numero_uc) {
      setNumeroInstalacao(data.contaLuz.numero_uc);
      newExtractedFields.add('numeroInstalacao');
    }
    if (data.contaLuz.tipo_instalacao) {
      setTipoInstalacao(data.contaLuz.tipo_instalacao);
      newExtractedFields.add('tipoInstalacao');
    }
    if (data.contaLuz.concessionaria) {
      setConcessionaria(data.contaLuz.concessionaria);
      newExtractedFields.add('concessionaria');
    }

    // Set consumption data
    if (data.contaLuz.consumo_media_anual) {
      setConsumoMediaAnual(data.contaLuz.consumo_media_anual);
      newExtractedFields.add('consumoMediaAnual');
    }
    if (data.contaLuz.consumo_media_trimestral) {
      setConsumoMediaTrimestral(data.contaLuz.consumo_media_trimestral);
      newExtractedFields.add('consumoMediaTrimestral');
    }
    if (data.contaLuz.consumo_ultimo_mes) {
      setConsumoUltimoMes(data.contaLuz.consumo_ultimo_mes);
      setConsumoMedioReal(data.contaLuz.consumo_ultimo_mes);
      newExtractedFields.add('consumoUltimoMes');
      newExtractedFields.add('consumoMedioReal');
    }

    // Set CIP
    if (data.contaLuz.cip_valor) {
      setCipValor(data.contaLuz.cip_valor);
      newExtractedFields.add('cipValor');
    }

    // Set company name for rectification
    if (data.empresa.razao_social) {
      setNomeRetificado(data.empresa.razao_social);
      newExtractedFields.add('nomeRetificado');
    }

    // Set document URLs
    setDocumentUrls({
      identificacao: data.documentUrls.identificacaoAdmin,
      contaLuz: data.documentUrls.contaLuz
    });
    setDocumentoIdentificacaoUrl(data.documentUrls.identificacaoAdmin);
    setContaLuzUrl(data.documentUrls.contaLuz);
    setContratoSocialUrl(data.documentUrls.contratoSocial);

    // Save PJ company data to database
    try {
      const { data: insertedData, error } = await supabase
        .from('dados_empresa_pj')
        .insert({
          proposta_id: id,
          razao_social: data.empresa.razao_social || 'Não informada',
          cnpj: data.empresa.cnpj || '',
          nire: data.empresa.nire,
          inscricao_estadual: data.empresa.inscricao_estadual,
          natureza_juridica: data.empresa.natureza_juridica,
          objeto_social: data.empresa.objeto_social,
          data_constituicao: data.empresa.data_constituicao,
          sede_logradouro: data.empresa.sede_logradouro,
          sede_numero: data.empresa.sede_numero,
          sede_complemento: data.empresa.sede_complemento,
          sede_bairro: data.empresa.sede_bairro,
          sede_cidade: data.empresa.sede_cidade,
          sede_uf: data.empresa.sede_uf,
          sede_cep: data.empresa.sede_cep,
          quadro_societario: data.empresa.quadro_societario || [],
          admin_nome_completo: data.empresa.admin_nome_completo || 'Não informado',
          admin_cpf: data.empresa.admin_cpf || '',
          admin_rg: data.empresa.admin_rg,
          admin_rg_orgao: data.empresa.admin_rg_orgao,
          admin_data_nascimento: data.empresa.admin_data_nascimento,
          admin_estado_civil: data.empresa.admin_estado_civil,
          admin_profissao: data.empresa.admin_profissao,
          admin_nacionalidade: data.empresa.admin_nacionalidade,
          admin_endereco: data.empresa.admin_endereco,
          admin_cidade: data.empresa.admin_cidade,
          admin_uf: data.empresa.admin_uf,
          admin_cep: data.empresa.admin_cep,
          contrato_social_url: data.documentUrls.contratoSocial
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error saving PJ data:', error);
        toast.error('Erro ao salvar dados da empresa. Tente novamente.');
      } else if (insertedData) {
        setDadosEmpresaPjId(insertedData.id);
        console.log('PJ data saved with ID:', insertedData.id);
      }
    } catch (err) {
      console.error('Error saving PJ data:', err);
    }

    setExtractedFields(newExtractedFields);
    setAiExtracted(true);
    setShowManualForm(true);
  }, [id]);

  // Handle fraud detection callback
  const handleFraudDetected = useCallback((data: { 
    cpfIdentificacao: string | null; 
    cpfCnpjConta: string | null; 
    dadosExtraidos: any;
  }) => {
    setFraudDetected(true);
    setFraudData({
      cpfIdentificacao: data.cpfIdentificacao,
      cpfCnpjConta: data.cpfCnpjConta
    });
  }, []);

  // Reset fraud state for retry
  const handleRetryDocuments = useCallback(() => {
    setFraudDetected(false);
    setFraudData(null);
    setIsPJWarning(false);
    setShowManualForm(false);
    setAiExtracted(false);
    setDocumentUrls(null);
    setDocumentoIdentificacaoUrl('');
    setContaLuzUrl('');
    setExtractedFields(new Set());
    setExtractedDataForComparison(null);
  }, []);

  // Handle contact support
  const handleContactSupport = useCallback(() => {
    const message = encodeURIComponent(configs.whatsapp_suporte_mensagem);
    window.open(`https://wa.me/${configs.whatsapp_suporte_numero}?text=${message}`, '_blank');
  }, [configs.whatsapp_suporte_numero, configs.whatsapp_suporte_mensagem]);

  // Validation - block if fraud detected
  const isFormValid = useMemo(() => {
    // Block form if fraud detected
    if (fraudDetected) return false;
    
    const hasDocuments = documentoIdentificacaoUrl && contaLuzUrl;
    
    const hasBasicFields = 
      cpfCnpj && isValidCpfCnpj(cpfCnpj) &&
      cep && isCEPComplete(cep) &&
      numeroInstalacao &&
      hasDocuments;

    if (tipoPessoa === 'PJ') {
      return hasBasicFields && contratoSocialUrl;
    }

    return hasBasicFields;
  }, [cpfCnpj, cep, endereco, numeroInstalacao, documentoIdentificacaoUrl, contaLuzUrl, tipoPessoa, contratoSocialUrl, fraudDetected]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propostaInicial || !isFormValid) return;

    setSubmitting(true);

    try {
      // Prepare divergence data for audit
      const divergenciasParaSalvar = comparison.hasDivergences 
        ? comparison.divergences.map(d => ({
            campo: d.campo,
            campoLabel: d.campoLabel,
            valorOriginal: d.valorOriginal,
            valorExtraido: d.valorExtraido,
            tipo: d.tipo
          }))
        : null;

      // 1. Save the request locally first (for history) - including divergences
      const { error: insertError } = await supabase
        .from('solicitacoes_proposta_definitiva')
        .insert({
          proposta_inicial_id: propostaInicial.id,
          cliente_nome: nomeRetificado || propostaInicial.cliente_nome,
          cliente_email: propostaInicial.cliente_email,
          cliente_telefone: propostaInicial.cliente_telefone,
          cliente_cpf_cnpj: cpfCnpj,
          cliente_endereco: endereco,
          cliente_cep: cep,
          cliente_cidade: cidade,
          cliente_uf: uf,
          numero_instalacao: numeroInstalacao,
          numero_ucs: numeroUcs,
          tipo_instalacao: tipoInstalacao,
          consumo_medio_real: consumoMedioReal,
          documento_identificacao_url: documentoIdentificacaoUrl,
          conta_luz_url: contaLuzUrl,
          contrato_social_url: tipoPessoa === 'PJ' ? contratoSocialUrl : null,
          tipo_pessoa: tipoPessoa,
          status: 'pendente',
          divergencias_detectadas: divergenciasParaSalvar,
          dados_retificados: comparison.hasDivergences,
          nome_retificado: nomeRetificado,
          concessionaria: concessionaria
        });

      if (insertError) throw insertError;

      // 2. Update proposta_assinante with dados_pj_id if PJ
      if (tipoPessoa === 'PJ' && dadosEmpresaPjId) {
        await supabase
          .from('propostas_assinantes')
          .update({ dados_pj_id: dadosEmpresaPjId })
          .eq('id', propostaInicial.id);
      }

      // 3. Update Bitrix24 and move lead to definitive proposal stage
      // Timeout de 30s para evitar spinner infinito (ex: erro CORS silencioso)
      const bitrixPromise = supabase.functions.invoke('bitrix24-update-lead', {
        body: {
          propostaInicialId: propostaInicial.id,
          dados: {
            cpf_cnpj: cpfCnpj,
            endereco: endereco,
            cep: cep,
            cidade: cidade,
            uf: uf,
            numero_instalacao: numeroInstalacao,
            numero_ucs: numeroUcs,
            tipo_instalacao: tipoInstalacao,
            consumo_medio_real: consumoMedioReal,
            tipo_pessoa: tipoPessoa,
            desconto_percentual: Number(searchParams.get('desconto')) || propostaInicial.desconto_percentual,
            fidelidade_anos: Number(searchParams.get('fidelidade')) || propostaInicial.fidelidade_anos,
            documento_identificacao_url: documentoIdentificacaoUrl,
            conta_luz_url: contaLuzUrl,
            contrato_social_url: tipoPessoa === 'PJ' ? contratoSocialUrl : null,
            nome_retificado: nomeRetificado,
            concessionaria: concessionaria,
            divergencias: comparison.hasDivergences ? comparison.divergences : null,
            data_nascimento: dataNascimento,
            rg_numero: rgNumero,
            rg_orgao_emissor: rgOrgaoEmissor,
            rg_data_emissao: rgDataEmissao,
            cnh_numero: cnhNumero,
            cnh_categoria: cnhCategoria,
            cnh_validade: cnhValidade,
            nome_mae: nomeMae,
            nome_pai: nomePai,
            naturalidade: naturalidade,
            nacionalidade: nacionalidade,
            telefone_contato: telefoneContato,
            email_contato: emailContato,
            numero_cliente: numeroCliente,
            valor_fatura: valorFatura,
            classe_consumo: classeConsumo,
            cip_valor: cipValor,
            recebe_energia_externa: recebeEnergiaExterna,
            energia_scee_kwh: energiaSceeKwh,
            tem_saldo_geracao: temSaldoGeracao,
            saldo_geracao_kwh: saldoGeracaoKwh
          }
        }
      });

      const timeoutPromise = new Promise<{ data: null; error: Error }>((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT_30S')), 30000)
      );

      try {
        const { data: bitrixResult, error: bitrixError } = await Promise.race([bitrixPromise, timeoutPromise]);

        if (bitrixError || bitrixResult?.error) {
          console.warn('Bitrix24 update warning:', bitrixError || bitrixResult?.error);
        }

        // Move lead to "Aguardando Assinatura - ClickSign" stage in Bitrix24
        try {
          await supabase.functions.invoke('bitrix24-sync', {
            body: { action: 'update_status', proposalId: propostaInicial.id, status: 'aceita' },
          });
        } catch (syncErr) {
          console.warn('Bitrix24 stage sync warning:', syncErr);
        }

        setSubmitting(false);
        setSubmitted(true);
      } catch (timeoutOrNetworkError: any) {
        console.error('[SolicitarPropostaDefinitiva] Timeout ou erro de rede na chamada ao backend:', timeoutOrNetworkError?.message);
        // Dados já foram salvos localmente (passo 1). Mostrar tela de sucesso mesmo assim.
        setSubmitting(false);
        setSubmitted(true);
      }
    } catch (error) {
      console.error('Error submitting request:', error);
      toast.error('Erro ao enviar solicitação. Tente novamente.');
      setSubmitting(false);
    }
  };

  const isFieldExtracted = (fieldName: string) => extractedFields.has(fieldName);

  const FieldWrapper = ({ fieldName, children }: { fieldName: string; children: React.ReactNode }) => (
    <div className="relative">
      {children}
      {isFieldExtracted(fieldName) && (
        <div className="absolute -top-1 -right-1">
          <span className="flex items-center gap-0.5 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
            <Sparkles className="h-2.5 w-2.5" />
            IA
          </span>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50">
        <Loader2 className="h-12 w-12 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!propostaInicial) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8">
            <h2 className="text-2xl font-bold mb-2">Proposta não encontrada</h2>
            <p className="text-muted-foreground">
              O link pode estar incorreto ou a proposta foi removida.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Processing screen with animated progress - shown during submission
  if (submitting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
        <motion.div 
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Animated spinning loader */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="mb-6"
          >
            <Loader2 className="h-16 w-16 text-emerald-600 mx-auto" />
          </motion.div>
          
          <h2 className="text-2xl font-bold text-emerald-700 mb-2">
            Finalizando sua solicitação...
          </h2>
          <p className="text-muted-foreground mb-4">
            Aguarde, você será redirecionado automaticamente.
          </p>
          
          {/* Animated progress bar */}
          <motion.div 
            className="w-64 h-2 bg-emerald-100 rounded-full overflow-hidden mx-auto"
          >
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
              initial={{ width: "0%" }}
              animate={{ width: "95%" }}
              transition={{ duration: 15, ease: "easeOut" }}
            />
          </motion.div>
          
          <p className="text-xs text-muted-foreground mt-4">
            ⏱️ Validando documentos e sincronizando dados...
          </p>
        </motion.div>
      </div>
    );
  }

  // Fallback static screen - only shown if bitrix24 had errors
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 p-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', duration: 0.5 }}
          className="max-w-md w-full text-center"
        >
          <Card className="shadow-xl border-0">
            <CardContent className="pt-10 pb-10 px-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.2, stiffness: 200 }}
                className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6"
              >
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              </motion.div>

              <h2 className="text-2xl font-bold mb-3 text-gray-900">
                Parabéns, {propostaInicial.cliente_nome?.split(' ')[0]}!
              </h2>
              <p className="text-gray-600 mb-6 leading-relaxed">
                Seus dados foram enviados com sucesso. Em pouco tempo você vai começar a <strong className="text-emerald-600">economizar na sua conta de energia</strong>.
              </p>

              <div className="bg-emerald-50 rounded-xl p-5 mb-6 border border-emerald-100">
                <div className="flex items-center gap-2 justify-center mb-3">
                  <Zap className="h-5 w-5 text-emerald-600" />
                  <h3 className="font-semibold text-emerald-800">Próximos passos</h3>
                </div>
                <ul className="text-sm text-emerald-700 space-y-3 text-left">
                  <li className="flex items-start gap-2">
                    <span className="bg-emerald-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                    <span>Nosso time vai analisar seus documentos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-emerald-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                    <span>Você receberá o contrato para assinatura via <strong>WhatsApp</strong> ou <strong>e-mail</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-emerald-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                    <span>Após a assinatura, seu desconto começa a valer!</span>
                  </li>
                </ul>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                <p className="text-sm text-gray-600 mb-3">
                  Ficou com alguma dúvida? Fale com a <strong>sofIA</strong>, nossa assistente virtual:
                </p>
                <a
                  href="https://wa.me/5531953470438?text=Olá! Acabei de enviar meus documentos para o contrato COESA e gostaria de saber mais."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-3 rounded-xl transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.243-1.216l-.257-.154-2.426.636.636-2.426-.154-.257A8 8 0 1112 20z"/></svg>
                  Falar com a sofIA
                </a>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <CoesaLogo variant="green" className="h-12" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Solicitar Contrato
          </h1>
          <p className="text-gray-600">
            {aiExtracted 
              ? 'Confira os dados extraídos pela IA e complete as informações faltantes'
              : 'Envie seus documentos e nossa IA preencherá o formulário automaticamente'
            }
          </p>
          <div className="mt-4 inline-block bg-emerald-100 rounded-full px-4 py-2">
            <span className="text-emerald-800 font-medium">{propostaInicial.cliente_nome}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Fraud Alert - Blocks entire form */}
          {fraudDetected && fraudData && (
            <FraudAlert
              cpfIdentificacao={fraudData.cpfIdentificacao}
              cpfCnpjConta={fraudData.cpfCnpjConta}
              onRetry={handleRetryDocuments}
              onContactSupport={handleContactSupport}
            />
          )}

          {/* AI Document Upload - First step (hidden when fraud detected) */}
          {!showManualForm && !fraudDetected && (
            isPJFromPropostaInicial ? (
              <DocumentUploadPJ
                propostaId={propostaInicial.id}
                onExtractionComplete={handlePJExtractionComplete}
                onManualMode={() => setShowManualForm(true)}
              />
            ) : (
              <DocumentUploadWithAI
                propostaId={propostaInicial.id}
                onExtractionComplete={handleExtractionComplete}
                onManualMode={() => setShowManualForm(true)}
                onFraudDetected={handleFraudDetected}
              />
            )
          )}

          {/* Form fields - shown after AI extraction or manual mode */}
          <AnimatePresence>
            {showManualForm && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="space-y-6"
              >
                {/* AI Extraction Banner */}
                {aiExtracted && (
                  <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
                    <CardContent className="py-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-full">
                          <Sparkles className="h-5 w-5 text-purple-600" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-purple-900">Dados extraídos com sucesso!</p>
                          <p className="text-sm text-purple-700">
                            Campos marcados com <Sparkles className="h-3 w-3 inline" /> foram preenchidos pela IA. Verifique e corrija se necessário.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Divergence Alert - Shows when AI data differs from original */}
                {aiExtracted && comparison.hasDivergences && (
                  <DataDivergenceAlert comparison={comparison} />
                )}

                {/* PJ Warning Alert - Shows when account is in CNPJ */}
                {isPJWarning && extractedDataForComparison && (
                  <PJWarningAlert
                    cpfIdentificacao={extractedDataForComparison.cpf || null}
                    cnpjConta={extractedDataForComparison.cpf_cnpj_titular || null}
                  />
                )}

                {/* Tipo de Pessoa */}
                <Card className={cn(isFieldExtracted('tipoPessoa') && "ring-2 ring-emerald-200")}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5 text-emerald-600" />
                      Tipo de Pessoa
                      {isFieldExtracted('tipoPessoa') && (
                        <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> Detectado pela IA
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RadioGroup
                      value={tipoPessoa}
                      onValueChange={(v) => setTipoPessoa(v as 'PF' | 'PJ')}
                      className="flex gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="PF" id="pf" />
                        <Label htmlFor="pf" className="flex items-center gap-2 cursor-pointer">
                          <User className="h-4 w-4" />
                          Pessoa Física
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="PJ" id="pj" />
                        <Label htmlFor="pj" className="flex items-center gap-2 cursor-pointer">
                          <Building2 className="h-4 w-4" />
                          Pessoa Jurídica
                        </Label>
                      </div>
                    </RadioGroup>
                  </CardContent>
                </Card>

                {/* Dados do Cliente */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-emerald-600" />
                      Dados Complementares
                    </CardTitle>
                    <CardDescription>
                      Complete ou confirme seus dados cadastrais
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FieldWrapper fieldName="cpfCnpj">
                      <Label htmlFor="cpf_cnpj">
                        {tipoPessoa === 'PF' ? 'CPF' : 'CNPJ'} <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="cpf_cnpj"
                        value={cpfCnpj}
                        onChange={(e) => setCpfCnpj(formatCpfCnpj(e.target.value))}
                        placeholder={tipoPessoa === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                        maxLength={tipoPessoa === 'PF' ? 14 : 18}
                        className={cn(
                          cpfCnpj && !isValidCpfCnpj(cpfCnpj) && 'border-red-500',
                          isFieldExtracted('cpfCnpj') && 'border-emerald-300 bg-emerald-50/50'
                        )}
                      />
                      {cpfCnpj && !isValidCpfCnpj(cpfCnpj) && (
                        <p className="text-red-500 text-xs mt-1">Documento inválido</p>
                      )}
                    </FieldWrapper>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <FieldWrapper fieldName="cep">
                        <Label htmlFor="cep">CEP <span className="text-red-500">*</span></Label>
                        <Input
                          id="cep"
                          value={cep}
                          onChange={(e) => setCep(formatCEP(e.target.value))}
                          placeholder="00000-000"
                          maxLength={9}
                          className={cn(isFieldExtracted('cep') && 'border-emerald-300 bg-emerald-50/50')}
                        />
                      </FieldWrapper>
                      <div className="sm:col-span-2">
                        <FieldWrapper fieldName="endereco">
                          <Label htmlFor="endereco">Endereço <span className="text-red-500">*</span></Label>
                          <Input
                            id="endereco"
                            value={endereco}
                            onChange={(e) => setEndereco(e.target.value)}
                            placeholder="Rua, número, complemento"
                            className={cn(isFieldExtracted('endereco') && 'border-emerald-300 bg-emerald-50/50')}
                          />
                        </FieldWrapper>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FieldWrapper fieldName="cidade">
                        <Label htmlFor="cidade">Cidade</Label>
                        <Input
                          id="cidade"
                          value={cidade}
                          onChange={(e) => setCidade(e.target.value)}
                          placeholder="Cidade"
                          className={cn(isFieldExtracted('cidade') && 'border-emerald-300 bg-emerald-50/50')}
                        />
                      </FieldWrapper>
                      <FieldWrapper fieldName="uf">
                        <Label htmlFor="uf">UF</Label>
                        <Input
                          id="uf"
                          value={uf}
                          onChange={(e) => setUf(e.target.value)}
                          placeholder="UF"
                          maxLength={2}
                          className={cn(isFieldExtracted('uf') && 'border-emerald-300 bg-emerald-50/50')}
                        />
                      </FieldWrapper>
                    </div>
                  </CardContent>
                </Card>

                {/* Dados da Instalação */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-emerald-600" />
                      Dados da Instalação
                    </CardTitle>
                    <CardDescription>
                      Informações da sua unidade consumidora
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FieldWrapper fieldName="numeroInstalacao">
                      <Label htmlFor="numero_instalacao">
                        Número da UC (Unidade Consumidora) <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="numero_instalacao"
                        value={numeroInstalacao}
                        onChange={(e) => setNumeroInstalacao(e.target.value)}
                        placeholder="Ex: 0012345678"
                        className={cn(isFieldExtracted('numeroInstalacao') && 'border-emerald-300 bg-emerald-50/50')}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Encontre este número na sua conta de luz
                      </p>
                    </FieldWrapper>

                    {/* Concessionária extraída */}
                    {concessionaria && (
                      <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
                          <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-blue-900 dark:text-blue-100">
                              {concessionaria}
                            </span>
                            <span className="flex items-center gap-0.5 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                              <Sparkles className="h-2.5 w-2.5" />
                              IA
                            </span>
                          </div>
                          <p className="text-xs text-blue-600 dark:text-blue-400">
                            Concessionária identificada na fatura
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="numero_ucs">Quantidade de UCs</Label>
                        <Input
                          id="numero_ucs"
                          type="number"
                          min={1}
                          max={99}
                          value={numeroUcs}
                          onChange={(e) => setNumeroUcs(parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <FieldWrapper fieldName="tipoInstalacao">
                        <Label htmlFor="tipo_instalacao">Tipo de Instalação</Label>
                        <Select value={tipoInstalacao} onValueChange={setTipoInstalacao}>
                          <SelectTrigger className={cn(isFieldExtracted('tipoInstalacao') && 'border-emerald-300 bg-emerald-50/50')}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Monofásico">Monofásico</SelectItem>
                            <SelectItem value="Bifásico">Bifásico</SelectItem>
                            <SelectItem value="Trifásico">Trifásico</SelectItem>
                          </SelectContent>
                        </Select>
                      </FieldWrapper>
                    </div>

                    {/* Métricas de Consumo extraídas pela IA */}
                    {(consumoMediaAnual || consumoMediaTrimestral || consumoUltimoMes) && (
                      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                        <div className="flex items-center gap-2 mb-3">
                          <Sparkles className="h-4 w-4 text-purple-600" />
                          <span className="text-sm font-medium text-purple-900 dark:text-purple-100">
                            Consumo extraído do histórico da fatura
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="text-center p-3 bg-white dark:bg-background rounded-lg border border-purple-100 dark:border-purple-800">
                            <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">
                              {consumoMediaAnual?.toFixed(0) ?? '-'}
                            </p>
                            <p className="text-xs text-muted-foreground">kWh/mês</p>
                            <p className="text-xs font-medium text-purple-600 mt-1">Média Anual</p>
                            <p className="text-[10px] text-muted-foreground">(12 meses)</p>
                          </div>
                          <div className="text-center p-3 bg-white dark:bg-background rounded-lg border border-purple-100 dark:border-purple-800">
                            <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">
                              {consumoMediaTrimestral?.toFixed(0) ?? '-'}
                            </p>
                            <p className="text-xs text-muted-foreground">kWh/mês</p>
                            <p className="text-xs font-medium text-purple-600 mt-1">Média Trimestral</p>
                            <p className="text-[10px] text-muted-foreground">(3 meses)</p>
                          </div>
                          <div className="text-center p-3 bg-white dark:bg-background rounded-lg border border-purple-100 dark:border-purple-800">
                            <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">
                              {consumoUltimoMes?.toFixed(0) ?? '-'}
                            </p>
                            <p className="text-xs text-muted-foreground">kWh</p>
                            <p className="text-xs font-medium text-purple-600 mt-1">Último Mês</p>
                            <p className="text-[10px] text-muted-foreground">(mais recente)</p>
                          </div>
                        </div>
                        {historicoConsumo.length > 0 && (
                          <p className="text-[10px] text-center text-muted-foreground mt-2">
                            Baseado em {historicoConsumo.length} meses de histórico
                          </p>
                        )}
                      </div>
                    )}

                    <FieldWrapper fieldName="consumoMedioReal">
                      <Label htmlFor="consumo_medio_real">
                        Consumo a utilizar na proposta (kWh) <span className="text-muted-foreground text-xs">(preenchido com último mês)</span>
                      </Label>
                      <Input
                        id="consumo_medio_real"
                        type="number"
                        min={0}
                        value={consumoMedioReal ?? ''}
                        onChange={(e) => setConsumoMedioReal(e.target.value ? parseFloat(e.target.value) : undefined)}
                        placeholder="Ex: 450"
                        className={cn(isFieldExtracted('consumoMedioReal') && 'border-emerald-300 bg-emerald-50/50')}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {consumoUltimoMes 
                          ? 'Preenchido com o consumo do último mês. Você pode alterar para a média anual ou outro valor.'
                          : 'Informe a média dos últimos 12 meses (verifique na conta de luz)'}
                      </p>
                    </FieldWrapper>
                  </CardContent>
                </Card>

                {/* Contrato Social (only for PJ) */}
                <AnimatePresence>
                  {tipoPessoa === 'PJ' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-emerald-600" />
                            Contrato Social
                          </CardTitle>
                          <CardDescription>
                            Obrigatório para Pessoa Jurídica
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="border-2 border-dashed rounded-lg p-6 text-center border-muted-foreground/25 hover:border-primary hover:bg-primary/5 cursor-pointer transition-all">
                            <input
                              type="file"
                              accept=".pdf"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  try {
                                    toast.loading('Enviando contrato social...', { id: 'contrato' });
                                    const fileExt = file.name.split('.').pop();
                                    const fileName = `solicitacoes/${id}/contrato-social/${Date.now()}.${fileExt}`;
                                    const { data, error } = await supabase.storage
                                      .from('documentos-clientes')
                                      .upload(fileName, file);
                                    if (error) throw error;
                                    setContratoSocialUrl(data.path);
                                    toast.success('Contrato enviado!', { id: 'contrato' });
                                  } catch (err) {
                                    toast.error('Erro ao enviar contrato', { id: 'contrato' });
                                  }
                                }
                              }}
                              className="hidden"
                              id="contrato-social-input"
                            />
                            <label htmlFor="contrato-social-input" className="cursor-pointer">
                              {contratoSocialUrl ? (
                                <div className="flex items-center justify-center gap-2 text-emerald-600">
                                  <CheckCircle2 className="h-8 w-8" />
                                  <span className="font-medium">Contrato Social enviado</span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-2">
                                  <FileText className="h-8 w-8 text-muted-foreground" />
                                  <span className="text-sm font-medium">Clique para enviar o Contrato Social</span>
                                  <span className="text-xs text-muted-foreground">Apenas PDF</span>
                                </div>
                              )}
                            </label>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Documents status */}
                {documentUrls && (
                  <Card className="bg-emerald-50/50 border-emerald-200">
                    <CardContent className="py-4">
                      <div className="flex items-center gap-2 text-emerald-700">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-medium">Documentos anexados:</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="text-xs bg-emerald-100 px-2 py-1 rounded">✓ Documento de Identificação</span>
                        <span className="text-xs bg-emerald-100 px-2 py-1 rounded">✓ Conta de Luz</span>
                        {contratoSocialUrl && (
                          <span className="text-xs bg-emerald-100 px-2 py-1 rounded">✓ Contrato Social</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Submit */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(`/proposta/${id}`)}
                    className="sm:w-auto"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Voltar à Proposta
                  </Button>
                  <Button
                    type="submit"
                    disabled={!isFormValid || submitting}
                    className="flex-1 h-12 text-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
                  >
                    {submitting ? (
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5 mr-2" />
                    )}
                    Enviar Solicitação
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </div>

      {/* Chatbot de dúvidas */}
      {propostaInicial && (
        <ProposalChatbot
          proposalContext={{
            cliente_nome: propostaInicial.cliente_nome,
            consumo_medio: propostaInicial.consumo_medio,
            tipo_proposta: 'inicial',
          }}
        />
      )}
    </div>
  );
}
