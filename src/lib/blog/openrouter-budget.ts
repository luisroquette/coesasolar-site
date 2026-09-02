// src/lib/blog/openrouter-budget.ts
// Circuit breaker de saldo (02/09/2026): a conta OpenRouter compartilhada já zerou uma vez
// (Doctor do ig-sentinel, 30-31/08) — se isso voltar a acontecer, o coesasolar queimaria as
// 5 tentativas do dia inteiras contra 402/insufficient_credits sem avisar cedo. Fail-open:
// erro na PRÓPRIA checagem (rede, formato de resposta) NUNCA bloqueia geração — só um saldo
// baixo CONFIRMADO bloqueia.
const MIN_BALANCE_USD = 1;

export interface BalanceCheck {
  ok: boolean; // true = segue gerando (saldo suficiente OU checagem indisponível)
  remaining: number | null;
}

export async function checkOpenRouterBalance(): Promise<BalanceCheck> {
  const apiKey = process.env.COESASOLAR_OPENROUTER_API_KEY;
  if (!apiKey) return { ok: true, remaining: null }; // sem chave configurada não é problema deste breaker

  try {
    const response = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      console.warn(`[openrouter-budget] Checagem de saldo respondeu ${response.status} — seguindo sem bloquear (fail-open).`);
      return { ok: true, remaining: null };
    }
    const body = (await response.json()) as { data?: { total_credits?: number; total_usage?: number } };
    const totalCredits = body.data?.total_credits;
    const totalUsage = body.data?.total_usage;
    if (typeof totalCredits !== 'number' || typeof totalUsage !== 'number') {
      console.warn('[openrouter-budget] Resposta de saldo em formato inesperado — seguindo sem bloquear (fail-open).');
      return { ok: true, remaining: null };
    }
    const remaining = totalCredits - totalUsage;
    return { ok: remaining >= MIN_BALANCE_USD, remaining };
  } catch (err) {
    console.warn('[openrouter-budget] Falha ao checar saldo (fail-open, não bloqueia):', err);
    return { ok: true, remaining: null };
  }
}
