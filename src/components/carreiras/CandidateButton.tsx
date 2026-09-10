"use client"

export function CandidateButton({ children = "Candidate-se agora" }: { children?: string }) {
  return (
    <a
      href="#candidatura"
      onClick={(event) => {
        event.preventDefault()
        document.getElementById("candidatura")?.scrollIntoView({ behavior: "smooth", block: "start" })
        window.setTimeout(() => document.getElementById("cv")?.focus(), 450)
      }}
      className="inline-flex h-11 items-center justify-center gap-3 rounded-full bg-white px-6 text-sm font-semibold text-[#06110d] transition-all hover:-translate-y-0.5 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      {children}<span aria-hidden>→</span>
    </a>
  )
}
