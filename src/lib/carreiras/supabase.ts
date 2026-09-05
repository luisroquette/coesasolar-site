// Leitura pública de vagas (rh_vagas) do Supabase do painel RH/DP
// (projeto yzjsrgoxdfzvsnacydke — diferente do Supabase do blog).
// RLS já restringe anon a status = 'publicada'; client aqui é sempre anon.
import { createClient } from '@supabase/supabase-js';

const TABLE = 'rh_vagas';

const COLUMNS =
  'slug, titulo, area, regime, modalidade, local, remuneracao, comissionamento, pitch, ' +
  'o_que_fara, o_que_buscamos, diferenciais, beneficios, observacoes, feedback_dias, publicado_em';

export interface VagaPublica {
  slug: string;
  titulo: string;
  area: string | null;
  regime: string;
  modalidade: string;
  local: string;
  remuneracao: string | null;
  comissionamento: string | null;
  pitch: string | null;
  o_que_fara: string[];
  o_que_buscamos: string[];
  diferenciais: string[];
  beneficios: string[];
  observacoes: string | null;
  feedback_dias: number;
  publicado_em: string | null;
}

/** Converte jsonb (pode vir null) em array e preenche `undefined` como null. */
export function normalizeVaga(row: unknown): VagaPublica {
  const r = row as Record<string, unknown>;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
  return {
    slug: r.slug as string,
    titulo: r.titulo as string,
    area: (r.area as string | null) ?? null,
    regime: r.regime as string,
    modalidade: r.modalidade as string,
    local: r.local as string,
    remuneracao: (r.remuneracao as string | null) ?? null,
    comissionamento: (r.comissionamento as string | null) ?? null,
    pitch: (r.pitch as string | null) ?? null,
    o_que_fara: arr(r.o_que_fara),
    o_que_buscamos: arr(r.o_que_buscamos),
    diferenciais: arr(r.diferenciais),
    beneficios: arr(r.beneficios),
    observacoes: (r.observacoes as string | null) ?? null,
    feedback_dias: (r.feedback_dias as number) ?? 0,
    publicado_em: (r.publicado_em as string | null) ?? null,
  };
}

function getClient() {
  const url = process.env.RH_SUPABASE_URL;
  const key = process.env.RH_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getVagasPublicadas(): Promise<VagaPublica[]> {
  const supabase = getClient();
  if (!supabase) {
    console.warn('[carreiras] RH_SUPABASE_URL/RH_SUPABASE_ANON_KEY ausentes — retornando lista vazia');
    return [];
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .order('publicado_em', { ascending: false });
  if (error) {
    console.warn('[carreiras] erro ao buscar vagas publicadas:', error.message);
    return [];
  }
  return (data ?? []).map(normalizeVaga);
}

export async function getVagaBySlug(slug: string): Promise<VagaPublica | null> {
  const supabase = getClient();
  if (!supabase) {
    console.warn('[carreiras] RH_SUPABASE_URL/RH_SUPABASE_ANON_KEY ausentes — retornando null');
    return null;
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('slug', slug)
    .maybeSingle();
  if (error || !data) return null;
  return normalizeVaga(data);
}
