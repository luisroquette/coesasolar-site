import { Check, ArrowDown } from 'lucide-react';

export function Transparencia() {
  return (
    <section className="py-10 px-5">
      <div className="max-w-[960px] mx-auto">
        <span className="text-[11px] uppercase tracking-[2px] font-semibold text-orange-500 block mb-1">Transparência</span>
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-1">O que muda na prática</h2>
        <p className="text-sm text-gray-500 mb-6">Tudo que você precisa saber antes de assinar</p>

        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <Check className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <h3 className="font-bold text-green-800 text-[15px] mb-1">Sua instalação, fornecedor e qualidade não mudam</h3>
                <p className="text-sm text-green-700 leading-relaxed">
                  Sem obras, sem equipamentos, sem trocar de distribuidora. A CEMIG continua sendo sua concessionária — a energia chega igual, só mais barata.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                <ArrowDown className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <h3 className="font-bold text-orange-800 text-[15px] mb-1">O valor que você paga diminui todo mês</h3>
                <p className="text-sm text-orange-700 leading-relaxed">
                  O desconto é aplicado automaticamente. O modelo de cobrança pode variar — veja as opções abaixo.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
