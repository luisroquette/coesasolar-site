import type { Metadata } from "next"
import { HomeNavbar } from "@/components/home/HomeNavbar"
import { HomeFooter } from "@/components/home/HomeFooter"
import { CandidaturaForm } from "@/components/carreiras/CandidaturaForm"

export const metadata: Metadata = {
  title: "Banco de Talentos | Coesa Energia",
  description: "Não achou a vaga certa? Deixe seu currículo e avisamos quando surgir uma oportunidade com o seu perfil.",
}

const serif = { fontFamily: "Georgia, serif" }

export default function BancoDeTalentosPage() {
  return (
    <main className="min-h-screen bg-background">
      <HomeNavbar />

      <section className="bg-coesa-ink pt-32 pb-16 px-4">
        <div className="container max-w-3xl mx-auto text-center">
          <p className="text-xs uppercase tracking-widest text-white/70 mb-3">Oportunidade profissional</p>
          <h1 style={serif} className="text-3xl md:text-5xl font-bold text-white leading-tight">
            Não achou sua vaga?
          </h1>
          <p className="mt-3 text-white/80">
            Deixe seu currículo com a gente. Assim que surgir uma vaga com o seu perfil, entramos em contato.
          </p>
        </div>
      </section>

      <article className="container max-w-3xl mx-auto px-4 py-12">
        <CandidaturaForm />
      </article>

      <HomeFooter />
    </main>
  )
}
