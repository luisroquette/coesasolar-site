import type { Metadata } from "next"
import { CareersHeader } from "@/components/carreiras/CareersHeader"
import { CarreirasList } from "@/components/carreiras/CarreirasList"
import { HomeFooter } from "@/components/home/HomeFooter"
import { getVagasPublicadas } from "@/lib/carreiras/supabase"

export const revalidate = 600
export const metadata: Metadata = {
  title: "Carreiras | Coesa Energia",
  description: "Vagas abertas na Coesa Energia — venha construir o futuro da energia com a gente.",
  alternates: { canonical: "https://coesasolar.com.br/carreiras" },
}

export default async function CarreirasPage() {
  const vagas = await getVagasPublicadas()
  return <main className="min-h-screen bg-background">
    <CareersHeader />
    <section className="bg-coesa-green-dark px-4 pb-12 pt-7 text-white"><div className="container mx-auto max-w-5xl"><p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/65">Carreiras Coesa</p><h1 className="max-w-3xl text-3xl font-bold leading-tight md:text-5xl" style={{ fontFamily: "Georgia, serif" }}>Construa o futuro da energia com a gente.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-white/75">Conheça as oportunidades abertas e encontre o próximo desafio para o seu perfil.</p></div></section>
    <section className="container mx-auto max-w-5xl px-4 py-12">{vagas.length ? <CarreirasList vagas={vagas} /> : <div className="rounded-lg border border-border p-8 text-center"><p>Nenhuma vaga aberta no momento.</p><a href="/carreiras/banco-de-talentos" className="mt-3 inline-block font-semibold text-coesa-green-dark underline">Entrar no banco de talentos</a></div>}</section>
    <HomeFooter />
  </main>
}
