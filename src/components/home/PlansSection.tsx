import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlanosComerciais, PlanoComercial } from "@/hooks/usePlanosComerciais";
import { WHATSAPP_5192 } from "@/lib/whatsapp-numbers";
import { useMemo } from "react";

// Fallback para planos caso não carregue do banco
const defaultPlans = [
  {
    discount: "15%",
    consumption: "Até 300 kWh/mês",
    features: ["Energia 100% solar", "Sem taxa de adesão", "Contrato digital"],
  },
  {
    discount: "20%",
    consumption: "301 a 1.000 kWh/mês",
    features: ["Energia 100% solar", "Sem taxa de adesão", "Contrato digital", "Atendimento prioritário"],
    popular: true,
  },
  {
    discount: "25%",
    consumption: "1.001 a 3.000 kWh/mês",
    features: ["Energia 100% solar", "Sem taxa de adesão", "Contrato digital", "Gestor dedicado"],
  },
  {
    discount: "30%",
    consumption: "Acima de 3.000 kWh/mês",
    features: ["Energia 100% solar", "Sem taxa de adesão", "Contrato digital", "Atendimento VIP"],
  },
];

export function PlansSection() {
  const { planos, loading } = usePlanosComerciais();

  const whatsappUrl = `https://wa.me/${WHATSAPP_5192}?text=Olá! Vim pelo site e gostaria de contratar um plano de energia solar.`;

  // Usar dados dinâmicos do banco (consumo_range e features)
  const plans = useMemo(() => {
    if (loading || planos.length === 0) return defaultPlans;
    
    return planos.map((plano: PlanoComercial) => ({
      discount: `${plano.desconto_percentual}%`,
      consumption: plano.consumo_range || `A partir de ${plano.consumo_minimo_kwh} kWh/mês`,
      features: plano.features || ["Energia 100% solar", "Sem taxa de adesão", "Contrato digital"],
      popular: plano.destaque,
    }));
  }, [planos, loading]);

  return (
    <section id="planos" className="py-20 lg:py-32 bg-white">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-sm font-medium text-muted-foreground tracking-widest uppercase mb-4">
            Planos
          </p>
          <h2 
            className="text-3xl md:text-4xl lg:text-5xl font-medium text-foreground mb-6"
            style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
          >
            Escolha seu desconto
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Quanto maior seu consumo, maior sua economia
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.discount}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative p-8 rounded-sm border ${
                plan.popular 
                  ? "border-black bg-black text-white" 
                  : "border-gray-200 bg-white hover:border-gray-300"
              } transition-colors`}
            >
              {plan.popular && (
                <span className="absolute top-0 right-0 px-3 py-1 bg-white text-black text-xs font-medium">
                  Popular
                </span>
              )}

              <div className="mb-8">
                <p 
                  className="text-5xl font-medium mb-2"
                  style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
                >
                  {plan.discount}
                </p>
                <p className={`text-sm ${plan.popular ? "text-white/60" : "text-muted-foreground"}`}>
                  de desconto
                </p>
              </div>

              <p className={`text-sm mb-6 pb-6 border-b ${
                plan.popular ? "text-white/70 border-white/20" : "text-muted-foreground border-gray-200"
              }`}>
                {plan.consumption}
              </p>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                      plan.popular ? "text-white/80" : "text-primary"
                    }`} />
                    <span className={plan.popular ? "text-white/80" : ""}>{feature}</span>
                  </li>
                ))}
              </ul>

              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <Button 
                  className={`w-full py-6 rounded-sm font-medium ${
                    plan.popular 
                      ? "bg-white text-black hover:bg-white/90" 
                      : "bg-black text-white hover:bg-black/90"
                  }`}
                >
                  Contratar
                </Button>
              </a>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
