# 🔌 INTEGRAÇÕES EXTERNAS - SOFIA BOT V2

> **Documentação Completa de APIs e Serviços Externos**  
> Total: **8 Integrações Principais** | **15 Secrets Configurados**

---

## 📊 VISÃO GERAL

| Integração | Propósito | Autenticação | Status |
|------------|-----------|--------------|--------|
| **Z-API** | WhatsApp Gateway | Instance ID + Token + Client-Token | ✅ Ativo |
| **Bitrix24** | CRM | Webhook URL (OAuth implícito) | ✅ Ativo |
| **Lovable AI Gateway** | LLM (Gemini/GPT) | Bearer Token | ✅ Ativo |
| **ElevenLabs** | Text-to-Speech | xi-api-key | ✅ Ativo |
| **OpenAI** | TTS Fallback + Embeddings | Bearer Token | ✅ Ativo |
| **Retell AI** | Voice Calls (Inbound/Outbound) | Bearer Token | ✅ Ativo |
| **Microsoft OneDrive** | Sync de Documentos RAG | OAuth 2.0 | ✅ Ativo |
| **Resend** | Email Transacional | API Key | ✅ Ativo |

---

## 🟢 Z-API (WhatsApp Gateway)

### Credenciais
```typescript
// Secrets configurados
ZAPI_INSTANCE_ID     // ID da instância Z-API
ZAPI_TOKEN           // Token da instância
ZAPI_SECURITY_TOKEN  // Client-Token (segurança)
```

### URLs Base
```
https://api.z-api.io/instances/{instanceId}/token/{token}/
```

### Endpoints Utilizados

#### 1. Enviar Mensagem de Texto
```typescript
// POST /send-text
const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

// Headers
{
  'Content-Type': 'application/json',
  'Client-Token': securityToken  // Opcional, mas recomendado
}

// Payload
{
  "phone": "5511999999999",  // Formato E.164 (13 dígitos BR)
  "message": "Olá! Como posso ajudar?"
}

// Response (sucesso)
{
  "zapiCode": "success",
  "messageId": "3EB0XXXXXXXXXXXX",
  "phone": "5511999999999"
}
```

#### 2. Enviar Áudio
```typescript
// POST /send-audio
const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-audio`;

// Payload
{
  "phone": "5511999999999",
  "audio": "data:audio/ogg;base64,{base64Data}",  // ou URL
  "waveform": true  // Exibe como voice message
}
```

#### 3. Download de Mídia
```typescript
// GET (URL do Z-API)
// Usado para baixar áudios/imagens enviados pelo cliente
const audioResponse = await fetch(audioUrl, {
  headers: {
    'Client-Token': securityToken  // Necessário para mídia privada
  },
  redirect: 'follow'
});
```

### Webhook de Entrada (Z-API → Supabase)
```typescript
// URL configurada no painel Z-API:
// POST https://{SUPABASE_URL}/functions/v1/z-api-webhook

// Payload recebido do Z-API
interface ZApiWebhookPayload {
  phone?: string;               // Telefone do cliente
  participantPhone?: string;    // Alternativa ao phone
  chatLid?: string;             // ID de conversa (multi-device)
  connectedPhone?: string;      // Telefone conectado
  messageId?: string;           // ID único da mensagem
  fromMe?: boolean;             // true = mensagem enviada pelo bot
  momment?: number;             // Timestamp em ms
  status?: string;              // Status da mensagem
  chatName?: string;            // Nome do chat
  senderName?: string;          // Nome do remetente
  type?: string;                // text, audio, image, document
  
  // Conteúdo por tipo
  text?: { message?: string };
  audio?: {
    audioUrl?: string;
    mimeType?: string;
  };
  image?: {
    imageUrl?: string;
    caption?: string;
  };
  document?: {
    documentUrl?: string;
    mimeType?: string;
    title?: string;
  };
}
```

### Configurações Dinâmicas (configuracoes_sistema)
```sql
-- Limites e retry
zapi_max_message_length     = 4000
zapi_max_retries            = 3
zapi_retry_delays           = 1000,2000,4000
zapi_retryable_status_codes = 400,429,500,502,503,504
zapi_paused_modes           = paused_for_human,human_takeover,paused,manual
```

### Multi-Agente
Cada agente pode ter suas próprias credenciais Z-API:
```typescript
// Tabela: ai_agents
{
  agent_id: 'sofia',
  zapi_instance_id: 'INSTANCIA_SOFIA',
  zapi_token: 'TOKEN_SOFIA',
  zapi_security_token: 'SECURITY_SOFIA'
}
```

---

## 🔵 BITRIX24 (CRM)

### Credenciais
```typescript
// Configurado em configuracoes_sistema
bitrix24_webhook_url  // URL do webhook: https://{dominio}.bitrix24.com.br/rest/{user_id}/{token}/
```

### Endpoints Utilizados

#### 1. Criar Lead
```typescript
// POST crm.lead.add
const url = `${bitrix24Url}/crm.lead.add`;

// Payload
{
  "fields": {
    "TITLE": "Lead - João Silva",
    "NAME": "João",
    "LAST_NAME": "Silva",
    "PHONE": [{ "VALUE": "+5511999999999", "VALUE_TYPE": "MOBILE" }],
    "EMAIL": [{ "VALUE": "joao@email.com", "VALUE_TYPE": "WORK" }],
    "STATUS_ID": "NEW",
    "SOURCE_ID": "WHATSAPP_SOFIA",
    "ASSIGNED_BY_ID": 123,
    
    // Campos customizados (UF_CRM_*)
    "UF_CRM_1755881740": 350,           // Consumo médio kWh
    "UF_CRM_1762440024": 0.85,          // Tarifa
    "UF_CRM_1755881813": 10,            // Desconto %
    "UF_CRM_LEAD_1759426797107": "ID"   // Tipo instalação (enum ID)
  }
}

// Response
{
  "result": 12345,  // ID do lead criado
  "time": { "duration": 0.05 }
}
```

#### 2. Atualizar Lead
```typescript
// POST crm.lead.update
const url = `${bitrix24Url}/crm.lead.update`;

// Payload
{
  "id": 12345,
  "fields": {
    "STATUS_ID": "UC_9SLRPP",  // Mover para Proposta Inicial
    "UF_CRM_1759186547": 36,   // Fidelidade meses
    "COMMENTS": "Proposta enviada via WhatsApp"
  }
}
```

#### 3. Buscar Lead
```typescript
// POST crm.lead.get
const url = `${bitrix24Url}/crm.lead.get`;

// Payload
{ "id": 12345 }

// Response
{
  "result": {
    "ID": "12345",
    "TITLE": "Lead - João Silva",
    "STATUS_ID": "UC_9SLRPP",
    "PHONE": [{ "VALUE": "+5511999999999" }],
    // ... todos os campos
  }
}
```

#### 4. Listar Campos Customizados
```typescript
// POST crm.lead.userfield.list
// Usado para resolver IDs de enums (distribuidora, tipo instalação)

// Response
{
  "result": [
    {
      "ID": "123",
      "FIELD_NAME": "UF_CRM_1758906628",
      "USER_TYPE_ID": "enumeration",
      "LIST": [
        { "ID": "1", "VALUE": "CEMIG - MG" },
        { "ID": "2", "VALUE": "CPFL Paulista - SP" }
      ]
    }
  ]
}
```

#### 5. Upload de PDF
```typescript
// POST disk.folder.uploadfile
// Seguido de crm.lead.details.configuration.forceCommonScopeForAll

// Anexa PDF de proposta ao lead
```

### Mapeamento de Campos (configuracoes_sistema)
```sql
-- Campos de Lead
bitrix24_field_tarifa              = UF_CRM_1762440024
bitrix24_field_consumo             = UF_CRM_1755881740
bitrix24_field_desconto            = UF_CRM_1755881813
bitrix24_field_fidelidade          = UF_CRM_1759186547
bitrix24_field_tipo_instalacao     = UF_CRM_LEAD_1759426797107
bitrix24_field_concessionaria      = UF_CRM_1758906628
bitrix24_field_valor_conta         = UF_CRM_1759342892

-- Estágios do Funil
bitrix24_stage_novo_lead           = NEW
bitrix24_stage_aguardando_dados    = UC_AGUARDANDO_DADOS
bitrix24_stage_proposta_inicial    = UC_9SLRPP
bitrix24_stage_proposta_definitiva = UC_JENEX5
bitrix24_stage_aguardando_assinatura = UC_AGUARDANDO_ASSINATURA
bitrix24_stage_fechado             = WON
bitrix24_stage_perdido             = LOSE
```

### Webhooks de Entrada (Bitrix → Supabase)
```
ONCRMLEADUPDATE → /functions/v1/bitrix24-webhook     (gera proposta)
ONCRMLEADUPDATE → /functions/v1/bitrix24-link-webhook (envia link via WhatsApp)
ONCRMDEALADD    → /functions/v1/bitrix24-deal-webhook (contrato assinado)
```

---

## 🟣 LOVABLE AI GATEWAY (LLM)

### Credenciais
```typescript
// Secret automático (não editável)
LOVABLE_API_KEY  // Chave gerenciada pelo Lovable
```

### URL Base
```
https://ai.gateway.lovable.dev/v1/chat/completions
```

### Modelos Disponíveis
```typescript
const AVAILABLE_MODELS = [
  // Gemini (primários)
  'google/gemini-3-flash-preview',  // Recomendado: rápido + barato
  'google/gemini-2.5-flash',        // Fallback
  'google/gemini-2.5-pro',          // Premium: contexto grande
  
  // OpenAI (fallback)
  'openai/gpt-5-mini',              // Fallback rápido
  'openai/gpt-5',                   // Premium
];
```

### Request Padrão
```typescript
// POST /v1/chat/completions
const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'google/gemini-3-flash-preview',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
      // ... histórico
    ],
    temperature: 0.7,
    max_tokens: 500,
  }),
});

// Response
{
  "id": "chatcmpl-xxx",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Resposta da IA..."
    }
  }],
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 80,
    "total_tokens": 230
  }
}
```

### Transcription (Áudio)
```typescript
// Usando Gemini para transcrição de áudio
{
  model: 'google/gemini-2.5-flash',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Transcreva este áudio...' },
      {
        type: 'file',
        file: {
          file_data: `data:audio/ogg;base64,${audioBase64}`,
        },
      },
    ],
  }],
  max_completion_tokens: 1000,
}
```

### Análise de Imagem
```typescript
// Usando Gemini para análise de fatura
{
  model: 'google/gemini-2.5-flash',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Analise esta fatura de energia...' },
      {
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${imageBase64}`,
        },
      },
    ],
  }],
  max_completion_tokens: 1500,
}
```

### Configurações Dinâmicas
```sql
-- configuracoes_sistema
llm_default_models        = google/gemini-3-flash-preview,google/gemini-2.5-flash
ai_gateway_url            = https://ai.gateway.lovable.dev/v1/chat/completions
llm_default_temperature   = 0.7
llm_default_max_tokens    = 400
llm_default_timeout_ms    = 30000
llm_token_char_ratio      = 4
```

---

## 🔴 ELEVENLABS (Text-to-Speech)

### Credenciais
```typescript
ELEVENLABS_API_KEY  // Gerenciado via connector
```

### URL Base
```
https://api.elevenlabs.io/v1/
```

### Gerar Áudio
```typescript
// POST /text-to-speech/{voice_id}
const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'xi-api-key': ELEVENLABS_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: "Olá, como posso ajudar?",
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.3,
      use_speaker_boost: true,
    },
  }),
});

// Response: ArrayBuffer (audio/mpeg)
```

### Configurações
```sql
-- configuracoes_sistema
tts_default_voice_id           = EXAVITQu4vr4xnSDxMaL  -- Sarah (padrão)
tts_elevenlabs_output_format   = mp3_44100_128
tts_elevenlabs_primary_model   = eleven_multilingual_v2
tts_elevenlabs_turbo_model     = eleven_turbo_v2_5
tts_stability                  = 0.5
tts_similarity_boost           = 0.75
tts_style                      = 0.3

-- Fallback automático
tts_fallback_threshold         = 2
tts_fallback_window_minutes    = 30
```

### Fallback para OpenAI
```typescript
// Ativado automaticamente após tts_fallback_threshold falhas

// POST https://api.openai.com/v1/audio/speech
{
  model: 'tts-1',
  input: "Texto para sintetizar",
  voice: 'nova',
  response_format: 'mp3',
}
```

---

## 🟠 RETELL AI (Voice Calls)

### Credenciais
```typescript
RETELL_API_KEY  // API key principal
SOFIA_VOICE_ID  // ID da voz customizada
```

### URL Base
```
https://api.retellai.com/v2/
```

### Criar Chamada Outbound
```typescript
// POST /create-phone-call
const response = await fetch('https://api.retellai.com/v2/create-phone-call', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${RETELL_API_KEY}`,
  },
  body: JSON.stringify({
    from_number: '+5511999999999',
    to_number: '+5511888888888',
    override_agent_id: agentId,
    retell_llm_dynamic_variables: {
      customer_name: 'João',
      customer_phone: '5511888888888',
      last_discount: 12,
      greeting_template: 'Oi {nome}, aqui é a sofIA da COESA!',
      queue_id: 'uuid-da-fila',
    },
    metadata: {
      queue_id: 'uuid',
      conversation_id: 'uuid',
    },
  }),
});

// Response
{
  "call_id": "call_xxx",
  "agent_id": "agent_xxx",
  "status": "created"
}
```

### Webhook de Chamada
```typescript
// POST /functions/v1/sofia-voice-webhook (inbound)
// POST /functions/v1/sofia-voice-outbound-webhook (outbound)

// Header de verificação
'x-retell-signature': signature

// Payload
{
  "call": {
    "call_id": "call_xxx",
    "from_number": "+5511999999999",
    "to_number": "+5511888888888",
    "status": "ended",
    "duration_seconds": 120
  },
  "transcript": [
    { "role": "agent", "content": "Olá, tudo bem?" },
    { "role": "user", "content": "Tudo sim, obrigado." }
  ],
  "call_analysis": {
    "summary": "Cliente interessado em proposta",
    "sentiment": "positive"
  }
}
```

---

## 🔵 MICROSOFT ONEDRIVE (Documentos RAG)

### Credenciais (OAuth 2.0)
```typescript
MICROSOFT_CLIENT_ID      // App registration ID
MICROSOFT_CLIENT_SECRET  // App secret
MICROSOFT_TENANT_ID      // Tenant ID
```

### Fluxo de Autenticação
```typescript
// 1. Obter token de acesso (Client Credentials)
const tokenResponse = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  }
);

const { access_token } = await tokenResponse.json();
```

### Endpoints Utilizados
```typescript
// Listar arquivos de pasta
GET https://graph.microsoft.com/v1.0/drives/{driveId}/items/{folderId}/children

// Baixar arquivo
GET https://graph.microsoft.com/v1.0/drives/{driveId}/items/{itemId}/content

// Criar pasta
POST https://graph.microsoft.com/v1.0/drives/{driveId}/items/{parentId}/children
{
  "name": "Nova Pasta",
  "@microsoft.graph.conflictBehavior": "rename",
  "folder": {}
}
```

### Sync de Documentos
```sql
-- Fila de sincronização: rag_sync_queue
-- Logs: rag_sync_logs
-- Documentos processados: rag_documents
```

---

## 🟢 RESEND (Email)

### Credenciais
```typescript
RESEND_API_KEY  // API key
```

### URL Base
```
https://api.resend.com/
```

### Enviar Email
```typescript
// POST /emails
const response = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: 'COESA Energia <noreply@coesaenergia.com.br>',
    to: ['admin@coesaenergia.com.br'],
    subject: '⚠️ Alerta: Áudio Desativado',
    html: '<p>O envio de áudio foi desativado automaticamente...</p>',
  }),
});
```

### Uso no Sistema
- Alertas de sistema (ElevenLabs quota, falhas críticas)
- Notificações de metas atingidas
- Relatórios semanais/diários

---

## 🔐 RESUMO DE SECRETS

| Secret | Propósito | Gerenciado Por |
|--------|-----------|----------------|
| `ZAPI_INSTANCE_ID` | ID da instância Z-API | Manual |
| `ZAPI_TOKEN` | Token de autenticação | Manual |
| `ZAPI_SECURITY_TOKEN` | Client-Token segurança | Manual |
| `LOVABLE_API_KEY` | AI Gateway | Automático (Lovable) |
| `ELEVENLABS_API_KEY` | TTS | Connector |
| `OPENAI_API_KEY` | TTS Fallback + Embeddings | Manual |
| `RETELL_API_KEY` | Voice Calls | Manual |
| `SOFIA_VOICE_ID` | ID da voz Retell | Manual |
| `MICROSOFT_CLIENT_ID` | OneDrive OAuth | Manual |
| `MICROSOFT_CLIENT_SECRET` | OneDrive OAuth | Manual |
| `MICROSOFT_TENANT_ID` | OneDrive OAuth | Manual |
| `RESEND_API_KEY` | Email | Manual |
| `N8N_WEBHOOK_TOKEN` | Integração N8N | Manual |
| `WHATSAPP_ACCESS_TOKEN` | Meta API (backup) | Manual |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta API (backup) | Manual |

---

## 🔄 FLUXO DE DADOS COMPLETO

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ENTRADA DE MENSAGEM                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Z-API WEBHOOK                                                               │
│  • Recebe payload JSON                                                       │
│  • Valida Client-Token                                                       │
│  • Normaliza telefone (12→13 dígitos)                                        │
│  • Detecta comandos de operador (#ASSUMIR, #RESOLVIDO)                       │
│  • Injeta agent_id e encaminha para sofia-webhook                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  LOVABLE AI GATEWAY                                                          │
│  • Transcrição de áudio (Gemini)                                             │
│  • Análise de imagem/PDF (Gemini)                                            │
│  • Geração de resposta (Gemini/GPT com fallback)                             │
│  • RAG search para contexto                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ELEVENLABS / OPENAI TTS                                                     │
│  • Gera áudio da resposta (se habilitado)                                    │
│  • Fallback automático para OpenAI                                           │
│  • Auto-disable após N falhas                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Z-API SEND                                                                  │
│  • Envia texto/áudio com retry exponencial                                   │
│  • Sanitiza mensagem (4000 chars max)                                        │
│  • Delay humanizado (1-3s)                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  BITRIX24 SYNC                                                               │
│  • Cria/atualiza lead                                                        │
│  • Resolve enum IDs dinamicamente                                            │
│  • Move no funil conforme status                                             │
│  • Upload de PDF de proposta                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 ARMAZENAMENTO E SINCRONIZAÇÃO DE LEADS

### Arquitetura de Dados

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUXO DE DADOS DO LEAD                                    │
└─────────────────────────────────────────────────────────────────────────────┘

WhatsApp (Mensagem)
        │
        ▼
┌───────────────────┐
│ data-extraction.ts│ ← Extrai: nome, email, CPF, valor, distribuidora
└────────┬──────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌─────────┐ ┌─────────────────┐
│ Supabase│ │    Bitrix24     │
│ (local) │ │   (CRM externo) │
└─────────┘ └─────────────────┘
     │               │
     │               │
     ▼               ▼
chatbot_conversas   crm.lead.add/update
     │
     ▼
dados_coletados (JSON)
```

### Armazenamento Local (Supabase)

#### Tabela: `chatbot_conversas`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID | Identificador único |
| `cliente_telefone` | TEXT | Telefone (5511999999999) |
| `cliente_nome` | TEXT | Nome extraído |
| `cliente_email` | TEXT | Email extraído |
| `bitrix24_lead_id` | TEXT | ID do lead no Bitrix24 |
| `bitrix24_stage` | TEXT | Estágio atual (ex: UC_9SLRPP) |
| `dados_coletados` | JSONB | Todos os dados extraídos |
| `proposta_id` | UUID | FK para propostas_assinantes |
| `fsm_expected_field` | TEXT | Campo aguardando coleta |

#### Estrutura `dados_coletados`

```typescript
interface DadosColetados {
  // Identificação
  nome?: string;
  email?: string;
  cpf?: string;
  cnpj?: string;
  
  // Localização
  endereco?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  
  // Conta de Energia
  valorFatura?: number;       // R$
  consumo?: number;           // kWh
  distribuidora?: string;     // Nome normalizado
  tipoInstalacao?: string;    // monofasico/bifasico/trifasico
  
  // Metadados
  _extractedAt?: string;
  _confidence?: number;
}
```

### Sincronização com Bitrix24

#### Fluxo Outbound (Supabase → Bitrix)

```typescript
// 1. Sofia coleta dados via WhatsApp
// 2. Dados salvos em chatbot_conversas.dados_coletados
// 3. syncToBitrix() é chamado

async function syncToBitrix(conversaId, phone, dadosColetados) {
  // Invoca Edge Function
  const result = await supabase.functions.invoke('sofia-bitrix-lead', {
    body: { conversaId, phone, dadosColetados }
  });
  
  // Retorna leadId criado/atualizado
  return result.data.leadId;
}
```

#### Mapeamento de Campos

```sql
-- configuracoes_sistema (chaves dinâmicas)
bitrix24_custom_field_cpf          → UF_CRM_CPF
bitrix24_custom_field_cnpj         → UF_CRM_CNPJ
bitrix24_custom_field_valor_fatura → UF_CRM_VALOR_FATURA
bitrix24_custom_field_distribuidora → UF_CRM_DISTRIBUIDORA
bitrix24_custom_field_tipo_instalacao → UF_CRM_TIPO_INSTALACAO
```

#### Resolução de Enums (Dropdowns)

```typescript
// bitrix-client.ts
async function resolveBitrixEnumId(fieldName, desiredValue) {
  // 1. Busca opções do campo (cacheado)
  const options = await fetchFieldOptions(bitrix24Url, fieldName);
  
  // 2. Normaliza valor (ex: 'CEMIG' → 'CEMIG - MG')
  const normalized = normalizarDistribuidoraParaBitrix(desiredValue);
  
  // 3. Retorna ID numérico
  return options[normalized]; // ex: '123'
}
```

#### Fluxo Inbound (Bitrix → Supabase)

```
ONCRMLEADUPDATE (Bitrix Webhook)
        │
        ▼
bitrix24-webhook (Edge Function)
        │
        ├─► Detecta mudança de estágio
        │
        ├─► Se estágio = Proposta Inicial:
        │       └─► Gera proposta
        │       └─► Atualiza chatbot_conversas.proposta_id
        │
        └─► Dispara bitrix24-link-webhook
                └─► Envia link via WhatsApp
```

### Guardrails de Sincronização

| Guardrail | Descrição |
|-----------|-----------|
| **Email obrigatório** | Não gera proposta sem email válido |
| **Deduplicação** | Cooldown de 1h para reenvio de links |
| **Retry Queue** | 3 tentativas com backoff (30s, 60s, 120s) |
| **Sync Locks** | Previne processamento duplicado |

### Micro CRM (Backup Local)

```typescript
// crm-sync.ts - Mantém cópia local dos leads
await syncContactToCRM(supabase, {
  nome: dadosColetados.nome,
  telefone: phone,
  email: dadosColetados.email,
  bitrixLeadId: leadId,
  bitrixStage: currentStage,
});

// Tabela: crm_contatos
// Origem: 'whatsapp_sofia'
```

---

**Última atualização:** 2026-02-02  
**Total de integrações:** 8  
**Total de secrets:** 15
