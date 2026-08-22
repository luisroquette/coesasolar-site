// REGRESSÃO: fallback de model id do llm-client (Sofia webhook) usa um id ativo na
// DeepSeek, nunca o legado desativado.
//
// Causa raiz (rodada 7 do fix de deepseek.ts): a DeepSeek desativou o model id
// 'deepseek-chat' em 2026-07-24 (mesma desativação já corrigida em
// src/lib/blog/deepseek.ts). FALLBACK_CONFIG.defaultModels (usado quando a config
// 'llm_default_models' não está no banco ou o banco está indisponível) ainda chamava
// com 'deepseek-chat' — e DEFAULT_MODELS (export legado do mesmo array) alimenta
// getModelsForAgent/getDefaultModels usados por sofia-webhook e
// sofia-orchestrator/funnel-context-phase.ts. Sem o fix, o fallback de todo o
// chatbot Sofia chama um model id morto.
import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { DEFAULT_MODELS, getDefaultModels, clearLLMConfigCache } from './llm-client.ts';

Deno.test('DEFAULT_MODELS (fallback legado) nunca contém o model id desativado "deepseek-chat"', () => {
  assertEquals(DEFAULT_MODELS.includes('deepseek-chat'), false);
});

Deno.test('DEFAULT_MODELS (fallback legado) usa "deepseek-v4-flash", o substituto ativo', () => {
  assertEquals(DEFAULT_MODELS[0], 'deepseek-v4-flash');
});

Deno.test('getDefaultModels() sem config em cache (DB indisponível) devolve o fallback ativo, nunca o legado', () => {
  clearLLMConfigCache();
  const models = getDefaultModels();
  assertEquals(models.includes('deepseek-chat'), false);
  assertNotEquals(models.indexOf('deepseek-v4-flash'), -1);
});
