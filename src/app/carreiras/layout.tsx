import { UtmCatcher } from "@/components/carreiras/UtmCatcher"

export default function CarreirasLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <UtmCatcher />
      {children}
    </>
  )
}
