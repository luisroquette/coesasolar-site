"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { validarClient, montarFormData } from "@/lib/carreiras/form-utils"

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
}

type Status = "idle" | "enviando" | "sucesso" | "ja_candidatou" | "encerrada" | "erro"

export function CandidaturaForm({ vagaSlug, feedbackDias }: CandidaturaFormProps) {
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const campos = { nome, email, whatsapp, cidade, consent, cv }
    const errosValidacao = validarClient(campos)
    if (errosValidacao.length > 0) {
      setErros(errosValidacao)
      return
    }
    setErros([])
    setStatus("enviando")
    const utm = lerUtmSalvo()
    const formData = montarFormData({ ...campos, linkedin, website }, vagaSlug, utm)
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
        <Input id="whatsapp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(00) 00000-0000" />
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
        <Label htmlFor="cv">Currículo (PDF, até 4MB)</Label>
        <Input
          id="cv"
          type="file"
          accept="application/pdf"
          onChange={(e) => setCv(e.target.files?.[0] ?? null)}
        />
      </div>

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
        <p className="text-sm text-red-600">Não foi possível enviar sua candidatura agora. Tente novamente em instantes.</p>
      )}

      <Button type="submit" disabled={status === "enviando"} className="w-full bg-coesa-green hover:bg-coesa-green/90">
        {status === "enviando" ? "Enviando..." : "Enviar candidatura"}
      </Button>
    </form>
  )
}
