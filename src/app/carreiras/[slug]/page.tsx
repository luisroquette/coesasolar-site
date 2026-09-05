import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { HomeNavbar } from "@/components/home/HomeNavbar"
import { HomeFooter } from "@/components/home/HomeFooter"
import { CandidaturaForm } from "@/components/carreiras/CandidaturaForm"
import { getVagaBySlug } from "@/lib/carreiras/supabase"

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
  const vaga = await getVagaBySlug(slug)
  if (!vaga) notFound()

  return (
    <main className="min-h-screen bg-background">
      <HomeNavbar />

      <section className="bg-coesa-green pt-32 pb-16 px-4">
        <div className="container max-w-3xl mx-auto text-center">
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

        <ListaSemIcone titulo="O que você fará" itens={vaga.o_que_fara} />
        <ListaSemIcone titulo="O que buscamos" itens={vaga.o_que_buscamos} />
        <ListaSemIcone titulo="Diferenciais" itens={vaga.diferenciais} />

        {vaga.observacoes && (
          <section className="py-8">
            <p className="text-foreground">{vaga.observacoes}</p>
          </section>
        )}

        {(vaga.remuneracao || vaga.comissionamento || vaga.beneficios.length > 0) && (
          <section className="py-8">
            <h2 style={serif} className="text-2xl font-semibold text-foreground mb-4">
              Remuneração e benefícios
            </h2>
            <ul className="space-y-2 text-foreground">
              {vaga.remuneracao && <li>{vaga.remuneracao}</li>}
              {vaga.comissionamento && <li>{vaga.comissionamento}</li>}
              {vaga.beneficios.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="py-12 border-t border-border mt-8">
          <h2 style={serif} className="text-2xl font-semibold text-foreground mb-6">
            Candidate-se
          </h2>
          <CandidaturaForm vagaSlug={vaga.slug} feedbackDias={vaga.feedback_dias} />
        </section>
      </article>

      <HomeFooter />
    </main>
  )
}
