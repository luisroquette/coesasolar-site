# Memory: architecture/sofia-bom-senso-humano-v1
Updated: now

## Problema Identificado

A Sofia estava respondendo de forma robótica e descontextualizada a situações sociais/emocionais (ex: cliente reclamou de spam e Sofia respondeu "Perfeito, fico no aguardo"). O problema era arquitetural: a hierarquia **Retrieval-Led Reasoning** proibia explicitamente o uso de "conhecimento pré-treinado", o que bloqueava o bom senso conversacional humano.

## Solução Implementada

Atualização da constituição SOFIA.md (v3.0 → v3.1) para incluir **P4: Bom Senso Humano** na hierarquia de raciocínio:

```
P1: rule_memory (regras determinísticas)
P2: RAG (conhecimento documental)
P3: Dados do cliente (confirmados)
P4: BOM SENSO HUMANO ← NOVO
P5: Fallback (perguntar/escalar)
```

### O que P4 permite:
- Desculpas sinceras quando há reclamação
- Resposta honesta sobre identidade ("sou a sofIA, assistente virtual")
- Empatia quando cliente está confuso
- Admissão de erros técnicos
- Agradecimentos naturais

### O que continua PROIBIDO:
- Inventar valores, prazos, links, estados de proposta
- Inventar dados técnicos sobre energia/COESA
- Ignorar rule_memory

## Arquivos Modificados
- `supabase/functions/_shared/sofia-core-loader.ts` (SOFIA_RETRIEVAL_LED, getRetrievalLedReasoningBlock)
- `supabase/functions/_shared/SOFIA.md` (v3.1)

## Impacto Esperado

A Sofia agora pode responder naturalmente a situações sociais sem precisar de regras específicas para cada caso, mantendo a proteção contra alucinação de dados técnicos.
