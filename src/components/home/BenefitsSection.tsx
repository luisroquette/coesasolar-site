"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PUBLIC_DISCOUNT_LABEL } from "@/lib/public-discount";
import { coletarUtm } from "@/lib/carreiras/form-utils";

const FORM_BASE_URL = "https://web-production-118a5.up.railway.app/f/landing-assinatura-solar-coesa";

export function BenefitsSection() {
  // Repassa as UTMs da URL do site pro form embeddado, pra manter a atribuição da campanha.
  const [formSrc, setFormSrc] = useState(FORM_BASE_URL);

  useEffect(() => {
    const utm = coletarUtm(new URLSearchParams(window.location.search));
    const query = new URLSearchParams(utm).toString();
    if (query) setFormSrc(`${FORM_BASE_URL}?${query}`);
  }, []);

  return (
    <section id="beneficios" className="py-20 lg:py-32 bg-white">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-start">
          {/* Left Column - Text Content */}
          <motion.div
            initial={{ x: -30 }}
            whileInView={{ x: 0 }}
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
              em {PUBLIC_DISCOUNT_LABEL} sem instalar painéis, sem obras e sem nenhum investimento inicial.
              A energia vem direto de nossas usinas solares.
            </p>
            
            {/* Feature List - Minimal */}
            <div className="space-y-4">
              {[
                `Economia de ${PUBLIC_DISCOUNT_LABEL} na conta de luz`,
                "Sem obras ou instalações na sua casa",
                "Energia 100% limpa e renovável",
                "Contratação 100% digital",
              ].map((feature, index) => (
                <motion.div
                  key={feature}
                  initial={{ x: -20 }}
                  whileInView={{ x: 0 }}
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
            initial={{ x: 30 }}
            whileInView={{ x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:sticky lg:top-24"
          >
            <link rel="preconnect" href="https://web-production-118a5.up.railway.app" />
            {/*
              Sem API de auto-resize do form (não manda postMessage de altura) e
              cross-origin impede medir o conteúdo real por JS. Altura fixa por
              breakpoint, enviesada pra sobrar espaço em vez de cortar/rolar —
              nunca pode aparecer scroll dentro do form, nem mobile nem desktop.
            */}
            <iframe
              src={formSrc}
              width="100%"
              className="block h-[950px] sm:h-[780px] lg:h-[620px] border-0 mx-auto"
              title="Landing – Assinatura Solar Coesa"
              sandbox="allow-scripts allow-forms allow-same-origin allow-top-navigation"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
