# Memory: architecture/agents-md-v35-implementation
Updated: now

## Implementação AGENTS.md v3.5 (Vercel-Style Completo)

### Arquivos Criados/Modificados

1. **`supabase/functions/_shared/AGENTS.md`** (NOVO ~20KB)
   - Documento canônico completo estilo Vercel
   - 10 cenários detalhados
   - 5 princípios narrativos
   - Personalidade definida ("Quem é Sofia")
   - Checklist pré-proposta

2. **`supabase/functions/_shared/sofia-core-loader.ts`** (v3.4→v3.5)
   - Adicionado `SOFIA_PRINCIPIOS` (5 princípios compactos)
   - Adicionado `SOFIA_PERSONALIDADE` (perfil humanizado)
   - Adicionado `SOFIA_RAG_USAGE` (orientações de uso do RAG)
   - Corte atualizado de R$300 para R$250 (conforme AGENTS.md)
   - Interface expandida com novos campos

3. **`supabase/functions/_shared/proposal-requirements.ts`** (expandido)
   - `validateProposalReadiness()`: Checklist completo pré-proposta
   - `hasMinimumProposalData()`: Validação rápida
   - Interface `ProposalChecklist` com 6 critérios

### Banco de Dados Populado

- **few_shot_examples**: 8 cenários do AGENTS.md inseridos
  - triagem:primeiro_contato
  - qualificacao:conta_baixa/conta_qualificada/desconfianca
  - coleta_dados:como_funciona
  - proposta:negociacao/cancelamento
  - fechamento:quer_assinar

### Estrutura do Prompt v3.5 (~7.8KB estimado)

```
1. RETRIEVAL-LED (~400 chars)
2. SOFIA CORE v3.5 (~2.5KB)
   ├─ Identidade
   ├─ Princípios (5 itens) ← NOVO
   ├─ Personalidade ← NOVO
   ├─ Cláusulas Pétreas
   ├─ Anti-alucinação
   └─ RAG Usage ← NOVO
3. Rule Memory (~500 chars)
4. Few-Shot (~1.2KB)
5. RAG Context (~1.5KB)
6. Dynamic Context (~1.2KB)
7. Format (~200 chars)
```

### Mudanças de Negócio

- Corte mínimo: R$300 → R$250 (conforme AGENTS.md canônico)
- Ordem de coleta: Valor→Dist→Email→Nome (antes era Dist→Valor)
