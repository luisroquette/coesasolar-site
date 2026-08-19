// src/lib/blog/gsc.ts
import { google } from 'googleapis';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';
import { getNextSeedKeyword, SEED_KEYWORDS } from './seed-keywords';

// Mínimo de keywords elegíveis no GSC para não usar fallback de seeds
const MIN_ELIGIBLE = 5;

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/** Seed do dia pulando temas já publicados — não repetir artigo a cada N dias. */
function getSeedSkippingPublished(existingKeywords: string[]): string {
  const published = new Set(existingKeywords.map(k => k.toLowerCase()));
  for (let i = 0; i < SEED_KEYWORDS.length; i++) {
    const candidate = getNextSeedKeyword(getDayOfYear() + i);
    if (!published.has(candidate.toLowerCase())) return candidate;
  }
  // Tudo publicado: recicla do rodízio mesmo assim (blog não pode parar).
  return getNextSeedKeyword(getDayOfYear());
}

export async function fetchTopKeyword(existingKeywords: string[]): Promise<string> {
  if (!AUTOBLOG_PROFILE.integrations.googleSearchConsoleEnabled) {
    return getSeedSkippingPublished(existingKeywords);
  }

  // Flag ligada sem credenciais: falha em silêncio = debug impossível. Diagnóstico claro.
  const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'].filter(
    k => !process.env[k],
  );
  if (missing.length > 0) {
    console.warn(`[gsc] Flag ligada mas envs ausentes: ${missing.join(', ')}. Usando seed fallback.`);
    return getSeedSkippingPublished(existingKeywords);
  }

  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    const searchconsole = google.searchconsole({ version: 'v1', auth });
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    const res = await searchconsole.searchanalytics.query({
      siteUrl: `sc-domain:${new URL(AUTOBLOG_PROFILE.brand.siteUrl).hostname}`,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 200,
        // ATENÇÃO: position NÃO é filtrável via dimensionFilterGroups
        // É uma métrica de row, não uma dimensão. Filtrar no código abaixo.
      },
    });

    const rows = res.data.rows ?? [];
    const existingSet = new Set(existingKeywords.map(k => k.toLowerCase()));

    const eligible = rows
      .filter(r => {
        const position = r.position ?? 0;
        if (position < 4 || position > 30) return false;
        const query = r.keys?.[0] ?? '';
        return !existingSet.has(query.toLowerCase());
      })
      .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0));

    if (eligible.length >= MIN_ELIGIBLE) {
      return eligible[0].keys![0];
    }
  } catch (err) {
    console.warn('[gsc] GSC falhou, usando seed fallback:', err);
  }

  return getSeedSkippingPublished(existingKeywords);
}
