import { motion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useFAQs } from "@/hooks/useFAQs";
import { Skeleton } from "@/components/ui/skeleton";

export function FAQSection() {
  const { faqs, loading } = useFAQs();

  return (
    <section id="faq" className="py-20 lg:py-32 bg-neutral-50">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-sm font-medium text-muted-foreground tracking-widest uppercase mb-4">
            FAQ
          </p>
          <h2 
            className="text-3xl md:text-4xl lg:text-5xl font-medium text-foreground"
            style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
          >
            Perguntas frequentes
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="max-w-3xl mx-auto"
        >
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white px-6 py-4 rounded-lg">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <Accordion type="single" collapsible className="space-y-4">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="bg-white border-0 px-6 data-[state=open]:shadow-sm"
                >
                  <AccordionTrigger className="text-left font-medium text-foreground hover:no-underline py-6 text-base">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-6">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </motion.div>
      </div>
    </section>
  );
}
