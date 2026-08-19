import { motion } from "framer-motion";
import { Shield, TrendingUp, HeartHandshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfiguracoes } from "@/hooks/useConfiguracoes";

const reasons = [
  {
    icon: Shield,
    title: "Segurança Garantida",
    description: "Usinas próprias e contratos transparentes. Sua economia garantida.",
  },
  {
    icon: TrendingUp,
    title: "Economia Real",
    description: "Desconto garantido todos os meses. Quanto mais consome, mais economiza.",
  },
  {
    icon: HeartHandshake,
    title: "Atendimento Premium",
    description: "Equipe dedicada do primeiro contato à assinatura.",
  },
];

export function WhyChooseSection() {
  const { configs } = useConfiguracoes();
  
  return (
    <section className="relative min-h-screen flex items-center bg-black text-white overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <img
          src={configs.home_bg_why_choose}
          alt="Solar panels"
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-20 lg:py-32">
        <div className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <p className="text-sm font-medium text-white/60 tracking-widest uppercase mb-4">
              Por que COESA
            </p>
            <h2 
              className="text-3xl md:text-4xl lg:text-5xl font-medium mb-8 leading-tight"
              style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
            >
              Proteção contra<br />
              aumentos de tarifa
            </h2>
            <p className="text-lg text-white/70 leading-relaxed mb-12 max-w-lg">
              Enquanto as tarifas de energia sobem ano após ano, você mantém seu desconto garantido 
              por contrato. É segurança e economia a longo prazo.
            </p>

            {/* Features Grid */}
            <div className="grid sm:grid-cols-3 gap-8 mb-12">
              {reasons.map((reason, index) => (
                <motion.div
                  key={reason.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="text-center sm:text-left"
                >
                  <reason.icon className="w-8 h-8 mb-4 text-white/80 mx-auto sm:mx-0" />
                  <h3 className="font-medium mb-2">{reason.title}</h3>
                  <p className="text-sm text-white/60">{reason.description}</p>
                </motion.div>
              ))}
            </div>

            <Button 
              size="lg"
              className="bg-white text-black hover:bg-white/90 font-medium px-8 py-6 rounded-sm"
              onClick={() => document.querySelector("#beneficios")?.scrollIntoView({ behavior: "smooth" })}
            >
              Saiba Mais
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
