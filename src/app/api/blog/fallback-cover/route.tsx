import { ImageResponse } from 'next/og';

export const runtime = 'edge';

function labelFromSlug(slug: string): string {
  return slug
    .replace(/[^a-z0-9-]/gi, '')
    .split('-')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .slice(0, 90) || 'Energia Solar Inteligente';
}

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get('slug') ?? '';
  const title = labelFromSlug(slug);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px',
        color: '#ffffff',
        background: 'linear-gradient(135deg, #063b32 0%, #0b6b55 58%, #d6a72d 100%)',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: 2 }}>
        COESA SOLAR
      </div>
      <div style={{ display: 'flex', maxWidth: 1040, fontSize: 64, lineHeight: 1.08, fontWeight: 800 }}>
        {title}
      </div>
      <div style={{ display: 'flex', fontSize: 28, opacity: 0.9 }}>
        Informação para decisões melhores sobre energia
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
