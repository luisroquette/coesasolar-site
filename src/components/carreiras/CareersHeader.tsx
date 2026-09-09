import Image from "next/image"
import Link from "next/link"
import coesaLogoWhite from "@/assets/logos/coesa-white-new.png"

export function CareersHeader() {
  return <header className="bg-coesa-green-dark px-4"><div className="container mx-auto flex h-20 max-w-5xl items-center justify-between"><Link href="/" aria-label="Coesa Energia — início"><Image src={coesaLogoWhite} alt="Coesa Energia" width={192} height={108} className="h-9 w-auto" priority /></Link><Link href="/carreiras" className="text-sm font-medium text-white/80 hover:text-white">Todas as vagas</Link></div></header>
}
