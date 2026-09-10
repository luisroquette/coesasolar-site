import { ExternalLink, Headphones, Play } from "lucide-react";
import { motion } from "framer-motion";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

const pressItems = [
  {
    source: "O Tempo",
    title: "Energia por assinatura faz Minas Gerais liderar setor no Brasil",
    href: "https://www.otempo.com.br/minas-sa/2025/11/12/energia-por-assinatura-faz-minas-gerais-liderar-setor-no-brasil",
    image: "https://www.otempo.com.br/content/dam/otempo/editorias/minas%20sa/2025/11/12/minas%20sa-energia_por_assinatura-coesa%20energia-1762980359.jpg",
    type: "article",
  },
  {
    source: "BM&C News",
    title: "Energia por assinatura se consolida como motor da transição energética",
    href: "https://bmcnews.com.br/petroleo-e-energia/energia-por-assinatura-se-consolida-como-motor-da-transicao-energetica/",
    image: "https://bmcnews.com.br/wp-content/uploads/2025/10/energia-por-assinatura.jpg",
    type: "article",
  },
  {
    source: "Times Brasil — CNBC",
    title: "COESA em entrevista com a Times Brasil",
    href: "https://www.youtube.com/watch?v=l9xkUcINWdY",
    image: "https://i.ytimg.com/vi/l9xkUcINWdY/maxresdefault.jpg",
    type: "video",
  },
  {
    source: "Revista Potência",
    title: "Transição energética pauta a COP30 e acelera corrida por novos modelos de energia limpa",
    href: "https://revistapotencia.com.br/portal-potencia/energia/transicao-energetica-pauta-a-cop30-e-acelera-corrida-por-novos-modelos-de-energia-limpa/",
    image: "https://revistapotencia.com.br/wp-content/uploads/2025/12/14-1.png",
    type: "article",
  },
  {
    source: "YouTube",
    title: "Entenda a energia solar por assinatura e suas vantagens",
    href: "https://www.youtube.com/watch?v=Z0MGJP2Ot-w",
    image: "https://i.ytimg.com/vi/Z0MGJP2Ot-w/hqdefault.jpg",
    type: "video",
  },
  {
    source: "Diário do Comércio",
    title: "Modelo de assinatura solar cresce com COP30 e cenário favorável à transição energética",
    href: "https://diariodocomercio.com.br/negocios/modelo-assinatura-solar-cresce-cop30/",
    image: "https://diariodocomercio.com.br/wp-content/uploads/2025/11/cop30-belem.jpg",
    type: "article",
  },
  {
    source: "R7 — Mundo Agro",
    title: "Energia solar por assinatura avança no campo e alivia custos do produtor rural",
    href: "https://noticias.r7.com/prisma/mundo-agro/energia-solar-por-assinatura-avanca-no-campo-e-alivia-custos-do-produtor-rural-23012026/",
    image: "https://newr7-r7-prod.web.arc-cdn.net/resizer/v2/6T3SUZ64PFHWPII4C23D5VEGZE.webp?smart=true&auth=fc2e9cd2e4ea8c336c76bce001edd7b0eb2f109d22377610d54219c562b46c8a&width=1200&height=630",
    type: "article",
  },
  {
    source: "Agrotempo — Spotify",
    title: "Produtor rural pode economizar até 25% da conta de luz com energia solar por assinatura",
    href: "https://open.spotify.com/episode/2Y8JDmhjzAytyhELl9Dtmj",
    image: "https://i.scdn.co/image/ab6765630000ba8ab310c9bc101c686cb506bf9b",
    type: "podcast",
  },
  {
    source: "YouTube",
    title: "Energia solar por assinatura se torna alternativa para produtores rurais",
    href: "https://www.youtube.com/watch?v=_-yk8-Pm7CQ",
    image: "https://i.ytimg.com/vi/_-yk8-Pm7CQ/maxresdefault.jpg",
    type: "video",
  },
] as const;

const mediaLabel = {
  article: "Ler matéria",
  video: "Assistir vídeo",
  podcast: "Ouvir episódio",
};

export function PressSection() {
  return (
    <section id="imprensa" className="overflow-hidden bg-[#f2f0ea] py-20 lg:py-32">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-12 flex flex-col justify-between gap-6 border-b border-black/15 pb-8 md:flex-row md:items-end lg:mb-16"
        >
          <div>
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Na imprensa
            </p>
            <h2 className="max-w-3xl text-3xl font-medium leading-tight text-foreground md:text-4xl lg:text-5xl">
              Energia inteligente em pauta
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground md:text-right">
            Notícias, entrevistas e conversas sobre a transformação do mercado de energia.
          </p>
        </motion.div>

        <Carousel
          opts={{ align: "start" }}
          aria-label="Notícias e entrevistas da COESA"
          className="w-full"
        >
          <CarouselContent className="-ml-5">
            {pressItems.map((item, index) => (
              <CarouselItem
                key={item.href}
                className="basis-[88%] pl-5 sm:basis-[56%] lg:basis-1/3"
              >
                <motion.a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${mediaLabel[item.type]}: ${item.title}`}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: (index % 3) * 0.08 }}
                  className="group block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-4 focus-visible:ring-offset-[#f2f0ea]"
                >
                  <div className="relative mb-5 aspect-[16/10] overflow-hidden bg-black/10">
                    <img
                      src={item.image}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-500 ease-out group-hover:scale-[1.035]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                    {item.type !== "article" && (
                      <span className="absolute bottom-4 left-4 grid h-11 w-11 place-items-center rounded-full bg-white text-black shadow-lg transition-transform group-hover:scale-110">
                        {item.type === "video" ? (
                          <Play className="ml-0.5 h-4 w-4 fill-current" aria-hidden="true" />
                        ) : (
                          <Headphones className="h-4 w-4" aria-hidden="true" />
                        )}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    <span>{item.source}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {mediaLabel[item.type]}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </div>
                  <h3 className="mt-3 text-xl font-medium leading-snug text-foreground decoration-1 underline-offset-4 group-hover:underline">
                    {item.title}
                  </h3>
                </motion.a>
              </CarouselItem>
            ))}
          </CarouselContent>

          <div className="mt-10 flex justify-end gap-3">
            <CarouselPrevious
              aria-label="Notícias anteriores"
              className="static h-11 w-11 translate-y-0 border-black/20 bg-transparent hover:bg-black hover:text-white"
            />
            <CarouselNext
              aria-label="Próximas notícias"
              className="static h-11 w-11 translate-y-0 border-black/20 bg-transparent hover:bg-black hover:text-white"
            />
          </div>
        </Carousel>
      </div>
    </section>
  );
}
