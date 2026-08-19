import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useConfiguracoes } from "@/hooks/useConfiguracoes";
import { WHATSAPP_5193 } from "@/lib/whatsapp-numbers";

export function CTASection() {
  const { configs } = useConfiguracoes();
  
  const scrollToForm = () => {
    const element = document.querySelector("#beneficios");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const whatsappUrl = `https://wa.me/${WHATSAPP_5193}?text=Olá! Vim pelo site e quero começar a economizar na conta de luz.`;

  return (
    <section className="relative py-32 lg:py-48 bg-black text-white overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <img
          src={configs.home_bg_cta}
          alt="Solar energy"
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-black/50" />
      </div>

      <div className="relative z-10 container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center max-w-3xl mx-auto"
        >
          <p className="text-sm font-medium text-white/60 tracking-widest uppercase mb-6">
            Comece hoje
          </p>
          <h2 
            className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-medium mb-8 leading-tight"
            style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
          >
            Pronto para economizar?
          </h2>
          
          <p className="text-lg text-white/70 mb-12 max-w-xl mx-auto">
            Junte-se a milhares de brasileiros que já economizam com energia solar por assinatura.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg"
              onClick={scrollToForm}
              className="bg-white text-black hover:bg-white/90 font-medium px-12 py-6 rounded-sm min-w-[200px]"
            >
              Simular Economia
            </Button>
            <a 
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button 
                size="lg"
                variant="outline"
                className="border-2 border-white/50 text-white hover:bg-white/10 font-medium px-12 py-6 rounded-sm bg-transparent w-full sm:w-auto min-w-[200px]"
              >
                Falar com Consultor
              </Button>
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
