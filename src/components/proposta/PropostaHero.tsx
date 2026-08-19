import { motion } from 'framer-motion';
import { Zap, ArrowRight, Clock, Sun, ShieldCheck, Leaf, Info } from 'lucide-react';
import { formatCurrency } from '@/lib/calculations';

interface PropostaHeroProps {
  clienteNome: string;
  concessionaria: string;
  uf: string;
  economiaMensal: number;
  descontoPercentual: number;
  planoLabel: string;
  valorContaOriginal: number;
  valorComCoesa: number;
  diasRestantes: number;
  validadeFormatada: string;
  onCTAClick: () => void;
}

export function PropostaHero({
  clienteNome,
  concessionaria,
  uf,
  economiaMensal,
  descontoPercentual,
  planoLabel,
  valorContaOriginal,
  valorComCoesa,
  diasRestantes,
  validadeFormatada,
  onCTAClick,
}: PropostaHeroProps) {
  return (
    <section className="w-full bg-gradient-to-br from-[#F97316] via-[#EA580C] to-[#C2410C]" style={{ backgroundImage: 'linear-gradient(160deg, #F97316 0%, #EA580C 55%, #C2410C 100%)' }}>
      <div className="max-w-[680px] mx-auto px-5 py-10 sm:py-14 text-center text-white">
        {/* Eyebrow */}
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-block text-[11px] uppercase tracking-[2px] font-semibold text-orange-100 mb-2"
        >
          Proposta Exclusiva
        </motion.span>

        {/* Nome */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-2xl sm:text-3xl font-extrabold leading-tight mb-1"
        >
          {clienteNome}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="text-sm text-orange-100 mb-5"
        >
          Energia solar por assinatura · {concessionaria}{concessionaria && !concessionaria.includes(uf) ? ` · ${uf}` : ''}
        </motion.p>

        {/* Aviso estimativa */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-sm text-orange-50 mb-6 max-w-lg mx-auto text-left"
        >
          <Info className="w-4 h-4 flex-shrink-0 inline-block" />{' '}
          Proposta calculada com base nos dados informados. Valores exatos confirmados após análise técnica gratuita.
        </motion.div>

        {/* Economia destaque */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
        >
          <p className="text-sm uppercase tracking-wider font-semibold text-orange-100 mb-1">
            Você vai economizar
          </p>
          <p className="text-[58px] sm:text-[72px] font-black leading-none tracking-tight drop-shadow-lg">
            {formatCurrency(economiaMensal)}
          </p>
          <p className="text-base text-orange-100 mt-1 mb-3">
            por mês na sua conta de luz
          </p>
          <span className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm font-semibold">
            ● {descontoPercentual}% de desconto — Plano {planoLabel}
          </span>
        </motion.div>

        {/* Comparativo */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="flex items-center justify-center gap-3 mt-8 mb-4"
        >
          <div className="bg-white/10 rounded-xl px-5 py-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-orange-200 font-semibold">Você paga hoje</p>
            <p className="text-2xl sm:text-3xl font-black">{formatCurrency(valorContaOriginal)}</p>
          </div>
          <ArrowRight className="w-5 h-5 text-orange-200 flex-shrink-0" />
          <div className="bg-white/20 rounded-xl px-5 py-3 text-center border border-white/20">
            <p className="text-[11px] uppercase tracking-wider text-orange-100 font-semibold">Com a COESA</p>
            <p className="text-2xl sm:text-3xl font-black">{formatCurrency(valorComCoesa)}</p>
          </div>
        </motion.div>

        {/* Tag economia */}
        <div className="inline-flex items-center gap-1.5 bg-green-500/90 rounded-full px-4 py-1.5 text-sm font-bold mb-6">
          ✦ Economia: {formatCurrency(economiaMensal)}/mês
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          {[
            { icon: ShieldCheck, text: 'Sem investimento' },
            { icon: Sun, text: 'Energia 100% solar' },
            { icon: Leaf, text: 'Regulado pela ANEEL' },
          ].map(({ icon: Icon, text }) => (
            <span key={text} className="inline-flex items-center gap-1 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1 text-xs font-medium text-orange-50">
              <Icon className="w-3.5 h-3.5" />
              {text}
            </span>
          ))}
        </div>

        {/* CTA */}
        <motion.button
          onClick={onCTAClick}
          className="w-full max-w-sm mx-auto flex items-center justify-center gap-2 bg-white text-orange-600 font-bold text-lg py-4 px-6 rounded-2xl shadow-xl hover:bg-orange-50 transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Zap className="w-5 h-5" />
          Quero garantir meu desconto
          <ArrowRight className="w-5 h-5" />
        </motion.button>

        <p className="text-xs text-orange-100/80 mt-3 max-w-xs mx-auto">
          Você será direcionado a um formulário rápido. Nenhum compromisso ainda.
        </p>

        <div className="flex flex-col items-center gap-1 mt-5 text-xs text-orange-200">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Proposta válida por {diasRestantes} dias
          </span>
          <span>Válida até {validadeFormatada}</span>
          <a href="https://wa.me/5531953470438?text=Olá! Tenho uma dúvida sobre a proposta da COESA." target="_blank" rel="noopener noreferrer" className="underline hover:text-white transition-colors mt-1">
            Dúvidas? Fale com a sofIA agora
          </a>
        </div>
      </div>
    </section>
  );
}
