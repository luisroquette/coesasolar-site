# Memory: architecture/agents-md-p4-narrative-principles-v1
Updated: now

## Implementação AGENTS.md: P4 - Narrative Principles

Seguindo o artigo da Vercel AGENTS.md, transformamos regras secas em **micro-narrativas** que explicam o "porquê" de cada regra. LLMs performam significativamente melhor quando entendem a lógica por trás das restrições.

## Mudanças Implementadas

### 1. `sofia-core-loader.ts`
- `SOFIA_CLAUSULAS_PETREAS` agora contém narrativas explicativas
- Cada CP (Cláusula Pétrea) explica a consequência de violá-la
- Versão atualizada para 3.3

### 2. `SOFIA.md`
- Seção "CLÁUSULAS PÉTREAS" reescrita com princípios narrativos
- Cada regra agora segue o formato: `**CPX:** → Porque [consequência negativa]`
- Versão: 3.2 → 3.3

## Exemplos de Transformação

### Antes (Regra Seca):
```
CP3: Abaixo R$300→encerrar educadamente
```

### Depois (Narrativa):
```
**CP3: CORTE_R$300** → Porque economia <R$50/mês não compensa a burocracia de troca. Cliente economiza pouco, COESA gasta recursos. Perdem os dois.
```

## Todas as Narrativas Implementadas

| CP | Regra | Narrativa |
|---|-------|-----------|
| CP1 | TRIAGEM_ÚNICA | Repetir menu irrita cliente e desperdiça tempo |
| CP2 | ORDEM_FUNIL | Pular etapas = proposta errada = cliente frustrado |
| CP3 | CORTE_R$300 | Economia <R$50 não compensa burocracia |
| CP4 | EMAIL_OBRIG | Proposta é PDF por email, sem email não entrega |
| CP5 | DOCS_VIA_LINK | WhatsApp = risco de vazamento, link = LGPD compliance |
| CP6 | TERCEIROS_VÁLIDO | "Conta do sogro" ainda é VENDA, não SAC |

## Por que isso importa (AGENTS.md)

O artigo da Vercel identificou que:
- Regras prescritivas ("faça X") têm menor adesão em casos edge
- Princípios narrativos ("faça X **porque** Y") permitem que o LLM raciocine analogamente em casos não cobertos
- LLMs com contexto de "consequência" tomam decisões mais alinhadas com o objetivo do negócio

## Status Final do Plano AGENTS.md

| # | Melhoria | Status |
|---|----------|--------|
| **P1** | Reasoning Examples | ✅ Feito (v3.2) |
| **P2** | Few-Shot Injection | ✅ Feito |
| **P3** | RAG Index | ✅ Feito |
| **P4** | Narrative Principles | ✅ Feito (v3.3) |

## Impacto Esperado

- LLM entende o "porquê" de cada restrição
- Melhor handling de casos edge não explicitamente cobertos
- Decisões mais alinhadas com objetivos comerciais da COESA
