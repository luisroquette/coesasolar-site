import { CoesaLogo } from '@/components/CoesaLogo';

export function PropostaFooter() {
  return (
    <footer className="bg-white border-t border-gray-100 py-8 px-5">
      <div className="max-w-[960px] mx-auto text-center">
        <CoesaLogo variant="green" size="sm" className="mx-auto mb-3" />
        <p className="text-xs text-gray-400 leading-relaxed">
          Coesa Energia Ltda. · CNPJ 60.937.217/0001-54
        </p>
        <p className="text-xs text-gray-400">
          Rua Desembargador Edésio Fernandes, 148/204 — BH/MG
        </p>
        <div className="flex items-center justify-center gap-3 mt-3 text-xs text-gray-400">
          <a href="#" className="hover:text-gray-600 transition-colors">Política de Privacidade</a>
          <span>·</span>
          <a href="#" className="hover:text-gray-600 transition-colors">Termos de Uso</a>
          <span>·</span>
          <a href="mailto:contato@coesaenergia.com.br" className="hover:text-gray-600 transition-colors">contato@coesaenergia.com.br</a>
        </div>
      </div>
    </footer>
  );
}
