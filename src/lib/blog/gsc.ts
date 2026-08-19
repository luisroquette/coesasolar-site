// Versão sem integração GSC (googleSearchConsoleEnabled: false no profile).
// Quando o Search Console for ativado, portar a versão completa do engine
// My_Blog_Makes_Neil_Proud (googleapis + GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN).
import { getNextSeedKeyword, SEED_KEYWORDS } from './seed-keywords';

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export async function fetchTopKeyword(existingKeywords: string[] = []): Promise<string> {
  // Sem GSC, o tema vem do rodízio de seeds pelo dia do ano — mas pula os
  // temas já publicados pra não repetir artigo a cada N dias.
  const published = new Set(existingKeywords.map((k) => k.toLowerCase()));

  for (let i = 0; i < SEED_KEYWORDS.length; i++) {
    const candidate = getNextSeedKeyword(getDayOfYear() + i);
    if (!published.has(candidate.toLowerCase())) return candidate;
  }

  // Tudo já publicado — recicla o seed do dia em vez de parar o cron.
  return getNextSeedKeyword(getDayOfYear());
}
