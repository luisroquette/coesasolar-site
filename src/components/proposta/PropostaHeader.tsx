import { CoesaLogo } from '@/components/CoesaLogo';

interface PropostaHeaderProps {
  validadeFormatada: string;
  emissaoFormatada: string;
}

export function PropostaHeader({ validadeFormatada, emissaoFormatada }: PropostaHeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-sm">
      <div className="max-w-[960px] mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CoesaLogo variant="green" size="md" />
          <span className="hidden sm:block text-xs text-gray-400 font-medium">Energia Inteligente para você</span>
        </div>
        <div className="text-right text-[11px] text-gray-400 leading-tight">
          <div>Válida até {validadeFormatada}</div>
          <div>Emissão: {emissaoFormatada}</div>
        </div>
      </div>
    </header>
  );
}
