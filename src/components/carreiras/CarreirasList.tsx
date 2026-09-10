"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import type { VagaPublica } from "@/lib/carreiras/supabase"
import { Badge } from "@/components/ui/badge"

const unico = (valores: (string | null | undefined)[]) => [...new Set(valores.filter((valor): valor is string => Boolean(valor)))].sort((a, b) => a.localeCompare(b, "pt-BR"))

export function CarreirasList({ vagas }: { vagas: VagaPublica[] }) {
  const [busca, setBusca] = useState("")
  const [area, setArea] = useState("")
  const [modalidade, setModalidade] = useState("")
  const [local, setLocal] = useState("")
  const areas = unico(vagas.map((vaga) => vaga.area))
  const modalidades = unico(vagas.map((vaga) => vaga.modalidade))
  const locais = unico(vagas.map((vaga) => vaga.local))
  const filtradas = useMemo(() => vagas.filter((vaga) => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR")
    return (!termo || [vaga.titulo, vaga.area, vaga.local].some((valor) => valor?.toLocaleLowerCase("pt-BR").includes(termo)))
      && (!area || vaga.area === area) && (!modalidade || vaga.modalidade === modalidade) && (!local || vaga.local === local)
  }), [vagas, busca, area, modalidade, local])
  const grupos = unico(filtradas.map((vaga) => vaga.area ?? "Outras")).map((nome) => ({ nome, vagas: filtradas.filter((vaga) => (vaga.area ?? "Outras") === nome) }))
  const temFiltros = Boolean(busca || area || modalidade || local)
  const limpar = () => { setBusca(""); setArea(""); setModalidade(""); setLocal("") }

  return <div className="space-y-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#83d9ad]">{vagas.length} {vagas.length === 1 ? "oportunidade aberta" : "oportunidades abertas"}</p><p aria-live="polite" className="mt-1 text-sm text-white/45">{filtradas.length} exibida{filtradas.length === 1 ? "" : "s"}</p></div>{temFiltros && <button type="button" onClick={limpar} className="text-sm font-semibold text-[#83d9ad] underline">Limpar filtros</button>}</div>
    {(vagas.length >= 2 || areas.length >= 2 || modalidades.length >= 2 || locais.length >= 2) && <div className="grid gap-3 md:grid-cols-4">
      {vagas.length >= 2 && <label className="md:col-span-2"><span className="sr-only">Buscar vagas</span><input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por cargo, área ou local" className="h-11 w-full rounded-md border border-white/15 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/40" /></label>}
      {areas.length >= 2 && <Filtro label="Área" value={area} values={areas} onChange={setArea} />}
      {modalidades.length >= 2 && <Filtro label="Modalidade" value={modalidade} values={modalidades} onChange={setModalidade} />}
      {locais.length >= 2 && <Filtro label="Local" value={local} values={locais} onChange={setLocal} />}
    </div>}
    {!filtradas.length ? <div className="rounded-2xl border border-white/15 p-8 text-center"><p>Nenhuma vaga corresponde aos filtros.</p><Link href="/carreiras/banco-de-talentos" className="mt-3 inline-block font-semibold text-[#83d9ad] underline">Entrar no banco de talentos</Link></div> : <div className="space-y-9">{grupos.map((grupo) => <section key={grupo.nome}><h2 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-[#83d9ad]">{grupo.nome}</h2><div className="divide-y divide-white/15 border-y border-white/15">{grupo.vagas.map((vaga) => <Link key={vaga.slug} href={`/carreiras/${vaga.slug}`} className="group flex items-center justify-between gap-4 py-5"><div><h3 className="text-lg font-semibold text-white transition-colors group-hover:text-[#83d9ad]">{vaga.titulo}</h3><div className="mt-2 flex flex-wrap items-center gap-2">{vaga.modalidade && <Badge className="border border-[#36d58b]/30 bg-[#36d58b]/10 text-[#83d9ad]">{vaga.modalidade}</Badge>}<p className="text-sm text-white/50">{[vaga.regime, vaga.local].filter(Boolean).join(" · ")}</p></div></div><span aria-hidden="true" className="text-xl text-[#83d9ad] transition-transform group-hover:translate-x-1">→</span></Link>)}</div></section>)}</div>}
  </div>
}

function Filtro({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }) {
  return <label><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 w-full rounded-md border border-white/15 bg-[#07140f] px-3 text-sm text-white"><option value="">{label}: todos</option>{values.map((item) => <option key={item}>{item}</option>)}</select></label>
}
