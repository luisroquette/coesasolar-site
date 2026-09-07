import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { HomeNavbar } from "@/components/home/HomeNavbar"
import { HomeFooter } from "@/components/home/HomeFooter"
import { CandidaturaForm } from "@/components/carreiras/CandidaturaForm"
import { getVagaBySlug, getConfigRhPublica } from "@/lib/carreiras/supabase"
import { montarLinkWhatsapp } from "@/lib/carreiras/form-utils"
import { logoDeMarca } from "@/lib/carreiras/marcas"

export const revalidate = 600

export async function generateStaticParams() {
  return []
}

const serif = { fontFamily: "Georgia, serif" }

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const vaga = await getVagaBySlug(slug)
  if (!vaga) return { title: "Vaga | Coesa Energia" }
  return {
    title: `${vaga.titulo} | Coesa Energia`,
    description: vaga.pitch ?? `Vaga de ${vaga.titulo} na Coesa Energia.`,
  }
}

function ListaSemIcone({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null
  return (
    <section className="py-8">
      <h2 style={serif} className="text-2xl font-semibold text-foreground mb-4">
        {titulo}
      </h2>
      <ul className="space-y-2 text-foreground">
        {itens.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

export default async function VagaDetalhePage({ params }: PageProps) {
  const { slug } = await params
  const [vaga, config] = await Promise.all([getVagaBySlug(slug), getConfigRhPublica()])
  if (!vaga) notFound()

  return (
    <main className="min-h-screen bg-background">
      <HomeNavbar />

      <section className="bg-coesa-green pt-32 pb-16 px-4">
        <div className="container max-w-3xl mx-auto text-center">
          <p className="text-xs uppercase tracking-widest text-white/70 mb-3">
            Oportunidade profissional
          </p>
          <h1 style={serif} className="text-3xl md:text-5xl font-bold text-white leading-tight">
            {vaga.titulo}
          </h1>
          <p className="mt-3 text-xs uppercase tracking-wider text-white/80">
            {[vaga.area, vaga.regime, vaga.modalidade, vaga.local].filter(Boolean).join(" · ")}
          </p>
        </div>
      </section>

      <article className="container max-w-3xl mx-auto px-4 py-12">
        {vaga.pitch && (
          <p style={serif} className="text-xl italic text-foreground leading-relaxed">
            {vaga.pitch}
          </p>
        )}

        <ListaSemIcone titulo="💻 O que você fará" itens={vaga.o_que_fara} />
        <ListaSemIcone titulo="🔍 O que buscamos" itens={vaga.o_que_buscamos} />
        <ListaSemIcone titulo="⭐ Diferenciais" itens={vaga.diferenciais} />

        {vaga.observacoes && (
          <section className="py-8">
            <p className="text-foreground">{vaga.observacoes}</p>
          </section>
        )}

        {(vaga.remuneracao || vaga.comissionamento || vaga.beneficios.length > 0) && (
          <section className="py-8">
            <h2 style={serif} className="text-2xl font-semibold text-foreground mb-4">
              💰 Remuneração e benefícios
            </h2>
            <ul className="space-y-2 text-foreground">
              {vaga.remuneracao && <li>{vaga.remuneracao}</li>}
              {vaga.comissionamento && <li>{vaga.comissionamento}</li>}
              {vaga.beneficios.map((item) => {
                const logo = logoDeMarca(item)
                return (
                  <li key={item} className="flex items-center gap-2">
                    {logo && <img src={logo} alt="" className="h-5 w-5 object-contain" />}
                    <span>{item}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {config && (
          <section className="py-8">
            <div className="rounded-lg border border-coesa-green/30 bg-coesa-gray-light/40 px-6 py-6">
              <h2 style={serif} className="text-xl font-semibold text-foreground mb-3">
                Envie seu currículo para
              </h2>
              <div className="flex flex-wrap gap-3">
                <a
                  href={`mailto:${config.email_rh}`}
                  className="inline-flex items-center rounded-md bg-coesa-green px-4 py-2 text-sm font-medium text-white hover:bg-coesa-green/90"
                >
                  {config.email_rh}
                </a>
                {config.whatsapp_rh && (
                  <a
                    href={montarLinkWhatsapp(config.whatsapp_rh)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-md border border-coesa-green px-4 py-2 text-sm font-medium text-coesa-green hover:bg-coesa-green/10"
                  >
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        {config && (
          <section className="py-8 text-center">
            <p style={serif} className="text-lg italic text-foreground/80 leading-relaxed">
              {config.mensagem_final}
            </p>
          </section>
        )}

        <section className="py-12 border-t border-border mt-8">
          <h2 style={serif} className="text-2xl font-semibold text-foreground mb-6">
            Candidate-se
          </h2>
          <CandidaturaForm vagaSlug={vaga.slug} feedbackDias={vaga.feedback_dias} camposExtras={vaga.campos} />
        </section>
      </article>

      <HomeFooter />
    </main>
  )
}
