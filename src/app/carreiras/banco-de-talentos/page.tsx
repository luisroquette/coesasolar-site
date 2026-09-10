import type { Metadata } from "next"
import { CareersHeader } from "@/components/carreiras/CareersHeader"
import { HomeFooter } from "@/components/home/HomeFooter"
import { CandidaturaForm } from "@/components/carreiras/CandidaturaForm"

export const metadata: Metadata = {
  title: "Banco de Talentos | Coesa Energia",
  description: "Não achou a vaga certa? Deixe seu currículo e avisamos quando surgir uma oportunidade com o seu perfil.",
  alternates: { canonical: "https://coesasolar.com.br/carreiras/banco-de-talentos" },
}

export default function BancoDeTalentosPage() {
  return (
    <main className="min-h-screen bg-[#06110d] text-white">
      <CareersHeader />

      <section className="border-b border-white/15 px-5 pb-10 pt-8 md:px-8 md:pb-12 md:pt-12">
        <div className="container mx-auto max-w-3xl">
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.24em] text-[#83d9ad]">Banco de talentos</p>
          <h1 className="text-3xl font-semibold uppercase leading-[1.05] tracking-[-0.02em] md:text-[40px]">
            Não achou sua vaga?
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/65">
            Deixe seu currículo com a gente. Assim que surgir uma vaga com o seu perfil, entramos em contato.
          </p>
        </div>
      </section>

      <section className="border-b border-white/15 bg-[#091711] px-5 py-10 md:px-8 md:py-14">
        <div className="container mx-auto max-w-3xl rounded-2xl border border-white/15 bg-[#0b1b14] p-5 shadow-2xl shadow-black/20 md:p-8">
          <h2 className="mb-2 text-2xl font-semibold uppercase tracking-[-0.01em]">Cadastre seu perfil</h2>
          <p className="mb-8 text-sm text-white/55">Leva cerca de 4 minutos. Você pode preencher tudo manualmente.</p>
          <CandidaturaForm />
        </div>
      </section>

      <HomeFooter compact />
    </main>
  )
}
