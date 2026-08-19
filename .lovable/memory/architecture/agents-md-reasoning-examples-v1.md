# Memory: architecture/agents-md-reasoning-examples-v1
Updated: now

## Implementação AGENTS.md: Reasoning Examples (P1)

Seguindo as melhores práticas do artigo Vercel AGENTS.md, foram adicionados **exemplos de raciocínio step-by-step** ao prompt da Sofia para ensinar à LLM **como** aplicar a hierarquia Retrieval-Led, não apenas **o que** ela é.

## Mudanças Implementadas

### 1. `sofia-core-loader.ts`
- Nova constante `SOFIA_REASONING_EXAMPLES` com 3 exemplos:
  - Ex1: Qualificação com valor abaixo do mínimo (aplicação de CP3)
  - Ex2: Tratamento de reclamação de spam (aplicação de P4:Bom Senso)
  - Ex3: Cliente quer proposta sem dar email (aplicação de CP2+CP4)
- Feature flag `ENABLE_REASONING_EXAMPLES = true`
- Tipo `SofiaCoreContent` atualizado com campo `reasoningExamples`
- Tipo `SofiaCoreLoaderOptions` com opção `includeReasoningExamples`
- Versão atualizada para 3.2

### 2. `SOFIA.md`
- Adicionada seção "## EXEMPLOS DE RACIOCÍNIO" com os 3 exemplos compactos
- Tamanho do arquivo: ~2.5KB → ~3.5KB
- Versão: 3.1 → 3.2

## Por que isso importa (AGENTS.md)

O artigo da Vercel identificou que LLMs performam melhor quando veem **exemplos de raciocínio** ao invés de apenas regras:
- Regras prescritivas ("faça X quando Y") têm ~53-79% success rate
- Exemplos de raciocínio step-by-step têm ~13% mais sucesso em ambiguidade

## Formato dos Exemplos

```markdown
### Ex1: Valor abaixo do mínimo
**Cliente:** "Minha conta é R$250"
**Raciocínio:** P1→CP3:CORTE_R$300 | P3→valorFatura=250 | Decisão→NÃO qualifica
**Resposta:** "Pra contas abaixo de R$300 a economia fica pequena..."
```

Cada exemplo mostra:
1. **Input** (mensagem do cliente)
2. **Raciocínio interno** (aplicação da hierarquia P1-P5)
3. **Output** (resposta gerada)

## Próximos Passos (P2-P4)
- P2: Injeção de few-shot examples da tabela `few_shot_examples`
- P3: Índice comprimido de categorias RAG
- P4: Princípios narrativos (explicar "por quê" de cada cláusula)
