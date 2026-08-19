# Módulos Compartilhados (_shared)

## Visão Geral

Esta pasta contém todos os módulos compartilhados entre as Edge Functions do projeto Sofia. Os módulos estão organizados por responsabilidade e seguem o princípio de single responsibility.

## Estrutura de Diretórios

```
_shared/
├── pipeline/              # Pipeline v2 da Sofia (7 camadas)
│   ├── index.ts          # Orquestrador principal
│   ├── types.ts          # Tipos e interfaces
│   ├── config.ts         # Configuração do pipeline
│   ├── intake.ts         # Normalização de entrada
│   ├── context.ts        # Carregamento de memória
│   ├── reasoning.ts      # Decisão via LLM
│   ├── action.ts         # Execução de tool calls
│   ├── validation.ts     # Guardrails
│   ├── learning.ts       # Persistência de aprendizados
│   ├── deterministic-router.ts  # Bypass de LLM para coleta
│   ├── behavioral-profile.ts    # Perfis comportamentais
│   ├── operator-feedback.ts     # Feedback de operadores
│   └── self-evaluation.ts       # Auto-avaliação
│
├── sofia-orchestrator/    # Fases do orquestrador modular
│   ├── index.ts          # Exports centralizados
│   ├── operator-phase.ts # Comandos #ASSUMIR, #RESOLVIDO
│   ├── triage-phase.ts   # Triagem e fluxo MarIA
│   ├── data-collection-phase.ts  # Extração de dados FSM
│   ├── llm-phase.ts      # RAG + LLM
│   └── response-phase.ts # Humanização + envio
│
├── utils/                 # Utilitários genéricos
│   └── phone-utils.ts    # Normalização de telefones
│
└── [70+ módulos]         # Módulos por funcionalidade
```

## Módulos Principais

### Core

| Módulo | Linhas | Descrição |
|--------|--------|-----------|
| `config-loader.ts` | ~300 | Carrega 70+ configs do banco com cache 5min |
| `lock-helpers.ts` | ~200 | Locks distribuídos (acquire, release, withLock) |
| `message-helpers.ts` | ~150 | Persistência de mensagens |
| `response-helpers.ts` | ~100 | Helpers para responses JSON |
| `security-helpers.ts` | ~200 | CORS, validação de headers |

### Integrações

| Módulo | Linhas | Descrição |
|--------|--------|-----------|
| `zapi-client.ts` | ~900 | Cliente Z-API com retry e outbound guard |
| `bitrix-client.ts` | ~700 | API Bitrix24 com resolução de campos |
| `bitrix-sync.ts` | ~600 | Sincronização de leads e propostas |
| `llm-client.ts` | ~400 | Cliente LLM com fallback cascade |
| `rag-search-client.ts` | ~300 | Busca vetorial em documentos |
| `tts-client.ts` | ~200 | Text-to-speech para áudios |

### Processamento de Mensagens

| Módulo | Linhas | Descrição |
|--------|--------|-----------|
| `data-extraction.ts` | ~500 | Extração de CPF, email, valor, etc. |
| `guided-script-fsm.ts` | ~600 | Máquina de estados do funil |
| `fast-path-handlers.ts` | ~400 | Handlers determinísticos |
| `pre-llm-hard-stops.ts` | ~300 | Validações antes da LLM |
| `detection-patterns.ts` | ~400 | Padrões de detecção |
| `message-buffer.ts` | ~200 | Buffer com janela de 5s |

### Rate Limiting & Segurança

| Módulo | Linhas | Descrição |
|--------|--------|-----------|
| `entry-point-rate-limiter.ts` | ~300 | Rate limit com sliding window |
| `rate-limiter.ts` | ~150 | Rate limiter genérico |
| `anti-spam.ts` | ~200 | Detecção de spam |
| `guardrails-enforcer.ts` | ~250 | Guardrails pós-LLM |

### Fluxos Específicos

| Módulo | Linhas | Descrição |
|--------|--------|-----------|
| `greeting-handler.ts` | ~150 | Saudações iniciais |
| `confirmation-handlers.ts` | ~200 | Confirmações sim/não |
| `distribuidora-handler.ts` | ~300 | Resolução de distribuidoras |
| `document-collection-flow.ts` | ~400 | Coleta de documentos |
| `maria-triage.ts` | ~300 | Triagem MarIA (SAC) |
| `triage-flow.ts` | ~350 | Triagem principal |

## Padrões de Uso

### Importando Módulos

```typescript
// Importar de índice centralizado
import { 
  executeOperatorPhase,
  executeTriagePhase,
  executeLLMPhase 
} from '../_shared/sofia-orchestrator/index.ts';

// Importar módulo específico
import { loadSystemConfig } from '../_shared/config-loader.ts';
import { sendWhatsAppMessage } from '../_shared/zapi-client.ts';
import { acquireLock, releaseLock } from '../_shared/lock-helpers.ts';
```

### Padrão de Response

```typescript
import { jsonResponse, errorResponse, webhookAck } from '../_shared/response-helpers.ts';

// Sucesso
return jsonResponse({ status: 'success', data: result });

// Erro
return errorResponse('Mensagem de erro', 400);

// Webhook ACK rápido
return webhookAck();
```

### Padrão de Lock

```typescript
import { withLock, acquireLock, releaseLockSilent } from '../_shared/lock-helpers.ts';

// Usando wrapper (recomendado)
const result = await withLock(
  supabase,
  phone,
  'sofia',
  'processing',
  async () => {
    // Código protegido por lock
    return await processMessage();
  },
  30 // timeout em segundos
);

// Usando acquire/release manual
const lockResult = await acquireLock(supabase, phone, 'sofia', 'processing', 30);
if (!lockResult.acquired) {
  return errorResponse('Another instance processing');
}
try {
  await processMessage();
} finally {
  await releaseLockSilent(supabase, phone);
}
```

### Padrão de Config

```typescript
import { loadSystemConfig, getConfigValue } from '../_shared/config-loader.ts';

// Carregar todas as configs (com cache)
const config = await loadSystemConfig(supabase);
const desconto = config.desconto_default;

// Carregar config específica com fallback
const rateLimit = await getConfigValue<number>(
  supabase, 
  'rate_limit_per_minute', 
  30
);
```

## Testes

Os arquivos de teste seguem o padrão `*_test.ts`:

```
_shared/
├── pre-llm-hard-stops_test.ts
└── ...

sofia-webhook/
├── operator_phase_test.ts
├── fsm_test.ts (a criar)
└── data_extraction_test.ts (a criar)
```

### Executando Testes

```bash
# Via ferramenta de testes do Lovable
supabase--test-edge-functions

# Específico
supabase--test-edge-functions --functions=["sofia-webhook"] --pattern="operator"
```

## Convenções

### Nomeação

- Arquivos: `kebab-case.ts`
- Funções exportadas: `camelCase`
- Interfaces: `PascalCase`
- Constantes: `UPPER_SNAKE_CASE`

### Estrutura de Módulo

```typescript
/**
 * MÓDULO: nome-do-modulo
 * 
 * Descrição breve do propósito
 * 
 * @module _shared/nome-do-modulo
 */

// ═══════════════════════════════════════════════════════
// IMPORTS
// ═══════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface ModuleConfig {
  // ...
}

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

const DEFAULT_TIMEOUT = 30000;

// ═══════════════════════════════════════════════════════
// MAIN FUNCTIONS
// ═══════════════════════════════════════════════════════

export async function mainFunction(): Promise<Result> {
  // ...
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function helperFunction(): void {
  // ...
}
```

### Logging

```typescript
// Prefixo consistente
console.log(`[module-name] Ação executada`);
console.warn(`[module-name] Aviso: situação X`);
console.error(`[module-name] Erro:`, error);

// Com contexto
console.log(`[module-name:${conversaId}] Mensagem processada`);
```

## Dependências Externas

| Pacote | Versão | Uso |
|--------|--------|-----|
| `@supabase/supabase-js` | ^2 | Cliente Supabase |
| `openai` | ^4 | Cliente OpenAI |
| `zod` | ^3 | Validação de schemas |

## Performance

### Cache

- **Config:** 5 minutos TTL
- **Patterns:** 10 minutos TTL
- **RAG embeddings:** 1 hora TTL

### Rate Limits Internos

- **LLM:** 3500 RPM (GPT-4), 60000 RPM (GPT-3.5)
- **Z-API:** ~200 req/min por instância
- **Bitrix24:** ~200 req/min

## Roadmap

- [ ] Migrar locks para Redis
- [ ] Implementar interface CRMProvider
- [ ] Adicionar testes para todos módulos críticos
- [ ] Documentar todos os módulos com JSDoc

## Autores

- Sofia Team
