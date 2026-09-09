import type { Metadata } from "next"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { notFound } from "next/navigation"
import { HomeFooter } from "@/components/home/HomeFooter"
import { CareersHeader } from "@/components/carreiras/CareersHeader"
import { CandidateButton } from "@/components/carreiras/CandidateButton"
import { CandidaturaForm } from "@/components/carreiras/CandidaturaForm"
import { getVagaBySlug, getConfigRhPublica } from "@/lib/carreiras/supabase"
import { normalizarItensConteudo, normalizarTexto } from "@/lib/carreiras/conteudo"
import { logoDeMarca } from "@/lib/carreiras/marcas"
import { Badge } from "@/components/ui/badge"

export const revalidate = 600
const SITE_URL = "https://coesasolar.com.br"
const serif = { fontFamily: "Georgia, serif" }

interface PageProps { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const vaga = await getVagaBySlug(slug)
  if (!vaga) return { title: "Vaga | Coesa Energia" }
  const url = `${SITE_URL}/carreiras/${vaga.slug}`
  const description = normalizarTexto(vaga.pitch ?? `Vaga de ${vaga.titulo} na Coesa Energia.`)
  return {
    title: `${vaga.titulo} | Coesa Energia`,
    description,
    alternates: { canonical: url },
    openGraph: { title: vaga.titulo, description, url, siteName: "Coesa Energia", type: "website" },
  }
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  const limpos = normalizarItensConteudo(itens)
  if (!limpos.length) return null
  return (
    <section className="space-y-3">
      <h2 style={serif} className="text-2xl font-semibold text-foreground">{titulo}</h2>
      <ul className="list-disc space-y-2 pl-5 leading-6 marker:text-coesa-green">
        {limpos.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  )
}

export default async function VagaDetalhePage({ params }: PageProps) {
  const { slug } = await params
  const [vaga, config] = await Promise.all([getVagaBySlug(slug), getConfigRhPublica()])
  if (!vaga) notFound()

  const descricao = [vaga.pitch, ...normalizarItensConteudo(vaga.o_que_fara), ...normalizarItensConteudo(vaga.o_que_buscamos)]
    .filter(Boolean).join(" ")
  const jobPosting: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: vaga.titulo,
    description: normalizarTexto(descricao),
    employmentType: vaga.regime,
    hiringOrganization: { "@type": "Organization", name: "Coesa Energia", sameAs: SITE_URL },
    url: `${SITE_URL}/carreiras/${vaga.slug}`,
  }
  if (vaga.publicado_em) jobPosting.datePosted = vaga.publicado_em
  if (vaga.local) jobPosting.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: vaga.local } }

  return (
    <main className="min-h-screen bg-background">
      <CareersHeader />

      <section className="bg-coesa-green-dark px-4 pb-12 pt-7 text-white">
        <div className="container mx-auto max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/65">Oportunidade profissional</p>
          <h1 style={serif} className="max-w-3xl text-3xl font-bold leading-[1.12] md:text-[40px]">{vaga.titulo}</h1>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-white/75">
            {vaga.modalidade && <Badge className="border-0 bg-white text-coesa-green-dark">{vaga.modalidade}</Badge>}
            <p>{[vaga.area, vaga.regime, vaga.local].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="mt-7"><CandidateButton /></div>
        </div>
      </section>

      <article className="container mx-auto max-w-3xl space-y-8 px-4 py-10">
        {vaga.pitch && <p style={serif} className="text-lg leading-7 text-foreground">{normalizarTexto(vaga.pitch)}</p>}
        <Lista titulo="💻 O que você fará" itens={vaga.o_que_fara} />
        <Lista titulo="🔍 O que buscamos" itens={vaga.o_que_buscamos} />
        <Lista titulo="⭐ Diferenciais" itens={vaga.diferenciais} />

        {vaga.observacoes && (
          <section className="prose prose-sm max-w-none leading-6 text-foreground prose-p:my-2 prose-li:my-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizarTexto(vaga.observacoes)}</ReactMarkdown>
          </section>
        )}

        {(vaga.remuneracao || vaga.comissionamento || vaga.beneficios.length > 0) && (
          <section className="space-y-3">
            <h2 style={serif} className="text-2xl font-semibold text-foreground">💰 Remuneração e benefícios</h2>
            <ul className="list-disc space-y-2 pl-5 leading-6 marker:text-coesa-green">
              {vaga.remuneracao && <li>{normalizarTexto(vaga.remuneracao)}</li>}
              {vaga.comissionamento && <li>{normalizarTexto(vaga.comissionamento)}</li>}
              {normalizarItensConteudo(vaga.beneficios).map((item) => {
                const logo = logoDeMarca(item)
                return <li key={item}>{logo ? <span className="inline-flex items-center gap-2"><img src={logo} alt="" className="h-5 w-5 object-contain" />{item}</span> : item}</li>
              })}
            </ul>
          </section>
        )}

        <div className="rounded-lg bg-coesa-gray-light/60 p-6"><CandidateButton dark /></div>

        {config?.mensagem_final && <p className="text-center text-sm leading-6 text-muted-foreground">{config.mensagem_final}</p>}

        <section id="candidatura" className="scroll-mt-6 border-t border-border pt-10">
          <h2 style={serif} className="mb-2 text-2xl font-semibold text-foreground">Candidate-se</h2>
          <p className="mb-7 text-sm text-muted-foreground">Leva cerca de 4 minutos. Você pode preencher tudo manualmente.</p>
          <CandidaturaForm
            vagaSlug={vaga.slug}
            feedbackDias={vaga.feedback_dias}
            camposExtras={vaga.campos}
            portfolioObrigatorio={vaga.portfolio_obrigatorio}
          />
        </section>
      </article>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPosting).replace(/</g, "\\u003c") }} />
      <HomeFooter />
    </main>
  )
}
