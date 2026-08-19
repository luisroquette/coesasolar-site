import { AssinanteOutput, AssinanteOutputGD2, FaturaConcessionaria, FaturaCoesa, formatCurrency, formatNumber, PLANO_UNLOCK_THRESHOLD, PLANO_UNLOCK_DESCONTO, PLANO_UNLOCK_FIDELIDADE } from '@/lib/calculations';
import { Sun, Zap, Smartphone, Shield, CheckCircle2, ArrowRight, Leaf, TrendingUp, Phone, Mail, FileText, Receipt, Unlock } from 'lucide-react';
import { motion, Variants, Easing } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import coesaLogo from '@/assets/logos/coesa-green.png';

// Check if plan is UNLOCK (4 years / 30%)
const isPlanoUnlock = (descontoPercentual: number, fidelidadeAnos: number) => 
  descontoPercentual >= PLANO_UNLOCK_DESCONTO && fidelidadeAnos >= PLANO_UNLOCK_FIDELIDADE;

export interface ConfiguracoesPDF {
  whatsapp_numero: string;
  email_contato: string;
  telefone_contato: string;
  empresa_nome: string;
  empresa_slogan: string;
}

export interface AssinantePDFData {
  cliente: {
    nome: string;
    email: string;
    telefone: string;
    cidade: string;
    uf: string;
  };
  instalacao: {
    concessionaria: string;
    numeroUcs: number;
    numeroInstalacao: string;
    tipoInstalacao: string;
  };
  consumo: {
    tarifa: number;
    tarifaCoesa?: number;
    taxaBancariaCoesa?: number;
    cip: number;
    consumoMedio: number;
    fidelidadeAnos: number;
    descontoPercentual: number;
    responsavelComercial: string;
  };
  resultado: AssinanteOutput;
  resultadoGD2?: AssinanteOutputGD2;
  configuracoes?: ConfiguracoesPDF;
  dadosInferidos?: boolean;
}

interface PropostaAssinantePDFProps {
  data: AssinantePDFData;
  animated?: boolean;
}

// Easing function
const easeOut: Easing = [0.0, 0.0, 0.2, 1];

// Animation variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: easeOut },
  },
};

const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: easeOut },
  },
};

const fadeInRight: Variants = {
  hidden: { opacity: 0, x: 30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: easeOut },
  },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: easeOut },
  },
};

const staggerCards: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const cardVariant: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: easeOut },
  },
};

export function PropostaAssinantePDF({ data, animated = true }: PropostaAssinantePDFProps) {
  const today = new Date();
  const validity = new Date(today);
  validity.setDate(validity.getDate() + 30);

  // Default configs
  const configs = data.configuracoes || {
    whatsapp_numero: '5511999999999',
    email_contato: 'contato@coesaenergia.com.br',
    telefone_contato: '(11) 99999-9999',
    empresa_nome: 'COESA Energia Inteligente',
    empresa_slogan: 'Soluções em Energia Renovável',
  };

  const vantagens = [
    { 
      icon: Sun, 
      title: 'Energia Limpa', 
      desc: '100% renovável e sustentável',
      color: 'from-amber-400 to-orange-500'
    },
    { 
      icon: Zap, 
      title: 'Sem Investimento', 
      desc: 'Economia imediata garantida',
      color: 'from-emerald-400 to-teal-500'
    },
    { 
      icon: Smartphone, 
      title: 'App Exclusivo', 
      desc: 'Acompanhe tudo em tempo real',
      color: 'from-blue-400 to-indigo-500'
    },
    { 
      icon: Shield, 
      title: 'Desconto Fixo', 
      desc: `${formatNumber(data.consumo.descontoPercentual, 0)}% garantido por contrato`,
      color: 'from-purple-400 to-pink-500'
    },
  ];

  const timeline = [
    { day: 'Hoje', title: 'Assinatura do Contrato', desc: 'Digital e sem burocracia' },
    { day: '30 dias', title: 'Análise de Viabilidade', desc: 'Estudo técnico da instalação' },
    { day: '60 dias', title: 'Homologação', desc: 'Aprovação pela concessionária' },
    { day: '90 dias', title: 'Início da Economia', desc: 'Sua conta já vem com desconto!' },
  ];

  // fidelidadeAnos agora vem corretamente em ANOS do banco
  const fidelidadeAnos = data.consumo.fidelidadeAnos;
  const fidelidadeLabel = fidelidadeAnos === Math.floor(fidelidadeAnos) 
    ? `${Math.floor(fidelidadeAnos)} anos` 
    : `${(fidelidadeAnos * 12).toFixed(0)} meses`;

  const periodos = [
    { label: '1 mês', value: data.resultado.economiaMensal },
    { label: '1 ano', value: data.resultado.economiaAnual },
    { label: '3 anos', value: data.resultado.economiaAnual * 3 },
    { label: '5 anos', value: data.resultado.economiaAnual * 5 },
    { label: fidelidadeLabel, value: data.resultado.economiaAcumulada, highlight: true },
  ];

  const maxValue = Math.max(...periodos.map(p => p.value));

  if (!animated) {
    return <StaticPDF data={data} vantagens={vantagens} timeline={timeline} periodos={periodos} maxValue={maxValue} today={today} validity={validity} configs={configs} fidelidadeLabel={fidelidadeLabel} />;
  }

  return (
    <motion.div 
      id="proposta-assinante-pdf" 
      className="w-full max-w-full bg-white font-sans text-gray-900"
      style={{ fontFamily: "'Open Sans', sans-serif" }}
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* ========== SEÇÃO PRINCIPAL (MOBILE-FIRST) ========== */}
      <div 
        className="flex flex-col relative overflow-hidden box-border"
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
          <motion.div 
            className={`absolute top-0 right-0 w-96 h-96 bg-gradient-to-br ${data.dadosInferidos ? 'from-amber-500 to-orange-500' : 'from-emerald-500 to-teal-500'} rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2`}
            animate={{ scale: [1, 1.1, 1], opacity: [0.03, 0.05, 0.03] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div 
            className={`absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr ${data.dadosInferidos ? 'from-amber-500 to-yellow-500' : 'from-emerald-500 to-green-500'} rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2`}
            animate={{ scale: [1, 1.15, 1], opacity: [0.03, 0.04, 0.03] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          />
        </div>

        {/* ========== HEADER ========== */}
        <motion.header 
          className={`relative ${data.dadosInferidos ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500' : 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500'} text-white px-4 sm:px-8 py-4 sm:py-5`}
          variants={fadeInUp}
        >
          <div className="absolute top-0 right-0 w-64 h-full overflow-hidden">
            <motion.div 
              className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div 
              className="absolute top-5 right-20 w-20 h-20 bg-white/5 rounded-full"
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            />
          </div>

          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <motion.div className="flex items-center gap-3 sm:gap-4" variants={fadeInLeft}>
              <motion.div 
                className="w-10 h-10 sm:w-14 sm:h-14 bg-white rounded-xl p-1.5 sm:p-2 shadow-lg flex-shrink-0"
                whileHover={{ scale: 1.05, rotate: 5 }}
              >
                <img src={coesaLogo} alt="COESA" className="w-full h-full object-contain" />
              </motion.div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  COESA Energia
                </h1>
                <p className={`${data.dadosInferidos ? 'text-amber-100' : 'text-emerald-100'} text-xs sm:text-sm`}>Energia Inteligente para você</p>
              </div>
            </motion.div>

            <motion.div className="text-left sm:text-right w-full sm:w-auto" variants={fadeInRight}>
              <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-1 mb-2 flex-wrap">
                {isPlanoUnlock(data.consumo.descontoPercentual, data.consumo.fidelidadeAnos) ? (
                  <motion.div 
                    className="inline-flex items-center gap-1.5 sm:gap-2 bg-gradient-to-r from-purple-500/30 to-amber-500/30 backdrop-blur-sm rounded-full px-2.5 sm:px-4 py-1 sm:py-1.5 border border-white/40"
                    animate={{ 
                      scale: [1, 1.02, 1],
                      boxShadow: [
                        '0 0 10px rgba(147, 51, 234, 0.3)',
                        '0 0 20px rgba(147, 51, 234, 0.5)',
                        '0 0 10px rgba(147, 51, 234, 0.3)',
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Unlock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-200" />
                    <span className="text-[10px] sm:text-xs font-bold text-yellow-100">PLANO UNLOCK</span>
                  </motion.div>
                ) : (
                  <motion.div 
                    className="inline-flex items-center gap-1.5 sm:gap-2 bg-white/20 backdrop-blur-sm rounded-full px-2.5 sm:px-4 py-1 sm:py-1.5"
                    animate={{ scale: [1, 1.02, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <span className="text-[10px] sm:text-xs font-medium">{data.dadosInferidos ? 'PROPOSTA INICIAL' : 'PROPOSTA EXCLUSIVA'}</span>
                  </motion.div>
                )}
                <div className={`inline-flex items-center gap-1 sm:gap-1.5 ${data.dadosInferidos ? 'bg-amber-100/20' : 'bg-emerald-100/20'} backdrop-blur-sm border border-white/30 rounded-full px-2 sm:px-3 py-0.5 sm:py-1`}>
                  <Shield className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="text-[9px] sm:text-[10px] font-semibold">Transparência</span>
                </div>
              </div>
              <div className="flex gap-2 sm:block text-[11px] sm:text-sm">
                <p className={`${data.dadosInferidos ? 'text-amber-100' : 'text-emerald-100'}`}>
                  Emissão: {today.toLocaleDateString('pt-BR')}
                </p>
                <p className="font-medium">
                  Válida: {validity.toLocaleDateString('pt-BR')}
                </p>
              </div>
            </motion.div>
          </div>
        </motion.header>

        {/* ========== DISCLAIMER PROPOSTA INICIAL - FAIXA AMARELA ========== */}
        {data.dadosInferidos && (
          <motion.div 
            className="bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400 px-4 sm:px-8 py-2.5 sm:py-3 border-y-2 sm:border-y-4 border-amber-600 shadow-lg"
            variants={fadeInUp}
          >
            <div className="flex items-start sm:items-center gap-2.5 sm:gap-4">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-amber-800 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg border-2 border-amber-900">
                <span className="text-white text-base sm:text-2xl">⚠️</span>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs sm:text-base font-black text-amber-900 uppercase tracking-wider mb-0.5 sm:mb-1">
                  Proposta com Dados Estimados
                </h4>
                <p className="text-[10px] sm:text-xs text-amber-900 leading-relaxed">
                  Proposta gerada a partir do valor da conta informado. <strong>Para valores exatos, solicite dados adicionais.</strong>
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ========== CLIENT CARD ========== */}
        <motion.div className="px-4 sm:px-8 mt-3 sm:-mt-4 relative z-10" style={{ marginTop: data.dadosInferidos ? '0.75rem' : undefined }} variants={fadeInUp}>
          <motion.div 
            className="bg-white rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl border border-gray-100 p-3 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0"
            whileHover={{ y: -2, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)' }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider mb-0.5 sm:mb-1">Cliente</p>
              <h2 className="text-base sm:text-xl font-bold text-gray-900 truncate" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                {data.cliente.nome || 'Nome do Cliente'}
              </h2>
              <div className="flex flex-col sm:flex-row flex-wrap gap-x-4 sm:gap-x-6 gap-y-0.5 sm:gap-y-1 mt-1 sm:mt-2 text-xs sm:text-sm text-gray-600">
                {data.cliente.email && <span className="truncate">{data.cliente.email}</span>}
                {data.cliente.telefone && <span>{data.cliente.telefone}</span>}
                {(data.cliente.cidade || data.cliente.uf) && (
                  <span>{[data.cliente.cidade, data.cliente.uf].filter(Boolean).join(' - ')}</span>
                )}
              </div>
            </div>
            <div className="text-left sm:text-right border-t sm:border-t-0 sm:border-l border-gray-200 pt-2 sm:pt-0 sm:pl-4 sm:ml-4">
              <p className="text-[10px] sm:text-xs text-gray-500">{data.instalacao.concessionaria}</p>
              <p className="text-xs sm:text-sm font-medium text-gray-700">{data.instalacao.tipoInstalacao} • {data.instalacao.numeroUcs} UC(s)</p>
              {data.instalacao.numeroInstalacao && (
                <p className="text-[10px] sm:text-xs text-gray-500">Nº {data.instalacao.numeroInstalacao}</p>
              )}
            </div>
          </motion.div>
        </motion.div>

        {/* ========== HERO DISCOUNT ========== */}
        <motion.div className="px-4 sm:px-8 mt-4 sm:mt-6" variants={fadeInUp}>
          <div className={`relative bg-gradient-to-br ${data.dadosInferidos ? 'from-amber-50 to-orange-50' : 'from-emerald-50 to-teal-50'} rounded-2xl sm:rounded-3xl p-4 sm:p-6 overflow-hidden`}>
            <motion.div 
              className={`absolute top-0 right-0 w-20 sm:w-32 h-20 sm:h-32 bg-gradient-to-br ${data.dadosInferidos ? 'from-amber-200/40 to-orange-200/40' : 'from-emerald-200/40 to-teal-200/40'} rounded-full transform translate-x-1/3 -translate-y-1/3`}
              animate={{ rotate: 360 }}
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
            />
            
            <div className="relative flex flex-col sm:flex-row items-center sm:justify-between gap-4">
              <motion.div className="flex-1 text-center sm:text-left order-2 sm:order-1" variants={fadeInLeft}>
                <h3 
                  className="text-xl sm:text-3xl font-extrabold text-gray-900 leading-tight mb-1 sm:mb-2"
                  style={{ fontFamily: "'Montserrat', sans-serif" }}
                >
                  {data.dadosInferidos ? 'Estimativa de' : 'Sua'} Economia{' '}
                  <span className={data.dadosInferidos ? 'text-amber-600' : 'text-emerald-600'}>Com Transparência</span>
                </h3>
                <p className="text-xs sm:text-base text-gray-600 hidden sm:block">
                  {data.dadosInferidos 
                    ? <>Esta é uma <strong>proposta inicial estimada</strong>. Valores aproximados para análise.</>
                    : <>Os <strong>MAIORES</strong> descontos de forma transparente. Consumiu? <strong>LEVOU!</strong></>
                  }
                </p>
              </motion.div>

              <motion.div className="relative flex-shrink-0 order-1 sm:order-2" variants={scaleIn}>
                <motion.div 
                  className={`w-24 h-24 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br ${data.dadosInferidos ? 'from-amber-500 to-orange-600' : 'from-emerald-500 to-teal-600'} shadow-xl sm:shadow-2xl flex flex-col items-center justify-center text-white`}
                  animate={{ 
                    boxShadow: data.dadosInferidos 
                      ? [
                          '0 15px 30px -8px rgba(245, 158, 11, 0.4)',
                          '0 15px 40px -8px rgba(245, 158, 11, 0.6)',
                          '0 15px 30px -8px rgba(245, 158, 11, 0.4)',
                        ]
                      : [
                          '0 15px 30px -8px rgba(16, 185, 129, 0.4)',
                          '0 15px 40px -8px rgba(16, 185, 129, 0.6)',
                          '0 15px 30px -8px rgba(16, 185, 129, 0.4)',
                        ]
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <div className="absolute inset-1 rounded-full border-2 sm:border-4 border-white/30" />
                  <motion.span 
                    className="text-3xl sm:text-5xl font-black leading-none"
                    style={{ fontFamily: "'Montserrat', sans-serif" }}
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    {formatNumber(data.consumo.descontoPercentual, 0)}%
                  </motion.span>
                  <span className="text-[9px] sm:text-xs font-medium mt-0.5 sm:mt-1 opacity-90 whitespace-nowrap">DE DESCONTO</span>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* ========== COMPARISON ========== */}
        <motion.div className="px-4 sm:px-8 mt-4 sm:mt-6" variants={staggerCards}>
          <motion.h4 
            className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider mb-2 sm:mb-3" 
            style={{ fontFamily: "'Montserrat', sans-serif" }}
            variants={fadeInUp}
          >
            Comparativo Mensal
          </motion.h4>
          
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <motion.div 
              className="bg-gray-50 border border-gray-200 sm:border-2 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 relative overflow-hidden"
              variants={cardVariant}
              whileHover={{ scale: 1.02 }}
            >
              <div className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2">
                <span className="text-[9px] sm:text-xs font-medium text-gray-400 bg-gray-200 px-1.5 sm:px-2 py-0.5 rounded-full">ATUAL</span>
              </div>
              <p className="text-xs sm:text-sm font-semibold text-gray-500 mb-0.5 sm:mb-1">Sem COESA</p>
              <div className="text-lg sm:text-3xl font-bold text-gray-700" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                {formatCurrency(data.resultado.valorSemCoesa)}
              </div>
              <div className="mt-2 sm:mt-3 text-[10px] sm:text-xs text-gray-500 space-y-0.5">
                <p>Consumo: {formatNumber(data.consumo.consumoMedio, 0)} kWh</p>
                <p>Tarifa: R$ {formatNumber(data.consumo.tarifa, 4)}/kWh</p>
                {data.consumo.cip > 0 && <p>CIP: R$ {formatNumber(data.consumo.cip, 2)}</p>}
              </div>
            </motion.div>

            <motion.div 
              className={`bg-gradient-to-br ${data.dadosInferidos ? 'from-amber-500 to-orange-600' : 'from-emerald-500 to-teal-600'} rounded-xl sm:rounded-2xl p-2.5 sm:p-4 text-white relative overflow-hidden shadow-md sm:shadow-lg`}
              variants={cardVariant}
              whileHover={{ scale: 1.02 }}
            >
              <div className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2">
                <span className={`text-[9px] sm:text-xs font-medium ${data.dadosInferidos ? 'text-amber-100' : 'text-emerald-100'} bg-white/20 px-1.5 sm:px-2 py-0.5 rounded-full`}>COESA</span>
              </div>
              <p className={`text-xs sm:text-sm font-semibold ${data.dadosInferidos ? 'text-amber-100' : 'text-emerald-100'} mb-0.5 sm:mb-1`}>Com COESA</p>
              <div className="text-lg sm:text-3xl font-bold" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                {formatCurrency(data.resultado.valorComCoesa)}
              </div>
              <div className={`mt-2 sm:mt-3 text-[10px] sm:text-xs ${data.dadosInferidos ? 'text-amber-100' : 'text-emerald-100'} space-y-0.5`}>
                <p>Consumo: {formatNumber(data.consumo.consumoMedio, 0)} kWh</p>
                <p className="hidden sm:block">Tarifa: R$ {formatNumber(data.consumo.tarifa * (1 - data.consumo.descontoPercentual / 100), 4)}/kWh</p>
                <p>+ Disp.: R$ {formatNumber(data.resultado.disponibilidade, 2)}</p>
              </div>
            </motion.div>
          </div>

          <motion.div 
            className="mt-3 sm:mt-4 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center justify-between shadow-md sm:shadow-lg"
            variants={cardVariant}
            whileHover={{ scale: 1.01 }}
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <motion.div 
                className="w-8 h-8 sm:w-10 sm:h-10 bg-white/30 rounded-full flex items-center justify-center"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-amber-800" />
              </motion.div>
              <div>
                <p className="text-[10px] sm:text-xs font-medium text-amber-800/80 uppercase tracking-wider">Economia Mensal</p>
                <motion.p 
                  className="text-lg sm:text-2xl font-extrabold text-amber-900" 
                  style={{ fontFamily: "'Montserrat', sans-serif" }}
                >
                  {formatCurrency(data.resultado.economiaMensal)}
                </motion.p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs sm:text-sm font-bold text-amber-900">{formatCurrency(data.resultado.economiaAnual)}/ano</p>
            </div>
          </motion.div>
        </motion.div>

        {/* ========== COMPOSIÇÃO TARIFÁRIA ========== */}
        <motion.div className="px-4 sm:px-8 mt-4 sm:mt-5" variants={fadeInUp}>
          <h4 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider mb-2 sm:mb-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            Composição da Sua Conta
          </h4>
          
          {/* Modelo GD2 com faturas separadas */}
          {data.resultadoGD2 ? (
            <div className="space-y-3">
              {/* Cards de boletos lado a lado */}
              <div className="grid grid-cols-2 gap-3">
                {/* Boleto Concessionária */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Receipt className="w-4 h-4 text-gray-500" />
                    <span className="text-xs font-bold text-gray-700 uppercase">Boleto Concessionária</span>
                  </div>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Disponibilidade ({data.resultadoGD2.disponibilidadeKwh} kWh)</span>
                      <span className="font-mono text-gray-700">{formatCurrency(data.resultadoGD2.contaConcessionaria.disponibilidadeValor)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">CIP</span>
                      <span className="font-mono text-gray-700">{formatCurrency(data.resultadoGD2.contaConcessionaria.cipValor)}</span>
                    </div>
                    {data.resultadoGD2.contaConcessionaria.gd2FioBValor > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Fio B (GD2)</span>
                        <span className="font-mono text-gray-700">{formatCurrency(data.resultadoGD2.contaConcessionaria.gd2FioBValor)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tributos</span>
                      <span className="font-mono text-gray-700">{formatCurrency(data.resultadoGD2.contaConcessionaria.totalTributos)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-gray-300">
                      <span className="font-semibold text-gray-900">TOTAL</span>
                      <span className="font-mono font-bold text-gray-900">{formatCurrency(data.resultadoGD2.contaConcessionaria.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Boleto COESA */}
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-200 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-700 uppercase">Boleto COESA</span>
                  </div>
                  <div className="space-y-1 text-[10px]">
                    {/* Transparência: Tarifa original vs com desconto */}
                    <div className="bg-blue-50/50 rounded p-1.5 mb-1 border border-blue-100">
                      <div className="flex justify-between text-[9px]">
                        <span className="text-blue-700">Tarifa Original:</span>
                        <span className="font-mono text-blue-700">{formatCurrency(data.consumo.tarifa)}/kWh</span>
                      </div>
                      <div className="flex justify-between text-[9px]">
                        <span className="text-emerald-700 font-semibold">Tarifa COESA ({formatNumber(data.consumo.descontoPercentual, 0)}% OFF):</span>
                        <span className="font-mono text-emerald-700 font-semibold">{formatCurrency(data.resultadoGD2.contaCoesa.tarifaCoesa)}/kWh</span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-700">Energia ({formatNumber(data.resultadoGD2.contaCoesa.energiaCompensadaKwh, 0)} kWh)</span>
                      <span className="font-mono text-emerald-800">{formatCurrency(data.resultadoGD2.contaCoesa.valorEnergia)}</span>
                    </div>
                    {/* Linha de desconto aplicado */}
                    <div className="flex justify-between bg-emerald-100/50 rounded px-1 py-0.5">
                      <span className="text-emerald-700 font-semibold text-[9px]">Você economiza:</span>
                      <span className="font-mono text-emerald-700 font-bold text-[9px]">-{formatCurrency(data.resultadoGD2.contaCoesa.energiaCompensadaKwh * data.consumo.tarifa * (data.consumo.descontoPercentual / 100))}</span>
                    </div>
                    {data.resultadoGD2.contaCoesa.taxaBancaria > 0 && (
                      <div className="flex justify-between">
                        <span className="text-emerald-700">Taxa Bancária</span>
                        <span className="font-mono text-emerald-800">{formatCurrency(data.resultadoGD2.contaCoesa.taxaBancaria)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-emerald-300">
                      <span className="font-semibold text-emerald-900">TOTAL</span>
                      <span className="font-mono font-bold text-emerald-900">{formatCurrency(data.resultadoGD2.contaCoesa.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resumo comparativo */}
              <div className="bg-gray-100 rounded-xl p-3">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="text-gray-600">Sem COESA:</span>
                    <span className="font-mono font-bold text-gray-800 ml-2">{formatCurrency(data.resultadoGD2.contaSemCoesa.total)}</span>
                  </div>
                  <div className="text-center">
                    <ArrowRight className="w-4 h-4 text-emerald-500 mx-auto" />
                  </div>
                  <div className="text-right">
                    <span className="text-gray-600">Com COESA:</span>
                    <span className="font-mono font-bold text-emerald-700 ml-2">{formatCurrency(data.resultadoGD2.totalComCoesa)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Modelo antigo fallback */
            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Componente</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500">Sem GD</th>
                    <th className="text-right py-2 px-3 font-semibold text-emerald-700">Com GD</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100 bg-blue-50/30">
                    <td className="py-1.5 px-3 text-gray-600 text-xs">
                      Tarifa: <span className="font-mono">{formatCurrency(data.consumo.tarifa)}/kWh</span> → <span className="font-mono text-emerald-700 font-semibold">{formatCurrency(data.consumo.tarifa * (1 - data.consumo.descontoPercentual / 100))}/kWh</span>
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-gray-400 text-xs">original</td>
                    <td className="py-1.5 px-3 text-right font-mono text-emerald-600 text-xs font-semibold">com desconto</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-1.5 px-3 text-gray-600">Consumo ({formatNumber(data.consumo.consumoMedio, 0)} kWh × tarifa)</td>
                    <td className="py-1.5 px-3 text-right font-mono text-gray-700">{formatCurrency(data.consumo.consumoMedio * data.consumo.tarifa)}</td>
                    <td className="py-1.5 px-3 text-right font-mono text-gray-700">{formatCurrency(data.consumo.consumoMedio * data.consumo.tarifa)}</td>
                  </tr>
                  <tr className="border-b border-gray-100 bg-emerald-50/50">
                    <td className="py-1.5 px-3 text-emerald-700 font-semibold">DESCONTO APLICADO ({formatNumber(data.consumo.descontoPercentual, 0)}%)</td>
                    <td className="py-1.5 px-3 text-right font-mono text-gray-400">—</td>
                    <td className="py-1.5 px-3 text-right font-mono font-bold text-emerald-600">-{formatCurrency(data.consumo.consumoMedio * data.consumo.tarifa * (data.consumo.descontoPercentual / 100))}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-1.5 px-3 text-gray-600">Disponibilidade Mínima</td>
                    <td className="py-1.5 px-3 text-right font-mono text-gray-400">incluído</td>
                    <td className="py-1.5 px-3 text-right font-mono text-emerald-700">{formatCurrency(data.resultado.disponibilidade)}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-1.5 px-3 text-gray-600">CIP (iluminação pública)</td>
                    <td className="py-1.5 px-3 text-right font-mono text-gray-700">{formatCurrency(data.consumo.cip)}</td>
                    <td className="py-1.5 px-3 text-right font-mono text-emerald-700">{formatCurrency(data.consumo.cip)}</td>
                  </tr>
                  <tr className="bg-gray-100 font-semibold">
                    <td className="py-2 px-3 text-gray-900">TOTAL MENSAL</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-700">{formatCurrency(data.resultado.valorSemCoesa)}</td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-700">{formatCurrency(data.resultado.valorComCoesa)}</td>
                  </tr>
                  {!data.dadosInferidos && (
                    <tr className="bg-amber-50">
                      <td className="py-2 px-3 text-amber-800 font-bold">ECONOMIA</td>
                      <td className="py-2 px-3 text-right text-amber-600">—</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-amber-700">
                        {formatCurrency(data.resultado.economiaMensal)} ({formatNumber(data.consumo.descontoPercentual, 0)}%)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {/* Nota explicativa sobre o desconto */}
          <div className="mt-3 p-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
            <p className="text-[10px] font-semibold text-emerald-800 mb-1">💡 Como funciona o desconto?</p>
            <p className="text-[9px] text-emerald-700 leading-relaxed">
              Sua tarifa atual é de <span className="font-mono font-semibold">{formatCurrency(data.consumo.tarifa)}/kWh</span>. 
              Com o desconto de <span className="font-semibold">{formatNumber(data.consumo.descontoPercentual, 0)}%</span>, 
              você passa a pagar <span className="font-mono font-semibold">{formatCurrency(data.consumo.tarifa * (1 - data.consumo.descontoPercentual / 100))}/kWh</span> pela energia consumida. 
              O desconto é aplicado diretamente sobre o valor do consumo em kWh, de forma simples e transparente: 
              <span className="font-semibold"> consumiu, economizou!</span>
            </p>
          </div>
          <p className="text-[9px] text-gray-500 mt-2 leading-tight">
            * {data.resultadoGD2 
              ? "Você receberá 2 boletos: um da concessionária (disponibilidade + CIP + tributos) e outro da COESA (energia compensada)."
              : "A tarifa informada já inclui impostos (PIS/COFINS e ICMS). A disponibilidade mínima é cobrada conforme tipo de instalação."
            }
          </p>
        </motion.div>

        {/* ========== ADVANTAGES ========== */}
        <motion.div className="px-8 mt-6" variants={staggerCards}>
          <motion.h4 
            className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3" 
            style={{ fontFamily: "'Montserrat', sans-serif" }}
            variants={fadeInUp}
          >
            Vantagens Exclusivas
          </motion.h4>
          
          <div className="grid grid-cols-4 gap-3">
            {vantagens.map((v, i) => (
              <motion.div 
                key={i} 
                className="text-center"
                variants={cardVariant}
                whileHover={{ y: -5, scale: 1.05 }}
              >
                <motion.div 
                  className={`w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br ${v.color} shadow-lg flex items-center justify-center mb-2`}
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 4, repeat: Infinity, delay: i * 0.2 }}
                >
                  <v.icon className="w-6 h-6 text-white" />
                </motion.div>
                <p className="text-xs font-bold text-gray-900">{v.title}</p>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{v.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ========== TIMELINE ========== */}
        <motion.div className="px-8 mt-6" variants={fadeInUp}>
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            Próximos Passos
          </h4>
          
          <div className="relative">
            <motion.div 
              className="absolute top-4 left-4 right-4 h-1 bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-600 rounded-full"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1, delay: 0.5 }}
              style={{ originX: 0 }}
            />
            
            <div className="relative flex justify-between px-2">
              {timeline.map((item, i) => (
                <motion.div 
                  key={i} 
                  className="flex flex-col items-center w-[23%]"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.7 + i * 0.15 }}
                >
                  <motion.div 
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md z-10 ${
                      i === timeline.length - 1 
                        ? 'bg-gradient-to-br from-amber-400 to-orange-500' 
                        : 'bg-gradient-to-br from-emerald-500 to-teal-600'
                    }`}
                    whileHover={{ scale: 1.2 }}
                    animate={i === timeline.length - 1 ? { scale: [1, 1.02, 1] } : {}}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    {i === timeline.length - 1 ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <span className="text-xs font-bold">{i + 1}</span>
                    )}
                  </motion.div>
                  <p className="text-[11px] font-bold text-gray-900 mt-2 text-center whitespace-nowrap">{item.day}</p>
                  <p className="text-[9px] text-gray-600 text-center leading-tight mt-0.5 max-w-[90px]">{item.title}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Spacer para preencher o resto da página */}
        <div className="flex-grow" />
      </div>

      {/* ========== PÁGINA 2 ========== */}
      <div 
        className="relative box-border"
        style={{ height: '297mm', maxHeight: '297mm', pageBreakBefore: 'always', breakBefore: 'page', overflow: 'hidden' }}
      >
        {/* Background Pattern Página 2 */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
          <div className={`absolute top-0 right-0 w-96 h-96 bg-gradient-to-br ${data.dadosInferidos ? 'from-amber-500 to-orange-500' : 'from-emerald-500 to-teal-500'} rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2`} />
          <div className={`absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr ${data.dadosInferidos ? 'from-amber-500 to-yellow-500' : 'from-emerald-500 to-green-500'} rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2`} />
        </div>

        {/* Header Compacto Página 2 */}
        <motion.header 
          className={`relative ${data.dadosInferidos ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500' : 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500'} text-white px-8 py-4`}
          variants={fadeInUp}
        >
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg p-1.5 shadow-lg">
                <img src={coesaLogo} alt="COESA" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  COESA Energia
                </h1>
                <p className={`${data.dadosInferidos ? 'text-amber-100' : 'text-emerald-100'} text-xs`}>{data.dadosInferidos ? 'Proposta Inicial para' : 'Proposta para'} {data.cliente.nome}</p>
              </div>
            </div>
            <div className="text-right">
              <span className={`text-xs ${data.dadosInferidos ? 'text-amber-100' : 'text-emerald-100'}`}>Página 2 de 2</span>
            </div>
          </div>
        </motion.header>

        {/* ========== SAVINGS PROJECTION ========== */}
        <motion.div className="px-4 sm:px-8 mt-6 sm:mt-8" variants={fadeInUp}>
          <h4 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 sm:mb-4" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            Projeção de Economia
          </h4>
          
          <div className="space-y-2 sm:space-y-3">
            {periodos.map((p, i) => (
              <motion.div 
                key={i} 
                className="flex items-center gap-2 sm:gap-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
              >
                <span className="text-[11px] sm:text-sm text-gray-600 w-12 sm:w-16 text-right font-medium">{p.label}</span>
                <div className="flex-1 h-6 sm:h-8 bg-gray-100 rounded-full overflow-hidden relative">
                  <motion.div 
                    className={`h-full rounded-full ${
                      p.highlight 
                        ? 'bg-gradient-to-r from-amber-400 to-orange-500' 
                        : 'bg-gradient-to-r from-emerald-400 to-teal-500'
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max((p.value / maxValue) * 100, 5)}%` }}
                    transition={{ duration: 0.8, delay: 0.5 + i * 0.1, ease: easeOut }}
                  />
                </div>
                <motion.span 
                  className={`text-[11px] sm:text-sm font-bold w-20 sm:w-28 text-right ${p.highlight ? 'text-amber-600' : 'text-gray-700'}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 1 + i * 0.1 }}
                >
                  {formatCurrency(p.value)}
                </motion.span>
              </motion.div>
            ))}
          </div>

          {/* Total highlight */}
          <motion.div 
            className="mt-4 sm:mt-6 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 sm:border-2 rounded-xl sm:rounded-2xl p-3 sm:p-5 flex items-center justify-between"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 1.2 }}
          >
            <div className="flex items-center gap-3 sm:gap-4">
              <motion.div 
                className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center flex-shrink-0"
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              >
                <Leaf className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </motion.div>
              <div>
                <p className="text-xs sm:text-sm text-amber-700/80">Economia total em {fidelidadeLabel}</p>
                <motion.p 
                  className="text-lg sm:text-2xl font-extrabold text-amber-800" 
                  style={{ fontFamily: "'Montserrat', sans-serif" }}
                >
                  {formatCurrency(data.resultado.economiaAcumulada)}
                </motion.p>
              </div>
            </div>
            <ArrowRight className="w-6 h-6 sm:w-8 sm:h-8 text-amber-400 hidden sm:block" />
          </motion.div>
        </motion.div>

        {/* ========== FOOTER - posição absoluta no fundo da página ========== */}
        <motion.footer 
          className="absolute bottom-0 left-0 right-0 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white px-8 py-4"
          variants={fadeInUp}
        >
          <div className="flex items-center justify-between">
            <motion.div 
              className="flex items-center gap-3"
              whileHover={{ x: 5 }}
            >
              <div className="w-8 h-8 bg-white rounded-lg p-1">
                <img src={coesaLogo} alt="COESA" className="w-full h-full object-contain" />
              </div>
              <div>
                <p className="text-sm font-semibold">{configs.empresa_nome}</p>
                <p className="text-xs text-gray-400">{configs.empresa_slogan}</p>
              </div>
            </motion.div>

            <div className="flex items-center gap-4">
              <div className="text-right text-xs text-gray-400">
                {data.consumo.responsavelComercial && (
                  <p>Consultor: <span className="text-white">{data.consumo.responsavelComercial}</span></p>
                )}
                <div className="flex items-center justify-end gap-1 mt-1">
                  <Mail className="w-3 h-3" />
                  <span>{configs.email_contato}</span>
                </div>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <Phone className="w-3 h-3" />
                  <span>{configs.telefone_contato}</span>
                </div>
              </div>

              <motion.div 
                className="bg-white rounded-lg p-1.5 shadow-lg"
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <QRCodeSVG 
                  value={`https://wa.me/${configs.whatsapp_numero}?text=Olá! Tenho interesse na proposta de energia solar. Cliente: ${encodeURIComponent(data.cliente.nome)}`}
                  size={48}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#1e5631"
                />
              </motion.div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-gray-500">
            <span>Escaneie o QR Code para falar conosco pelo WhatsApp</span>
          </div>
          
          {/* Rodapé específico para Proposta Inicial */}
          {data.dadosInferidos && (
            <div className="mt-3 pt-3 border-t border-amber-500/30">
              <div className="flex items-center justify-center gap-2 bg-amber-500/20 rounded-lg px-4 py-2">
                <span className="text-amber-300 text-lg">⚠️</span>
                <p className="text-[9px] text-amber-200 text-center leading-tight">
                  <strong className="text-amber-100">PROPOSTA INICIAL:</strong> Valores estimados por aproximação. 
                  Para validação dos números apresentados, solicite uma <strong className="text-white">proposta definitiva</strong> junto à COESA.
                </p>
              </div>
            </div>
          )}
        </motion.footer>
      </div>
    </motion.div>
  );
}

// Static version for PDF generation (no animations)
interface StaticPDFProps {
  data: AssinantePDFData;
  vantagens: { icon: typeof Sun; title: string; desc: string; color: string }[];
  timeline: { day: string; title: string; desc: string }[];
  periodos: { label: string; value: number; highlight?: boolean }[];
  maxValue: number;
  today: Date;
  validity: Date;
  configs: ConfiguracoesPDF;
  fidelidadeLabel: string;
}

function StaticPDF({ data, vantagens, timeline, periodos, maxValue, today, validity, configs, fidelidadeLabel }: StaticPDFProps) {
  return (
    <div 
      id="proposta-assinante-pdf" 
      className="w-full max-w-full bg-white font-sans text-gray-900"
      style={{ fontFamily: "'Open Sans', sans-serif" }}
    >
      {/* ========== SEÇÃO PRINCIPAL (MOBILE-FIRST) ========== */}
      <div 
        className="flex flex-col relative overflow-hidden box-border"
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
          <div className={`absolute top-0 right-0 w-96 h-96 bg-gradient-to-br ${data.dadosInferidos ? 'from-amber-500 to-orange-500' : 'from-emerald-500 to-teal-500'} rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2`} />
          <div className={`absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr ${data.dadosInferidos ? 'from-amber-500 to-yellow-500' : 'from-emerald-500 to-green-500'} rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2`} />
        </div>

        {/* Header */}
        <header className={`relative ${data.dadosInferidos ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500' : 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500'} text-white px-8 py-5`}>
          <div className="absolute top-0 right-0 w-64 h-full overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full" />
            <div className="absolute top-5 right-20 w-20 h-20 bg-white/5 rounded-full" />
          </div>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white rounded-xl p-2 shadow-lg">
                <img src={coesaLogo} alt="COESA" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>COESA Energia</h1>
                <p className={`${data.dadosInferidos ? 'text-amber-100' : 'text-emerald-100'} text-sm`}>Energia Inteligente para você</p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex flex-col items-end gap-1 mb-2">
                {isPlanoUnlock(data.consumo.descontoPercentual, data.consumo.fidelidadeAnos) ? (
                  <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500/30 to-amber-500/30 backdrop-blur-sm rounded-full px-4 py-1.5 border border-white/40">
                    <Unlock className="w-4 h-4 text-yellow-200" />
                    <span className="text-xs font-bold text-yellow-100">PLANO UNLOCK</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5">
                    <span className="text-xs font-medium">{data.dadosInferidos ? 'PROPOSTA INICIAL' : 'PROPOSTA EXCLUSIVA'}</span>
                  </div>
                )}
                <div className={`inline-flex items-center gap-1.5 ${data.dadosInferidos ? 'bg-amber-100/20' : 'bg-emerald-100/20'} backdrop-blur-sm border border-white/30 rounded-full px-3 py-1`}>
                  <Shield className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-semibold">Transparência Garantida</span>
                </div>
              </div>
              <p className={`text-sm ${data.dadosInferidos ? 'text-amber-100' : 'text-emerald-100'}`}>Emissão: {today.toLocaleDateString('pt-BR')}</p>
              <p className="text-sm font-medium">Válida até: {validity.toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
        </header>

        {/* Disclaimer Proposta Inicial - FAIXA AMARELA */}
        {data.dadosInferidos && (
          <div className="bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400 px-8 py-3 border-y-4 border-amber-600 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-800 rounded-full flex items-center justify-center flex-shrink-0 shadow-lg border-2 border-amber-900">
                <span className="text-white text-2xl">⚠️</span>
              </div>
              <div className="flex-1">
                <h4 className="text-base font-black text-amber-900 uppercase tracking-wider mb-1">
                  Proposta com Dados Estimados
                </h4>
                <p className="text-xs text-amber-900 leading-relaxed">
                  Esta proposta foi gerada automaticamente a partir do <strong>valor da conta de luz informado no sistema</strong>. 
                  O consumo e tipo de instalação foram inferidos. <strong>Para valores exatos, solicite dados adicionais ao cliente.</strong>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Client Card */}
        <div className="px-8 relative z-10" style={{ marginTop: data.dadosInferidos ? '1rem' : '-1rem' }}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-5 flex items-center justify-between">
            <div className="flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Cliente</p>
              <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                {data.cliente.nome || 'Nome do Cliente'}
              </h2>
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-gray-600">
                {data.cliente.email && <span>{data.cliente.email}</span>}
                {data.cliente.telefone && <span>{data.cliente.telefone}</span>}
                {(data.cliente.cidade || data.cliente.uf) && (
                  <span>{[data.cliente.cidade, data.cliente.uf].filter(Boolean).join(' - ')}</span>
                )}
              </div>
            </div>
            <div className="text-right border-l border-gray-200 pl-6 ml-4">
              <p className="text-xs text-gray-500">{data.instalacao.concessionaria}</p>
              <p className="text-sm font-medium text-gray-700">{data.instalacao.tipoInstalacao} • {data.instalacao.numeroUcs} UC(s)</p>
              {data.instalacao.numeroInstalacao && <p className="text-xs text-gray-500">Nº {data.instalacao.numeroInstalacao}</p>}
            </div>
          </div>
        </div>

        {/* Hero Discount */}
        <div className="px-8 mt-6">
          <div className={`relative bg-gradient-to-br ${data.dadosInferidos ? 'from-amber-50 to-orange-50' : 'from-emerald-50 to-teal-50'} rounded-3xl p-6 overflow-hidden`}>
            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${data.dadosInferidos ? 'from-amber-200/40 to-orange-200/40' : 'from-emerald-200/40 to-teal-200/40'} rounded-full transform translate-x-1/3 -translate-y-1/3`} />
            <div className="relative flex items-center justify-between">
              <div className="flex-1 pr-8">
                <h3 className="text-3xl font-extrabold text-gray-900 leading-tight mb-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  {data.dadosInferidos ? 'Estimativa de' : 'Sua'} Economia<br /><span className={data.dadosInferidos ? 'text-amber-600' : 'text-emerald-600'}>Com Transparência</span>
                </h3>
                <p className="text-gray-600">
                  {data.dadosInferidos 
                    ? <>Esta é uma <strong>proposta inicial estimada</strong>. Os valores são aproximados e servem como base para uma análise mais detalhada.</>
                    : <>Oferecemos os <strong>MAIORES</strong> descontos do mercado de forma clara, honesta e transparente. Sem pegadinha; Sem letrinha miúda. Consumiu? <strong>LEVOU!</strong></>
                  }
                </p>
              </div>
              <div className="relative flex-shrink-0">
                <div className={`w-36 h-36 rounded-full bg-gradient-to-br ${data.dadosInferidos ? 'from-amber-500 to-orange-600' : 'from-emerald-500 to-teal-600'} shadow-2xl flex flex-col items-center justify-center text-white`}>
                  <div className="absolute inset-1 rounded-full border-4 border-white/30" />
                  <span className="text-5xl font-black leading-none" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    {formatNumber(data.consumo.descontoPercentual, 0)}%
                  </span>
                  <span className="text-xs font-medium mt-1 opacity-90 whitespace-nowrap">DE DESCONTO</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Comparison */}
        <div className="px-8 mt-6">
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>Comparativo Mensal</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 relative">
              <div className="absolute top-2 right-2"><span className="text-xs font-medium text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">ATUAL</span></div>
              <p className="text-sm font-semibold text-gray-500 mb-1">Sem COESA</p>
              <div className="text-3xl font-bold text-gray-700" style={{ fontFamily: "'Montserrat', sans-serif" }}>{formatCurrency(data.resultado.valorSemCoesa)}</div>
              <div className="mt-3 text-xs text-gray-500 space-y-0.5">
                <p>Consumo: {formatNumber(data.consumo.consumoMedio, 0)} kWh</p>
                <p>Tarifa: R$ {formatNumber(data.consumo.tarifa, 4)}/kWh</p>
                {data.consumo.cip > 0 && <p>CIP: R$ {formatNumber(data.consumo.cip, 2)}</p>}
              </div>
            </div>
            <div className={`bg-gradient-to-br ${data.dadosInferidos ? 'from-amber-500 to-orange-600' : 'from-emerald-500 to-teal-600'} rounded-2xl p-4 text-white relative shadow-lg`}>
              <div className="absolute -top-4 -right-4 w-20 h-20 bg-white/10 rounded-full" />
              <div className="absolute top-2 right-2"><span className={`text-xs font-medium ${data.dadosInferidos ? 'text-amber-100' : 'text-emerald-100'} bg-white/20 px-2 py-0.5 rounded-full`}>COM COESA</span></div>
              <p className={`text-sm font-semibold ${data.dadosInferidos ? 'text-amber-100' : 'text-emerald-100'} mb-1`}>Com COESA</p>
              <div className="text-3xl font-bold" style={{ fontFamily: "'Montserrat', sans-serif" }}>{formatCurrency(data.resultado.valorComCoesa)}</div>
              <div className={`mt-3 text-xs ${data.dadosInferidos ? 'text-amber-100' : 'text-emerald-100'} space-y-0.5`}>
                <p>Consumo: {formatNumber(data.consumo.consumoMedio, 0)} kWh</p>
                <p>Tarifa: R$ {formatNumber(data.consumo.tarifa * (1 - data.consumo.descontoPercentual / 100), 4)}/kWh</p>
                <p>+ Disponibilidade: R$ {formatNumber(data.resultado.disponibilidade, 2)}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/30 rounded-full flex items-center justify-center"><TrendingUp className="w-5 h-5 text-amber-800" /></div>
              <div>
                <p className="text-xs font-medium text-amber-800/80 uppercase tracking-wider">Economia Mensal</p>
                <p className="text-2xl font-extrabold text-amber-900" style={{ fontFamily: "'Montserrat', sans-serif" }}>{formatCurrency(data.resultado.economiaMensal)}</p>
              </div>
            </div>
            <div className="text-right">
              {!data.dadosInferidos && <p className="text-xs text-amber-800/80">por mês</p>}
              <p className="text-sm font-bold text-amber-900">{formatCurrency(data.resultado.economiaAnual)}/ano</p>
            </div>
          </div>
        </div>

        {/* Composição Tarifária Detalhada */}
        <div className="px-8 mt-5">
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>Composição da Sua Conta</h4>
          
          {/* Modelo GD2 com faturas separadas */}
          {data.resultadoGD2 ? (
            <div className="space-y-3">
              {/* Cards de boletos lado a lado */}
              <div className="grid grid-cols-2 gap-3">
                {/* Boleto Concessionária */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Receipt className="w-4 h-4 text-gray-500" />
                    <span className="text-xs font-bold text-gray-700 uppercase">Boleto Concessionária</span>
                  </div>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Disponibilidade ({data.resultadoGD2.disponibilidadeKwh} kWh)</span>
                      <span className="font-mono text-gray-700">{formatCurrency(data.resultadoGD2.contaConcessionaria.disponibilidadeValor)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">CIP</span>
                      <span className="font-mono text-gray-700">{formatCurrency(data.resultadoGD2.contaConcessionaria.cipValor)}</span>
                    </div>
                    {data.resultadoGD2.contaConcessionaria.gd2FioBValor > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Fio B (GD2)</span>
                        <span className="font-mono text-gray-700">{formatCurrency(data.resultadoGD2.contaConcessionaria.gd2FioBValor)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tributos</span>
                      <span className="font-mono text-gray-700">{formatCurrency(data.resultadoGD2.contaConcessionaria.totalTributos)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-gray-300">
                      <span className="font-semibold text-gray-900">TOTAL</span>
                      <span className="font-mono font-bold text-gray-900">{formatCurrency(data.resultadoGD2.contaConcessionaria.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Boleto COESA */}
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-200 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-700 uppercase">Boleto COESA</span>
                  </div>
                  <div className="space-y-1 text-[10px]">
                    {/* Transparência: Tarifa original vs com desconto */}
                    <div className="bg-blue-50/50 rounded p-1.5 mb-1 border border-blue-100">
                      <div className="flex justify-between text-[9px]">
                        <span className="text-blue-700">Tarifa Original:</span>
                        <span className="font-mono text-blue-700">{formatCurrency(data.consumo.tarifa)}/kWh</span>
                      </div>
                      <div className="flex justify-between text-[9px]">
                        <span className="text-emerald-700 font-semibold">Tarifa COESA ({formatNumber(data.consumo.descontoPercentual, 0)}% OFF):</span>
                        <span className="font-mono text-emerald-700 font-semibold">{formatCurrency(data.resultadoGD2.contaCoesa.tarifaCoesa)}/kWh</span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-700">Energia ({formatNumber(data.resultadoGD2.contaCoesa.energiaCompensadaKwh, 0)} kWh)</span>
                      <span className="font-mono text-emerald-800">{formatCurrency(data.resultadoGD2.contaCoesa.valorEnergia)}</span>
                    </div>
                    {/* Linha de desconto aplicado */}
                    <div className="flex justify-between bg-emerald-100/50 rounded px-1 py-0.5">
                      <span className="text-emerald-700 font-semibold text-[9px]">Você economiza:</span>
                      <span className="font-mono text-emerald-700 font-bold text-[9px]">-{formatCurrency(data.resultadoGD2.contaCoesa.energiaCompensadaKwh * data.consumo.tarifa * (data.consumo.descontoPercentual / 100))}</span>
                    </div>
                    {data.resultadoGD2.contaCoesa.taxaBancaria > 0 && (
                      <div className="flex justify-between">
                        <span className="text-emerald-700">Taxa Bancária</span>
                        <span className="font-mono text-emerald-800">{formatCurrency(data.resultadoGD2.contaCoesa.taxaBancaria)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-emerald-300">
                      <span className="font-semibold text-emerald-900">TOTAL</span>
                      <span className="font-mono font-bold text-emerald-900">{formatCurrency(data.resultadoGD2.contaCoesa.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resumo comparativo */}
              <div className="bg-gray-100 rounded-xl p-3">
                <div className="flex justify-between items-center text-xs">
                  <div>
                    <span className="text-gray-600">Sem COESA:</span>
                    <span className="font-mono font-bold text-gray-800 ml-2">{formatCurrency(data.resultadoGD2.contaSemCoesa.total)}</span>
                  </div>
                  <div className="text-center">
                    <ArrowRight className="w-4 h-4 text-emerald-500 mx-auto" />
                  </div>
                  <div className="text-right">
                    <span className="text-gray-600">Com COESA:</span>
                    <span className="font-mono font-bold text-emerald-700 ml-2">{formatCurrency(data.resultadoGD2.totalComCoesa)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Modelo antigo fallback */
            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Componente</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-500">Sem GD</th>
                    <th className="text-right py-2 px-3 font-semibold text-emerald-700">Com GD</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100 bg-blue-50/30">
                    <td className="py-1.5 px-3 text-gray-600 text-xs">
                      Tarifa: <span className="font-mono">{formatCurrency(data.consumo.tarifa)}/kWh</span> → <span className="font-mono text-emerald-700 font-semibold">{formatCurrency(data.consumo.tarifa * (1 - data.consumo.descontoPercentual / 100))}/kWh</span>
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-gray-400 text-xs">original</td>
                    <td className="py-1.5 px-3 text-right font-mono text-emerald-600 text-xs font-semibold">com desconto</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-1.5 px-3 text-gray-600">Consumo ({formatNumber(data.consumo.consumoMedio, 0)} kWh × tarifa)</td>
                    <td className="py-1.5 px-3 text-right font-mono text-gray-700">{formatCurrency(data.consumo.consumoMedio * data.consumo.tarifa)}</td>
                    <td className="py-1.5 px-3 text-right font-mono text-gray-700">{formatCurrency(data.consumo.consumoMedio * data.consumo.tarifa)}</td>
                  </tr>
                  <tr className="border-b border-gray-100 bg-emerald-50/50">
                    <td className="py-1.5 px-3 text-emerald-700 font-semibold">DESCONTO APLICADO ({formatNumber(data.consumo.descontoPercentual, 0)}%)</td>
                    <td className="py-1.5 px-3 text-right font-mono text-gray-400">—</td>
                    <td className="py-1.5 px-3 text-right font-mono font-bold text-emerald-600">-{formatCurrency(data.consumo.consumoMedio * data.consumo.tarifa * (data.consumo.descontoPercentual / 100))}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-1.5 px-3 text-gray-600">Disponibilidade Mínima</td>
                    <td className="py-1.5 px-3 text-right font-mono text-gray-400">incluído</td>
                    <td className="py-1.5 px-3 text-right font-mono text-emerald-700">{formatCurrency(data.resultado.disponibilidade)}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-1.5 px-3 text-gray-600">CIP (iluminação pública)</td>
                    <td className="py-1.5 px-3 text-right font-mono text-gray-700">{formatCurrency(data.consumo.cip)}</td>
                    <td className="py-1.5 px-3 text-right font-mono text-emerald-700">{formatCurrency(data.consumo.cip)}</td>
                  </tr>
                  <tr className="bg-gray-100 font-semibold">
                    <td className="py-2 px-3 text-gray-900">TOTAL MENSAL</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-700">{formatCurrency(data.resultado.valorSemCoesa)}</td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-700">{formatCurrency(data.resultado.valorComCoesa)}</td>
                  </tr>
                  {!data.dadosInferidos && (
                    <tr className="bg-amber-50">
                      <td className="py-2 px-3 text-amber-800 font-bold">ECONOMIA</td>
                      <td className="py-2 px-3 text-right text-amber-600">—</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-amber-700">
                        {formatCurrency(data.resultado.economiaMensal)} ({formatNumber(data.consumo.descontoPercentual, 0)}%)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {/* Nota explicativa sobre o desconto */}
          <div className="mt-3 p-3 bg-emerald-50/50 rounded-lg border border-emerald-100">
            <p className="text-[10px] font-semibold text-emerald-800 mb-1">💡 Como funciona o desconto?</p>
            <p className="text-[9px] text-emerald-700 leading-relaxed">
              Sua tarifa atual é de <span className="font-mono font-semibold">{formatCurrency(data.consumo.tarifa)}/kWh</span>. 
              Com o desconto de <span className="font-semibold">{formatNumber(data.consumo.descontoPercentual, 0)}%</span>, 
              você passa a pagar <span className="font-mono font-semibold">{formatCurrency(data.consumo.tarifa * (1 - data.consumo.descontoPercentual / 100))}/kWh</span> pela energia consumida. 
              O desconto é aplicado diretamente sobre o valor do consumo em kWh, de forma simples e transparente: 
              <span className="font-semibold"> consumiu, economizou!</span>
            </p>
          </div>
          <p className="text-[9px] text-gray-500 mt-2 leading-tight">
            * {data.resultadoGD2 
              ? "Você receberá 2 boletos: um da concessionária (disponibilidade + CIP + tributos) e outro da COESA (energia compensada)."
              : "A tarifa informada já inclui impostos (PIS/COFINS e ICMS). A disponibilidade mínima é cobrada conforme tipo de instalação."
            }
          </p>
        </div>

        {/* Advantages */}
        <div className="px-8 mt-6">
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>Vantagens Exclusivas</h4>
          <div className="grid grid-cols-4 gap-3">
            {vantagens.map((v, i) => (
              <div key={i} className="text-center">
                <div className={`w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br ${v.color} shadow-lg flex items-center justify-center mb-2`}>
                  <v.icon className="w-6 h-6 text-white" />
                </div>
                <p className="text-xs font-bold text-gray-900">{v.title}</p>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="px-8 mt-6">
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4" style={{ fontFamily: "'Montserrat', sans-serif" }}>Próximos Passos</h4>
          <div className="relative">
            <div className="absolute top-4 left-4 right-4 h-1 bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-600 rounded-full" />
            <div className="relative flex justify-between px-2">
              {timeline.map((item, i) => (
                <div key={i} className="flex flex-col items-center w-[23%]">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white shadow-md z-10 ${i === timeline.length - 1 ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
                    {i === timeline.length - 1 ? <CheckCircle2 className="w-4 h-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
                  </div>
                  <p className="text-[11px] font-bold text-gray-900 mt-2 text-center whitespace-nowrap">{item.day}</p>
                  <p className="text-[9px] text-gray-600 text-center leading-tight mt-0.5 max-w-[90px]">{item.title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Spacer para preencher o resto da página */}
        <div className="flex-grow" />
      </div>

      {/* ========== PÁGINA 2 ========== */}
      <div 
        className="relative box-border"
        style={{ height: '297mm', maxHeight: '297mm', pageBreakBefore: 'always', breakBefore: 'page', overflow: 'hidden' }}
      >
        {/* Background Pattern Página 2 */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
          <div className={`absolute top-0 right-0 w-96 h-96 bg-gradient-to-br ${data.dadosInferidos ? 'from-amber-500 to-orange-500' : 'from-emerald-500 to-teal-500'} rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2`} />
          <div className={`absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr ${data.dadosInferidos ? 'from-amber-500 to-yellow-500' : 'from-emerald-500 to-green-500'} rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2`} />
        </div>

        {/* Header Compacto Página 2 */}
        <header className={`relative ${data.dadosInferidos ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500' : 'bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500'} text-white px-8 py-4`}>
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white rounded-lg p-1.5 shadow-lg">
                <img src={coesaLogo} alt="COESA" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  COESA Energia
                </h1>
                <p className={`${data.dadosInferidos ? 'text-amber-100' : 'text-emerald-100'} text-xs`}>{data.dadosInferidos ? 'Proposta Inicial para' : 'Proposta para'} {data.cliente.nome}</p>
              </div>
            </div>
            <div className="text-right">
              <span className={`text-xs ${data.dadosInferidos ? 'text-amber-100' : 'text-emerald-100'}`}>Página 2 de 2</span>
            </div>
          </div>
        </header>

        {/* Savings Projection */}
        <div className="px-8 mt-8">
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4" style={{ fontFamily: "'Montserrat', sans-serif" }}>Projeção de Economia</h4>
          <div className="space-y-3">
            {periodos.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-16 text-right font-medium">{p.label}</span>
                <div className="flex-1 h-8 bg-gray-100 rounded-full overflow-hidden relative">
                  <div className={`h-full rounded-full ${p.highlight ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 'bg-gradient-to-r from-emerald-400 to-teal-500'}`} style={{ width: `${Math.max((p.value / maxValue) * 100, 5)}%` }} />
                </div>
                <span className={`text-sm font-bold w-28 ${p.highlight ? 'text-amber-600' : 'text-gray-700'}`}>{formatCurrency(p.value)}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center"><Leaf className="w-6 h-6 text-white" /></div>
              <div>
                <p className="text-sm text-amber-700/80">Economia total em {fidelidadeLabel}</p>
                <p className="text-2xl font-extrabold text-amber-800" style={{ fontFamily: "'Montserrat', sans-serif" }}>{formatCurrency(data.resultado.economiaAcumulada)}</p>
              </div>
            </div>
            <ArrowRight className="w-8 h-8 text-amber-400" />
          </div>
        </div>

        {/* Footer - posição absoluta no fundo da página */}
        <footer className="absolute bottom-0 left-0 right-0 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-lg p-1"><img src={coesaLogo} alt="COESA" className="w-full h-full object-contain" /></div>
              <div>
                <p className="text-sm font-semibold">{configs.empresa_nome}</p>
                <p className="text-xs text-gray-400">{configs.empresa_slogan}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right text-xs text-gray-400">
                {data.consumo.responsavelComercial && <p>Consultor: <span className="text-white">{data.consumo.responsavelComercial}</span></p>}
                <div className="flex items-center justify-end gap-1 mt-1">
                  <Mail className="w-3 h-3" />
                  <span>{configs.email_contato}</span>
                </div>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <Phone className="w-3 h-3" />
                  <span>{configs.telefone_contato}</span>
                </div>
              </div>

              <div className="bg-white rounded-lg p-1.5 shadow-lg">
                <QRCodeSVG 
                  value={`https://wa.me/${configs.whatsapp_numero}?text=Olá! Tenho interesse na proposta de energia solar. Cliente: ${encodeURIComponent(data.cliente.nome)}`}
                  size={48}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#1e5631"
                />
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-gray-500">
            <span>Escaneie o QR Code para falar conosco pelo WhatsApp</span>
          </div>
          
          {/* Rodapé específico para Proposta Inicial */}
          {data.dadosInferidos && (
            <div className="mt-3 pt-3 border-t border-amber-500/30">
              <div className="flex items-center justify-center gap-2 bg-amber-500/20 rounded-lg px-4 py-2">
                <span className="text-amber-300 text-lg">⚠️</span>
                <p className="text-[9px] text-amber-200 text-center leading-tight">
                  <strong className="text-amber-100">PROPOSTA INICIAL:</strong> Valores estimados por aproximação. 
                  Para validação dos números apresentados, solicite uma <strong className="text-white">proposta definitiva</strong> junto à COESA.
                </p>
              </div>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
