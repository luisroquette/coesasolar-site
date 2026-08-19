import { motion } from "framer-motion";
import { SimulationForm } from "./SimulationForm";

export function BenefitsSection() {
  return (
    <section id="beneficios" className="py-20 lg:py-32 bg-white">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
          {/* Left Column - Text Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <p className="text-sm font-medium text-muted-foreground tracking-widest uppercase mb-4">
              Energia Inteligente
            </p>
            <h2 
              className="text-3xl md:text-4xl lg:text-5xl font-medium text-foreground mb-8 leading-tight"
              style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
            >
              Economize sem<br />
              complicação
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-lg">
              A energia solar por assinatura da COESA permite que você reduza sua conta de luz 
              em até 30% sem instalar painéis, sem obras e sem nenhum investimento inicial. 
              A energia vem direto de nossas usinas solares.
            </p>
            
            {/* Feature List - Minimal */}
            <div className="space-y-4">
              {[
                "Economia de até 30% na conta de luz",
                "Sem obras ou instalações na sua casa",
                "Energia 100% limpa e renovável",
                "Contratação 100% digital",
              ].map((feature, index) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span className="text-foreground">{feature}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right Column - Form */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:sticky lg:top-24"
          >
            <SimulationForm />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
