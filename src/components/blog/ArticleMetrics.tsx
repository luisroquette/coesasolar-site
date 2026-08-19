'use client';

// Beacon de métricas próprias do artigo: view na carga, scroll50 na metade da
// página e end perto do fim. Cada evento dispara UMA vez; falha de rede não
// afeta o leitor (fire-and-forget com keepalive).
import { useEffect, useRef } from 'react';

export default function ArticleMetrics({ slug }: { slug: string }) {
  const sent = useRef<Record<string, boolean>>({});

  useEffect(() => {
    function send(event: string) {
      if (sent.current[event]) return;
      sent.current[event] = true;
      fetch('/api/blog/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleSlug: slug, event }),
        keepalive: true,
      }).catch(() => {});
    }

    function onScroll() {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) {
        send('scroll50');
        send('end');
        return;
      }
      const progress = window.scrollY / scrollable;
      if (progress >= 0.5) send('scroll50');
      if (progress >= 0.95) send('end');
    }

    send('view');
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // páginas curtas (sem rolagem) já caem no caso acima

    return () => window.removeEventListener('scroll', onScroll);
  }, [slug]);

  return null;
}
