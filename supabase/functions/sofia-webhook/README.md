# Edge Function: sofia-webhook

## Propósito

Webhook principal que recebe mensagens do WhatsApp via Z-API e orquestra toda a pipeline de processamento da Sofia, desde a validação até o envio da resposta.

## Endpoint

- **Método:** POST
- **URL:** `/functions/v1/sofia-webhook`

## Entradas

### Payload Z-API (Mensagem de Texto)
```json
{
  "phone": "5534999887766",
  "text": {
    "message": "Olá, quero saber sobre energia solar"
  },
  "messageId": "msg_abc123",
  "fromMe": false,
  "isGroup": false,
  "status": "RECEIVED"
}
```

### Payload Z-API (Mensagem de Mídia)
```json
{
  "phone": "5534999887766",
  "image": {
    "mimeType": "image/jpeg",
    "imageUrl": "https://..."
  },
  "messageId": "msg_xyz789"
}
```

## Saídas

### Sucesso (200)
```json
{
  "status": "success",
  "conversaId": "uuid-conversa",
  "messageProcessed": true,
  "handlerType": "deterministic|llm|fast_path"
}
```

### Erro (400/500)
```json
{
  "status": "error",
  "error": "Mensagem de erro",
  "code": "VALIDATION_ERROR"
}
```

## Dependências

### Módulos Core
- `_shared/sofia-orchestrator/` - Fases do orquestrador (operator, triage, data-collection, llm, response)
- `_shared/pipeline/` - Pipeline v2 (intake, context, reasoning, action, validation, learning)
- `_shared/lock-helpers.ts` - Locks distribuídos para evitar race conditions
- `_shared/message-helpers.ts` - Persistência de mensagens
- `_shared/config-loader.ts` - Configurações centralizadas

### Módulos de Processamento
- `_shared/entry-point-rate-limiter.ts` - Rate limiting por telefone e global
- `_shared/message-buffer.ts` - Buffer de mensagens (janela 5s)
- `_shared/data-extraction.ts` - Extração de entidades (CPF, email, valor, etc.)
- `_shared/guided-script-fsm.ts` - Máquina de estados do funil
- `_shared/llm-client.ts` - Chamadas para LLM (OpenAI/Gemini)
- `_shared/rag-search-client.ts` - Busca em base de conhecimento

### Integrações
- `_shared/zapi-client.ts` - Envio de mensagens WhatsApp
- `_shared/bitrix-client.ts` - Sincronização com CRM

## Configurações (configuracoes_sistema)

| Chave | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `buffer_wait_window_ms` | number | 4000 | Janela de buffer para agrupar mensagens |
| `rate_limit_per_minute` | number | 30 | Rate limit por telefone |
| `rate_limit_global` | number | 500 | Rate limit global |
| `pipeline_v2_enabled` | boolean | true | Usar pipeline v2 |
| `pipeline_v2_rollout` | number | 100 | % de rollout do pipeline v2 |
| `typing_indicator_enabled` | boolean | true | Mostrar "digitando..." |
| `latency_short_msg_seconds` | number | 2.0 | Delay humanizado para msgs curtas |

## Autenticação

- [ ] Requer JWT válido
- [ ] Aceita anon key
- [x] Webhook público (validado por security token)

## Rate Limiting

- Global: `500 req/min`
- Por telefone: `30 req/min`
- Sliding window: `5 minutos`

## Fluxo Interno

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOFIA WEBHOOK FLOW                           │
└─────────────────────────────────────────────────────────────────┘

[Z-API] ──► [sofia-webhook]
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 0: SECURITY                                                │
│ ├─ Validate security token                                       │
│ ├─ Rate limiting check (global + per-phone)                      │
│ └─ Validate payload structure                                    │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 1: BUFFER                                                  │
│ ├─ Add message to buffer                                         │
│ ├─ Wait for silence window (5s)                                  │
│ └─ Aggregate multiple messages                                   │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 2: HARD STOPS                                              │
│ ├─ Operator commands (#ASSUMIR, #RESOLVIDO)                      │
│ ├─ Manual mode check (sofia_mode = 'manual')                     │
│ └─ Blocked stage check (Bitrix24)                                │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 3: FAST-PATHS (~60% of messages)                           │
│ ├─ Greeting handler                                              │
│ ├─ Confirmation handler                                          │
│ ├─ Distribuidora handler                                         │
│ ├─ Document collection flow                                      │
│ ├─ FSM-guided data collection                                    │
│ └─ Deterministic templates                                       │
└─────────────────────────────────────────────────────────────────┘
              │ (if not handled)
              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 4: CONTEXT LOADING                                         │
│ ├─ Load conversation history                                     │
│ ├─ Load working memory                                           │
│ ├─ Load client profile (Bitrix24)                                │
│ ├─ Load active rules                                             │
│ └─ RAG search for relevant knowledge                             │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 5: LLM REASONING                                           │
│ ├─ Build system prompt (persona + rules + context)               │
│ ├─ Call LLM (GPT-4/Gemini) with tool calling                     │
│ ├─ Parse response and tool calls                                 │
│ └─ Extract new facts for learning                                │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 6: GUARDRAILS                                              │
│ ├─ Content safety check                                          │
│ ├─ Business rules validation                                     │
│ ├─ Competitor detection                                          │
│ ├─ Pricing guardrails                                            │
│ └─ Escalation triggers                                           │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│ LAYER 7: RESPONSE                                                │
│ ├─ Humanized latency (typing indicator)                          │
│ ├─ Send via Z-API                                                │
│ ├─ Save to chatbot_mensagens                                     │
│ ├─ Update conversation state                                     │
│ └─ Sync to Bitrix24                                              │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
           [WhatsApp]
```

## Erros Comuns

| Código | Causa | Solução |
|--------|-------|---------|
| 400 | Payload inválido | Verificar estrutura Z-API |
| 401 | Security token inválido | Verificar `zapi_security_token` |
| 429 | Rate limit excedido | Aguardar janela de 1 minuto |
| 500 | Erro interno | Verificar logs em `edge_function_logs` |

## Tabelas Utilizadas

| Tabela | Operação | Descrição |
|--------|----------|-----------|
| `chatbot_conversas` | R/W | Estado da conversa |
| `chatbot_mensagens` | R/W | Histórico de mensagens |
| `chatbot_mensagens_pendentes` | W | Fila de retry |
| `working_memory` | R/W | Memória de curto prazo |
| `configuracoes_sistema` | R | Configurações |
| `ai_agents` | R | Configuração do agente |
| `deterministic_response_templates` | R | Templates FSM |
| `cross_webhook_locks` | R/W | Locks distribuídos |

## Métricas e Observabilidade

- **Logs:** Prefixo `[sofia-webhook]` em todos os logs
- **Duração:** `total_duration_ms` em cada response
- **Handler Type:** `deterministic`, `fast_path`, `llm`, `operator_command`
- **Tabela de métricas:** `pipeline_execution_log`

## Exemplos

### cURL (Simular mensagem)
```bash
curl -X POST 'https://cvcdweqybgfxywcelriq.supabase.co/functions/v1/sofia-webhook' \
  -H 'Content-Type: application/json' \
  -d '{
    "phone": "5534999887766",
    "text": { "message": "Olá, quero economizar na conta de luz" },
    "messageId": "test_123",
    "fromMe": false
  }'
```

### Teste de Comando Operador
```bash
curl -X POST 'https://cvcdweqybgfxywcelriq.supabase.co/functions/v1/sofia-webhook' \
  -H 'Content-Type: application/json' \
  -d '{
    "phone": "5534911111111",
    "text": { "message": "#ASSUMIR 5534999887766" },
    "messageId": "cmd_123",
    "fromMe": true
  }'
```

## TODOs

- [x] Implementar Pipeline v2 completo
- [x] Adicionar buffer de mensagens
- [x] Implementar rate limiting
- [ ] Adicionar testes unitários (cobertura 35%)
- [ ] Refatorar webhook monolítico (3144 linhas)

## Histórico de Mudanças

| Data | Versão | Descrição |
|------|--------|-----------|
| 2024-01 | 1.0 | Versão inicial |
| 2024-06 | 2.0 | Pipeline v2 com FSM |
| 2025-01 | 2.1 | Orquestrador modular |

## Autores

- Sofia Team
