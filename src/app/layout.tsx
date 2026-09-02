import type { Metadata } from "next"
import Script from "next/script"
import { AUTOBLOG_PROFILE } from "@/lib/autoblog-profile"
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
    // 2 códigos: o original (19/08, conta desconhecida) + o novo (02/09, projeto GCP
    // "coesasolar" dedicado, conta luisroquette@gmail.com) — array mantém as duas
    // verificações válidas ao mesmo tempo, sem derrubar a anterior.
    google: ["9qbmTBx08hIDy8NvgWnV837CnzUfYsRuiktCP4L_sOE", "79X7E36KKfbT-F_2dm_rhxKOygvrXaXSkKbCY8f18ZQ"],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // GA4 plugado no perfil do autoblog — um lugar só pra ligar/desligar/trocar o ID.
  const gaMeasurementId = AUTOBLOG_PROFILE.integrations.googleAnalyticsMeasurementId;

  return (
    <html lang="pt-BR" suppressHydrationWarning className="motion-safe:scroll-smooth">
      <body>
        {children}
        {gaMeasurementId && (
          <>
            <Script async src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`} />
            <Script id="gtag-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaMeasurementId}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  )
}
