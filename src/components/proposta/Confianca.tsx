import { Zap, Building2, FileText, Leaf } from 'lucide-react';

export function Confianca() {
  return (
    <section className="py-10 px-5 bg-gray-50">
      <div className="max-w-[960px] mx-auto">
        <span className="text-[11px] uppercase tracking-[2px] font-semibold text-orange-500 block mb-1">Confiança</span>
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-1">Por que a COESA é diferente</h2>
        <p className="text-sm text-gray-500 mb-6">Números reais de uma operação consolidada</p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { value: '5+', label: 'Anos de operação' },
            { value: '1.200+', label: 'Clientes ativos' },
            { value: '100%', label: 'Digital e regulado' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
              <p className="text-xl font-black text-gray-900">{s.value}</p>
              <p className="text-[11px] text-gray-400 font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: Zap, title: 'Regulada ANEEL', desc: 'Geração Distribuída regulamentada' },
            { icon: Building2, title: 'Empresa registrada', desc: 'CNPJ 60.937.217/0001-54 · Belo Horizonte, MG' },
            { icon: FileText, title: 'Contrato digital válido', desc: 'Assine sem sair de casa' },
            { icon: Leaf, title: '100% energia solar', desc: 'Usinas solares parceiras. Economize e contribua com o meio ambiente' },
          ].map(item => (
            <div key={item.title} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <item.icon className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-sm text-gray-900">{item.title}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
