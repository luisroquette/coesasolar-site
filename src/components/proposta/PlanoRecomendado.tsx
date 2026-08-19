import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Lock } from 'lucide-react';
import { formatCurrency, calcularPropostaAssinante, AssinanteInput } from '@/lib/calculations';
import { PlanoConfig, PLANOS_DISPONIVEIS } from '@/components/PlanSelector';

interface PlanoRecomendadoProps {
  planoAtual: PlanoConfig;
  planos: PlanoConfig[];
  consumoMedio: number;
  tarifa: number;
  cip: number;
  tipoInstalacao: 'Monofásico' | 'Bifásico' | 'Trifásico';
  numeroUcs: number;
  onSelectPlano: (plano: PlanoConfig) => void;
}

export function PlanoRecomendado({
  planoAtual,
  planos,
  consumoMedio,
  tarifa,
  cip,
  tipoInstalacao,
  numeroUcs,
  onSelectPlano,
}: PlanoRecomendadoProps) {
  const [expanded, setExpanded] = useState(false);

  const calcEconomia = (plano: PlanoConfig) => {
    const input: AssinanteInput = { tarifa, cip, consumoMedio, fidelidadeAnos: plano.fidelidadeAnos, descontoPercentual: plano.descontoPercentual, tipoInstalacao, numeroUcs };
    return calcularPropostaAssinante(input);
  };

  const resultadoAtual = calcEconomia(planoAtual);
  const outrosPlanos = planos.filter(p => p.id !== planoAtual.id);

  const planoNomes: Record<number, string> = { 1: 'Básico', 2: 'Smart', 3: 'Premium', 4: 'Unlock' };

  return (
    <section className="py-10 px-5">
      <div className="max-w-[960px] mx-auto">
        <span className="text-[11px] uppercase tracking-[2px] font-semibold text-orange-500 block mb-1">Plano</span>
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-1">Seu plano recomendado</h2>
        <p className="text-sm text-gray-500 mb-6">Baseado no seu perfil de consumo</p>

        {/* Plano destaque */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl overflow-hidden shadow-lg text-white">
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-extrabold text-lg">Plano {planoNomes[planoAtual.fidelidadeAnos] || planoAtual.label}</h3>
              <span className="bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider rounded-full px-2.5 py-0.5">
                Recomendado para você
              </span>
            </div>
            <p className="text-5xl font-black mb-1">{planoAtual.descontoPercentual}%</p>
            <p className="text-sm text-orange-100 mb-4">de desconto</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-orange-200">Economia/mês</p>
                <p className="font-bold text-lg">{formatCurrency(resultadoAtual.economiaMensal)}</p>
              </div>
              <div>
                <p className="text-xs text-orange-200">Total em {planoAtual.fidelidadeAnos} anos</p>
                <p className="font-bold text-lg">{formatCurrency(resultadoAtual.economiaAcumulada)}</p>
              </div>
              <div>
                <p className="text-xs text-orange-200">Fidelidade</p>
                <p className="font-bold text-lg">{planoAtual.fidelidadeAnos} anos</p>
              </div>
            </div>
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-2 py-3 mt-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <span>Este é o plano ideal para seu consumo · Ver comparação completa</span>
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 pb-2">
                {outrosPlanos.map(p => {
                  const res = calcEconomia(p);
                  const nome = planoNomes[p.fidelidadeAnos] || p.label;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onSelectPlano(p)}
                      className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4 hover:border-orange-300 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                        <div>
                          <span className="font-semibold text-gray-900">{nome}</span>
                          <span className="text-gray-400 text-sm"> · {p.fidelidadeAnos} ano{p.fidelidadeAnos > 1 ? 's' : ''} · {p.descontoPercentual}%</span>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-emerald-500">{formatCurrency(res.economiaMensal)} Economia/mês</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lock info */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mt-3 flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-gray-500 leading-relaxed">
            O desconto é garantido durante todo o período contratado. Caso precise encerrar antes do prazo, existe uma taxa proporcional ao tempo restante — tudo detalhado no contrato, antes de você assinar.
          </p>
        </div>
      </div>
    </section>
  );
}
