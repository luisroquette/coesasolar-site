// src/lib/blog/image-gen.ts
import sharp from 'sharp';
import { uploadImageToStorage } from './supabase-blog';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

let imageApiBlockedUntil = 0;

export function fallbackCoverUrl(slug: string): string {
  return `${AUTOBLOG_PROFILE.brand.siteUrl}/api/blog/fallback-cover?slug=${encodeURIComponent(slug)}`;
}

function blockImageApiTemporarily(err: unknown): void {
  const candidate = err as { status?: number; code?: string };
  if (candidate?.status === 429 || candidate?.code === 'credit_balance_exhausted') {
    imageApiBlockedUntil = Date.now() + 15 * 60 * 1000;
  }
}

/** Imagem 2K do Seedream 4.5 → 1280x853 webp q80 (~150-250KB; Neil: "5MB → 200KB"). */
async function optimizeToWebp(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(1280, 853, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer();
}

async function generateImageB64(prompt: string, size = '1536x1024'): Promise<string | null> {
  if (Date.now() < imageApiBlockedUntil) return null;
  const apiKey = process.env.COESASOLAR_OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('COESASOLAR_OPENROUTER_API_KEY not configured');
  const response = await fetch('https://openrouter.ai/api/v1/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'bytedance-seed/seedream-4.5',
      prompt,
      resolution: '2K',
      aspect_ratio: size === '1024x1024' ? '1:1' : '16:9',
      n: 1,
    }),
  });
  if (!response.ok) throw Object.assign(new Error(`OpenRouter image error ${response.status}`), { status: response.status });
  return ((await response.json()) as { data?: Array<{ b64_json?: string }> }).data?.[0]?.b64_json ?? null;
}

export async function generateAndUploadCover(
  prompt: string,
  slug: string,
): Promise<string | null> {
  if (!AUTOBLOG_PROFILE.integrations.imageGenerationEnabled) return null;
  if (!prompt?.trim()) return fallbackCoverUrl(slug); // sem chamada paga e sem capa nula

  try {
    const b64 = await generateImageB64(prompt);
    if (!b64) return fallbackCoverUrl(slug);

    const webp = await optimizeToWebp(Buffer.from(b64, 'base64'));
    return await uploadImageToStorage(`${slug}.webp`, webp, 'image/webp');
  } catch (err) {
    blockImageApiTemporarily(err);
    console.error('[image-gen] Falhou, usando capa fallback própria:', err);
    return fallbackCoverUrl(slug);
  }
}

/** Infográfico (quadrado, sem texto — IA não gera texto legível confiável):
 *  resumo visual no fim do artigo, compartilhável. Flag infographicsEnabled. */
export async function generateAndUploadInfographic(
  prompt: string,
  slug: string,
): Promise<string | null> {
  if (!AUTOBLOG_PROFILE.integrations.infographicsEnabled) return null;
  if (!prompt?.trim()) return null; // prompt vazio = chamada paga desperdiçada

  try {
    const b64 = await generateImageB64(
      `${prompt}, clean infographic style, bold shapes and icons, flat design, NO text, no words, no letters`,
      '1024x1024',
    );
    if (!b64) return null;

    const webp = await sharp(Buffer.from(b64, 'base64'))
      .resize(1024, 1024, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();
    return await uploadImageToStorage(`${slug}-infographic.webp`, webp, 'image/webp');
  } catch (err) {
    console.warn('[image-gen] Infográfico falhou (não bloqueia publicação):', err);
    return null;
  }
}

async function generateAndUploadOne(
  prompt: string,
  slug: string,
  keyword: string,
  index: number,
): Promise<{ url: string; alt: string } | null> {
  if (!prompt?.trim()) return null; // prompt vazio = chamada paga desperdiçada
  try {
    const b64 = await generateImageB64(prompt);
    if (!b64) return null;
    const webp = await optimizeToWebp(Buffer.from(b64, 'base64'));
    const url = await uploadImageToStorage(`${slug}-body-${index + 1}.webp`, webp, 'image/webp');
    return url ? { url, alt: `${keyword} — ilustração ${index + 1}` } : null;
  } catch (err) {
    console.warn(`[image-gen] Imagem ${index + 1} do corpo falhou (não bloqueia publicação):`, err);
    return null;
  }
}

/** N imagens para o corpo do artigo (1 por seção), com alt por keyword. `null` na posição i
 *  = aquele prompt/upload falhou — preserva o índice (nunca `.push` só no sucesso) para que
 *  quem consome o array por posição (ex.: injectSectionImages) não desalinhe imagem×seção
 *  quando uma falha no meio da lista.
 *  Lotes de 3 em paralelo (achado 25/08/2026: sequencial estourava o maxDuration=300s da
 *  rota com 7-9 imagens de corpo — mesmo espírito do batch de 3 de writeSection). */
export async function generateAndUploadBodyImages(
  prompts: string[],
  slug: string,
  keyword: string,
): Promise<Array<{ url: string; alt: string } | null>> {
  if (!AUTOBLOG_PROFILE.integrations.imageGenerationEnabled) return prompts.map(() => null);
  if (Date.now() < imageApiBlockedUntil) return prompts.map(() => null);

  const results: Array<{ url: string; alt: string } | null> = new Array(prompts.length).fill(null);
  for (let i = 0; i < prompts.length; i += 3) {
    const batchIndexes = prompts.slice(i, i + 3).map((_, j) => i + j);
    const batchResults = await Promise.all(
      batchIndexes.map(idx => generateAndUploadOne(prompts[idx], slug, keyword, idx))
    );
    batchIndexes.forEach((idx, j) => { results[idx] = batchResults[j]; });
  }
  return results;
}
