"use client"

export function CandidateButton({ children = "Candidate-se agora", dark = false }: { children?: string; dark?: boolean }) {
  return (
    <a
      href="#candidatura"
      onClick={(event) => {
        event.preventDefault()
        document.getElementById("candidatura")?.scrollIntoView({ behavior: "smooth", block: "start" })
        window.setTimeout(() => document.getElementById("cv")?.focus(), 450)
      }}
      className={`inline-flex h-11 items-center justify-center rounded-md px-6 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 ${dark ? "bg-coesa-green-dark text-white hover:bg-coesa-green" : "bg-white text-coesa-green-dark hover:bg-white/90 focus-visible:ring-white"}`}
    >
      {children}
    </a>
  )
}
