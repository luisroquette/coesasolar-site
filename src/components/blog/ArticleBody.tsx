// src/components/blog/ArticleBody.tsx
// Server Component: react-markdown não precisa de interatividade — renderizar no
// servidor tira o JS de markdown do bundle do cliente.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseVideoEmbed, type VideoEmbed } from '@/lib/blog/video-embed';

interface ArticleBodyProps {
  content: string;
}

interface HastElement {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
}

/** Parágrafo cujo único filho é um link de vídeo (YouTube/Vimeo) → vira embed. */
function isVideoOnlyParagraph(node: unknown): VideoEmbed | null {
  const el = node as HastElement;
  if (!el || el.type !== 'element' || el.tagName !== 'p') return null;
  const children = (el as unknown as { children?: HastElement[] }).children ?? [];
  const links = children.filter(c => c.type === 'element' && c.tagName === 'a');
  const nonEmptyText = children.filter(c => c.type === 'text' && (c as unknown as { value?: string }).value?.trim());
  if (links.length !== 1 || nonEmptyText.length > 0) return null;
  return parseVideoEmbed(String(links[0].properties?.href ?? ''));
}

const components = {
  p: ({ node, children }: { node?: unknown; children?: React.ReactNode }) => {
    const video = node ? isVideoOnlyParagraph(node) : null;
    if (video) {
      const label = typeof children === 'string' ? children : 'Vídeo incorporado do artigo';
      return (
        <figure className="my-8 not-prose">
          <div className="aspect-video rounded-2xl overflow-hidden bg-foreground/5">
            <iframe
              src={video.embedUrl}
              title={label}
              className="w-full h-full"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <figcaption className="text-xs text-muted-foreground mt-2">
            <a
              href={video.watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground transition-colors"
            >
              Abrir vídeo no {video.provider === 'youtube' ? 'YouTube' : 'Vimeo'} ↗
            </a>
          </figcaption>
        </figure>
      );
    }
    return <p>{children}</p>;
  },
};

export default function ArticleBody({ content }: ArticleBodyProps) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-heading prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-h2:text-muted-foreground prose-blockquote:not-italic [&_p]:text-justify">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
