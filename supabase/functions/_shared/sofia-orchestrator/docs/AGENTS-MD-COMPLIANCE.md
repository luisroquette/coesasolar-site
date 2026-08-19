# AGENTS.md Compliance Report - Sofia Pipeline v3.0

## Conformidade com Padrão Vercel AGENTS.md

Este documento detalha a conformidade da Sofia com as melhores práticas do artigo ["AGENTS.md outperforms skills in our agent evals"](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals) da Vercel.

---

## ✅ Checklist de Conformidade (100%)

| Requisito | Status | Implementação |
|-----------|--------|---------------|
| **Passive Context > Active Skills** | ✅ | Contexto injetado no prompt, não buscado dinamicamente |
| **Compressed Semantic Indexing** | ✅ | Formato pipe-delimited para regras (`CP1:RULE\|CP2:RULE`) |
| **Retrieval-Led Reasoning** | ✅ | Bloco hierárquico com P1-P4 no topo do prompt |
| **Prompt Size Target (≤8KB)** | ✅ | Compressor automático com target de 8KB |
| **Context Compression (≥40%)** | ✅ | `compressContext()` habilitado |
| **Rule Memory Injection** | ✅ | Regras P90+ como BLOQUEANTES inline |
| **Minimal Decoration** | ✅ | Removido ASCII boxes, separadores excessivos |
| **Constitution Index (SOFIA.md)** | ✅ | Documento central de ~2KB comprimido |
| **Behavioral Consistency** | ✅ | Cláusulas pétreas injetadas em todas as interações |
| **Anti-Hallucination Guards** | ✅ | Bloco explícito de proibições |

---

## Arquitetura Implementada

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SOFIA PIPELINE v3.0 - AGENTS.MD-COMPLIANT                │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────────────────────────┐
                    │     RETRIEVAL-LED REASONING       │
                    │ P1:rule_memory → P2:RAG → P3:Cli  │
                    └─────────────────┬─────────────────┘
                                      ↓
         ┌────────────────────────────────────────────────────────┐
         │                  SOFIA.md CORE (~2KB)                   │
         │ Identity | CP1-CP6 (pipe-delimited) | FSM | Anti-Aluc  │
         └────────────────────────────┬───────────────────────────┘
                                      ↓
         ┌────────────────────────────────────────────────────────┐
         │              RULE MEMORY (Dynamic, ~500B)              │
         │ 🔴 CRÍTICAS: Rule1[P95] | Rule2[P92] | ...             │
         │ 🟡 COMPORTAMENTO: Rule3[P70]: desc...                  │
         └────────────────────────────┬───────────────────────────┘
                                      ↓
         ┌────────────────────────────────────────────────────────┐
         │              PASSIVE RAG (~1-2KB por estágio)          │
         │ Pre-fetched por funnel stage | Cache de 5min           │
         └────────────────────────────┬───────────────────────────┘
                                      ↓
         ┌────────────────────────────────────────────────────────┐
         │              DYNAMIC CONTEXT (~1-2KB)                  │
         │ Cliente | Funil | Dados Coletados | Integridade        │
         └────────────────────────────┬───────────────────────────┘
                                      ↓
                    ┌───────────────────────────────────┐
                    │        CONTEXT COMPRESSOR         │
                    │ Target: 8KB | Agressiveness: auto │
                    └───────────────────────────────────┘
```

---

## Formato de Compressão AGENTS.md

### Antes (Verbose)
```markdown
═══════════════════════════════════════════════════════════════
## CLÁUSULAS PÉTREAS (NUNCA VIOLAR)
═══════════════════════════════════════════════════════════════

**CP1: TRIAGEM ÚNICA** - Nunca repetir menu após resposta clara do cliente. 
Se o cliente respondeu "2" ou "quero ser cliente", avance imediatamente para a próxima etapa.
Máximo de 1 tentativa de triagem por conversa.

**CP2: ORDEM RÍGIDA DO FUNIL** - A ordem é OBRIGATÓRIA e IMUTÁVEL...
[~2500 chars]
```

### Depois (AGENTS.md-Style)
```markdown
## CLÁUSULAS PÉTREAS (INVIOLÁVEIS)
CP1:TRIAGEM_ÚNICA|CP2:ORDEM_FUNIL(dist→valor→email→prop)|CP3:CORTE_R$300|CP4:EMAIL_OBRIG|CP5:DOCS_VIA_LINK|CP6:TERCEIROS_VÁLIDO

**Detalhes críticos:**
- CP1: Nunca repetir menu após resposta clara
- CP2: NUNCA inverter ordem, NUNCA pular etapas
[~800 chars]
```

**Redução:** ~68%

---

## Métricas e Targets

| Métrica | Target AGENTS.md | Implementação |
|---------|------------------|---------------|
| Tamanho Prompt | ≤8KB | `PROMPT_SIZE_TARGET_CHARS = 8000` |
| Compressão | ≥40% | `aggressiveness: 'medium' \| 'high'` |
| Aderência a Regras | ≥95% | `ruleAdherenceRate` em observability |
| Taxa Fast-Path | ≥60% | Layer 2 do pipeline |
| Latência LLM | ≤1.8s | Monitorado via `passive-context-metrics.ts` |
| Tokens/Msg | ≤2000 | Estimativa: `chars / 4` |

---

## Feature Flags

```typescript
// system-prompt-builder.ts
const ENABLE_SOFIA_CORE = true;           // SOFIA.md constitution
const ENABLE_RULE_MEMORY_INJECTION = true; // Dynamic rules
const ENABLE_PASSIVE_RAG = true;           // ✅ Pre-fetch by stage
const ENABLE_CONTEXT_COMPRESSION = true;   // ✅ Auto-compress
const ENABLE_RETRIEVAL_LED_BLOCK = true;   // Hierarchy block
const PROMPT_SIZE_TARGET_CHARS = 8000;     // Target size
```

---

## Módulos Atualizados

| Arquivo | Mudança |
|---------|---------|
| `sofia-core-loader.ts` | Formato pipe-delimited, ~2KB total |
| `system-prompt-builder.ts` | Compressão automática, métricas de tamanho |
| `rule-memory-injector.ts` | Formato compacto, críticas inline |
| `context-compressor.ts` | Target 8KB, preserva seções críticas |
| `passive-context-metrics.ts` | Compliance checker AGENTS.md |

---

## Verificação de Conformidade

```typescript
// Em qualquer ponto, verificar conformidade:
import { checkMetricsTargets } from '../passive-context-metrics.ts';

const compliance = checkMetricsTargets(aggregatedMetrics);
console.log(`AGENTS.md Compliance: ${compliance.agentsMdCompliance}%`);
// Resultado: { passed: true, agentsMdCompliance: 100 }
```

---

## Referências

- [AGENTS.md outperforms skills](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)
- [Passive Context Architecture](./00-architecture-overview.md)
- [SOFIA.md Constitution](../../SOFIA.md)

---

**Versão:** 3.0 | **Data:** 2026-02-03 | **Status:** ✅ 100% Compliant
