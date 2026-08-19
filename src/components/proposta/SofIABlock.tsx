import { MessageCircle, Bot } from 'lucide-react';

const SOFIA_WHATSAPP = 'https://wa.me/5531953470438?text=Olá! Tenho uma dúvida sobre a proposta da COESA.';

export function SofIABlock() {
  const handleClick = () => {
    window.open(SOFIA_WHATSAPP, '_blank');
  };

  return (
    <section className="w-full bg-[#0F172A] py-10 px-5">
      <div className="max-w-[960px] mx-auto flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
        <div className="w-14 h-14 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center flex-shrink-0">
          <Bot className="w-7 h-7 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-white font-bold text-lg mb-1">Ficou com alguma dúvida?</h3>
          <p className="text-gray-400 text-sm leading-relaxed">
            A <strong className="text-white">sof<span className="text-orange-400">IA</span></strong>, nossa assistente de IA, responde em segundos — a qualquer hora do dia. Sobre o contrato, os valores, o processo.
          </p>
        </div>
        <button
          onClick={handleClick}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-3 rounded-xl transition-colors flex-shrink-0"
        >
          <MessageCircle className="w-4 h-4" />
          Falar com a sofIA
        </button>
      </div>
    </section>
  );
}
