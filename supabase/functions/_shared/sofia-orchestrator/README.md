# Sofia Orchestrator

## Visão Geral

O Sofia Orchestrator é uma arquitetura modular de 18 fases que processa mensagens do WhatsApp através de um pipeline determinístico + LLM. Cerca de 60% das mensagens são resolvidas por fast-paths determinísticos, reduzindo custos e latência.

## Arquitetura do Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    WEBHOOK ENTRY POINT                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 0: INITIALIZATION                                        │
│ ├─ Phase 9:  Webhook Initialization (parsing, format detection)│
│ ├─ Phase 10: Agent Lock (status check, distributed locking)   │
│ └─ Phase 15: Global Pause (system disabled check)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: HARD STOPS                                            │
│ ├─ Phase 1:  Operator Commands (#ASSUMIR, #RESOLVIDO, etc.)   │
│ ├─ Phase 11: Conversation Lifecycle (search, duplicates)      │
│ └─ Phase 16: Greeting (first contact welcome)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 2: FAST-PATHS (~60% of messages)                         │
│ ├─ Phase 2:  Triage (existing client, MarIA, department)      │
│ ├─ Phase 7:  Fast-Path Handlers (documents, confirmations)    │
│ ├─ Phase 8:  Validation (distributor, typo, disqualification) │
│ └─ Phase 17: Message Buffer (humanized aggregation)           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3: INTAKE                                                │
│ ├─ Phase 3:  Data Collection (FSM-guided extraction)          │
│ ├─ Phase 12: Lead Processing (hot leads, Bitrix creation)     │
│ └─ Phase 18: Media Processing (audio, image, PDF)             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 4: CONTEXT                                               │
│ ├─ Phase 6:  Context Building (funnel, score, hesitation)     │
│ └─ Phase 13: Funnel Context (scoring, proposal fetching)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 5: REASONING (LLM - ~40% of messages)                    │
│ └─ Phase 4:  LLM Phase (RAG, prompts, AI call)                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 6: RESPONSE                                              │
│ ├─ Phase 5:  Response (humanization, audio, escalation)       │
│ └─ Phase 14: Response Finalization (guardrails, cleanup)      │
└─────────────────────────────────────────────────────────────────┘
```

## Padrão de Interface

Todas as fases seguem o mesmo padrão de design:

```typescript
interface PhaseContext {
  supabase: SupabaseClient;
  conversaId: string;
  phone: string;
  // ... campos específicos da fase
}

interface PhaseResult {
  handled: boolean;      // Se a fase retornou early
  response?: Response;   // HTTP response se handled=true
  // ... campos específicos da fase
}

// Função principal de execução
function executePhase(ctx: PhaseContext): Promise<PhaseResult>;

// Função de verificação (opcional)
function shouldExecutePhase(...): boolean;
```

## Tabela Resumo das Fases

| # | Fase | Tipo | Layer | Descrição |
|---|------|------|-------|-----------|
| 1 | Operator | Determinístico | Hard Stops | Comandos de operador (#ASSUMIR, #RESOLVIDO) |
| 2 | Triage | Híbrido | Fast-Paths | Triagem de clientes existentes, MarIA |
| 3 | Data Collection | Determinístico | Intake | Extração FSM de dados (CPF, email, etc.) |
| 4 | LLM | LLM-Based | Reasoning | RAG + prompt building + chamada LLM |
| 5 | Response | Híbrido | Response | Humanização, áudio, escalação |
| 6 | Context Building | Determinístico | Context | Score, funnel stage, hesitação |
| 7 | Fast-Path | Determinístico | Fast-Paths | Handlers de documentos, confirmações |
| 8 | Validation | Determinístico | Fast-Paths | Validação de distribuidora, typos |
| 9 | Webhook Init | Determinístico | Initialization | Parsing, detecção de formato |
| 10 | Agent Lock | Determinístico | Initialization | Status check, locking distribuído |
| 11 | Conversation Lifecycle | Determinístico | Hard Stops | Busca, duplicatas, pausa |
| 12 | Lead Processing | Determinístico | Intake | Hot leads, criação Bitrix |
| 13 | Funnel Context | Determinístico | Context | Scoring, fetch de proposta |
| 14 | Response Finalization | Determinístico | Response | Guardrails, race conditions |
| 15 | Global Pause | Determinístico | Initialization | Check de sistema desabilitado |
| 16 | Greeting | Determinístico | Hard Stops | Welcome de primeiro contato |
| 17 | Message Buffer | Determinístico | Fast-Paths | Agregação humanizada |
| 18 | Media Processing | Híbrido | Intake | Transcrição, análise de imagem/PDF |

## Convenções de Desenvolvimento

### Nomenclatura

- **Arquivos:** `<nome>-phase.ts`
- **Função principal:** `execute<Nome>Phase(ctx)`
- **Função de verificação:** `shouldExecute<Nome>Phase(...)`
- **Tipos:** `<Nome>PhaseContext`, `<Nome>PhaseResult`

### Early Return Pattern

```typescript
// Se handled=true, as fases seguintes são puladas
if (result.handled) {
  return result.response;
}
// Continua para próxima fase
```

### Logging

Sempre use prefixo da fase nos logs:

```typescript
console.log(`[PHASE_NAME] Mensagem de log`);
```

### Tipos Exportados

Cada fase deve exportar:
- `execute<Nome>Phase` - Função principal
- `shouldExecute<Nome>Phase` - Verificação (se aplicável)
- `<Nome>PhaseContext` - Interface de entrada
- `<Nome>PhaseResult` - Interface de saída
- Tipos auxiliares específicos

## Estrutura de Diretórios

```
supabase/functions/_shared/sofia-orchestrator/
├── README.md                     # Este documento
├── README-PHASE-TEMPLATE.md      # Template para novas fases
├── docs/                         # Documentação detalhada por fase
│   ├── 01-operator-phase.md
│   ├── 02-triage-phase.md
│   └── ...
├── index.ts                      # Exports centralizados
├── operator-phase.ts             # Fase 1
├── triage-phase.ts               # Fase 2
└── ...                           # Demais fases
```

## Adicionando Novas Fases

1. Crie o arquivo `<nome>-phase.ts` seguindo o template
2. Implemente `PhaseContext`, `PhaseResult` e `executePhase`
3. Adicione exports em `index.ts`
4. Crie documentação em `docs/<numero>-<nome>.md`
5. Atualize a tabela neste README

## Links Úteis

- [Template de Fase](./README-PHASE-TEMPLATE.md)
- [Documentação das Fases](./docs/)
- [Index de Exports](./index.ts)

---

**Última atualização:** 2026-02-03
**Versão:** 1.0
