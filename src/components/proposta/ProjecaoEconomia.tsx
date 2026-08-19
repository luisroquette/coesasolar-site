import { motion } from 'framer-motion';
import { AlertTriangle, PiggyBank } from 'lucide-react';
import { formatCurrency } from '@/lib/calculations';

interface ProjecaoEconomiaProps {
  economiaMensal: number;
  economiaAcumulada: number;
  fidelidadeAnos: number;
  planoLabel: string;
}

export function ProjecaoEconomia({ economiaMensal, economiaAcumulada, fidelidadeAnos, planoLabel }: ProjecaoEconomiaProps) {
  // Always show exactly 3 bars: 1 month, midpoint, and full period
  const totalMeses = fidelidadeAnos * 12;
  const midMeses = Math.round(totalMeses / 2);
  const midLabel = midMeses >= 12 
    ? `${Math.floor(midMeses / 12)} ${Math.floor(midMeses / 12) === 1 ? 'ano' : 'anos'}${midMeses % 12 > 0 ? ` e ${midMeses % 12} meses` : ''}`
    : `${midMeses} meses`;

  const barData: Array<{ label: string; value: number; highlight?: boolean }> = [
    { label: '1 mês', value: economiaMensal },
    { label: midLabel, value: economiaMensal * midMeses },
    { label: `${fidelidadeAnos} ${fidelidadeAnos === 1 ? 'ano' : 'anos'}`, value: economiaAcumulada, highlight: true },
  ];

  const maxValue = economiaAcumulada;

  return (
    <section className="py-10 px-5">
      <div className="max-w-[960px] mx-auto">
        <span className="text-[11px] uppercase tracking-[2px] font-semibold text-orange-500 block mb-1">Projeção</span>
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-1">Quanto você vai acumular</h2>
        <p className="text-sm text-gray-500 mb-6">Veja como sua economia cresce com o Plano {planoLabel}</p>

        <div className="space-y-3">
          {barData.map((bar, i) => {
            const pct = maxValue > 0 ? Math.max(5, (bar.value / maxValue) * 100) : 5;
            return (
              <motion.div
                key={bar.label}
                initial={{ opacity: 0, x: -15 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex items-center gap-3"
              >
                <span className="text-xs text-gray-500 w-16 text-right flex-shrink-0 font-medium">{bar.label}</span>
                <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${pct}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 + 0.2, duration: 0.6, ease: 'easeOut' }}
                    className={`h-full rounded-lg ${bar.highlight ? 'bg-gradient-to-r from-orange-400 to-orange-500' : 'bg-green-400'}`}
                  />
                </div>
                <span className={`text-sm font-bold w-24 text-right ${bar.highlight ? 'text-orange-600' : 'text-gray-700'}`}>
                  {formatCurrency(bar.value)}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Total card */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-5 text-center">
          <p className="text-sm font-semibold text-green-700 flex items-center justify-center gap-1.5"><PiggyBank className="w-4 h-4" /> Economia total em {fidelidadeAnos} {fidelidadeAnos === 1 ? 'ano' : 'anos'}</p>
          <p className="text-3xl font-black text-green-700 mt-1">{formatCurrency(economiaAcumulada)}</p>
          <p className="text-xs text-green-600 mt-1">É dinheiro que fica no seu bolso, não na conta da distribuidora</p>
        </div>

        {/* Loss aversion */}
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 mt-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-600">
            Cada mês sem assinar = <strong>{formatCurrency(economiaMensal)}</strong> que ficam com a distribuidora. Você não perde esse dinheiro — ele só deixa de ser seu.
          </p>
        </div>
      </div>
    </section>
  );
}
