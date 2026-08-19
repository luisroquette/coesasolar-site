import { Calculator, Sparkles } from 'lucide-react';
import { EconomyCalculator } from './EconomyCalculator';

export function CalculatorSection() {
  return (
    <section id="calculadora" className="py-20 bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <div className="text-center mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full text-sm text-primary font-medium">
            <Calculator className="h-4 w-4" />
            Simulador de Economia
          </div>
          
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            Calcule sua economia{' '}
            <span className="text-primary">REAL</span>{' '}
            em segundos
          </h2>
          
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Digite o valor da sua conta de luz e veja quanto você pode economizar 
            com energia solar por assinatura, considerando{' '}
            <span className="text-foreground font-medium">CIP</span>,{' '}
            <span className="text-foreground font-medium">disponibilidade mínima</span> e{' '}
            <span className="text-foreground font-medium">PIS/COFINS</span>.
          </p>
        </div>

        {/* Calculator */}
        <EconomyCalculator />

        {/* Trust badges */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Cálculo baseado em dados reais do mercado</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Sem compromisso</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>100% gratuito</span>
          </div>
        </div>
      </div>
    </section>
  );
}
