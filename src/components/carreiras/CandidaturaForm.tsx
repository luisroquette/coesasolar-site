"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { validarClient, montarFormData, formatarWhatsapp, preencherSeVazio, type CampoExtraForm } from "@/lib/carreiras/form-utils"

const RH_API_BASE = process.env.NEXT_PUBLIC_RH_API_BASE ?? "https://relatorios.coesasolar.com.br"

function lerUtmSalvo(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem("carreiras_utm") ?? "{}")
  } catch {
    return {}
  }
}

function dataFeedback(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toLocaleDateString("pt-BR")
}

interface CandidaturaFormProps {
  vagaSlug: string
  feedbackDias: number
  camposExtras?: CampoExtraForm[]
}

type Status = "idle" | "enviando" | "sucesso" | "ja_candidatou" | "encerrada" | "erro"

export function CandidaturaForm({ vagaSlug, feedbackDias, camposExtras = [] }: CandidaturaFormProps) {
  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [whatsapp, setWhatsapp] = useState("")
  const [cidade, setCidade] = useState("")
  const [linkedin, setLinkedin] = useState("")
  const [consent, setConsent] = useState(false)
  const [cv, setCv] = useState<File | null>(null)
  const [website, setWebsite] = useState("")
  const [erros, setErros] = useState<string[]>([])
  const [status, setStatus] = useState<Status>("idle")
  const [erroServidor, setErroServidor] = useState<string | null>(null)
  const [portfolioModo, setPortfolioModo] = useState<"nenhum" | "link" | "arquivo">("nenhum")
  const [portfolioUrl, setPortfolioUrl] = useState("")
  const [portfolioArquivo, setPortfolioArquivo] = useState<File | null>(null)
  const [pretensaoSalarial, setPretensaoSalarial] = useState("")
  const [disponibilidade, setDisponibilidade] = useState("")
  const [extraindo, setExtraindo] = useState(false)
  const [erroExtracao, setErroExtracao] = useState<string | null>(null)
  const [respostasExtras, setRespostasExtras] = useState<Record<string, string>>({})
  const [arquivosExtras, setArquivosExtras] = useState<Record<string, File | null>>({})

  if (status === "sucesso") {
    return (
      <p className="text-center text-foreground">
        Candidatura recebida! Você receberá nosso feedback até {dataFeedback(feedbackDias)} — enviaremos o resultado, seja ele qual for.
      </p>
    )
  }

  if (status === "encerrada") {
    return (
      <p className="text-center text-foreground">
        Esta vaga acabou de ser encerrada.{" "}
        <Link href="/carreiras" className="text-coesa-green underline">
          Ver outras vagas
        </Link>
      </p>
    )
  }

  async function onCvSelecionado(arquivo: File | null) {
    setCv(arquivo)
    if (!arquivo) return
    setExtraindo(true)
    setErroExtracao(null)
    try {
      const fd = new FormData()
      fd.append("cv", arquivo)
      const res = await fetch(`${RH_API_BASE}/api/carreiras/extrair-cv`, { method: "POST", body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setErroExtracao(typeof body?.error === "string" ? body.error : "Não foi possível ler o currículo automaticamente — preencha manualmente.")
        return
      }
      const dados = await res.json()
      if (dados.nome) setNome((prev) => preencherSeVazio(prev, dados.nome))
      if (dados.email) setEmail((prev) => preencherSeVazio(prev, dados.email))
      if (dados.whatsapp) setWhatsapp((prev) => preencherSeVazio(prev, formatarWhatsapp(dados.whatsapp)))
      if (dados.cidade) setCidade((prev) => preencherSeVazio(prev, dados.cidade))
    } catch {
      setErroExtracao("Não foi possível ler o currículo automaticamente — preencha manualmente.")
    } finally {
      setExtraindo(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const campos = {
      nome, email, whatsapp, cidade, consent, cv,
      portfolioUrl: portfolioModo === "link" ? portfolioUrl : undefined,
      portfolioArquivo: portfolioModo === "arquivo" ? portfolioArquivo : undefined,
    }
    const errosValidacao = validarClient({ ...campos, camposExtras, respostasExtras })
    if (errosValidacao.length > 0) {
      setErros(errosValidacao)
      return
    }
    setErros([])
    setErroServidor(null)
    setStatus("enviando")
    const utm = lerUtmSalvo()
    const formData = montarFormData(
      { ...campos, linkedin, website, pretensaoSalarial, disponibilidade },
      vagaSlug,
      utm,
      { respostasExtras, arquivosExtras },
    )
    try {
      const res = await fetch(`${RH_API_BASE}/api/carreiras/candidaturas`, {
        method: "POST",
        body: formData,
      })
      if (res.status === 201) {
        setStatus("sucesso")
      } else if (res.status === 409) {
        setStatus("ja_candidatou")
      } else if (res.status === 404) {
        setStatus("encerrada")
      } else {
        const body = await res.json().catch(() => null)
        setErroServidor(typeof body?.error === "string" && body.error.trim() ? body.error : null)
        setStatus("erro")
      }
    } catch {
      setStatus("erro")
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="nome">Nome completo</Label>
        <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="whatsapp">WhatsApp</Label>
        <Input id="whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(formatarWhatsapp(e.target.value))} placeholder="(00) 00000-0000" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cidade">Cidade</Label>
        <Input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="linkedin">LinkedIn (opcional)</Label>
        <Input id="linkedin" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Portfólio (opcional)</Label>
        <div className="flex gap-2 text-sm">
          <button type="button" onClick={() => setPortfolioModo(portfolioModo === "link" ? "nenhum" : "link")} className={portfolioModo === "link" ? "underline text-coesa-ink" : "text-coesa-text-muted"}>
            Link
          </button>
          <span className="text-coesa-text-muted">·</span>
          <button type="button" onClick={() => setPortfolioModo(portfolioModo === "arquivo" ? "nenhum" : "arquivo")} className={portfolioModo === "arquivo" ? "underline text-coesa-ink" : "text-coesa-text-muted"}>
            Arquivo
          </button>
        </div>
        {portfolioModo === "link" && (
          <Input value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} placeholder="https://..." />
        )}
        {portfolioModo === "arquivo" && (
          <Input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setPortfolioArquivo(e.target.files?.[0] ?? null)} />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="pretensao">Pretensão salarial (opcional)</Label>
        <Input id="pretensao" value={pretensaoSalarial} onChange={(e) => setPretensaoSalarial(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="disponibilidade">Disponibilidade (opcional)</Label>
        <select
          id="disponibilidade"
          value={disponibilidade}
          onChange={(e) => setDisponibilidade(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Selecione...</option>
          <option value="imediata">Imediata</option>
          <option value="aviso_previo">Aviso prévio</option>
          <option value="a_combinar">A combinar</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cv">Currículo (PDF, até 4MB)</Label>
        <Input
          id="cv"
          type="file"
          accept="application/pdf"
          onChange={(e) => onCvSelecionado(e.target.files?.[0] ?? null)}
        />
        {extraindo && <p className="text-xs text-coesa-text-muted">Lendo seu currículo para preencher os campos acima...</p>}
        {erroExtracao && <p className="text-xs text-coesa-text-muted">{erroExtracao}</p>}
      </div>

      {camposExtras.map((campo) => (
        <div key={campo.id} className="space-y-2">
          <Label htmlFor={`campo-${campo.id}`}>{campo.label}{campo.obrigatorio ? " *" : " (opcional)"}</Label>
          {campo.tipo === "texto_curto" && (
            <Input id={`campo-${campo.id}`} value={respostasExtras[campo.id] ?? ""} onChange={(e) => setRespostasExtras({ ...respostasExtras, [campo.id]: e.target.value })} />
          )}
          {campo.tipo === "texto_longo" && (
            <Textarea id={`campo-${campo.id}`} value={respostasExtras[campo.id] ?? ""} onChange={(e) => setRespostasExtras({ ...respostasExtras, [campo.id]: e.target.value })} />
          )}
          {campo.tipo === "selecao" && (
            <select
              id={`campo-${campo.id}`}
              value={respostasExtras[campo.id] ?? ""}
              onChange={(e) => setRespostasExtras({ ...respostasExtras, [campo.id]: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Selecione...</option>
              {campo.opcoes.map((op) => <option key={op} value={op}>{op}</option>)}
            </select>
          )}
          {campo.tipo === "sim_nao" && (
            <select
              id={`campo-${campo.id}`}
              value={respostasExtras[campo.id] ?? ""}
              onChange={(e) => setRespostasExtras({ ...respostasExtras, [campo.id]: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Selecione...</option>
              <option value="Sim">Sim</option>
              <option value="Não">Não</option>
            </select>
          )}
          {campo.tipo === "anexo" && (
            <Input id={`campo-${campo.id}`} type="file" onChange={(e) => setArquivosExtras({ ...arquivosExtras, [campo.id]: e.target.files?.[0] ?? null })} />
          )}
        </div>
      ))}

      {/* honeypot anti-spam — invisível para humanos */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
      />

      <div className="flex items-start gap-2">
        <Checkbox id="consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-1" />
        <Label htmlFor="consent" className="font-normal leading-snug">
          Autorizo o uso dos meus dados para este processo seletivo e para contato sobre futuras oportunidades na Coesa Energia.
        </Label>
      </div>

      {erros.length > 0 && (
        <ul className="text-sm text-red-600 space-y-1">
          {erros.map((erro) => (
            <li key={erro}>{erro}</li>
          ))}
        </ul>
      )}

      {status === "ja_candidatou" && (
        <p className="text-sm text-red-600">Você já se candidatou a esta vaga.</p>
      )}
      {status === "erro" && (
        <p className="text-sm text-red-600">
          {erroServidor ?? "Não foi possível enviar sua candidatura agora. Tente novamente em instantes."}
        </p>
      )}

      <Button type="submit" disabled={status === "enviando"} className="w-full bg-coesa-green hover:bg-coesa-green/90">
        {status === "enviando" ? "Enviando..." : "Enviar candidatura"}
      </Button>
    </form>
  )
}
