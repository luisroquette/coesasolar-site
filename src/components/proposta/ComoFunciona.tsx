import { motion } from 'framer-motion';
import { FileText, Settings, Sparkles, Clock } from 'lucide-react';

export function ComoFunciona() {
  const steps = [
    {
      num: 1,
      icon: FileText,
      title: 'Você preenche o formulário e assina digitalmente',
      desc: 'Ao aceitar a proposta, você é direcionado a um formulário rápido online. Após o preenchimento, o contrato chega no seu WhatsApp e e-mail para assinatura digital.',
      chips: ['100% online', 'Assinatura digital válida', 'WhatsApp + e-mail'],
    },
    {
      num: 2,
      icon: Settings,
      title: 'A COESA cuida de toda a burocracia',
      desc: 'A CEMIG leva até 60 dias para homologar — é uma exigência regulatória deles, fora do nosso controle.',
      chips: [],
    },
    {
      num: 3,
      icon: Sparkles,
      title: 'Sua conta chega com desconto todo mês',
      desc: 'O desconto é aplicado automaticamente. Sua instalação elétrica não muda nada.',
      chips: [],
    },
  ];

  return (
    <section className="py-10 px-5">
      <div className="max-w-[960px] mx-auto">
        <span className="text-[11px] uppercase tracking-[2px] font-semibold text-orange-500 block mb-1">Passo a Passo</span>
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-1">Como funciona</h2>
        <p className="text-sm text-gray-500 mb-6">Simples — em 3 passos</p>

        <div className="space-y-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.num}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: i * 0.1 }}
              className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0 text-orange-500 font-bold text-sm">
                  {s.num}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 text-[15px] mb-1">{s.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
                  {s.chips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {s.chips.map(c => (
                        <span key={c} className="inline-flex items-center bg-green-50 text-green-700 text-[11px] font-medium rounded-full px-2.5 py-0.5">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Info box */}
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mt-4 flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-orange-700">
            <strong>Por que até 60 dias?</strong> É uma exigência regulatória da própria CEMIG para homologação de créditos de energia solar.
          </p>
        </div>
      </div>
    </section>
  );
}
