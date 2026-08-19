// Versão sem integração GSC (googleSearchConsoleEnabled: false no profile).
// Quando o Search Console for ativado, portar a versão completa do engine
// My_Blog_Makes_Neil_Proud (googleapis + GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN).
import { getNextSeedKeyword } from './seed-keywords';

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export async function fetchTopKeyword(): Promise<string> {
  return getNextSeedKeyword(getDayOfYear());
}
