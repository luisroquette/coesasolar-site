import type { Metadata } from "next"
import { CareersHeader } from "@/components/carreiras/CareersHeader"
import { CarreirasList } from "@/components/carreiras/CarreirasList"
import { HomeFooter } from "@/components/home/HomeFooter"
import { getVagasPublicadas } from "@/lib/carreiras/supabase"

export const revalidate = 0
export const metadata: Metadata = {
  title: "Carreiras | Coesa Energia",
  description: "Vagas abertas na Coesa Energia — venha construir o futuro da energia com a gente.",
  alternates: { canonical: "https://coesasolar.com.br/carreiras" },
}

export default async function CarreirasPage() {
  const vagas = await getVagasPublicadas()
  return <main className="min-h-screen bg-[#06110d] text-white">
    <CareersHeader />
    <section className="border-b border-white/15 px-5 pb-12 pt-10 md:px-8 md:pb-16 md:pt-14"><div className="container mx-auto max-w-6xl"><p className="mb-4 text-[11px] font-bold uppercase tracking-[0.24em] text-[#83d9ad]">Carreiras Coesa</p><h1 className="max-w-3xl text-3xl font-semibold uppercase leading-[1.05] tracking-[-0.02em] md:text-[44px]">Construa o futuro da energia com a gente.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-white/65">Conheça as oportunidades abertas e encontre o próximo desafio para o seu perfil.</p></div></section>
    <section className="container mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-14">{vagas.length ? <CarreirasList vagas={vagas} /> : <div className="rounded-2xl border border-white/15 p-8 text-center"><p>Nenhuma vaga aberta no momento.</p><a href="/carreiras/banco-de-talentos" className="mt-3 inline-block font-semibold text-[#83d9ad] underline">Entrar no banco de talentos</a></div>}</section>
    <HomeFooter compact />
  </main>
}
