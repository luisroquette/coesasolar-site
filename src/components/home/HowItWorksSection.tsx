import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useConfiguracoes } from "@/hooks/useConfiguracoes";

const steps = [
  {
    number: "01",
    title: "Simule",
    description: "Preencha seus dados e valor da conta de luz",
  },
  {
    number: "02",
    title: "Assine",
    description: "Contrato 100% digital, sem burocracia",
  },
  {
    number: "03",
    title: "Conecte",
    description: "Fazemos toda parte técnica com a concessionária",
  },
  {
    number: "04",
    title: "Economize",
    description: "Receba sua fatura com desconto todo mês",
  },
];

export function HowItWorksSection() {
  const { configs } = useConfiguracoes();
  
  return (
    <section id="como-funciona" className="relative min-h-screen flex items-center bg-black text-white overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={configs.home_bg_how_it_works}
          alt="Solar installation"
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/60" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-20 lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-sm font-medium text-white/60 tracking-widest uppercase mb-4">
            Processo
          </p>
          <h2 
            className="text-3xl md:text-4xl lg:text-5xl font-medium mb-6"
            style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
          >
            Como funciona
          </h2>
          <p className="text-lg text-white/60 max-w-2xl mx-auto">
            Em 4 passos simples você começa a economizar
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 mb-16">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="text-center"
            >
              <p 
                className="text-6xl lg:text-7xl font-light text-white/20 mb-4"
                style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
              >
                {step.number}
              </p>
              <h3 className="text-xl font-medium mb-2">{step.title}</h3>
              <p className="text-sm text-white/60">{step.description}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center"
        >
          <Button 
            size="lg"
            className="bg-white text-black hover:bg-white/90 font-medium px-12 py-6 rounded-sm"
            onClick={() => document.querySelector("#beneficios")?.scrollIntoView({ behavior: "smooth" })}
          >
            Começar Agora
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
