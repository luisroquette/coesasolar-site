import { motion } from 'framer-motion';
import { Zap, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/calculations';
import { forwardRef } from 'react';

interface CTAFinalProps {
  planoLabel: string;
  descontoPercentual: number;
  economiaMensal: number;
  validadeFormatada: string;
  onCTAClick: () => void;
}

export const CTAFinal = forwardRef<HTMLElement, CTAFinalProps>(function CTAFinal(
  { planoLabel, descontoPercentual, economiaMensal, validadeFormatada, onCTAClick },
  ref
) {
  return (
    <section
      ref={ref}
      className="w-full bg-gradient-to-br from-[#F97316] via-[#EA580C] to-[#C2410C] py-12 px-5"
      style={{ backgroundImage: 'linear-gradient(160deg, #F97316 0%, #EA580C 55%, #C2410C 100%)' }}
    >
      <div className="max-w-[680px] mx-auto text-center text-white">
        <h2 className="text-2xl sm:text-3xl font-extrabold mb-2">Pronto para começar a economizar?</h2>
        <p className="text-sm text-orange-100 mb-6">
          Plano {planoLabel} · {descontoPercentual}% · {formatCurrency(economiaMensal)}/mês
        </p>

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
        <p className="text-xs text-orange-200 mt-3">Proposta válida até {validadeFormatada}</p>
        <a href="https://wa.me/5531953470438?text=Olá! Tenho uma dúvida sobre a proposta da COESA." target="_blank" rel="noopener noreferrer" className="text-xs text-orange-200 underline hover:text-white transition-colors mt-1">
          Dúvidas? Fale com a sofIA
        </a>
      </div>
    </section>
  );
});
