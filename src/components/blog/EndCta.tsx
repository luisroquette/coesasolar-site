// src/components/blog/EndCta.tsx
// Fechamento do artigo: CTA primário do perfil OU fallback de compartilhamento
// + newsletter (o fechamento sempre leva a UMA ação — guia Neil Patel).
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';
import { buildShareUrls, hasPrimaryCta, resolveCtaVariant } from '@/lib/blog/cta';
import CtaButton from '@/components/blog/CtaButton';

interface EndCtaProps {
  title: string;
  slug: string;
}

const SHARE_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 font-semibold text-sm text-foreground transition-all hover:border-primary hover:text-primary';

export default function EndCta({ title, slug }: EndCtaProps) {
  const { cta } = AUTOBLOG_PROFILE;
  const url = `${AUTOBLOG_PROFILE.brand.siteUrl}/blog/${slug}`;

  // A/B de CTA: variante determinística por slug+semana; sem variantes, o CTA
  // padrão do perfil. A variante ativa vai para o beacon de clique.
  // O render roda no servidor e congela no cache ISR até a revalidação —
  // sem relógio no client, sem risco de hidratação.
  // eslint-disable-next-line react-hooks/purity
  const weekIndex = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const variantIndex = resolveCtaVariant(slug, weekIndex, cta.variants);
  const active = variantIndex !== null ? cta.variants[variantIndex] : null;

  if (active || hasPrimaryCta(cta.url)) {
    const display = active ?? cta;
    return (
      <div className="mt-12 p-6 rounded-2xl border border-primary/30 bg-primary/5 text-center">
        <p className="font-semibold text-foreground mb-2">{display.title}</p>
        <p className="text-sm text-muted-foreground mb-4">{display.subtitle}</p>
        <CtaButton
          href={display.url}
          label={display.buttonLabel}
          slug={slug}
          variant={variantIndex !== null ? `v${variantIndex + 1}` : 'padrao'}
        />
      </div>
    );
  }

  // Fallback: sem CTA configurado, a ação é compartilhar (+ newsletter se houver)
  const share = buildShareUrls(url, title);
  return (
    <div className="mt-12 p-6 rounded-2xl border border-primary/30 bg-primary/5">
      <p className="font-semibold text-foreground mb-4 text-center">
        Este artigo ajudou? Compartilhe com alguém que precisa dele.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <a href={share.x} target="_blank" rel="noopener noreferrer" className={SHARE_BUTTON_CLASS}>
          X
        </a>
        <a
          href={share.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className={SHARE_BUTTON_CLASS}
        >
          WhatsApp
        </a>
        <a
          href={share.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          className={SHARE_BUTTON_CLASS}
        >
          LinkedIn
        </a>
        {AUTOBLOG_PROFILE.editorial.newsletterUrl.trim() && (
          <a
            href={AUTOBLOG_PROFILE.editorial.newsletterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 py-2.5 font-semibold text-sm transition-all"
          >
            Receber novidades
          </a>
        )}
      </div>
    </div>
  );
}
