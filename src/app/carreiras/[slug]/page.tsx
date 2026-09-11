import type { Metadata } from "next"
import type { ReactNode } from "react"
import { BriefcaseBusiness, Code2, MapPin } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { notFound } from "next/navigation"
import { HomeFooter } from "@/components/home/HomeFooter"
import { CareersHeader } from "@/components/carreiras/CareersHeader"
import { CandidateButton } from "@/components/carreiras/CandidateButton"
import { CandidaturaForm } from "@/components/carreiras/CandidaturaForm"
import { getVagaBySlug, getConfigRhPublica } from "@/lib/carreiras/supabase"
import { normalizarDiferenciais, normalizarItensConteudo, normalizarTexto } from "@/lib/carreiras/conteudo"
import { logoDeMarca } from "@/lib/carreiras/marcas"

export const revalidate = 0
const SITE_URL = "https://coesasolar.com.br"

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
    <section className="border-t border-white/15 pt-7">
      <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-white">{titulo}</h2>
      <ul className="space-y-2 text-[15px] leading-6 text-white/75">
        {limpos.map((item) => <li key={item} className="flex gap-3"><span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#36d58b]" />{item}</li>)}
      </ul>
    </section>
  )
}

function Metadado({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: ReactNode }) {
  return <span className="inline-flex items-center gap-2 text-sm text-white/65"><Icon aria-hidden className="h-4 w-4 text-white/85" /><span className="sr-only">{label}: </span>{children}</span>
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

  const metadados = [
    vaga.modalidade && { icon: MapPin, label: "Modalidade", valor: vaga.modalidade },
    vaga.area && { icon: Code2, label: "Área", valor: vaga.area },
    vaga.regime && { icon: BriefcaseBusiness, label: "Regime", valor: vaga.regime },
    vaga.local && { icon: MapPin, label: "Local", valor: vaga.local },
  ].filter(Boolean) as { icon: typeof MapPin; label: string; valor: string }[]

  return (
    <main className="min-h-screen bg-[#06110d] text-white">
      <CareersHeader />

      <section className="relative overflow-hidden border-b border-white/15 px-5 pb-10 pt-8 md:px-8 md:pb-12 md:pt-12">
        <svg aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-32 w-full opacity-30" viewBox="0 0 1440 160" preserveAspectRatio="none">
          <path d="M0 126H250L292 85L326 126H622L661 65L708 126H967L1006 94L1040 126H1440" fill="none" stroke="#35d58a" strokeWidth="1.5" />
          <path d="M0 146H1440M120 112V160M360 112V160M600 112V160M840 112V160M1080 112V160M1320 112V160" fill="none" stroke="#35d58a" strokeWidth="0.5" opacity=".35" />
        </svg>
        <div className="relative container mx-auto grid max-w-6xl gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-9">
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.24em] text-[#83d9ad]">Oportunidade profissional</p>
            <h1 className="max-w-4xl text-3xl font-semibold uppercase leading-[1.05] tracking-[-0.02em] md:text-[40px]">{vaga.titulo}</h1>
            <div className="mt-6 flex flex-wrap gap-x-7 gap-y-3">
              {metadados.map(({ icon, label, valor }) => <Metadado key={`hero-${label}-${valor}`} icon={icon} label={label}>{valor}</Metadado>)}
            </div>
          </div>
          <div className="lg:col-span-3 lg:flex lg:justify-end"><CandidateButton /></div>
        </div>
      </section>

      <div className="container mx-auto grid max-w-6xl gap-12 px-5 py-10 md:px-8 md:py-14 lg:grid-cols-12">
        <article className="space-y-7 lg:col-span-8">
          {vaga.pitch && <section><h2 className="mb-3 text-xs font-bold uppercase tracking-[0.16em]">Sobre a vaga</h2><p className="max-w-3xl text-[15px] leading-6 text-white/75">{normalizarTexto(vaga.pitch)}</p></section>}
          <Lista titulo="O que você fará" itens={vaga.o_que_fara} />
          <Lista titulo="O que buscamos" itens={vaga.o_que_buscamos} />
          <Lista titulo="Diferenciais" itens={normalizarDiferenciais(vaga.diferenciais)} />

          {vaga.observacoes && (
            <section className="prose prose-sm prose-invert max-w-none border-t border-white/15 pt-7 leading-6 prose-headings:text-xs prose-headings:font-bold prose-headings:uppercase prose-headings:tracking-[0.16em] prose-p:my-2 prose-p:text-white/75 prose-li:my-1 prose-li:text-white/75 prose-strong:text-white">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizarTexto(vaga.observacoes)}</ReactMarkdown>
            </section>
          )}

          {(vaga.remuneracao || vaga.comissionamento || vaga.beneficios.length > 0) && (
            <section className="border-t border-white/15 pt-7">
              <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.16em]">Remuneração e benefícios</h2>
              <ul className="space-y-2 text-[15px] leading-6 text-white/75">
                {vaga.remuneracao && <li className="flex gap-3"><span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#36d58b]" />{normalizarTexto(vaga.remuneracao)}</li>}
                {vaga.comissionamento && <li className="flex gap-3"><span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#36d58b]" />{normalizarTexto(vaga.comissionamento)}</li>}
                {normalizarItensConteudo(vaga.beneficios).map((item) => {
                  const logo = logoDeMarca(item)
                  return <li key={item} className="flex gap-3"><span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#36d58b]" />{logo ? <span className="inline-flex items-center gap-2"><img src={logo} alt="" className="h-5 w-5 object-contain" />{item}</span> : item}</li>
                })}
              </ul>
            </section>
          )}

          <div className="border-t border-white/15 pt-7"><CandidateButton /></div>
        </article>

        <aside className="lg:col-span-4">
          <div className="rounded-2xl border border-white/15 bg-white/[0.025] p-6 lg:sticky lg:top-6">
            <h2 className="mb-5 text-xs font-bold uppercase tracking-[0.16em]">Resumo da vaga</h2>
            <div className="flex flex-col gap-4">{metadados.map(({ icon, label, valor }) => <Metadado key={`resumo-${label}-${valor}`} icon={icon} label={label}>{valor}</Metadado>)}</div>
            <div className="my-6 border-t border-white/15" />
            <CandidateButton />
            {config?.mensagem_final && <><div className="my-6 border-t border-white/15" /><p className="text-sm leading-6 text-white/60">{config.mensagem_final}</p></>}
          </div>
        </aside>
      </div>

      <section id="candidatura" className="scroll-mt-4 border-y border-white/15 bg-[#091711] px-5 py-10 md:px-8 md:py-14">
        <div className="container mx-auto max-w-6xl rounded-2xl border border-white/15 bg-[#0b1b14] p-5 shadow-2xl shadow-black/20 md:p-8">
          <h2 className="mb-2 text-2xl font-semibold uppercase tracking-[-0.01em]">Candidate-se</h2>
          <p className="mb-8 text-sm text-white/55">Leva cerca de 4 minutos. Você pode preencher tudo manualmente.</p>
          <CandidaturaForm
            vagaSlug={vaga.slug}
            feedbackDias={vaga.feedback_dias}
            camposExtras={vaga.campos}
            portfolioObrigatorio={vaga.portfolio_obrigatorio}
          />
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPosting).replace(/</g, "\\u003c") }} />
      <HomeFooter compact />
    </main>
  )
}
