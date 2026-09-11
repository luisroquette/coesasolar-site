import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WHATSAPP_5192 } from "@/lib/whatsapp-numbers";
import { PUBLIC_DISCOUNT_LABEL } from "@/lib/public-discount";

const features = [
  "Energia 100% solar",
  "Sem taxa de adesão",
  "Contrato digital",
  "Atendimento prioritário",
];

export function PlansSection() {
  const whatsappUrl = `https://wa.me/${WHATSAPP_5192}?text=Olá! Vim pelo site e gostaria de contratar o plano com ${PUBLIC_DISCOUNT_LABEL} de desconto.`;

  return (
    <section id="planos" className="bg-white py-20 lg:py-32">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center lg:mb-16"
        >
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Plano
          </p>
          <h2
            className="mb-6 text-3xl font-medium text-foreground md:text-4xl lg:text-5xl"
            style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
          >
            Seu desconto é {PUBLIC_DISCOUNT_LABEL}
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Uma condição simples, transparente e igual para todos.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mx-auto grid max-w-5xl overflow-hidden rounded-sm border border-gray-200 bg-white md:grid-cols-[0.85fr_1.15fr]"
        >
          <div className="flex flex-col justify-center border-b border-gray-200 p-10 md:border-b-0 md:border-r lg:p-14">
            <p
              className="mb-2 text-7xl font-medium text-foreground lg:text-8xl"
              style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
            >
              {PUBLIC_DISCOUNT_LABEL}
            </p>
            <p className="mb-8 text-base text-muted-foreground">de desconto</p>
            <p className="border-t border-gray-200 pt-6 text-base text-muted-foreground">
              301 a 1.000 kWh/mês
            </p>
          </div>

          <div className="flex flex-col justify-between p-10 lg:p-14">
            <ul className="mb-10 grid gap-5 sm:grid-cols-2">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-base text-foreground">
                  <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <Button className="h-14 w-full rounded-sm bg-black text-base font-medium text-white hover:bg-black/90">
                Contratar com {PUBLIC_DISCOUNT_LABEL} de desconto
              </Button>
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
