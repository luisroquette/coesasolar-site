# Módulo: Agent Adapters

## Propósito

Sistema de adapters que permite comportamentos específicos por agente (sofIA, marIA, julIA, iagO, jaimE) sem duplicação de código.

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `types.ts` | Interface `AgentAdapter` e tipos auxiliares |
| `base-adapter.ts` | Classe base com implementações padrão |
| `sofia-adapter.ts` | Adapter sofIA (vendas inbound) |
| `maria-adapter.ts` | Adapter marIA (SAC) |
| `julia-adapter.ts` | Adapter julIA (cobrança) |
| `iago-adapter.ts` | Adapter iagO (vendas outbound) |
| `jaime-adapter.ts` | Adapter jaimE (suporte técnico) |
| `index.ts` | Resolver e exports |

## Uso

```typescript
import { resolveAgentAdapter } from './adapters/index.ts';

const adapter = resolveAgentAdapter(agentId);

// Fast-paths habilitados
const fastPaths = adapter.getEnabledFastPaths();

// Campos de coleta
const requiredFields = adapter.getRequiredFields();

// Decisão de triagem
const triage = adapter.shouldTriggerTriage(context);

// Pipeline V2
const useV2 = adapter.shouldUsePipelineV2();
```

## Configuração por Agente

| Agente | Role | Pipeline | Triagem | Fast-Paths |
|--------|------|----------|---------|------------|
| sofIA | sales | V2 ✅ | → marIA | vendas |
| marIA | sac | V1 | → sofia/julia | SAC |
| julIA | collections | V1 | ❌ | cobrança |
| iagO | outbound_sales | V2 ✅ | ❌ | subset sofIA |
| jaimE | support | V1 | ❌ | técnico |

## Extensibilidade

Novos agentes: criar novo adapter estendendo `BaseAgentAdapter`.

---
**Última atualização:** 2026-02-03
