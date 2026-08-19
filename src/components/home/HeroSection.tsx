import { useMemo } from "react";
import { ChevronDown, Zap, Leaf, Shield, Clock, LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useConfiguracoes } from "@/hooks/useConfiguracoes";
import { WHATSAPP_5193 } from "@/lib/whatsapp-numbers";

const iconMap: Record<string, LucideIcon> = {
  Zap, Leaf, Shield, Clock
};

interface HeroStat {
  icon: string;
  value: string;
  label: string;
}

export function HeroSection() {
  const { configs } = useConfiguracoes();
  
  const stats = useMemo(() => {
    try {
      const parsed = JSON.parse(configs.hero_stats) as HeroStat[];
      return parsed.map(s => ({
        ...s,
        IconComponent: iconMap[s.icon] || Zap
      }));
    } catch {
      return [
        { icon: 'Zap', value: '30%', label: 'Economia', IconComponent: Zap },
        { icon: 'Leaf', value: '100%', label: 'Energia Limpa', IconComponent: Leaf },
        { icon: 'Shield', value: '5 anos', label: 'Garantia', IconComponent: Shield },
        { icon: 'Clock', value: '0', label: 'Investimento', IconComponent: Clock },
      ];
    }
  }, [configs.hero_stats]);

  const videoUrl = useMemo(() => {
    const videoId = configs.hero_video_youtube_id;
    const origin = configs.hero_video_origin;
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${origin}`;
  }, [configs.hero_video_youtube_id, configs.hero_video_origin]);

  const scrollToForm = () => {
    const element = document.querySelector("#beneficios");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section 
      id="inicio"
      className="relative min-h-screen flex flex-col"
    >
      {/* YouTube Video Background */}
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        <iframe
          src={videoUrl}
          title="COESA Background Video"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[177.78vh] min-w-full h-[56.25vw] min-h-full object-cover pointer-events-none"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        {/* Dark Overlay */}
        <div className="absolute inset-0 bg-black/65" />
      </div>

      {/* Main Content - Centered */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="container mx-auto px-4 text-center text-white">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="max-w-4xl mx-auto"
          >
            {/* Main Title - Clean, Sans-serif */}
            <h1 
              className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl mb-6 leading-tight text-white font-medium tracking-tight"
              style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
            >
              Energia Solar por Assinatura
            </h1>
            
            {/* Subtitle */}
            <p className="text-lg md:text-xl text-white/70 mb-10 font-light tracking-wide max-w-2xl mx-auto">
              Economize até 30% na sua conta de luz sem investir nada.
              Energia limpa direto para sua casa.
            </p>

            {/* CTA Buttons - Tesla style */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Button 
                size="lg"
                onClick={scrollToForm}
                className="bg-white text-black hover:bg-white/90 font-medium text-base px-12 py-6 rounded-sm shadow-lg hover:shadow-xl transition-all min-w-[200px]"
              >
                Simular Economia
              </Button>
              <a 
                href={`https://wa.me/${WHATSAPP_5193}?text=Olá! Vim pelo site e gostaria de saber mais sobre energia solar por assinatura.`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button 
                  size="lg"
                  variant="outline"
                  className="border-2 border-white/50 text-white hover:bg-white/10 font-medium text-base px-12 py-6 rounded-sm bg-transparent w-full sm:w-auto min-w-[200px]"
                >
                  Falar com Consultor
                </Button>
              </a>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Stats Bar - Bottom of screen, Tesla-style */}
      <motion.div 
        className="relative z-10 bg-black/40 backdrop-blur-sm border-t border-white/10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.6 }}
      >
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {stats.map((stat, index) => (
              <motion.div 
                key={stat.label}
                className="text-center text-white"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 + index * 0.1, duration: 0.4 }}
              >
                <stat.IconComponent className="w-5 h-5 mx-auto mb-2 text-white/60" />
                <p className="text-2xl md:text-3xl font-medium">{stat.value}</p>
                <p className="text-xs md:text-sm text-white/60 tracking-wide">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div 
        className="absolute bottom-32 left-1/2 -translate-x-1/2 z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.5 }}
      >
        <motion.button
          onClick={scrollToForm}
          className="text-white/40 hover:text-white transition-colors"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          aria-label="Scroll down"
        >
          <ChevronDown className="w-8 h-8" />
        </motion.button>
      </motion.div>
    </section>
  );
}
