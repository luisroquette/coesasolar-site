'use client';

// Botão de CTA com beacon de clique: sendBeacon sobrevive à navegação
// (o fetch normal seria abortado ao trocar de página). Falha do beacon
// nunca bloqueia o clique.
interface CtaButtonProps {
  href: string;
  label: string;
  slug: string;
  variant: string;
}

export default function CtaButton({ href, label, slug, variant }: CtaButtonProps) {
  function handleClick() {
    try {
      const payload = JSON.stringify({ articleSlug: slug, event: 'cta', variant });
      navigator.sendBeacon('/api/blog/metrics', new Blob([payload], { type: 'application/json' }));
    } catch {
      // beacon indisponível — o clique segue normalmente
    }
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6 py-3 font-semibold text-sm transition-all"
    >
      {label}
    </a>
  );
}
