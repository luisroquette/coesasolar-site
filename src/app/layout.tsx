import type { Metadata } from "next"
import Script from "next/script"
import "../index.css"

export const metadata: Metadata = {
  title: "Coesa Solar - Energia Solar por Assinatura",
  description: "Economize até 30% na sua conta de luz com energia solar por assinatura. Sem investimento inicial, sem obras.",
  icons: { icon: "/favicon.png" },
  openGraph: {
    type: "website",
    title: "Coesa Solar - Energia Solar por Assinatura",
    description: "Economize até 30% na sua conta de luz com energia solar por assinatura. Sem investimento inicial, sem obras.",
    images: ["https://coesasolar.com.br/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    site: "@CoesaSolar",
    title: "Coesa Solar - Energia Solar por Assinatura",
    description: "Economize até 30% na sua conta de luz com energia solar por assinatura. Sem investimento inicial, sem obras.",
    images: ["https://coesasolar.com.br/og-image.png"],
  },
  verification: {
    google: "9qbmTBx08hIDy8NvgWnV837CnzUfYsRuiktCP4L_sOE",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        {children}
        <Script async src="https://www.googletagmanager.com/gtag/js?id=G-TKZQ0VXJ61" />
        <Script id="gtag-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-TKZQ0VXJ61');`}
        </Script>
      </body>
    </html>
  )
}
