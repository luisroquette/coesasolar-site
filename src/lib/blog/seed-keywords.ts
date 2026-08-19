// src/lib/blog/seed-keywords.ts
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

export const SEED_KEYWORDS = AUTOBLOG_PROFILE.editorial.seedKeywords;

export function getNextSeedKeyword(dayOfYear: number): string {
  return SEED_KEYWORDS[dayOfYear % SEED_KEYWORDS.length];
}
