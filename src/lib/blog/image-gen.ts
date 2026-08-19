// src/lib/blog/image-gen.ts
import OpenAI from 'openai';
import type { ImagesResponse } from 'openai/resources/images';
import sharp from 'sharp';
import { uploadImageToStorage } from './supabase-blog';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

const CLIENT = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** PNG 1536x1024 do gpt-image-1 → 1280x853 webp q80 (~150-250KB; Neil: "5MB → 200KB"). */
async function optimizeToWebp(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(1280, 853, { fit: 'cover' })
    .webp({ quality: 80 })
    .toBuffer();
}

async function generateImageB64(prompt: string): Promise<string | null> {
  // gpt-image-1: sempre retorna b64_json (response_format não é aceito),
  // quality aceita 'low'|'medium'|'high'|'auto', size aceita 1024x1024|1536x1024|1024x1536|auto
  const response = (await CLIENT().images.generate({
    model: 'gpt-image-1',
    prompt,
    size: '1536x1024',
    quality: 'medium',
  } as Parameters<OpenAI['images']['generate']>[0])) as ImagesResponse;
  return response.data?.[0]?.b64_json ?? null;
}

export async function generateAndUploadCover(
  prompt: string,
  slug: string,
): Promise<string | null> {
  if (!AUTOBLOG_PROFILE.integrations.imageGenerationEnabled) return null;
  if (!prompt?.trim()) return null; // prompt vazio = chamada paga desperdiçada

  try {
    const b64 = await generateImageB64(prompt);
    if (!b64) return null;

    const webp = await optimizeToWebp(Buffer.from(b64, 'base64'));
    return await uploadImageToStorage(`${slug}.webp`, webp, 'image/webp');
  } catch (err) {
    console.error('[image-gen] Falhou, artigo será publicado sem capa:', err);
    return null;
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
    const response = (await CLIENT().images.generate({
      model: 'gpt-image-1',
      prompt: `${prompt}, clean infographic style, bold shapes and icons, flat design, NO text, no words, no letters`,
      size: '1024x1024',
      quality: 'medium',
    } as Parameters<OpenAI['images']['generate']>[0])) as ImagesResponse;
    const b64 = response.data?.[0]?.b64_json;
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

/** 1-2 imagens para o corpo do artigo, com alt por keyword (quebram o texto). */
export async function generateAndUploadBodyImages(
  prompts: string[],
  slug: string,
  keyword: string,
): Promise<Array<{ url: string; alt: string }>> {
  if (!AUTOBLOG_PROFILE.integrations.imageGenerationEnabled) return [];

  const results: Array<{ url: string; alt: string }> = [];
  for (let i = 0; i < prompts.length; i++) {
    if (!prompts[i]?.trim()) continue; // prompt vazio = chamada paga desperdiçada
    try {
      const b64 = await generateImageB64(prompts[i]);
      if (!b64) continue;
      const webp = await optimizeToWebp(Buffer.from(b64, 'base64'));
      const url = await uploadImageToStorage(`${slug}-body-${i + 1}.webp`, webp, 'image/webp');
      if (url) results.push({ url, alt: `${keyword} — ilustração ${i + 1}` });
    } catch (err) {
      console.warn(`[image-gen] Imagem ${i + 1} do corpo falhou (não bloqueia publicação):`, err);
    }
  }
  return results;
}
