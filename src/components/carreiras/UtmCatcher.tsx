"use client"

// Captura utm_* da URL e persiste em sessionStorage pra sobreviver à navegação
// lista -> detalhe. Usa window.location.search (NÃO useSearchParams) porque
// esta página é ISR e useSearchParams exigiria Suspense (missing-suspense-with-csr-bailout).
import { useEffect } from "react"
import { coletarUtm } from "@/lib/carreiras/form-utils"

const STORAGE_KEY = "carreiras_utm"

export function UtmCatcher() {
  useEffect(() => {
    const utm = coletarUtm(new URLSearchParams(window.location.search))
    if (Object.keys(utm).length === 0) return
    const existing = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}")
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...utm }))
  }, [])

  return null
}
