import { Check, MessageCircle } from 'lucide-react';

export function FormaPagamento() {
  return (
    <section className="py-10 px-5 bg-gray-50">
      <div className="max-w-[960px] mx-auto">
        <span className="text-[11px] uppercase tracking-[2px] font-semibold text-orange-500 block mb-1">Forma de Pagamento</span>
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-1">Como você vai receber a cobrança</h2>
        <p className="text-sm text-gray-500 mb-6">Escolha a forma que funciona melhor para você</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-2">Padrão</p>
            <h3 className="font-bold text-gray-900 mb-2">2 faturas separadas</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Fatura CEMIG + Fatura COESA separadas
            </p>
          </div>
          <div className="bg-white rounded-2xl border-2 border-green-300 p-5 relative">
            <span className="absolute -top-2.5 right-3 bg-green-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-full px-2.5 py-0.5">
              Recomendado
            </span>
            <p className="text-xs uppercase tracking-wider text-green-600 font-semibold mb-2">1 boleto unificado</p>
            <h3 className="font-bold text-gray-900 mb-2">Único boleto COESA</h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-2">
              Único boleto COESA com tudo incluído. Repassamos à CEMIG automaticamente.
            </p>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
              <Check className="w-3.5 h-3.5" />
              Mais prático e seguro
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2.5 mt-4 bg-white rounded-xl border border-gray-100 p-4">
          <MessageCircle className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-gray-500">
            Para ativar o boleto unificado, basta informar sua preferência à nossa equipe após assinar.
          </p>
        </div>
      </div>
    </section>
  );
}
