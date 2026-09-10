import Image from "next/image"
import Link from "next/link"
import coesaLogoWhite from "@/assets/logos/coesa-white-new.png"

export function CareersHeader() {
  return <header className="border-b border-white/10 bg-[#06110d] px-5 md:px-8"><div className="container mx-auto flex h-[72px] max-w-6xl items-center justify-between"><Link href="/" aria-label="Coesa Energia — início"><Image src={coesaLogoWhite} alt="Coesa Energia" width={192} height={108} className="h-8 w-auto" priority /></Link><Link href="/carreiras" className="text-sm font-medium text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36d58b]">Todas as vagas</Link></div></header>
}
