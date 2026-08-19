import { motion } from 'framer-motion';
import { ArrowRight, Info } from 'lucide-react';
import { formatCurrency } from '@/lib/calculations';

interface EconomiaDetalhesProps {
  valorContaOriginal: number;
  valorComCoesa: number;
  economiaMensal: number;
  economiaAcumulada: number;
  descontoPercentual: number;
  planoLabel: string;
  fidelidadeAnos: number;
  tarifa: number;
  tarifaComDesconto: number;
}

export function EconomiaDetalhes({
  valorContaOriginal,
  valorComCoesa,
  economiaMensal,
  economiaAcumulada,
  descontoPercentual,
  planoLabel,
  fidelidadeAnos,
  tarifa,
  tarifaComDesconto,
}: EconomiaDetalhesProps) {
  return (
    <section className="py-10 px-5 bg-gray-50">
      <div className="max-w-[960px] mx-auto">
        <span className="text-[11px] uppercase tracking-[2px] font-semibold text-orange-500 block mb-1">Sua Economia</span>
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-1">Sua economia em detalhes</h2>
        <p className="text-sm text-gray-500 mb-6">
          Baseado na sua conta de {formatCurrency(valorContaOriginal)}/mês · Plano {planoLabel}
        </p>

        {/* Comparativo */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 bg-red-50 rounded-xl p-4 text-center border border-red-100">
            <p className="text-[11px] uppercase tracking-wider text-red-400 font-semibold mb-1">Você paga hoje</p>
            <p className="text-2xl font-black text-red-600">{formatCurrency(valorContaOriginal)}</p>
            <p className="text-[11px] text-red-300 mt-1">Tarifa: R$ {tarifa.toFixed(2)}/kWh</p>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
          <div className="flex-1 bg-green-50 rounded-xl p-4 text-center border border-green-200">
            <p className="text-[11px] uppercase tracking-wider text-green-600 font-semibold mb-1">Com a COESA</p>
            <p className="text-2xl font-black text-green-700">{formatCurrency(valorComCoesa)}</p>
            <p className="text-[11px] text-green-500 mt-1">Tarifa: R$ {tarifaComDesconto.toFixed(2)}/kWh</p>
          </div>
        </div>

        {/* Card economia */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-white rounded-2xl border border-green-200 p-5 shadow-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-gray-900">Economia mensal</span>
            <span className="bg-green-100 text-green-700 text-xs font-bold rounded-full px-3 py-0.5">
              {descontoPercentual}% de desconto
            </span>
          </div>
          <p className="text-3xl sm:text-4xl font-black text-green-600 mb-1">{formatCurrency(economiaMensal)}</p>
          <p className="text-sm text-gray-500 mb-4">
            {formatCurrency(economiaAcumulada)} de economia ao longo dos {fidelidadeAnos} anos
          </p>
          <div className="border-t border-gray-100 pt-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-gray-400 leading-relaxed">
              <strong>Como o desconto é calculado:</strong> o desconto incide exclusivamente sobre o valor do consumo de energia em kWh. Taxas obrigatórias da CEMIG (disponibilidade mínima e CIP) não recebem desconto — são encargos regulatórios.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
