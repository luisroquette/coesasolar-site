# Memory: architecture/message-bus-unified-persistence
Updated: 2026-02-03

## Arquitetura Unificada de Mensagens

O sistema agora utiliza um **Message Bus centralizado** (`_shared/message-bus.ts`) como fonte única de verdade para persistência de mensagens.

### Problema Resolvido

**Antes:** 36+ arquivos fazendo inserts diretos em `chatbot_mensagens`, causando:
- Mensagens perdidas quando certos paths não eram acionados
- Timestamps inconsistentes
- Impossibilidade de deduplicação
- Dificuldade de debugging

**Depois:** Ponto único de entrada com garantias:
- Deduplicação automática por `message_id`
- Atualização automática de timestamps na conversa
- Métricas centralizadas
- Logging estruturado

### API do Message Bus

```typescript
import { 
  getMessageBus,
  publishUserMessage,
  publishAssistantMessage,
  publishConversationPair,
} from '../_shared/message-bus.ts';

// Singleton instance
const bus = getMessageBus(supabase);

// User message
await bus.publishUser(conversaId, "Olá", { messageId });

// Assistant message with handler type
await bus.publishAssistant(conversaId, "Oi!", 'triage');

// Conversation pair (user + assistant)
await publishConversationPair(
  supabase, conversaId, 
  userContent, assistantContent, 
  messageId, 'triage'
);
```

### Handler Types Disponíveis

| Handler | Descrição |
|---------|-----------|
| `triage` | Triagem inicial |
| `fast_path` | Resposta determinística |
| `guided_script` | FSM do funil |
| `llm_response` | Resposta via LLM |
| `followup` | Mensagem de follow-up |
| `nudge` | Nudge automático |
| `rescue` | Resgate de conversa |
| `fallback` | Fallback de erro |
| `human` | Mensagem de humano |
| `bitrix_sync` | Sincronização Bitrix |
| `contract_sent` | Envio de contrato |
| `proposal_sent` | Envio de proposta |
| `typo_correction` | Correção de typo |
| `scheduler` | Mensagem agendada |

### Arquivos Migrados

✅ `triage-flow.ts` - 100% migrado  
✅ `typo-confirmation.ts` - 100% migrado  
✅ `z-api-send-message/index.ts` - 100% migrado  
✅ `unanswered-message-detector/index.ts` - 100% migrado  
✅ `contract-sent-webhook/index.ts` - 100% migrado

### Migração Completa ✅

Todos os arquivos identificados foram migrados para o Message Bus.

### Integração com Intake Layer

O `intake-layer.ts` continua responsável pela persistência **inicial** da mensagem do usuário ANTES de qualquer processamento. O Message Bus é usado para as respostas subsequentes.

```
Mensagem recebe → intake-layer (user msg) → processamento → message-bus (assistant msg)
```

### Métricas

O MessageBus coleta métricas automaticamente:

```typescript
const metrics = bus.getMetrics();
// { totalMessages, totalDuplicates, totalErrors, lastError }
```
