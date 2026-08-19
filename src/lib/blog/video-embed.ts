// src/lib/blog/video-embed.ts
// Embed de vídeo com allowlist: só YouTube e Vimeo viram iframe no artigo.
// YouTube usa youtube-nocookie.com (modo privacy-enhanced — sem tracking do visitante).
// Tudo o mais vira link normal — nunca iframe de host desconhecido.

export interface VideoEmbed {
  provider: 'youtube' | 'vimeo';
  id: string;
  embedUrl: string;
  /** Link "abrir no site" — sempre a página real do vídeo, nunca o /embed/ pelado. */
  watchUrl: string;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;

export function parseVideoEmbed(href: string): VideoEmbed | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();

  // YouTube: youtube.com / www.youtube.com / m.youtube.com / music.youtube.com / youtu.be
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    if (!YOUTUBE_ID.test(id)) return null;
    return {
      provider: 'youtube',
      id,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
    };
  }
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    if (host.startsWith('music.')) return null; // music.youtube não tem embed estável
    let id: string | null = null;
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2] ?? null;
    else if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/')[2] ?? null;
    if (!id || !YOUTUBE_ID.test(id)) return null;
    return {
      provider: 'youtube',
      id,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
    };
  }

  // Vimeo: vimeo.com/ID ou player.vimeo.com/video/ID
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = host === 'player.vimeo.com'
      ? url.pathname.split('/')[2] ?? ''
      : url.pathname.split('/')[1] ?? '';
    if (!VIMEO_ID.test(id)) return null;
    return {
      provider: 'vimeo',
      id,
      embedUrl: `https://player.vimeo.com/video/${id}`,
      watchUrl: `https://vimeo.com/${id}`,
    };
  }

  return null;
}
