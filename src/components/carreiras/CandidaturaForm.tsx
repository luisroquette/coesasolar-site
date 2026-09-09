"use client"

import { useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { montarFormData, formatarWhatsapp, listaDeTexto, periodoInvalido, preencherListaSeVazia, preencherSeVazio, type CampoExtraForm, type ExperienciaForm, type FormacaoForm, type IdiomaForm } from "@/lib/carreiras/form-utils"

const RH_API_BASE = process.env.NEXT_PUBLIC_RH_API_BASE ?? "https://relatorios.coesasolar.com.br"
const ETAPAS = ["Currículo", "Dados pessoais", "Experiência e formação", "Perfil e revisão"]
type Status = "idle" | "enviando" | "sucesso" | "ja_candidatou" | "encerrada" | "erro"

function lerUtmSalvo(): Record<string, string> {
  try { return JSON.parse(sessionStorage.getItem("carreiras_utm") ?? "{}") } catch { return {} }
}
function dataFeedback(dias: number): string {
  const data = new Date(); data.setDate(data.getDate() + dias); return data.toLocaleDateString("pt-BR")
}

interface Props {
  vagaSlug?: string
  feedbackDias?: number
  camposExtras?: CampoExtraForm[]
  portfolioObrigatorio?: boolean
}

export function CandidaturaForm({ vagaSlug, feedbackDias, camposExtras = [], portfolioObrigatorio = false }: Props) {
  const [etapa, setEtapa] = useState(1)
  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [cidade, setCidade] = useState("")
  const [linkedin, setLinkedin] = useState("")
  const [consent, setConsent] = useState(false)
  const [consentIa, setConsentIa] = useState(false)
  const [cv, setCv] = useState<File | null>(null)
  const [website, setWebsite] = useState("")
  const [portfolioModo, setPortfolioModo] = useState<"nenhum" | "link" | "arquivo">("nenhum")
  const [portfolioUrl, setPortfolioUrl] = useState("")
  const [portfolioArquivo, setPortfolioArquivo] = useState<File | null>(null)
  const [pretensaoSalarial, setPretensaoSalarial] = useState("")
  const [disponibilidade, setDisponibilidade] = useState("")
  const [resumoProfissional, setResumoProfissional] = useState("")
  const [anosExperiencia, setAnosExperiencia] = useState("")
  const [cargoAtual, setCargoAtual] = useState("")
  const [formacoes, setFormacoes] = useState<FormacaoForm[]>([])
  const [experiencias, setExperiencias] = useState<ExperienciaForm[]>([])
  const [habilidades, setHabilidades] = useState("")
  const [idiomas, setIdiomas] = useState<IdiomaForm[]>([])
  const [certificacoes, setCertificacoes] = useState("")
  const [fontePreenchimento, setFontePreenchimento] = useState<"manual" | "ia_cv">("manual")
  const [respostasExtras, setRespostasExtras] = useState<Record<string, string>>({})
  const [arquivosExtras, setArquivosExtras] = useState<Record<string, File | null>>({})
  const [erros, setErros] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<Status>("idle")
  const [erroServidor, setErroServidor] = useState<string | null>(null)
  const [extraindo, setExtraindo] = useState(false)
  const [erroExtracao, setErroExtracao] = useState<string | null>(null)
  const resumoErrosRef = useRef<HTMLDivElement>(null)

  function mostrarErros(novos: Record<string, string>) {
    setErros(novos)
    const primeiro = Object.keys(novos)[0]
    if (primeiro) requestAnimationFrame(() => {
      const campo = document.getElementById(primeiro) as HTMLElement | null
      if (campo) campo.focus()
      else resumoErrosRef.current?.focus()
    })
    return Object.keys(novos).length === 0
  }

  function validarEtapa(atual: number) {
    const novos: Record<string, string> = {}
    if (atual === 1) {
      if (!cv) novos.cv = "Anexe seu currículo em PDF."
      else if (cv.type !== "application/pdf" && !cv.name.toLowerCase().endsWith(".pdf")) novos.cv = "O currículo deve ser PDF."
      else if (cv.size > 4 * 1024 * 1024) novos.cv = "O currículo deve ter até 4MB."
      if (!consent) novos.consent = "Autorize o uso dos dados para continuar."
    }
    if (atual === 2) {
      if (!nome.trim()) novos.nome = "Informe seu nome."
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) novos.email = "Informe um e-mail válido."
      if (whatsapp.replace(/\D/g, "").length < 10) novos.whatsapp = "Informe um WhatsApp válido."
      if (!cidade.trim()) novos.cidade = "Informe sua cidade."
    }
    if (atual === 3) {
      formacoes.forEach((item, indice) => {
        if (!item.instituicao.trim()) novos[`formacao-instituicao-${indice}`] = "Informe a instituição."
        if (!item.curso.trim()) novos[`formacao-curso-${indice}`] = "Informe o curso."
        if (periodoInvalido(item.inicio, item.fim)) novos[`formacao-fim-${indice}`] = "O término deve ser posterior ao início."
      })
      experiencias.forEach((item, indice) => {
        if (!item.empresa.trim()) novos[`experiencia-empresa-${indice}`] = "Informe a empresa."
        if (!item.cargo.trim()) novos[`experiencia-cargo-${indice}`] = "Informe o cargo."
        if (periodoInvalido(item.inicio, item.fim)) novos[`experiencia-fim-${indice}`] = "O término deve ser posterior ao início."
      })
    }
    if (atual === 4) {
      idiomas.forEach((item, indice) => {
        if (!item.idioma.trim()) novos[`idioma-${indice}`] = "Informe o idioma."
      })
      if (portfolioObrigatorio && !portfolioUrl.trim() && !portfolioArquivo) novos.portfolio = "Anexe ou informe o link do portfólio."
      if (portfolioUrl && portfolioArquivo) novos.portfolio = "Use link ou arquivo, não os dois."
      if (portfolioArquivo && portfolioArquivo.size > 1.5 * 1024 * 1024) novos.portfolio = "O portfólio deve ter até 1,5MB."
      const totalAnexos = (cv?.size ?? 0) + (portfolioArquivo?.size ?? 0)
        + Object.values(arquivosExtras).reduce((total, arquivo) => total + (arquivo?.size ?? 0), 0)
      if (totalAnexos > 4_300_000) novos.portfolio = "Os anexos juntos excedem o limite. Use links para os arquivos maiores."
      for (const campo of camposExtras) {
        if (!campo.obrigatorio) continue
        if (campo.tipo === "anexo" ? !arquivosExtras[campo.id] : !(respostasExtras[campo.id] ?? "").trim()) {
          novos[`campo-${campo.id}`] = `${campo.label} é obrigatório.`
        }
      }
    }
    return mostrarErros(novos)
  }

  function avancar() {
    if (extraindo || !validarEtapa(etapa)) return
    setEtapa((valor) => Math.min(4, valor + 1))
    window.setTimeout(() => document.querySelector<HTMLElement>(`[data-etapa="${Math.min(4, etapa + 1)}"] input, [data-etapa="${Math.min(4, etapa + 1)}"] textarea`)?.focus(), 0)
  }

  async function extrairCv() {
    if (!cv || !consentIa) return
    setExtraindo(true); setErroExtracao(null)
    try {
      const form = new FormData(); form.append("cv", cv); form.append("consent_ia", "true")
      const response = await fetch(`${RH_API_BASE}/api/carreiras/extrair-cv`, { method: "POST", body: form })
      const dados = await response.json().catch(() => ({}))
      if (!response.ok) { setErroExtracao(dados.error ?? "Preenchimento automático indisponível — preencha manualmente."); return }
      if (dados.nome) setNome((valor) => preencherSeVazio(valor, dados.nome))
      if (dados.email) setEmail((valor) => preencherSeVazio(valor, dados.email))
      if (dados.whatsapp) setWhatsapp((valor) => preencherSeVazio(valor, formatarWhatsapp(dados.whatsapp)))
      if (dados.cidade) setCidade((valor) => preencherSeVazio(valor, dados.cidade))
      if (dados.resumo_profissional) setResumoProfissional((valor) => preencherSeVazio(valor, dados.resumo_profissional))
      if (dados.anos_experiencia != null) setAnosExperiencia((valor) => preencherSeVazio(valor, String(dados.anos_experiencia)))
      if (dados.cargo_atual) setCargoAtual((valor) => preencherSeVazio(valor, dados.cargo_atual))
      setFormacoes((valor) => preencherListaSeVazia(valor, dados.formacoes))
      setExperiencias((valor) => preencherListaSeVazia(valor, dados.experiencias))
      setIdiomas((valor) => preencherListaSeVazia(valor, dados.idiomas))
      if (dados.habilidades?.length) setHabilidades((valor) => preencherSeVazio(valor, dados.habilidades.join(", ")))
      if (dados.certificacoes?.length) setCertificacoes((valor) => preencherSeVazio(valor, dados.certificacoes.join(", ")))
      setFontePreenchimento("ia_cv")
    } catch { setErroExtracao("Preenchimento automático indisponível — preencha manualmente.") }
    finally { setExtraindo(false) }
  }

  async function enviar(event: FormEvent) {
    event.preventDefault()
    if (etapa < 4) { avancar(); return }
    for (const passo of [1, 2, 3, 4]) {
      if (!validarEtapa(passo)) { setEtapa(passo); return }
    }
    setErroServidor(null); setStatus("enviando")
    const form = montarFormData({
      nome, email, whatsapp, cidade, linkedin, consent, cv, website,
      portfolioUrl: portfolioModo === "link" ? portfolioUrl : undefined,
      portfolioArquivo: portfolioModo === "arquivo" ? portfolioArquivo : undefined,
      pretensaoSalarial, disponibilidade, resumoProfissional, anosExperiencia, fontePreenchimento,
      cargoAtual, formacoes, experiencias, habilidades: listaDeTexto(habilidades), idiomas,
      certificacoes: listaDeTexto(certificacoes),
    }, vagaSlug ?? "", lerUtmSalvo(), { respostasExtras, arquivosExtras })
    try {
      const response = await fetch(`${RH_API_BASE}/api/carreiras/candidaturas`, { method: "POST", body: form })
      if (response.status === 201) setStatus("sucesso")
      else if (response.status === 409) setStatus("ja_candidatou")
      else if (response.status === 404) setStatus("encerrada")
      else { const body = await response.json().catch(() => ({})); setErroServidor(body.error ?? null); setStatus("erro") }
    } catch { setStatus("erro") }
  }

  if (status === "sucesso") return <p className="text-center">{feedbackDias ? `Candidatura recebida! Você receberá nosso feedback até ${dataFeedback(feedbackDias)} — enviaremos o resultado, seja ele qual for.` : "Currículo recebido! Você entrou no nosso banco de talentos."}</p>
  if (status === "encerrada") return <p className="text-center">Esta vaga acabou de ser encerrada. <Link href="/carreiras" className="text-coesa-green underline">Ver outras vagas</Link></p>

  const FieldError = ({ id }: { id: string }) => erros[id] ? <p className="mt-1 text-sm text-red-700">{erros[id]}</p> : null
  return (
    <form onSubmit={enviar} className="space-y-6">
      <ol aria-label="Progresso da candidatura" className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {ETAPAS.map((nomeEtapa, indice) => <li key={nomeEtapa} className={`border-t-2 pt-2 text-xs ${indice + 1 <= etapa ? "border-coesa-green-dark font-semibold text-coesa-green-dark" : "border-border text-muted-foreground"}`}>{indice + 1}. {nomeEtapa}</li>)}
      </ol>

      {Object.keys(erros).length > 0 && <div ref={resumoErrosRef} tabIndex={-1} role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">Revise os campos indicados:</p><ul className="mt-1 list-disc pl-5">{Object.values(erros).map((erro) => <li key={erro}>{erro}</li>)}</ul></div>}

      {etapa === 1 && <fieldset data-etapa="1" className="space-y-5">
        <legend className="sr-only">Currículo e consentimento</legend>
        <div><Label htmlFor="cv">Currículo (PDF, até 4MB) *</Label><Input id="cv" type="file" accept="application/pdf" required aria-required="true" aria-invalid={!!erros.cv} onChange={(e) => { setCv(e.target.files?.[0] ?? null); setFontePreenchimento("manual") }} /><FieldError id="cv" /></div>
        <div className="flex items-start gap-2"><Checkbox id="consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} aria-required="true" aria-invalid={!!erros.consent} className="mt-1" /><Label htmlFor="consent" className="font-normal leading-snug">Autorizo o uso dos meus dados para este processo seletivo e contato sobre futuras oportunidades na Coesa Energia. *</Label></div><FieldError id="consent" />
        <div className="rounded-md border border-border p-4"><div className="flex items-start gap-2"><Checkbox id="consent-ia" checked={consentIa} onCheckedChange={(v) => setConsentIa(v === true)} className="mt-1" /><Label htmlFor="consent-ia" className="font-normal leading-snug">Opcional: autorizo o envio deste currículo a um serviço de IA para preencher o formulário. Posso continuar manualmente sem autorizar.</Label></div><Button type="button" variant="outline" className="mt-3" disabled={!cv || !consentIa || extraindo} onClick={() => void extrairCv()}>{extraindo ? "Lendo currículo..." : "Preencher campos com IA"}</Button>{erroExtracao && <p className="mt-2 text-sm text-muted-foreground">{erroExtracao}</p>}</div>
      </fieldset>}

      {etapa === 2 && <fieldset data-etapa="2" className="grid gap-5 md:grid-cols-2"><legend className="sr-only">Dados pessoais</legend>
        <div><Label htmlFor="nome">Nome completo *</Label><Input id="nome" required aria-required="true" aria-invalid={!!erros.nome} value={nome} onChange={(e) => setNome(e.target.value)} /><FieldError id="nome" /></div>
        <div><Label htmlFor="email">E-mail *</Label><Input id="email" type="email" required aria-required="true" aria-invalid={!!erros.email} value={email} onChange={(e) => setEmail(e.target.value)} /><FieldError id="email" /></div>
        <div><Label htmlFor="whatsapp">WhatsApp *</Label><Input id="whatsapp" required aria-required="true" aria-invalid={!!erros.whatsapp} value={whatsapp} onChange={(e) => setWhatsapp(formatarWhatsapp(e.target.value))} placeholder="(00) 00000-0000" /><FieldError id="whatsapp" /></div>
        <div><Label htmlFor="cidade">Cidade *</Label><Input id="cidade" required aria-required="true" aria-invalid={!!erros.cidade} value={cidade} onChange={(e) => setCidade(e.target.value)} /><FieldError id="cidade" /></div>
      </fieldset>}

      {etapa === 3 && <fieldset data-etapa="3" className="space-y-7"><legend className="sr-only">Experiência e formação</legend>
        <div><Label htmlFor="cargo-atual">Cargo atual ou mais recente (opcional)</Label><Input id="cargo-atual" value={cargoAtual} onChange={(e) => setCargoAtual(e.target.value)} /></div>
        <section aria-labelledby="experiencias-titulo" className="space-y-4"><div className="flex items-center justify-between gap-3"><h3 id="experiencias-titulo" className="font-semibold">Experiências profissionais</h3><Button type="button" variant="outline" size="sm" disabled={experiencias.length >= 15} onClick={() => setExperiencias([...experiencias, { empresa: "", cargo: "" }])}>Adicionar experiência</Button></div>
          {experiencias.length === 0 && <p className="text-sm text-muted-foreground">Adicione seus vínculos profissionais ou use o preenchimento por IA.</p>}
          {experiencias.map((item, indice) => <div key={indice} className="space-y-4 rounded-md border border-border p-4"><div className="flex justify-between"><p className="text-sm font-semibold">Experiência {indice + 1}</p><button type="button" className="text-sm text-red-700 underline" aria-label={`Remover experiência ${indice + 1}`} onClick={() => setExperiencias(experiencias.filter((_, i) => i !== indice))}>Remover</button></div><div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor={`experiencia-empresa-${indice}`}>Empresa *</Label><Input id={`experiencia-empresa-${indice}`} value={item.empresa} aria-invalid={!!erros[`experiencia-empresa-${indice}`]} onChange={(e) => setExperiencias(experiencias.map((valor, i) => i === indice ? { ...valor, empresa: e.target.value } : valor))} /><FieldError id={`experiencia-empresa-${indice}`} /></div><div><Label htmlFor={`experiencia-cargo-${indice}`}>Cargo *</Label><Input id={`experiencia-cargo-${indice}`} value={item.cargo} aria-invalid={!!erros[`experiencia-cargo-${indice}`]} onChange={(e) => setExperiencias(experiencias.map((valor, i) => i === indice ? { ...valor, cargo: e.target.value } : valor))} /><FieldError id={`experiencia-cargo-${indice}`} /></div><div><Label htmlFor={`experiencia-inicio-${indice}`}>Início</Label><Input id={`experiencia-inicio-${indice}`} type="month" value={item.inicio ?? ""} onChange={(e) => setExperiencias(experiencias.map((valor, i) => i === indice ? { ...valor, inicio: e.target.value || undefined } : valor))} /></div><div><Label htmlFor={`experiencia-fim-${indice}`}>Fim</Label><Input id={`experiencia-fim-${indice}`} type="month" disabled={item.atual} value={item.fim ?? ""} onChange={(e) => setExperiencias(experiencias.map((valor, i) => i === indice ? { ...valor, fim: e.target.value || undefined } : valor))} /></div></div><div className="flex items-center gap-2"><Checkbox id={`experiencia-atual-${indice}`} checked={item.atual ?? false} onCheckedChange={(valor) => setExperiencias(experiencias.map((itemAtual, i) => i === indice ? { ...itemAtual, atual: valor === true, fim: valor === true ? undefined : itemAtual.fim } : itemAtual))} /><Label htmlFor={`experiencia-atual-${indice}`} className="font-normal">Trabalho aqui atualmente</Label></div><div><Label htmlFor={`experiencia-descricao-${indice}`}>Principais atividades e resultados</Label><Textarea id={`experiencia-descricao-${indice}`} rows={3} value={item.descricao ?? ""} onChange={(e) => setExperiencias(experiencias.map((valor, i) => i === indice ? { ...valor, descricao: e.target.value } : valor))} /></div></div>)}
        </section>
        <section aria-labelledby="formacoes-titulo" className="space-y-4"><div className="flex items-center justify-between gap-3"><h3 id="formacoes-titulo" className="font-semibold">Formação acadêmica</h3><Button type="button" variant="outline" size="sm" disabled={formacoes.length >= 10} onClick={() => setFormacoes([...formacoes, { instituicao: "", curso: "" }])}>Adicionar formação</Button></div>
          {formacoes.length === 0 && <p className="text-sm text-muted-foreground">Adicione sua formação ou use o preenchimento por IA.</p>}
          {formacoes.map((item, indice) => <div key={indice} className="space-y-4 rounded-md border border-border p-4"><div className="flex justify-between"><p className="text-sm font-semibold">Formação {indice + 1}</p><button type="button" className="text-sm text-red-700 underline" aria-label={`Remover formação ${indice + 1}`} onClick={() => setFormacoes(formacoes.filter((_, i) => i !== indice))}>Remover</button></div><div className="grid gap-4 md:grid-cols-2"><div><Label htmlFor={`formacao-instituicao-${indice}`}>Instituição *</Label><Input id={`formacao-instituicao-${indice}`} value={item.instituicao} aria-invalid={!!erros[`formacao-instituicao-${indice}`]} onChange={(e) => setFormacoes(formacoes.map((valor, i) => i === indice ? { ...valor, instituicao: e.target.value } : valor))} /><FieldError id={`formacao-instituicao-${indice}`} /></div><div><Label htmlFor={`formacao-curso-${indice}`}>Curso *</Label><Input id={`formacao-curso-${indice}`} value={item.curso} aria-invalid={!!erros[`formacao-curso-${indice}`]} onChange={(e) => setFormacoes(formacoes.map((valor, i) => i === indice ? { ...valor, curso: e.target.value } : valor))} /><FieldError id={`formacao-curso-${indice}`} /></div><div><Label htmlFor={`formacao-nivel-${indice}`}>Nível</Label><Input id={`formacao-nivel-${indice}`} placeholder="Ex.: Graduação, Técnico" value={item.nivel ?? ""} onChange={(e) => setFormacoes(formacoes.map((valor, i) => i === indice ? { ...valor, nivel: e.target.value } : valor))} /></div><div className="grid grid-cols-2 gap-3"><div><Label htmlFor={`formacao-inicio-${indice}`}>Início</Label><Input id={`formacao-inicio-${indice}`} type="month" value={item.inicio ?? ""} onChange={(e) => setFormacoes(formacoes.map((valor, i) => i === indice ? { ...valor, inicio: e.target.value || undefined } : valor))} /></div><div><Label htmlFor={`formacao-fim-${indice}`}>Fim</Label><Input id={`formacao-fim-${indice}`} type="month" disabled={item.cursando} value={item.fim ?? ""} onChange={(e) => setFormacoes(formacoes.map((valor, i) => i === indice ? { ...valor, fim: e.target.value || undefined } : valor))} /></div></div></div><div className="flex items-center gap-2"><Checkbox id={`formacao-cursando-${indice}`} checked={item.cursando ?? false} onCheckedChange={(valor) => setFormacoes(formacoes.map((itemAtual, i) => i === indice ? { ...itemAtual, cursando: valor === true, fim: valor === true ? undefined : itemAtual.fim } : itemAtual))} /><Label htmlFor={`formacao-cursando-${indice}`} className="font-normal">Estou cursando</Label></div></div>)}
        </section>
      </fieldset>}

      {etapa === 4 && <fieldset data-etapa="4" className="space-y-5"><legend className="sr-only">Perfil e revisão</legend>
        <div><Label htmlFor="linkedin">LinkedIn (opcional)</Label><Input id="linkedin" type="url" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} /></div>
        <div><Label htmlFor="resumo-profissional">Resumo profissional (opcional)</Label><Textarea id="resumo-profissional" rows={4} value={resumoProfissional} onChange={(e) => setResumoProfissional(e.target.value)} /></div>
        <div className="grid gap-5 md:grid-cols-2"><div><Label htmlFor="anos-experiencia">Anos de experiência (opcional)</Label><Input id="anos-experiencia" type="number" min="0" value={anosExperiencia} onChange={(e) => setAnosExperiencia(e.target.value)} /></div><div><Label htmlFor="pretensao">Pretensão salarial (opcional)</Label><Input id="pretensao" value={pretensaoSalarial} onChange={(e) => setPretensaoSalarial(e.target.value)} /></div></div>
        <div><Label htmlFor="habilidades">Habilidades (opcional)</Label><Textarea id="habilidades" rows={2} value={habilidades} onChange={(e) => setHabilidades(e.target.value)} placeholder="Separe por vírgula. Ex.: TypeScript, React, SQL" /></div>
        <section aria-labelledby="idiomas-titulo" className="space-y-3"><div className="flex items-center justify-between"><h3 id="idiomas-titulo" className="font-semibold">Idiomas</h3><Button type="button" variant="outline" size="sm" disabled={idiomas.length >= 10} onClick={() => setIdiomas([...idiomas, { idioma: "" }])}>Adicionar idioma</Button></div>{idiomas.map((item, indice) => <div key={indice} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><div><Label htmlFor={`idioma-${indice}`}>Idioma *</Label><Input id={`idioma-${indice}`} value={item.idioma} aria-invalid={!!erros[`idioma-${indice}`]} onChange={(e) => setIdiomas(idiomas.map((valor, i) => i === indice ? { ...valor, idioma: e.target.value } : valor))} /><FieldError id={`idioma-${indice}`} /></div><div><Label htmlFor={`idioma-nivel-${indice}`}>Nível</Label><select id={`idioma-nivel-${indice}`} value={item.nivel ?? ""} onChange={(e) => setIdiomas(idiomas.map((valor, i) => i === indice ? { ...valor, nivel: (e.target.value || undefined) as IdiomaForm["nivel"] } : valor))} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Selecione...</option><option value="basico">Básico</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option><option value="fluente">Fluente</option><option value="nativo">Nativo</option></select></div><button type="button" className="self-end pb-2 text-sm text-red-700 underline" onClick={() => setIdiomas(idiomas.filter((_, i) => i !== indice))}>Remover</button></div>)}</section>
        <div><Label htmlFor="certificacoes">Certificações (opcional)</Label><Textarea id="certificacoes" rows={2} value={certificacoes} onChange={(e) => setCertificacoes(e.target.value)} placeholder="Separe por vírgula ou uma por linha" /></div>
        <div><Label htmlFor="disponibilidade">Disponibilidade (opcional)</Label><select id="disponibilidade" value={disponibilidade} onChange={(e) => setDisponibilidade(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Selecione...</option><option value="imediata">Imediata</option><option value="aviso_previo">Aviso prévio</option><option value="a_combinar">A combinar</option></select></div>
        <div id="portfolio" tabIndex={-1}><Label>Portfólio {portfolioObrigatorio ? "*" : "(opcional)"}</Label><div className="my-2 flex gap-4 text-sm"><button type="button" onClick={() => { setPortfolioModo("link"); setPortfolioArquivo(null) }} className={portfolioModo === "link" ? "font-semibold text-coesa-green-dark underline" : "text-muted-foreground"}>Link</button><button type="button" onClick={() => { setPortfolioModo("arquivo"); setPortfolioUrl("") }} className={portfolioModo === "arquivo" ? "font-semibold text-coesa-green-dark underline" : "text-muted-foreground"}>Arquivo</button></div>{portfolioModo === "link" && <Input id="portfolio-url" type="url" required={portfolioObrigatorio} aria-required={portfolioObrigatorio} value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} placeholder="https://..." />}{portfolioModo === "arquivo" && <Input id="portfolio-file" type="file" required={portfolioObrigatorio} aria-required={portfolioObrigatorio} accept="application/pdf,image/png,image/jpeg" onChange={(e) => setPortfolioArquivo(e.target.files?.[0] ?? null)} />}<FieldError id="portfolio" /></div>
        {camposExtras.map((campo) => <div key={campo.id}><Label htmlFor={`campo-${campo.id}`}>{campo.label}{campo.obrigatorio ? " *" : " (opcional)"}</Label>{campo.tipo === "texto_curto" && <Input id={`campo-${campo.id}`} required={campo.obrigatorio} aria-required={campo.obrigatorio} value={respostasExtras[campo.id] ?? ""} onChange={(e) => setRespostasExtras({ ...respostasExtras, [campo.id]: e.target.value })} />}{campo.tipo === "texto_longo" && <Textarea id={`campo-${campo.id}`} required={campo.obrigatorio} aria-required={campo.obrigatorio} value={respostasExtras[campo.id] ?? ""} onChange={(e) => setRespostasExtras({ ...respostasExtras, [campo.id]: e.target.value })} />}{(campo.tipo === "selecao" || campo.tipo === "sim_nao") && <select id={`campo-${campo.id}`} required={campo.obrigatorio} aria-required={campo.obrigatorio} value={respostasExtras[campo.id] ?? ""} onChange={(e) => setRespostasExtras({ ...respostasExtras, [campo.id]: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">Selecione...</option>{(campo.tipo === "sim_nao" ? ["Sim", "Não"] : campo.opcoes).map((opcao) => <option key={opcao}>{opcao}</option>)}</select>}{campo.tipo === "anexo" && <Input id={`campo-${campo.id}`} type="file" required={campo.obrigatorio} aria-required={campo.obrigatorio} accept="application/pdf,image/png,image/jpeg" onChange={(e) => setArquivosExtras({ ...arquivosExtras, [campo.id]: e.target.files?.[0] ?? null })} />}<FieldError id={`campo-${campo.id}`} /></div>)}
        <div className="rounded-md bg-coesa-gray-light/60 p-4 text-sm"><p className="font-semibold">Revise antes de enviar</p><p>{nome} · {email}</p><p>{cargoAtual || "Cargo não informado"} · {experiencias.length} experiência(s) · {formacoes.length} formação(ões)</p><p>{cv?.name}</p></div>
      </fieldset>}

      <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" />
      {status === "ja_candidatou" && <p role="alert" className="text-sm text-red-700">Você já se candidatou a esta vaga.</p>}
      {status === "erro" && <p role="alert" className="text-sm text-red-700">{erroServidor ?? "Não foi possível enviar sua candidatura agora. Tente novamente."}</p>}
      <div className="flex gap-3">{etapa > 1 && <Button type="button" variant="outline" onClick={() => { setErros({}); setEtapa((valor) => valor - 1) }}>Voltar</Button>}<Button type="submit" disabled={extraindo || status === "enviando"} className="flex-1 bg-coesa-green-dark hover:bg-coesa-green">{etapa < 4 ? "Continuar" : status === "enviando" ? "Enviando..." : "Enviar candidatura"}</Button></div>
    </form>
  )
}
