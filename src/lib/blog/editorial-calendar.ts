// src/lib/blog/editorial-calendar.ts
// Calendário editorial no banco: pauta planejada TEM precedência sobre o seed
// rotativo — o dono agenda, o pipeline publica na data (se scheduled_date for
// hoje ou antes; data futura espera, e o dia sem pauta cai no seed).
import { getServiceClient } from '@/lib/blog/supabase-blog';

const getClient = getServiceClient;

export interface EditorialBrief {
  relatedKeywords: string[];
  competitors: string[];
  attentionPoints: string;
}

export interface PlannedEntry extends EditorialBrief {
  keyword: string;
}

/** Linha planejada lida do banco (sem campos internos). */
interface PlannedRow {
  keyword: string;
  related_keywords: string[] | null;
  competitors: string[] | null;
  attention_points: string | null;
}

/** Pura: escolhe a pauta mais antiga (data ≤ hoje) entre as planejadas. */
export function pickPlannedKeyword(
  rows: Array<{ keyword: string; scheduled_date: string | null; status: string }>,
  today: string,
): string | null {
  const eligible = rows
    .filter(r => r.status === 'planned')
    .filter(r => !r.scheduled_date || r.scheduled_date <= today)
    .sort((a, b) => (a.scheduled_date ?? '9999').localeCompare(b.scheduled_date ?? '9999'));
  return eligible[0]?.keyword ?? null;
}

/** Pura: seção do prompt com a pauta do calendário. Vazia quando não há pauta. */
export function buildEditorialBriefSection(brief: EditorialBrief | null): string {
  if (!brief) return '';

  const parts: string[] = [];
  if (brief.relatedKeywords.length > 0) {
    parts.push(`Keywords relacionadas (use variações naturais no texto): ${brief.relatedKeywords.join(', ')}`);
  }
  if (brief.competitors.length > 0) {
    parts.push(`Concorrentes a superar em profundidade (sem citá-los): ${brief.competitors.join(', ')}`);
  }
  if (brief.attentionPoints.trim()) {
    parts.push(`Pontos de atenção do dono do blog: ${brief.attentionPoints.trim()}`);
  }
  if (parts.length === 0) return '';

  return `## PAUTA DO CALENDÁRIO (vinda do dono do blog — priorize estes pontos)
${parts.join('\n')}`;
}

function toBrief(row: PlannedRow): EditorialBrief {
  return {
    relatedKeywords: row.related_keywords ?? [],
    competitors: row.competitors ?? [],
    attentionPoints: row.attention_points ?? '',
  };
}

/** Próxima pauta com data ≤ hoje. Null = dia sem pauta (usa seed/GSC). */
export async function getNextPlannedEntry(): Promise<PlannedEntry | null> {
  const supabase = getClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('coesa_editorial_calendar')
    .select('keyword, related_keywords, competitors, attention_points, scheduled_date, status')
    .eq('status', 'planned')
    // NULL = pauta sem data (publica na próxima janela do cron). `today` vem de
    // toISOString().slice(0,10) — formato [0-9-]{10}, sem risco de injeção no .or().
    .or(`scheduled_date.is.null,scheduled_date.lte.${today}`)
    .order('scheduled_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as PlannedRow;
  return { keyword: row.keyword, ...toBrief(row) };
}

/** Marca a pauta como publicada, vinculando o slug do artigo. */
export async function markPublished(keyword: string, slug: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from('coesa_editorial_calendar')
    .update({ status: 'published', article_slug: slug })
    .eq('keyword', keyword);
  if (error) console.warn('[editorial-calendar] markPublished:', error.message);
}

/** Guarda o outline validado (pipeline 2 etapas) na pauta — estrutura da pauta fica no banco. */
export async function saveOutlineStructure(keyword: string, outlineText: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from('coesa_editorial_calendar')
    .update({ outline_structure: outlineText })
    .eq('keyword', keyword);
  if (error) console.warn('[editorial-calendar] saveOutlineStructure:', error.message);
}
