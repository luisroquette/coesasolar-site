export function Timeline() {
  const steps = [
    { label: 'Hoje', title: 'Você preenche o formulário online', desc: 'Após aceitar, formulário rápido → contrato chega por WhatsApp e e-mail.' },
    { label: 'Em até 30 dias', title: 'A COESA cuida de tudo com a CEMIG', desc: 'Análise técnica e processo burocrático.' },
    { label: 'Até 60 dias', title: 'Homologação aprovada pela CEMIG', desc: 'Prazo regulatório — avisamos você.' },
    { label: 'Mês seguinte', title: 'Sua conta chega com desconto', desc: 'Automático, todo mês, sem você fazer nada.' },
  ];

  return (
    <section className="py-10 px-5">
      <div className="max-w-[960px] mx-auto">
        <span className="text-[11px] uppercase tracking-[2px] font-semibold text-orange-500 block mb-1">Próximos Passos</span>
        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-1">O que acontece depois que você assinar</h2>
        <p className="text-sm text-gray-500 mb-6">Do seu sim até a primeira economia</p>

        <div className="relative pl-6">
          {/* Vertical line */}
          <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gray-200" />

          <div className="space-y-6">
            {steps.map((step, i) => (
              <div key={step.label} className="relative">
                <div className="absolute -left-6 top-1.5 w-[22px] h-[22px] bg-orange-500 rounded-full border-4 border-white shadow-sm" />
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-orange-500">{step.label}</span>
                  <h3 className="font-bold text-gray-900 text-[15px] mt-0.5">{step.title}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
