// src/lib/blog/time-budget.ts
// REGRESSÃO 02/09/2026: a Vercel mata a rota /api/blog/generate com SIGKILL ao bater
// maxDuration (300s) — o catch nunca roda, insertRunLog nunca grava, e a linha do claim
// fica presa em 'running' pra sempre (só reclamada pelo claim do dia seguinte, perdendo o
// dia sem publicar e sem erro visível). Lógica pura extraída pra ser testável sem montar
// o pipeline inteiro; ver uso em src/app/api/blog/generate/route.ts.
export function hasTimeBudget(elapsedMs: number, maxDurationS: number, safetyMarginMs: number): boolean {
  return elapsedMs < maxDurationS * 1000 - safetyMarginMs;
}
