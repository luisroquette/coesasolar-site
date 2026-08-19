# 📡 ENDPOINTS DE API - SOFIA BOT V2

> **Documentação Completa de Todos os Edge Functions**  
> Total: 74 Edge Functions

---

## 🔴 WEBHOOKS PRINCIPAIS (Entry Points)

### 1. `z-api-webhook` (866 linhas)
**URL:** `POST /functions/v1/z-api-webhook`  
**Função:** Entry point para mensagens do WhatsApp via Z-API

```typescript
// PAYLOAD RECEBIDO DO Z-API
interface ZApiWebhookPayload {
  phone?: string;               // Telefone do cliente (55XXXXXXXXXXX)
  participantPhone?: string;    // Alternativa ao phone
  chatLid?: string;             // ID de conversa no modo multi-device
  connectedPhone?: string;      // Telefone conectado na instância
  messageId?: string;           // ID único da mensagem
  fromMe?: boolean;             // true = mensagem enviada pelo bot
  momment?: number;             // Timestamp em milissegundos
  status?: string;              // Status da mensagem
  chatName?: string;            // Nome do chat
  senderName?: string;          // Nome do remetente
  senderPhoto?: string;         // URL da foto do remetente
  broadcast?: boolean;          // É broadcast?
  isGroup?: boolean;            // É grupo?
  type?: string;                // Tipo: text, audio, image, document
  text?: { message?: string };  // Conteúdo de texto
  audio?: {                     // Conteúdo de áudio
    audioUrl?: string;
    mimeType?: string;
    caption?: string;
  };
  image?: {                     // Conteúdo de imagem
    imageUrl?: string;
    mimeType?: string;
    thumbnailUrl?: string;
    caption?: string;
  };
  document?: {                  // Conteúdo de documento
    documentUrl?: string;
    mimeType?: string;
    title?: string;
  };
  _agentId?: string;            // Injetado por maria-webhook, julia-webhook, etc.
}
```

**Fluxo de Processamento:**
1. Valida token de segurança (opcional)
2. Ignora `fromMe=true` (exceto comandos de operador)
3. Ignora grupos e broadcasts
4. Detecta comandos de operador (`#ASSUMIR`, `#RESOLVIDO`, `#SAC`)
5. Normaliza telefone (12→13 dígitos BR)
6. Salva mapeamento LID→phone (multi-device)
7. Verifica duplicação de mensagem
8. Transforma payload e encaminha para `sofia-webhook`

**Comandos de Operador Suportados:**
| Comando | Ação | Descrição |
|---------|------|-----------|
| `#ASSUMIR` / `#MEU` / `#TAKEOVER` | Pausa | Operador assume a conversa |
| `#RESOLVIDO` / `#DEVOLVER` / `#SOFIA` | Resume | Devolve para a IA |
| `#SAC` / `#SUPORTE` / `#CLIENTE` | Redirect | Marca como cliente SAC |

**Funções Principais:**
```typescript
function extractTextFromPayload(payload): string
function detectOperatorCommand(text): { command, isPause, isResume }
function detectOperatorCommandV2(text): { command, isPause, isResume, isSAC }
function normalizeIncomingPhone(rawPhone): string
function findConversationByPhoneVariations(supabase, targetPhone, agentIdFromPayload)
async function handleOperatorCommand(supabase, phone, command, logId, agentIdFromPayload, extractedText, chatLid)
```

---

### 2. `sofia-webhook` (3881 linhas)
**URL:** `POST /functions/v1/sofia-webhook`  
**Função:** Processamento principal de IA

```typescript
// PAYLOAD ESPERADO (formato ChatApp/transformado)
interface WebhookPayload {
  data?: MessageData[];
  _agentId?: string;
  _zapiOriginal?: ZApiWebhookPayload;
  _provider?: string;
}

interface MessageData {
  id: string;
  fromMe: boolean;
  fromApi?: boolean;
  side: 'in' | 'out';
  type: string;                // text, voice, image, document
  message?: {
    text?: string;
    caption?: string;
    file?: { link?: string; contentType?: string };
  };
  fromUser?: { id: string; name?: string; phone?: string };
  chat?: { id: string; phone?: string; name?: string; type?: 'private' | 'group' };
  time?: number;
}
```

**Imports Críticos (100+ módulos):**
```typescript
// Pipeline Principal
import { orchestrateMessageBuffer } from '../_shared/message-buffer.ts';
import { executePreLLMHardStops } from '../_shared/pre-llm-hard-stops.ts';
import { processAllFastPaths } from '../_shared/fast-path-handlers.ts';
import { orchestrateLLMFlow } from '../_shared/llm-client.ts';
import { orchestrateRAGSearch } from '../_shared/rag-search-client.ts';
import { applyAllGuards } from '../_shared/llm-guardrails.ts';

// Mídia
import { processMediaMessage } from '../_shared/media-message-processor.ts';
import { transcribeAudio, analyzeImage, analyzePDF } from '../_shared/media-handler.ts';

// Envio
import { sendWhatsAppMessage } from '../_shared/zapi-client.ts';
import { applyFullHumanization } from '../_shared/humanized-latency.ts';

// CRM
import { orchestrateBitrixSyncFlow } from '../_shared/bitrix-sync.ts';
```

**Etapas de Processamento:**
1. Parse do payload (ChatApp ou Legacy)
2. Buffer humanizado (agrupa msgs 4s)
3. Carrega agent config (AI Gym)
4. Hard Stops (bloqueios determinísticos)
5. Fast Paths (bypass LLM)
6. RAG Search (busca conhecimento)
7. LLM Call (Gemini/GPT)
8. Guardrails (validação resposta)
9. Humanização (delay de digitação)
10. Envio Z-API
11. Persistência e CRM sync

---

### 3. `sofia-pipeline` (118 linhas)
**URL:** `POST /functions/v1/sofia-pipeline`  
**Função:** Pipeline V2 experimental

```typescript
// PAYLOAD
{
  phone: string;
  messageId?: string;
  text?: { message?: string };
  conversaId?: string;  // Opcional, resolvido internamente
}
```

**Fluxo Pipeline V2:**
```
INTAKE → DETERMINISTIC_ROUTER → CONTEXT → REASONING → ACTION → VALIDATION → LEARNING
```

---

### 4. Webhooks de Agentes (66 linhas cada)

**maria-webhook, julia-webhook, iago-webhook, jaime-webhook**

Wrappers leves que injetam `_agentId` e encaminham para `z-api-webhook`:

```typescript
// maria-webhook/index.ts
const enrichedBody = { ...body, _agentId: 'maria' };
await fetch(`${SUPABASE_URL}/functions/v1/z-api-webhook`, {
  body: JSON.stringify(enrichedBody),
});
```

---

## 🟢 ENVIO DE MENSAGENS

### 5. `z-api-send-message` (762 linhas)
**URL:** `POST /functions/v1/z-api-send-message`  
**Função:** Envio de mensagens via Z-API com retry

```typescript
// REQUEST
{
  phone: string;              // Telefone (será normalizado)
  message?: string;           // Texto da mensagem
  audioUrl?: string;          // URL de áudio (alternativa)
  conversaId?: string;        // ID da conversa (para tracking)
  agentId?: string;           // Agent (sofia, maria, julia...)
  enableAsyncRetry?: boolean; // Queue para retry async
  skipAntiSpam?: boolean;     // Bypass anti-spam
  
  // Credenciais específicas do agente (opcional)
  zapiInstanceId?: string;
  zapiToken?: string;
  zapiSecurityToken?: string;
}

// RESPONSE
{
  success: boolean;
  data?: any;
  error?: string;
  statusCode?: number;
}
```

**Features:**
- Retry com backoff exponencial (3 tentativas)
- Fallback sem Client-Token em 403
- Sanitização de mensagem (4000 chars max)
- Anti-spam check
- Outbound guard (loop detection)
- Queue para retry assíncrono

**Funções Principais:**
```typescript
async function sendTextMessageWithRetry(phone, message, instanceId, token, securityToken): Promise<SendResult>
async function sendAudioMessageWithRetry(phone, audioUrl, ...): Promise<SendResult>
async function queueForRetry(supabase, phone, message, conversaId, agentId, error, statusCode): Promise<void>
```

---

### 6. `z-api-add-contact`
**URL:** `POST /functions/v1/z-api-add-contact`  
**Função:** Salva contato no WhatsApp do agente

---

## 🔵 INTEGRAÇÃO BITRIX24

### 7. `bitrix24-webhook` (2354 linhas)
**URL:** `POST /functions/v1/bitrix24-webhook`  
**Função:** Recebe eventos do Bitrix24 e gera propostas

```typescript
// PAYLOAD DO BITRIX24 (URL-encoded ou JSON)
interface WebhookPayload {
  event?: string;           // ONCRMLEADUPDATE, ONCRMLEADADD, etc.
  data?: {
    FIELDS?: { ID?: string };
  };
}

// DIAGNOSTIC ENDPOINT
GET /functions/v1/bitrix24-webhook?diagnostic=true

// TEST MODE
POST /functions/v1/bitrix24-webhook?test=true
Body: { "leadId": "1234", "forceProcess": true }
```

**Campos Customizados Mapeados:**
```typescript
const BITRIX_CUSTOM_FIELDS = {
  tarifa: 'UF_CRM_1762440024',
  consumoMedio: 'UF_CRM_1755881740',
  desconto: 'UF_CRM_1755881813',
  fidelidade: 'UF_CRM_1759186547',
  tipoInstalacao: 'UF_CRM_LEAD_1759426797107',
  concessionaria: 'UF_CRM_1758906628',
  valorConta: '', // Carregado dinamicamente
};
```

---

### 8. `bitrix24-sync` 
**URL:** `POST /functions/v1/bitrix24-sync`  
**Função:** Sincroniza proposta com lead Bitrix

---

### 9. `bitrix24-update-lead`
**URL:** `POST /functions/v1/bitrix24-update-lead`  
**Função:** Atualiza campos de lead no Bitrix

---

### 10. `bitrix24-upload-pdf`
**URL:** `POST /functions/v1/bitrix24-upload-pdf`  
**Função:** Faz upload de PDF de proposta para o Bitrix

---

### 11. `bitrix24-get-stages`
**URL:** `POST /functions/v1/bitrix24-get-stages`  
**Função:** Lista estágios do Kanban

---

### 12. `bitrix24-list-fields`
**URL:** `POST /functions/v1/bitrix24-list-fields`  
**Função:** Lista campos customizados de leads

---

### 13. `bitrix24-verify-customer`
**URL:** `POST /functions/v1/bitrix24-verify-customer`  
**Função:** Verifica se lead existe no Bitrix

---

### 14. `bitrix24-force-update-link`
**URL:** `POST /functions/v1/bitrix24-force-update-link`  
**Função:** Força atualização de link de proposta no Bitrix

---

### 15. `bitrix24-deal-webhook`
**URL:** `POST /functions/v1/bitrix24-deal-webhook`  
**Função:** Webhook para eventos de Deal (negócio)

---

### 16. `bitrix24-link-webhook`
**URL:** `POST /functions/v1/bitrix24-link-webhook`  
**Função:** Webhook para link de proposta

---

### 17. `bitrix24-sync-cliente-gd`
**URL:** `POST /functions/v1/bitrix24-sync-cliente-gd`  
**Função:** Sincroniza cliente GD com Bitrix

---

### 18. `bitrix24-update-customer`
**URL:** `POST /functions/v1/bitrix24-update-customer`  
**Função:** Atualiza dados de cliente no Bitrix

---

### 19. `sofia-bitrix-lead`
**URL:** `POST /functions/v1/sofia-bitrix-lead`  
**Função:** Cria lead no Bitrix a partir da Sofia

---

## 🟡 RAG (KNOWLEDGE BASE)

### 20. `rag-search`
**URL:** `POST /functions/v1/rag-search`  
**Função:** Busca semântica na base de conhecimento

```typescript
// REQUEST
{
  query: string;           // Texto de busca
  agentId?: string;        // Filtra por agente
  topK?: number;           // Número de resultados (default: 5)
  minScore?: number;       // Similaridade mínima (default: 0.7)
  categories?: string[];   // Filtrar categorias
}

// RESPONSE
{
  results: Array<{
    id: string;
    content: string;
    similarity: number;
    category: string;
    file_name: string;
    metadata: any;
  }>;
  totalTokens: number;
}
```

---

### 21. `rag-upload`
**URL:** `POST /functions/v1/rag-upload`  
**Função:** Upload de documento para a base RAG

---

### 22. `process-rag-document`
**URL:** `POST /functions/v1/process-rag-document`  
**Função:** Processa documento (chunking + embedding)

---

### 23. `rag-batch-processor`
**URL:** `POST /functions/v1/rag-batch-processor`  
**Função:** Processamento em lote de documentos

---

### 24. `rag-conversation-processor`
**URL:** `POST /functions/v1/rag-conversation-processor`  
**Função:** Processa conversas para aprendizado

---

### 25. `rag-premium-scripts`
**URL:** `POST /functions/v1/rag-premium-scripts`  
**Função:** Scripts premium de vendas

---

### 26. `process-kb-document`
**URL:** `POST /functions/v1/process-kb-document`  
**Função:** Processa documento de Knowledge Base

---

## 🟠 VOZ (VOICE)

### 27. `elevenlabs-tts`
**URL:** `POST /functions/v1/elevenlabs-tts`  
**Função:** Text-to-Speech via ElevenLabs

```typescript
// REQUEST
{
  text: string;           // Texto para sintetizar
  voiceId?: string;       // ID da voz
  agentId?: string;       // Agent config
}

// RESPONSE
{
  audioUrl: string;       // URL do áudio gerado
  duration: number;       // Duração em segundos
}
```

---

### 28. `elevenlabs-conversation-token`
**URL:** `POST /functions/v1/elevenlabs-conversation-token`  
**Função:** Token para conversa em tempo real

---

### 29. `sofia-voice-webhook`
**URL:** `POST /functions/v1/sofia-voice-webhook`  
**Função:** Webhook para chamadas de voz

---

### 30. `sofia-voice-outbound-webhook`
**URL:** `POST /functions/v1/sofia-voice-outbound-webhook`  
**Função:** Webhook para chamadas outbound

---

### 31. `retell-create-outbound-call`
**URL:** `POST /functions/v1/retell-create-outbound-call`  
**Função:** Cria chamada outbound via Retell

---

### 32. `retell-call-webhook`
**URL:** `POST /functions/v1/retell-call-webhook`  
**Função:** Webhook de eventos Retell

---

### 33. `retell-web-call-token`
**URL:** `POST /functions/v1/retell-web-call-token`  
**Função:** Token para chamada web

---

## 🔴 SCHEDULERS (AGENDADORES)

### 34. `chatbot-nudge-scheduler`
**URL:** `POST /functions/v1/chatbot-nudge-scheduler`  
**Função:** Envia nudges de reengajamento

---

### 35. `chatbot-followup-scheduler`
**URL:** `POST /functions/v1/chatbot-followup-scheduler`  
**Função:** Envia follow-ups programados

---

### 36. `pending-task-scheduler`
**URL:** `POST /functions/v1/pending-task-scheduler`  
**Função:** Processa tarefas pendentes

---

### 37. `pending-response-scheduler`
**URL:** `POST /functions/v1/pending-response-scheduler`  
**Função:** Processa respostas pendentes

---

### 38. `message-retry-scheduler`
**URL:** `POST /functions/v1/message-retry-scheduler`  
**Função:** Retenta mensagens falhadas

---

### 39. `stuck-leads-rescue-scheduler`
**URL:** `POST /functions/v1/stuck-leads-rescue-scheduler`  
**Função:** Resgata leads parados

---

### 40. `document-recovery-scheduler`
**URL:** `POST /functions/v1/document-recovery-scheduler`  
**Função:** Recupera documentos pendentes

---

### 41. `proposal-retry-scheduler`
**URL:** `POST /functions/v1/proposal-retry-scheduler`  
**Função:** Retenta geração de propostas

---

### 42. `technical-failure-recovery-scheduler`
**URL:** `POST /functions/v1/technical-failure-recovery-scheduler`  
**Função:** Recupera de falhas técnicas

---

### 43. `auto-learning-scheduler`
**URL:** `POST /functions/v1/auto-learning-scheduler`  
**Função:** Processa aprendizado automático

---

### 44. `operator-commands-poller`
**URL:** `POST /functions/v1/operator-commands-poller`  
**Função:** Processa comandos de operador pendentes

---

## 🟣 ONEDRIVE / STORAGE

### 45. `onedrive-sync`
**URL:** `POST /functions/v1/onedrive-sync`  
**Função:** Sincroniza arquivos com OneDrive

---

### 46. `onedrive-list-folder`
**URL:** `POST /functions/v1/onedrive-list-folder`  
**Função:** Lista arquivos de pasta

---

### 47. `onedrive-create-folder`
**URL:** `POST /functions/v1/onedrive-create-folder`  
**Função:** Cria pasta no OneDrive

---

### 48. `onedrive-get-drive-id`
**URL:** `POST /functions/v1/onedrive-get-drive-id`  
**Função:** Obtém ID do drive

---

### 49. `onedrive-list-site-drives`
**URL:** `POST /functions/v1/onedrive-list-site-drives`  
**Função:** Lista drives do site

---

### 50. `ensure-learning-folders`
**URL:** `POST /functions/v1/ensure-learning-folders`  
**Função:** Cria estrutura de pastas de aprendizado

---

## ⚪ EXTRAÇÃO DE DOCUMENTOS

### 51. `extrair-dados-documentos`
**URL:** `POST /functions/v1/extrair-dados-documentos`  
**Função:** Extrai dados de documentos (faturas, etc.)

```typescript
// REQUEST
{
  documentUrl: string;    // URL do documento
  documentType: string;   // invoice, identity, contract
}

// RESPONSE
{
  dados: {
    nome?: string;
    cpf?: string;
    consumo?: number;
    valor?: number;
    // ... outros campos
  };
  confidence: number;
}
```

---

### 52. `extrair-dados-contrato-social`
**URL:** `POST /functions/v1/extrair-dados-contrato-social`  
**Função:** Extrai dados de contrato social (PJ)

---

## 🔵 PÚBLICOS / SITE

### 53. `public-proposal`
**URL:** `GET /functions/v1/public-proposal?id={publicId}`  
**Função:** Retorna dados de proposta pública

---

### 54. `create-lead-from-site`
**URL:** `POST /functions/v1/create-lead-from-site`  
**Função:** Cria lead a partir do site

```typescript
// REQUEST
{
  nome: string;
  telefone: string;
  email?: string;
  valorConta?: number;
  concessionaria?: string;
  // ... outros campos
}
```

---

### 55. `contract-sent-webhook`
**URL:** `POST /functions/v1/contract-sent-webhook`  
**Função:** Webhook quando contrato é enviado

---

## 🟢 AI GYM / AGENTES

### 56. `agent-source-export`
**URL:** `POST /functions/v1/agent-source-export`  
**Função:** Exporta configuração de agente

---

### 57. `agent-source-upload`
**URL:** `POST /functions/v1/agent-source-upload`  
**Função:** Importa configuração de agente

---

## 🔴 ESTATÍSTICAS

### 58. `sofia-daily-stats`
**URL:** `POST /functions/v1/sofia-daily-stats`  
**Função:** Gera estatísticas diárias

---

### 59. `sofia-weekly-stats`
**URL:** `POST /functions/v1/sofia-weekly-stats`  
**Função:** Gera estatísticas semanais

---

### 60. `sofia-hot-lead-alert`
**URL:** `POST /functions/v1/sofia-hot-lead-alert`  
**Função:** Alerta de lead quente

---

## 🟠 TESTES E DIAGNÓSTICO

### 61. `sofia-regression-tests`
**URL:** `POST /functions/v1/sofia-regression-tests`  
**Função:** Executa testes de regressão

---

### 62. `zapi-credentials-check`
**URL:** `POST /functions/v1/zapi-credentials-check`  
**Função:** Verifica credenciais Z-API

---

## 🔵 APRENDIZADO

### 63. `retroactive-learning-processor`
**URL:** `POST /functions/v1/retroactive-learning-processor`  
**Função:** Processa aprendizado retroativo

---

## ⚪ UTILIDADES

### 64. `proposal-chatbot`
**URL:** `POST /functions/v1/proposal-chatbot`  
**Função:** Chatbot de geração de proposta

---

### 65. `send-notification-email`
**URL:** `POST /functions/v1/send-notification-email`  
**Função:** Envia e-mails de notificação

---

### 66. `cleanup-sofia-audio`
**URL:** `POST /functions/v1/cleanup-sofia-audio`  
**Função:** Limpa áudios antigos

---

### 67. `cleanup-typos`
**URL:** `POST /functions/v1/cleanup-typos`  
**Função:** Limpa typos confirmados

---

### 68. `manage-users`
**URL:** `POST /functions/v1/manage-users`  
**Função:** Gerencia usuários do sistema

---

### 69. `import-cidades`
**URL:** `POST /functions/v1/import-cidades`  
**Função:** Importa dados de cidades

---

### 70. `aneel-tarifas`
**URL:** `POST /functions/v1/aneel-tarifas`  
**Função:** Busca tarifas da ANEEL

---

### 71. `aneel-bandeiras`
**URL:** `POST /functions/v1/aneel-bandeiras`  
**Função:** Busca bandeiras tarifárias

---

## 📊 RESUMO POR CATEGORIA

| Categoria | Quantidade | Descrição |
|-----------|------------|-----------|
| **WhatsApp Webhooks** | 5 | Entry points Z-API |
| **Bitrix24** | 13 | Integração CRM |
| **RAG/KB** | 7 | Knowledge Base |
| **Voice** | 7 | Voz/TTS |
| **Schedulers** | 11 | Agendadores |
| **OneDrive** | 6 | Storage |
| **Extração** | 2 | OCR/AI |
| **Públicos** | 3 | Site/API |
| **AI Gym** | 2 | Agentes |
| **Stats** | 3 | Estatísticas |
| **Testes** | 2 | QA |
| **Utilidades** | 8 | Misc |

---

## 🔒 CONFIGURAÇÕES DE SEGURANÇA

Todas as funções em `supabase/config.toml` têm `verify_jwt = false` para permitir webhooks externos.

A autenticação é feita via:
1. **Client-Token** (Z-API security token)
2. **Authorization Bearer** (Supabase service role key)
3. **Validação de origem** (Bitrix24 domain)

---

## 📝 NOTAS IMPORTANTES

1. **Normalização de Telefone**: Sempre use `normalizePhoneNumber()` de `phone-utils.ts`
2. **Multi-Agent**: Use `_agentId` no payload para rotear para o agente correto
3. **Retry**: `z-api-send-message` tem retry automático com backoff exponencial
4. **Rate Limiting**: Anti-spam implementado em `anti-spam.ts`
5. **Logs**: Todos os webhooks logam em `whatsapp_webhook_events`
