// src/lib/blog/image-gen.ts
import OpenAI from 'openai';
import type { ImagesResponse } from 'openai/resources/images';
import { uploadCoverImage } from './supabase-blog';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

export async function generateAndUploadCover(
  prompt: string,
  slug: string,
): Promise<string | null> {
  if (!AUTOBLOG_PROFILE.integrations.imageGenerationEnabled) return null;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // gpt-image-1: sempre retorna b64_json (response_format não é aceito),
    // quality aceita 'low'|'medium'|'high'|'auto', size aceita 1024x1024|1536x1024|1024x1536|auto
    const response = (await openai.images.generate({
      model: 'gpt-image-1',
      prompt,
      size: '1536x1024',
      quality: 'medium',
    } as Parameters<typeof openai.images.generate>[0])) as ImagesResponse;

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) return null;

    const buffer = Buffer.from(b64, 'base64');
    return await uploadCoverImage(slug, buffer);
  } catch (err) {
    console.error('[image-gen] Falhou, artigo será publicado sem capa:', err);
    return null;
  }
}
