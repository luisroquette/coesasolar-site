import { Sun, Zap, Shield, CheckCircle2, ArrowRight, TrendingUp, Phone, Mail, Award, ArrowRightLeft, AlertTriangle, Clock, Target, DollarSign, Calendar, Unlock } from 'lucide-react';
import { motion, Variants, Easing } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import coesaLogo from '@/assets/logos/coesa-green.png';
import { formatCurrency, formatNumber, PLANO_UNLOCK_DESCONTO, PLANO_UNLOCK_FIDELIDADE } from '@/lib/calculations';
import { ClienteGDOutput, formatPayback } from '@/lib/calculations-cliente-gd';

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

export interface ClienteGDPDFData {
  cliente: {
    nome: string;
    cpfCnpj?: string;
    cidade: string;
    uf: string;
    email?: string;
    telefone?: string;
  };
  instalacao: {
    concessionaria: string;
    tipoInstalacao: string;
    numeroUcs: number;
    consumoMedio: number;
    tarifa: number;
    cip: number;
  };
  concorrente: {
    nome: string;
    descontoPercentual: number;
    multaRescisoria: number;
    mesesRestantes: number;
  };
  coesa: {
    descontoPercentual: number;
    fidelidadeAnos: number;
  };
  resultado: ClienteGDOutput;
  configuracoes?: ConfiguracoesPDF;
}

interface PropostaClienteGDPDFProps {
  data: ClienteGDPDFData;
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

// SVG Chart Component for PDF (static, no Recharts)
function FluxoCaixaSVG({ 
  multaRescisoria, 
  fluxoCaixa, 
  paybackMeses 
}: { 
  multaRescisoria: number; 
  fluxoCaixa: ClienteGDOutput['fluxoCaixaMigracao'];
  paybackMeses: number | null;
}) {
  if (multaRescisoria <= 0 || !fluxoCaixa.length) return null;

  const maxMeses = Math.min(fluxoCaixa.length, 24);
  const chartData = fluxoCaixa.slice(0, maxMeses);
  const maxEconomia = Math.max(...chartData.map(d => d.economiaAcumulada), multaRescisoria);
  
  const width = 340;
  const height = 100;
  const padding = { top: 10, right: 10, bottom: 20, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const xScale = (index: number) => padding.left + (index / (maxMeses - 1)) * chartWidth;
  const yScale = (value: number) => padding.top + chartHeight - (value / maxEconomia) * chartHeight;

  const economiaPath = chartData.map((d, i) => 
    `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.economiaAcumulada)}`
  ).join(' ');

  const multaY = yScale(multaRescisoria);
  const paybackX = paybackMeses && paybackMeses <= maxMeses ? xScale(paybackMeses - 1) : null;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map(pct => {
        const y = padding.top + chartHeight - (pct / 100) * chartHeight;
        return (
          <line 
            key={pct} 
            x1={padding.left} 
            y1={y} 
            x2={width - padding.right} 
            y2={y} 
            stroke="#e5e7eb" 
            strokeDasharray="2,2"
          />
        );
      })}
      
      {/* Multa line */}
      <line 
        x1={padding.left} 
        y1={multaY} 
        x2={width - padding.right} 
        y2={multaY} 
        stroke="#ef4444" 
        strokeWidth="2" 
        strokeDasharray="4,2"
      />
      <text x={padding.left + 2} y={multaY - 4} fill="#ef4444" fontSize="8" fontWeight="bold">
        Multa
      </text>

      {/* Economia area */}
      <path
        d={`${economiaPath} L ${xScale(maxMeses - 1)} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`}
        fill="url(#economiaGradient)"
        opacity="0.3"
      />
      
      {/* Economia line */}
      <path
        d={economiaPath}
        fill="none"
        stroke="#10b981"
        strokeWidth="2"
      />

      {/* Payback point */}
      {paybackX && (
        <>
          <line 
            x1={paybackX} 
            y1={padding.top} 
            x2={paybackX} 
            y2={padding.top + chartHeight} 
            stroke="#f59e0b" 
            strokeWidth="2" 
            strokeDasharray="4,2"
          />
          <circle cx={paybackX} cy={multaY} r="4" fill="#f59e0b" />
          <text x={paybackX} y={padding.top - 2} fill="#f59e0b" fontSize="8" textAnchor="middle" fontWeight="bold">
            Payback
          </text>
        </>
      )}

      {/* X axis labels */}
      {[0, 6, 12, 18, 24].filter(m => m < maxMeses).map(m => (
        <text 
          key={m} 
          x={xScale(m)} 
          y={height - 4} 
          fill="#6b7280" 
          fontSize="8" 
          textAnchor="middle"
        >
          {m === 0 ? 'Hoje' : `${m}m`}
        </text>
      ))}

      {/* Gradient definition */}
      <defs>
        <linearGradient id="economiaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function PropostaClienteGDPDF({ data, animated = true }: PropostaClienteGDPDFProps) {
  const today = new Date();
  const validity = new Date(today);
  validity.setDate(validity.getDate() + 30);

  const configs = data.configuracoes || {
    whatsapp_numero: '5511999999999',
    email_contato: 'contato@coesaenergia.com.br',
    telefone_contato: '(11) 99999-9999',
    empresa_nome: 'COESA Energia Inteligente',
    empresa_slogan: 'Soluções em Energia Renovável',
  };

  const fidelidadeLabel = data.coesa.fidelidadeAnos === 1 
    ? '1 ano' 
    : `${data.coesa.fidelidadeAnos} anos`;

  const whatsappUrl = `https://wa.me/${configs.whatsapp_numero.replace(/\D/g, '')}?text=Olá! Tenho interesse na proposta de migração COESA para ${data.cliente.nome}`;

  const vantagens = [
    { 
      icon: TrendingUp, 
      title: 'Mais Desconto', 
      desc: `+${formatNumber(data.resultado.diferencaPercentual, 0)}% em relação ao atual`,
      color: 'from-emerald-400 to-teal-500'
    },
    { 
      icon: Zap, 
      title: 'Sem Investimento', 
      desc: 'Migração sem custo inicial',
      color: 'from-amber-400 to-orange-500'
    },
    { 
      icon: Shield, 
      title: 'Transparência', 
      desc: 'Desconto garantido por contrato',
      color: 'from-blue-400 to-indigo-500'
    },
    { 
      icon: Sun, 
      title: 'Energia Limpa', 
      desc: '100% renovável e sustentável',
      color: 'from-purple-400 to-pink-500'
    },
  ];

  const periodos = [
    { label: '1 mês', value: data.resultado.diferencaMensal },
    { label: '1 ano', value: data.resultado.economiaAdicionalAnual },
    { label: fidelidadeLabel, value: data.resultado.economiaAdicionalAcumulada, highlight: true },
  ];

  const maxValue = Math.max(...periodos.map(p => p.value));

  if (!animated) {
    return (
      <StaticPDF 
        data={data} 
        vantagens={vantagens} 
        periodos={periodos} 
        maxValue={maxValue} 
        today={today} 
        validity={validity} 
        configs={configs} 
        fidelidadeLabel={fidelidadeLabel}
        whatsappUrl={whatsappUrl}
      />
    );
  }

  return (
    <motion.div 
      id="proposta-cliente-gd-pdf" 
      className="w-[210mm] bg-white font-sans text-gray-900"
      style={{ fontFamily: "'Open Sans', sans-serif" }}
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {/* ========== PÁGINA 1 - COMPARATIVO ========== */}
      <div 
        className="flex flex-col relative overflow-hidden box-border"
        style={{ height: '297mm', maxHeight: '297mm', pageBreakAfter: 'always', breakAfter: 'page' }}
      >
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
          <motion.div 
            className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-orange-500 to-amber-500 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"
            animate={{ scale: [1, 1.1, 1], opacity: [0.03, 0.05, 0.03] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div 
            className="absolute bottom-0 left-0 w-80 h-80 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2"
            animate={{ scale: [1, 1.15, 1], opacity: [0.03, 0.04, 0.03] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          />
        </div>

        {/* ========== HEADER ========== */}
        <motion.header 
          className="relative bg-gradient-to-r from-orange-600 via-amber-500 to-orange-500 text-white px-8 py-5"
          variants={fadeInUp}
        >
          <div className="absolute top-0 right-0 w-64 h-full overflow-hidden">
            <motion.div 
              className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>

          <div className="relative flex items-center justify-between">
            <motion.div className="flex items-center gap-4" variants={fadeInLeft}>
              <motion.div 
                className="w-14 h-14 bg-white rounded-xl p-2 shadow-lg"
                whileHover={{ scale: 1.05, rotate: 5 }}
              >
                <img src={coesaLogo} alt="COESA" className="w-full h-full object-contain" />
              </motion.div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  COESA Energia
                </h1>
                <p className="text-orange-100 text-sm">Energia Inteligente para você</p>
              </div>
            </motion.div>

            <motion.div className="text-right" variants={fadeInRight}>
              <div className="flex flex-col items-end gap-1 mb-2">
                {isPlanoUnlock(data.coesa.descontoPercentual, data.coesa.fidelidadeAnos) ? (
                  <motion.div 
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500/30 to-amber-500/30 backdrop-blur-sm rounded-full px-4 py-1.5 border border-white/40"
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
                    <Unlock className="w-4 h-4 text-yellow-200" />
                    <span className="text-xs font-bold text-yellow-100">PLANO UNLOCK</span>
                  </motion.div>
                ) : (
                  <motion.div 
                    className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5"
                    animate={{ scale: [1, 1.02, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    <span className="text-xs font-medium">PROPOSTA MIGRAÇÃO</span>
                  </motion.div>
                )}
                <div className="inline-flex items-center gap-1.5 bg-orange-100/20 backdrop-blur-sm border border-white/30 rounded-full px-3 py-1">
                  <Shield className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-semibold">Transparência Garantida</span>
                </div>
              </div>
              <p className="text-sm text-orange-100">
                Emissão: {today.toLocaleDateString('pt-BR')}
              </p>
              <p className="text-sm font-medium">
                Válida até: {validity.toLocaleDateString('pt-BR')}
              </p>
            </motion.div>
          </div>
        </motion.header>

        {/* ========== CLIENT CARD ========== */}
        <motion.div className="px-8 -mt-4 relative z-10" variants={fadeInUp}>
          <motion.div 
            className="bg-white rounded-2xl shadow-xl border border-gray-100 p-5 flex items-center justify-between"
            whileHover={{ y: -2, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)' }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Cliente</p>
              <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                {data.cliente.nome || 'Nome do Cliente'}
              </h2>
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-gray-600">
                {data.cliente.cpfCnpj && <span>{data.cliente.cpfCnpj}</span>}
                {(data.cliente.cidade || data.cliente.uf) && (
                  <span>{[data.cliente.cidade, data.cliente.uf].filter(Boolean).join(' - ')}</span>
                )}
              </div>
            </div>
            <div className="text-right border-l border-gray-200 pl-6 ml-4">
              <p className="text-xs text-gray-500">{data.instalacao.concessionaria}</p>
              <p className="text-sm font-medium text-gray-700">{data.instalacao.tipoInstalacao} • {data.instalacao.numeroUcs} UC(s)</p>
              <p className="text-xs text-gray-500 mt-1">{formatNumber(data.instalacao.consumoMedio, 0)} kWh/mês</p>
            </div>
          </motion.div>
        </motion.div>

        {/* ========== HERO - TROQUE E ECONOMIZE ========== */}
        <motion.div className="px-8 mt-6" variants={fadeInUp}>
          <div className="relative bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 rounded-3xl p-6 overflow-hidden">
            <motion.div 
              className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-200/40 to-amber-200/40 rounded-full transform translate-x-1/3 -translate-y-1/3"
              animate={{ rotate: 360 }}
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
            />
            
            <div className="relative flex items-center justify-between">
              <motion.div className="flex-1 pr-8" variants={fadeInLeft}>
                <h3 
                  className="text-3xl font-extrabold text-gray-900 leading-tight mb-2"
                  style={{ fontFamily: "'Montserrat', sans-serif" }}
                >
                  Troque e<br />
                  <span className="text-orange-600">Economize Mais!</span>
                </h3>
                <p className="text-gray-600">
                  Migre do <strong>{data.concorrente.nome || 'seu consórcio atual'}</strong> para a COESA e 
                  ganhe <strong>+{formatNumber(data.resultado.diferencaPercentual, 0)}%</strong> de desconto adicional!
                </p>
              </motion.div>

              <motion.div className="relative flex-shrink-0" variants={scaleIn}>
                <motion.div 
                  className="w-36 h-36 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 shadow-2xl flex flex-col items-center justify-center text-white"
                  animate={{ 
                    boxShadow: [
                      '0 25px 50px -12px rgba(249, 115, 22, 0.4)',
                      '0 25px 60px -12px rgba(249, 115, 22, 0.6)',
                      '0 25px 50px -12px rgba(249, 115, 22, 0.4)',
                    ]
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <div className="absolute inset-1 rounded-full border-4 border-white/30" />
                  <motion.span 
                    className="text-3xl font-black leading-none"
                    style={{ fontFamily: "'Montserrat', sans-serif" }}
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    +{formatNumber(data.resultado.diferencaPercentual, 0)}%
                  </motion.span>
                  <span className="text-xs font-medium mt-1 opacity-90 whitespace-nowrap">DESCONTO EXTRA</span>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* ========== COMPARATIVO LADO A LADO ========== */}
        <motion.div className="px-8 mt-6" variants={staggerCards}>
          <motion.h4 
            className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3" 
            style={{ fontFamily: "'Montserrat', sans-serif" }}
            variants={fadeInUp}
          >
            Comparativo Mensal
          </motion.h4>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Concorrente */}
            <motion.div 
              className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 relative overflow-hidden"
              variants={cardVariant}
            >
              <div className="absolute top-2 right-2">
                <span className="text-xs font-medium text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">ATUAL</span>
              </div>
              <p className="text-sm font-semibold text-gray-500 mb-1">{data.concorrente.nome || 'Concorrente'}</p>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg font-bold text-gray-600 bg-gray-200 px-3 py-1 rounded-full">
                  {formatNumber(data.concorrente.descontoPercentual, 0)}% OFF
                </span>
              </div>
              <div className="text-3xl font-bold text-gray-700" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                {formatCurrency(data.resultado.valorConcorrente)}
              </div>
              <p className="text-xs text-gray-500 mt-2">por mês</p>
            </motion.div>

            {/* COESA */}
            <motion.div 
              className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white relative overflow-hidden shadow-lg"
              variants={cardVariant}
              whileHover={{ scale: 1.02 }}
            >
              <motion.div 
                className="absolute -top-4 -right-4 w-20 h-20 bg-white/10 rounded-full"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 4, repeat: Infinity }}
              />
              
              <div className="absolute top-2 right-2">
                <span className="text-xs font-medium text-emerald-100 bg-white/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Award className="w-3 h-3" />
                  RECOMENDADO
                </span>
              </div>
              <p className="text-sm font-semibold text-emerald-100 mb-1">COESA Energia</p>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg font-bold text-white bg-white/20 px-3 py-1 rounded-full">
                  {formatNumber(data.coesa.descontoPercentual, 0)}% OFF
                </span>
              </div>
              <div className="text-3xl font-bold" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                {formatCurrency(data.resultado.valorCoesa)}
              </div>
              <p className="text-xs text-emerald-100 mt-2">por mês</p>
            </motion.div>
          </div>

          {/* Economia Adicional */}
          <motion.div 
            className="mt-4 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400 rounded-2xl p-4 flex items-center justify-between shadow-lg"
            variants={cardVariant}
            animate={{
              boxShadow: [
                '0 10px 25px -5px rgba(251, 191, 36, 0.3)',
                '0 15px 35px -5px rgba(251, 191, 36, 0.5)',
                '0 10px 25px -5px rgba(251, 191, 36, 0.3)',
              ]
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="flex items-center gap-3">
              <motion.div 
                className="w-10 h-10 bg-white/30 rounded-full flex items-center justify-center"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <TrendingUp className="w-5 h-5 text-amber-800" />
              </motion.div>
              <div>
                <p className="text-xs font-medium text-amber-800/80 uppercase tracking-wider">Economia Adicional Mensal</p>
                <motion.p 
                  className="text-2xl font-extrabold text-amber-900" 
                  style={{ fontFamily: "'Montserrat', sans-serif" }}
                >
                  {formatCurrency(data.resultado.diferencaMensal)}
                </motion.p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-amber-800/80">por mês</p>
              <p className="text-sm font-bold text-amber-900">{formatCurrency(data.resultado.economiaAdicionalAnual)}/ano</p>
            </div>
          </motion.div>
        </motion.div>

        {/* ========== PROJEÇÃO DE ECONOMIA ========== */}
        <motion.div className="px-8 mt-6" variants={staggerCards}>
          <motion.h4 
            className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3" 
            style={{ fontFamily: "'Montserrat', sans-serif" }}
            variants={fadeInUp}
          >
            Projeção de Economia Adicional
          </motion.h4>
          
          <div className="space-y-2">
            {periodos.map((p, i) => (
              <motion.div 
                key={i} 
                className={`flex items-center gap-3 ${p.highlight ? 'bg-emerald-50 border border-emerald-200 rounded-xl p-2' : ''}`}
                variants={cardVariant}
              >
                <span className="text-xs font-medium text-gray-600 w-20">{p.label}</span>
                <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div 
                    className={`h-full ${p.highlight ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-amber-400 to-orange-400'} rounded-full`}
                    initial={{ width: 0 }}
                    animate={{ width: `${(p.value / maxValue) * 100}%` }}
                    transition={{ duration: 1, delay: 0.2 + i * 0.1 }}
                  />
                </div>
                <span className={`text-sm font-bold ${p.highlight ? 'text-emerald-700' : 'text-gray-700'} w-28 text-right`}>
                  {formatCurrency(p.value)}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ========== VANTAGENS ========== */}
        <motion.div className="px-8 mt-6" variants={staggerCards}>
          <motion.h4 
            className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3" 
            style={{ fontFamily: "'Montserrat', sans-serif" }}
            variants={fadeInUp}
          >
            Vantagens da Migração
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

        {/* ========== RODAPÉ PÁGINA 1 ========== */}
        <div className="absolute bottom-0 left-0 right-0 px-8 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Proposta de Migração • {data.cliente.nome}</span>
            <span>Página 1/2</span>
          </div>
        </div>
      </div>

      {/* ========== PÁGINA 2 - ANÁLISE DA MULTA ========== */}
      <div 
        className="flex flex-col relative overflow-hidden box-border"
        style={{ height: '297mm', maxHeight: '297mm' }}
      >
        {/* Background */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none">
          <div className="absolute top-1/2 left-1/2 w-[600px] h-[600px] bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2" />
        </div>

        {/* Header Secundário */}
        <motion.header 
          className="relative bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 text-white px-8 py-4"
          variants={fadeInUp}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-white rounded-lg p-1.5 shadow">
                <img src={coesaLogo} alt="COESA" className="w-full h-full object-contain" />
              </div>
              <div>
                <h2 className="text-lg font-bold" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  Análise de Viabilidade
                </h2>
                <p className="text-emerald-100 text-xs">Proposta de Migração para {data.cliente.nome}</p>
              </div>
            </div>
            <div className="text-right text-xs text-emerald-100">
              <p>Fidelidade: {fidelidadeLabel}</p>
              <p>Desconto: {formatNumber(data.coesa.descontoPercentual, 0)}%</p>
            </div>
          </div>
        </motion.header>

        {/* ========== SEÇÃO MULTA RESCISÓRIA ========== */}
        <motion.div className="px-8 mt-6" variants={fadeInUp}>
          {data.concorrente.multaRescisoria > 0 ? (
            <>
              <motion.h4 
                className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2" 
                style={{ fontFamily: "'Montserrat', sans-serif" }}
                variants={fadeInUp}
              >
                <DollarSign className="w-4 h-4 text-red-500" />
                Análise da Multa Rescisória
              </motion.h4>

              {/* Cards de métricas */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <motion.div 
                  className="bg-red-50 border border-red-200 rounded-xl p-4 text-center"
                  variants={cardVariant}
                >
                  <p className="text-xs text-red-600 uppercase tracking-wider mb-1">Multa Rescisória</p>
                  <p className="text-2xl font-bold text-red-700" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    {formatCurrency(data.concorrente.multaRescisoria)}
                  </p>
                </motion.div>

                <motion.div 
                  className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center"
                  variants={cardVariant}
                >
                  <p className="text-xs text-amber-600 uppercase tracking-wider mb-1">Payback</p>
                  <p className="text-2xl font-bold text-amber-700" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    {formatPayback(data.resultado.paybackMeses)}
                  </p>
                </motion.div>

                <motion.div 
                  className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center"
                  variants={cardVariant}
                >
                  <p className="text-xs text-emerald-600 uppercase tracking-wider mb-1">ROI Total</p>
                  <p className="text-2xl font-bold text-emerald-700" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    {formatNumber(data.resultado.roiMigracao, 0)}%
                  </p>
                </motion.div>
              </div>

              {/* Gráfico de Fluxo de Caixa */}
              <motion.div 
                className="bg-gray-50 rounded-xl border border-gray-200 p-4"
                variants={cardVariant}
              >
                <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">
                  Fluxo de Caixa da Migração
                </h5>
                <FluxoCaixaSVG 
                  multaRescisoria={data.concorrente.multaRescisoria}
                  fluxoCaixa={data.resultado.fluxoCaixaMigracao}
                  paybackMeses={data.resultado.paybackMeses}
                />
                <div className="flex items-center justify-center gap-6 mt-3 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-emerald-500 rounded" />
                    Economia Acumulada
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-red-500 rounded" style={{ borderStyle: 'dashed' }} />
                    Multa Rescisória
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-amber-500 rounded-full" />
                    Ponto de Payback
                  </span>
                </div>
              </motion.div>

              {/* Alerta de Payback */}
              {data.resultado.paybackMeses && data.resultado.paybackMeses > data.coesa.fidelidadeAnos * 12 && (
                <motion.div 
                  className="mt-4 bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-start gap-3"
                  variants={cardVariant}
                >
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-700">Atenção: Payback excede a fidelidade</p>
                    <p className="text-xs text-red-600 mt-1">
                      O tempo para recuperar a multa ({formatPayback(data.resultado.paybackMeses)}) é maior que o período de 
                      fidelidade ({fidelidadeLabel}). Considere negociar a multa ou estender a fidelidade.
                    </p>
                  </div>
                </motion.div>
              )}
            </>
          ) : (
            <motion.div 
              className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-8 text-center"
              variants={scaleIn}
            >
              <motion.div 
                className="w-16 h-16 mx-auto bg-emerald-500 rounded-full flex items-center justify-center mb-4"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <CheckCircle2 className="w-8 h-8 text-white" />
              </motion.div>
              <h4 className="text-xl font-bold text-emerald-800" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                Migração Sem Custos Adicionais!
              </h4>
              <p className="text-emerald-700 mt-2">
                Não há multa rescisória. A economia começa imediatamente!
              </p>
            </motion.div>
          )}
        </motion.div>

        {/* ========== CONCLUSÃO ========== */}
        <motion.div className="px-8 mt-6" variants={fadeInUp}>
          <motion.div 
            className={`rounded-2xl p-6 ${
              data.resultado.migracaoRecomendada 
                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white' 
                : 'bg-gradient-to-br from-amber-500 to-orange-500 text-white'
            }`}
            variants={scaleIn}
          >
            <div className="flex items-center gap-4">
              <motion.div 
                className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                {data.resultado.migracaoRecomendada ? (
                  <CheckCircle2 className="w-10 h-10 text-white" />
                ) : (
                  <AlertTriangle className="w-10 h-10 text-white" />
                )}
              </motion.div>
              <div className="flex-1">
                <h4 className="text-2xl font-bold" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  {data.resultado.migracaoRecomendada ? 'MIGRAÇÃO VANTAJOSA!' : 'ANÁLISE NECESSÁRIA'}
                </h4>
                <p className="text-sm opacity-90 mt-1">
                  {data.resultado.migracaoRecomendada 
                    ? `Economia adicional de ${formatCurrency(data.resultado.economiaAdicionalAcumulada)} em ${fidelidadeLabel}!`
                    : 'Os termos atuais requerem negociação adicional.'
                  }
                </p>
              </div>
            </div>

            {/* Resumo de benefícios */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-xs opacity-80">Economia Mensal</p>
                <p className="text-lg font-bold">{formatCurrency(data.resultado.diferencaMensal)}</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-xs opacity-80">Economia Anual</p>
                <p className="text-lg font-bold">{formatCurrency(data.resultado.economiaAdicionalAnual)}</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-xs opacity-80">ROI da Migração</p>
                <p className="text-lg font-bold">{formatNumber(data.resultado.roiMigracao, 0)}%</p>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* ========== RODAPÉ COM CONTATOS ========== */}
        <div className="absolute bottom-0 left-0 right-0">
          <motion.div 
            className="px-8 py-6 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white"
            variants={fadeInUp}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-xl p-2">
                    <img src={coesaLogo} alt="COESA" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <p className="font-bold text-lg" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                      {configs.empresa_nome}
                    </p>
                    <p className="text-gray-400 text-sm">{configs.empresa_slogan}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  <span>{configs.telefone_contato}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-emerald-400" />
                  <span>{configs.email_contato}</span>
                </div>
                <div className="bg-white p-2 rounded-xl">
                  <QRCodeSVG 
                    value={whatsappUrl}
                    size={60}
                    level="M"
                    bgColor="white"
                    fgColor="#1f2937"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700 text-xs text-gray-400">
              <span>Fidelidade: {fidelidadeLabel} • Desconto: {formatNumber(data.coesa.descontoPercentual, 0)}%</span>
              <span>Válida até {validity.toLocaleDateString('pt-BR')}</span>
              <span>Página 2/2</span>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

// ========== VERSÃO ESTÁTICA PARA PDF ==========
interface StaticPDFProps {
  data: ClienteGDPDFData;
  vantagens: { icon: any; title: string; desc: string; color: string }[];
  periodos: { label: string; value: number; highlight?: boolean }[];
  maxValue: number;
  today: Date;
  validity: Date;
  configs: ConfiguracoesPDF;
  fidelidadeLabel: string;
  whatsappUrl: string;
}

function StaticPDF({ data, vantagens, periodos, maxValue, today, validity, configs, fidelidadeLabel, whatsappUrl }: StaticPDFProps) {
  return (
    <div 
      id="proposta-cliente-gd-pdf" 
      className="w-[210mm] bg-white font-sans text-gray-900"
      style={{ fontFamily: "'Open Sans', sans-serif" }}
    >
      {/* ========== PÁGINA 1 ========== */}
      <div 
        className="flex flex-col relative overflow-hidden box-border"
        style={{ height: '297mm', maxHeight: '297mm', pageBreakAfter: 'always', breakAfter: 'page' }}
      >
        {/* Header */}
        <header className="relative bg-gradient-to-r from-orange-600 via-amber-500 to-orange-500 text-white px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white rounded-xl p-2 shadow-lg">
                <img src={coesaLogo} alt="COESA" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  COESA Energia
                </h1>
                <p className="text-orange-100 text-sm">Energia Inteligente para você</p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex flex-col items-end gap-1 mb-2">
                {isPlanoUnlock(data.coesa.descontoPercentual, data.coesa.fidelidadeAnos) ? (
                  <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500/30 to-amber-500/30 backdrop-blur-sm rounded-full px-4 py-1.5 border border-white/40">
                    <Unlock className="w-4 h-4 text-yellow-200" />
                    <span className="text-xs font-bold text-yellow-100">PLANO UNLOCK</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5">
                    <ArrowRightLeft className="w-4 h-4" />
                    <span className="text-xs font-medium">PROPOSTA MIGRAÇÃO</span>
                  </div>
                )}
                <div className="inline-flex items-center gap-1.5 bg-orange-100/20 border border-white/30 rounded-full px-3 py-1">
                  <Shield className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-semibold">Transparência Garantida</span>
                </div>
              </div>
              <p className="text-sm text-orange-100">Emissão: {today.toLocaleDateString('pt-BR')}</p>
              <p className="text-sm font-medium">Válida até: {validity.toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
        </header>

        {/* Client Card */}
        <div className="px-8 -mt-4 relative z-10">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-5 flex items-center justify-between">
            <div className="flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Cliente</p>
              <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                {data.cliente.nome || 'Nome do Cliente'}
              </h2>
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-gray-600">
                {data.cliente.cpfCnpj && <span>{data.cliente.cpfCnpj}</span>}
                {(data.cliente.cidade || data.cliente.uf) && (
                  <span>{[data.cliente.cidade, data.cliente.uf].filter(Boolean).join(' - ')}</span>
                )}
              </div>
            </div>
            <div className="text-right border-l border-gray-200 pl-6 ml-4">
              <p className="text-xs text-gray-500">{data.instalacao.concessionaria}</p>
              <p className="text-sm font-medium text-gray-700">{data.instalacao.tipoInstalacao} • {data.instalacao.numeroUcs} UC(s)</p>
              <p className="text-xs text-gray-500 mt-1">{formatNumber(data.instalacao.consumoMedio, 0)} kWh/mês</p>
            </div>
          </div>
        </div>

        {/* Hero */}
        <div className="px-8 mt-6">
          <div className="relative bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 rounded-3xl p-6 overflow-hidden">
            <div className="relative flex items-center justify-between">
              <div className="flex-1 pr-8">
                <h3 className="text-3xl font-extrabold text-gray-900 leading-tight mb-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  Troque e<br /><span className="text-orange-600">Economize Mais!</span>
                </h3>
                <p className="text-gray-600">
                  Migre do <strong>{data.concorrente.nome || 'seu consórcio atual'}</strong> para a COESA e 
                  ganhe <strong>+{formatNumber(data.resultado.diferencaPercentual, 0)}%</strong> de desconto adicional!
                </p>
              </div>
              <div className="w-36 h-36 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 shadow-2xl flex flex-col items-center justify-center text-white">
                <div className="absolute inset-1 rounded-full border-4 border-white/30" />
                <span className="text-3xl font-black leading-none" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  +{formatNumber(data.resultado.diferencaPercentual, 0)}%
                </span>
                <span className="text-xs font-medium mt-1 opacity-90 whitespace-nowrap">DESCONTO EXTRA</span>
              </div>
            </div>
          </div>
        </div>

        {/* Comparativo */}
        <div className="px-8 mt-6">
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            Comparativo Mensal
          </h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 relative">
              <div className="absolute top-2 right-2">
                <span className="text-xs font-medium text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">ATUAL</span>
              </div>
              <p className="text-sm font-semibold text-gray-500 mb-1">{data.concorrente.nome || 'Concorrente'}</p>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg font-bold text-gray-600 bg-gray-200 px-3 py-1 rounded-full">
                  {formatNumber(data.concorrente.descontoPercentual, 0)}% OFF
                </span>
              </div>
              <div className="text-3xl font-bold text-gray-700" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                {formatCurrency(data.resultado.valorConcorrente)}
              </div>
              <p className="text-xs text-gray-500 mt-2">por mês</p>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-4 text-white relative shadow-lg">
              <div className="absolute top-2 right-2">
                <span className="text-xs font-medium text-emerald-100 bg-white/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Award className="w-3 h-3" />
                  RECOMENDADO
                </span>
              </div>
              <p className="text-sm font-semibold text-emerald-100 mb-1">COESA Energia</p>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg font-bold text-white bg-white/20 px-3 py-1 rounded-full">
                  {formatNumber(data.coesa.descontoPercentual, 0)}% OFF
                </span>
              </div>
              <div className="text-3xl font-bold" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                {formatCurrency(data.resultado.valorCoesa)}
              </div>
              <p className="text-xs text-emerald-100 mt-2">por mês</p>
            </div>
          </div>

          <div className="mt-4 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-400 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/30 rounded-full flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-amber-800" />
              </div>
              <div>
                <p className="text-xs font-medium text-amber-800/80 uppercase tracking-wider">Economia Adicional Mensal</p>
                <p className="text-2xl font-extrabold text-amber-900" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  {formatCurrency(data.resultado.diferencaMensal)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-amber-800/80">por mês</p>
              <p className="text-sm font-bold text-amber-900">{formatCurrency(data.resultado.economiaAdicionalAnual)}/ano</p>
            </div>
          </div>
        </div>

        {/* Projeção */}
        <div className="px-8 mt-6">
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            Projeção de Economia Adicional
          </h4>
          <div className="space-y-2">
            {periodos.map((p, i) => (
              <div key={i} className={`flex items-center gap-3 ${p.highlight ? 'bg-emerald-50 border border-emerald-200 rounded-xl p-2' : ''}`}>
                <span className="text-xs font-medium text-gray-600 w-20">{p.label}</span>
                <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${p.highlight ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-amber-400 to-orange-400'} rounded-full`}
                    style={{ width: `${(p.value / maxValue) * 100}%` }}
                  />
                </div>
                <span className={`text-sm font-bold ${p.highlight ? 'text-emerald-700' : 'text-gray-700'} w-28 text-right`}>
                  {formatCurrency(p.value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Vantagens */}
        <div className="px-8 mt-6">
          <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3" style={{ fontFamily: "'Montserrat', sans-serif" }}>
            Vantagens da Migração
          </h4>
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

        {/* Footer P1 */}
        <div className="absolute bottom-0 left-0 right-0 px-8 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Proposta de Migração • {data.cliente.nome}</span>
            <span>Página 1/2</span>
          </div>
        </div>
      </div>

      {/* ========== PÁGINA 2 ========== */}
      <div 
        className="flex flex-col relative overflow-hidden box-border"
        style={{ height: '297mm', maxHeight: '297mm' }}
      >
        {/* Header Secundário */}
        <header className="relative bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 text-white px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-white rounded-lg p-1.5 shadow">
                <img src={coesaLogo} alt="COESA" className="w-full h-full object-contain" />
              </div>
              <div>
                <h2 className="text-lg font-bold" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  Análise de Viabilidade
                </h2>
                <p className="text-emerald-100 text-xs">Proposta de Migração para {data.cliente.nome}</p>
              </div>
            </div>
            <div className="text-right text-xs text-emerald-100">
              <p>Fidelidade: {fidelidadeLabel}</p>
              <p>Desconto: {formatNumber(data.coesa.descontoPercentual, 0)}%</p>
            </div>
          </div>
        </header>

        {/* Seção Multa */}
        <div className="px-8 mt-6">
          {data.concorrente.multaRescisoria > 0 ? (
            <>
              <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                <DollarSign className="w-4 h-4 text-red-500" />
                Análise da Multa Rescisória
              </h4>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-red-600 uppercase tracking-wider mb-1">Multa Rescisória</p>
                  <p className="text-2xl font-bold text-red-700" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    {formatCurrency(data.concorrente.multaRescisoria)}
                  </p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-amber-600 uppercase tracking-wider mb-1">Payback</p>
                  <p className="text-2xl font-bold text-amber-700" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    {formatPayback(data.resultado.paybackMeses)}
                  </p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-emerald-600 uppercase tracking-wider mb-1">ROI Total</p>
                  <p className="text-2xl font-bold text-emerald-700" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    {formatNumber(data.resultado.roiMigracao, 0)}%
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <h5 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">
                  Fluxo de Caixa da Migração
                </h5>
                <FluxoCaixaSVG 
                  multaRescisoria={data.concorrente.multaRescisoria}
                  fluxoCaixa={data.resultado.fluxoCaixaMigracao}
                  paybackMeses={data.resultado.paybackMeses}
                />
                <div className="flex items-center justify-center gap-6 mt-3 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-emerald-500 rounded" />
                    Economia Acumulada
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-red-500 rounded" />
                    Multa Rescisória
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-amber-500 rounded-full" />
                    Ponto de Payback
                  </span>
                </div>
              </div>

              {data.resultado.paybackMeses && data.resultado.paybackMeses > data.coesa.fidelidadeAnos * 12 && (
                <div className="mt-4 bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-700">Atenção: Payback excede a fidelidade</p>
                    <p className="text-xs text-red-600 mt-1">
                      O tempo para recuperar a multa ({formatPayback(data.resultado.paybackMeses)}) é maior que o período de 
                      fidelidade ({fidelidadeLabel}). Considere negociar a multa ou estender a fidelidade.
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 mx-auto bg-emerald-500 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-white" />
              </div>
              <h4 className="text-xl font-bold text-emerald-800" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                Migração Sem Custos Adicionais!
              </h4>
              <p className="text-emerald-700 mt-2">
                Não há multa rescisória. A economia começa imediatamente!
              </p>
            </div>
          )}
        </div>

        {/* Conclusão */}
        <div className="px-8 mt-6">
          <div className={`rounded-2xl p-6 ${
            data.resultado.migracaoRecomendada 
              ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white' 
              : 'bg-gradient-to-br from-amber-500 to-orange-500 text-white'
          }`}>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center">
                {data.resultado.migracaoRecomendada ? (
                  <CheckCircle2 className="w-10 h-10 text-white" />
                ) : (
                  <AlertTriangle className="w-10 h-10 text-white" />
                )}
              </div>
              <div className="flex-1">
                <h4 className="text-2xl font-bold" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  {data.resultado.migracaoRecomendada ? 'MIGRAÇÃO VANTAJOSA!' : 'ANÁLISE NECESSÁRIA'}
                </h4>
                <p className="text-sm opacity-90 mt-1">
                  {data.resultado.migracaoRecomendada 
                    ? `Economia adicional de ${formatCurrency(data.resultado.economiaAdicionalAcumulada)} em ${fidelidadeLabel}!`
                    : 'Os termos atuais requerem negociação adicional.'
                  }
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-6">
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-xs opacity-80">Economia Mensal</p>
                <p className="text-lg font-bold">{formatCurrency(data.resultado.diferencaMensal)}</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-xs opacity-80">Economia Anual</p>
                <p className="text-lg font-bold">{formatCurrency(data.resultado.economiaAdicionalAnual)}</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-xs opacity-80">ROI da Migração</p>
                <p className="text-lg font-bold">{formatNumber(data.resultado.roiMigracao, 0)}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0">
          <div className="px-8 py-6 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-xl p-2">
                    <img src={coesaLogo} alt="COESA" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <p className="font-bold text-lg" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                      {configs.empresa_nome}
                    </p>
                    <p className="text-gray-400 text-sm">{configs.empresa_slogan}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  <span>{configs.telefone_contato}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-emerald-400" />
                  <span>{configs.email_contato}</span>
                </div>
                <div className="bg-white p-2 rounded-xl">
                  <QRCodeSVG 
                    value={whatsappUrl}
                    size={60}
                    level="M"
                    bgColor="white"
                    fgColor="#1f2937"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700 text-xs text-gray-400">
              <span>Fidelidade: {fidelidadeLabel} • Desconto: {formatNumber(data.coesa.descontoPercentual, 0)}%</span>
              <span>Válida até {validity.toLocaleDateString('pt-BR')}</span>
              <span>Página 2/2</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
