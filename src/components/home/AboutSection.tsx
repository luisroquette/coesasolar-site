import { motion } from "framer-motion";
import { StatsCounter } from "./StatsCounter";
import { useConfiguracoes } from "@/hooks/useConfiguracoes";

const stats = [
  { value: 20, suffix: "+", label: "MWp instalados" },
  { value: 3000, suffix: "+", label: "MWh/mês" },
  { value: 2000, suffix: "+", label: "Clientes" },
  { value: 4, suffix: "", label: "Estados" },
];

export function AboutSection() {
  const { configs } = useConfiguracoes();
  return (
    <section id="sobre" className="py-20 lg:py-32 bg-white">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          {/* Image */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="relative overflow-hidden">
              <img
                src={configs.home_bg_about}
                alt="Usina solar COESA"
                className="w-full h-[400px] lg:h-[600px] object-cover"
              />
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <p className="text-sm font-medium text-muted-foreground tracking-widest uppercase mb-4">
              Sobre Nós
            </p>
            <h2 
              className="text-3xl md:text-4xl lg:text-5xl font-medium text-foreground mb-8 leading-tight"
              style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
            >
              Pioneiros em<br />
              energia inteligente
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">
              A <strong className="text-foreground">COESA Energia Inteligente</strong> é pioneira no modelo de energia solar 
              por assinatura em Minas Gerais. Com usinas próprias estrategicamente localizadas, 
              garantimos energia de qualidade e economia real para nossos assinantes.
            </p>
            
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                  className="text-center"
                >
                  <div className="text-3xl lg:text-4xl font-medium text-foreground mb-1">
                    <StatsCounter 
                      value={stat.value} 
                      suffix={stat.suffix}
                      prefix=""
                    />
                  </div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
