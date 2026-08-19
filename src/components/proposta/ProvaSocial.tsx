import { motion } from 'framer-motion';
import { Star } from 'lucide-react';

const testimonials = [
  {
    name: 'Maria R.',
    city: 'Belo Horizonte, MG',
    economy: 620,
    text: 'Fui com um pé atrás, mas depois que veio a primeira conta com desconto eu indiquei para minha irmã. Simples, rápido e sem enrolação.',
    initials: 'MR',
  },
  {
    name: 'José Carlos',
    city: 'Contagem, MG',
    economy: 780,
    text: 'Pensei que ia ter obra na minha casa. Não mexeu em nada. Só o valor da conta que veio menor. Recomendo demais.',
    initials: 'JC',
  },
  {
    name: 'Ana Paula S.',
    city: 'Uberlândia, MG',
    economy: 1050,
    text: 'A sofIA tirou todas as minhas dúvidas antes de eu assinar. Me senti segura o tempo todo. Hoje economizo todo mês sem fazer nada.',
    initials: 'AP',
  },
];

export function ProvaSocial() {
  return (
    <section className="py-10 px-5 bg-gray-50">
      <div className="max-w-[960px] mx-auto">
        <span className="text-[11px] uppercase tracking-[2px] font-semibold text-orange-500 block mb-1">Quem já Economiza</span>
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-1">Clientes que já garantiram o desconto</h2>
        <p className="text-sm text-gray-500 mb-6">Mais de 1.200 clientes economizando em MG</p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { value: '1.200+', label: 'Clientes ativos MG' },
            { value: 'R$ 890', label: 'Eco. média / mês' },
            { value: '4,8★', label: 'Avaliação média' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
              <p className="text-lg sm:text-xl font-black text-gray-900">{s.value}</p>
              <p className="text-[11px] text-gray-400 font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Testimonials */}
        <div className="space-y-3">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm"
            >
              <div className="flex gap-0.5 mb-2">
                {[1, 2, 3, 4, 5].map(s => {
                  const isLastStar = s === 5;
                  const isHalf = isLastStar && i === 2;
                  if (isHalf) {
                    return (
                      <span key={s} className="relative w-4 h-4">
                        <Star className="w-4 h-4 text-yellow-400 absolute inset-0" />
                        <span className="absolute inset-0 overflow-hidden" style={{ width: '50%' }}>
                          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        </span>
                      </span>
                    );
                  }
                  return <Star key={s} className="w-4 h-4 fill-yellow-400 text-yellow-400" />;
                })}
              </div>
              <p className="text-sm text-gray-600 leading-relaxed mb-3">"{t.text}"</p>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-xs">
                  {t.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t.name} · {t.city}</p>
                  <p className="text-xs text-green-600 font-medium">Economizando R$ {t.economy.toLocaleString('pt-BR')}/mês</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
