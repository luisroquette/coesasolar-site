# Memory: architecture/agents-md-p3-rag-index-v1
Updated: 2026-02-03

## Implementação AGENTS.md P3: RAG Index

### Propósito
Adicionar um índice compacto das categorias RAG disponíveis no prompt, permitindo que o LLM "saiba o que ele sabe" antes de raciocinar.

### Arquivos Criados/Modificados

**Novo Módulo:**
- `supabase/functions/_shared/rag-index-builder.ts` - Busca categorias ativas da tabela `rag_documents` e formata em índice compacto

**Modificados:**
- `supabase/functions/_shared/system-prompt-builder.ts` - Integração do RAG Index como SECTION 5
- `supabase/functions/_shared/sofia-orchestrator/llm-phase.ts` - Orquestração do buildRAGIndex

### Formato do Índice
```
📚 DOCS_DISPONÍVEIS: ❓FAQ|📋Processo|💰Financeiro|🤝Objeções|☀️Solar|...
↳ Consulte estes tópicos para fundamentar respostas; se não houver cobertura, pergunte ao cliente.
```

### Características
- **Cache de 15 minutos** por agente (categorias mudam raramente)
- **Labels com emoji** para rápida identificação pelo LLM
- **Ordenação por volume** (categorias com mais docs primeiro)
- **Threshold mínimo** de 1 documento para inclusão

### Posição no Prompt (SECTION 5)
1. Retrieval-Led Reasoning
2. SOFIA Core
3. Rule Memory
4. Few-Shot Examples (P2)
5. **RAG Index (P3)** ← NOVO
6. RAG Knowledge
7. Dynamic Context

### Benefícios
- LLM sabe quais conhecimentos estão disponíveis ANTES de raciocinar
- Reduz alucinações ao indicar cobertura disponível
- Formato compacto (~150-300 chars) não impacta limite de 8KB
