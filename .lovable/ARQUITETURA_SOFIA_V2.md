# 🏗️ ARQUITETURA COMPLETA - SOFIA BOT V2

> **Documento de Auditoria Técnica**
> Atualizado em: 2026-02-02

---

## 📬 FLUXO COMPLETO DE MENSAGENS WHATSAPP

### Diagrama de Sequência

```
┌─────────┐     ┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│ Cliente │     │  Z-API   │     │ z-api-webhook│     │sofia-webhook │     │    LLM      │
│WhatsApp │     │ Provider │     │ (Roteador)   │     │ (Principal)  │     │Gemini/GPT   │
└────┬────┘     └────┬─────┘     └──────┬───────┘     └──────┬───────┘     └──────┬──────┘
     │               │                  │                    │                    │
     │ 1. Envia msg  │                  │                    │                    │
     │──────────────>│                  │                    │                    │
     │               │                  │                    │                    │
     │               │ 2. Webhook POST  │                    │                    │
     │               │─────────────────>│                    │                    │
     │               │                  │                    │                    │
     │               │                  │ 3. Detecta agente  │                    │
     │               │                  │ & Comando operador │                    │
     │               │                  │                    │                    │
     │               │                  │ 4. Repassa payload │                    │
     │               │                  │───────────────────>│                    │
     │               │                  │                    │                    │
     │               │                  │                    │ 5. Buffer humano   │
     │               │                  │                    │ (agrupa msgs 4s)   │
     │               │                  │                    │                    │
     │               │                  │                    │ 6. Media Process   │
     │               │                  │                    │ (áudio→texto)      │
     │               │                  │                    │                    │
     │               │                  │                    │ 7. Hard Stops      │
     │               │                  │                    │ (regras determ.)   │
     │               │                  │                    │                    │
     │               │                  │                    │ 8. RAG Search      │
     │               │                  │                    │────────┐           │
     │               │                  │                    │<───────┘           │
     │               │                  │                    │                    │
     │               │                  │                    │ 9. Chama LLM       │
     │               │                  │                    │───────────────────>│
     │               │                  │                    │                    │
     │               │                  │                    │ 10. Resposta       │
     │               │                  │                    │<───────────────────│
     │               │                  │                    │                    │
     │               │                  │                    │ 11. Guardrails     │
     │               │                  │                    │ 12. Sync CRM       │
     │               │                  │                    │ 13. Save DB        │
     │               │                  │                    │                    │
     │               │ 14. Envia msg    │                    │                    │
     │               │<─────────────────│────────────────────│                    │
     │               │                  │                    │                    │
     │ 15. Recebe    │                  │                    │                    │
     │<──────────────│                  │                    │                    │
```

### Componentes Envolvidos (Ordem de Execução)

#### 🔵 ETAPA 1: RECEBIMENTO (Z-API → z-api-webhook)

| # | Componente | Arquivo | Função |
|---|------------|---------|--------|
| 1 | **Z-API Provider** | Externo | Recebe mensagem do WhatsApp e envia webhook |
| 2 | **z-api-webhook** | `supabase/functions/z-api-webhook/index.ts` | Entry point - recebe payload JSON |

**Detalhes do z-api-webhook:**
```typescript
// Extrai texto do payload (múltiplos campos possíveis)
function extractTextFromPayload(payload): string

// Normaliza telefone (12 → 13 dígitos BR)
function normalizeIncomingPhone(rawPhone): string

// Detecta comandos de operador (#ASSUMIR, #RESOLVIDO, #SAC)
function detectOperatorCommandV2(text): { command, isPause, isResume, isSAC }

// Busca conversa por variações de telefone
async function findConversationByPhoneVariations(supabase, phone, agentId)

// Processa comandos de operador (takeover/return)
async function handleOperatorCommand(supabase, phone, command, ...)
```

**Ações executadas:**
- Valida token de segurança
- Ignora mensagens `fromMe` (próprio bot)
- Ignora grupos e broadcasts
- Detecta e processa comandos de operador
- Redireciona para `sofia-webhook` (ou maria/julia/iago/jaime)

---

#### 🟢 ETAPA 2: PROCESSAMENTO PRINCIPAL (sofia-webhook)

| # | Componente | Arquivo | Função |
|---|------------|---------|--------|
| 3 | **sofia-webhook** | `supabase/functions/sofia-webhook/index.ts` | Webhook principal (3881 linhas) |

**Imports Críticos (100+ módulos):**
```typescript
// Prompt e Sistema
import { buildSystemPrompt } from '../_shared/system-prompt-builder.ts';
import { loadMessageTemplates } from '../_shared/message-templates.ts';

// Mídia
import { processMediaMessage } from '../_shared/media-message-processor.ts';
import { transcribeAudio, analyzeImage, analyzePDF } from '../_shared/media-handler.ts';

// Buffer Humanizado
import { orchestrateMessageBuffer } from '../_shared/message-buffer.ts';
import { applyFullHumanization } from '../_shared/humanized-latency.ts';

// Detecção e Fluxos
import { executePreLLMHardStops } from '../_shared/pre-llm-hard-stops.ts';
import { processAllFastPaths } from '../_shared/fast-path-handlers.ts';
import { handleTriageFlow } from '../_shared/triage-flow.ts';
import { buildFSMContext, executeFSMCheck } from '../_shared/guided-script-fsm.ts';

// LLM e RAG
import { orchestrateLLMFlow } from '../_shared/llm-client.ts';
import { orchestrateRAGSearch } from '../_shared/rag-search-client.ts';

// Guardrails
import { applyAllGuards } from '../_shared/llm-guardrails.ts';
import { processAIResponse } from '../_shared/response-processing.ts';

// Integrações
import { orchestrateBitrixSyncFlow } from '../_shared/bitrix-sync.ts';
import { sendWhatsAppMessage } from '../_shared/zapi-client.ts';

// Operador
import { isOperatorCommand, executeTakeoverInChat } from '../_shared/operator-commands.ts';
```

---

#### 🟡 ETAPA 3: SUB-FLUXOS NO SOFIA-WEBHOOK

##### 3.1 Buffer Humanizado (Phase 90)
**Arquivo:** `_shared/message-buffer.ts`

```
Cliente: "Oi"           → Buffer acumula
Cliente: "Tudo bem?"    → Buffer acumula  
Cliente: "Quero energia"→ Buffer acumula
[4 segundos de silêncio]
Buffer libera: "Oi Tudo bem? Quero energia" → Processa ÚNICO
```

**Funções:**
- `orchestrateMessageBuffer()` - Orquestra todo o fluxo
- `addToBuffer()` - Adiciona msg ao buffer (RPC)
- `checkBufferReady()` - Verifica janela de silêncio
- `claimBuffer()` - Lock atômico para processar
- `mergeBufferedMessages()` - Une msgs fragmentadas
- `clearBuffer()` - Limpa após processamento

##### 3.2 Processamento de Mídia
**Arquivo:** `_shared/media-message-processor.ts`

| Tipo | Função | Descrição |
|------|--------|-----------|
| Áudio | `transcribeAudio()` | Gemini/Whisper transcrição |
| Imagem | `analyzeImage()` | Gemini Vision análise |
| PDF | `analyzePDF()` | Extração de dados fatura |

##### 3.3 Pre-LLM Hard Stops
**Arquivo:** `_shared/pre-llm-hard-stops.ts`

Regras determinísticas que BLOQUEIAM a LLM:
- Conversa pausada para humano
- Lead descartado
- Fora de horário comercial
- Rate limiting excedido
- Comandos de operador

##### 3.4 Fast Paths (Bypass LLM)
**Arquivo:** `_shared/fast-path-handlers.ts`

Respostas instantâneas SEM chamar LLM:
- Perguntas sobre custo ("Tem algum custo?")
- Modelo ganha-ganha
- Validade do desconto
- Explicação CIP/taxas

##### 3.5 FSM (Máquina de Estados)
**Arquivo:** `_shared/guided-script-fsm.ts`

```
TRIAGEM → IDENTIFICACAO → COLETA_DADOS → SIMULACAO 
    → PROPOSTA → DOCUMENTOS → CONTRATO → FECHADO
```

##### 3.6 RAG Search
**Arquivo:** `_shared/rag-search-client.ts`

```typescript
// Busca semântica na base de conhecimento
const ragResult = await orchestrateRAGSearch({
  query: messageText,
  agentId: 'sofia',
  topK: 5,
  minScore: 0.7
});
// Injeta contexto relevante no prompt do sistema
```

##### 3.7 LLM Call
**Arquivo:** `_shared/llm-client.ts`

```typescript
// Chama LLM com fallback automático
const llmResult = await orchestrateLLMFlow({
  systemPrompt,
  history,
  mediaContext,
  agentPersona,
  apiKey: LOVABLE_API_KEY
});
// Models: gemini-3-flash-preview → gemini-2.5-flash → gpt-5-mini
```

##### 3.8 Guardrails (Pós-LLM)
**Arquivo:** `_shared/llm-guardrails.ts`

Validações na resposta da IA:
- Remove menções a concorrentes
- Substitui placeholders não resolvidos
- Bloqueia promessas não autorizadas
- Corrige informações incorretas

##### 3.9 Response Processing
**Arquivo:** `_shared/response-processing.ts`

- Anexa link de proposta se prometido
- Remove formatação markdown excessiva
- Trunca se muito longo

---

#### 🔴 ETAPA 4: ENVIO DA RESPOSTA

| # | Componente | Arquivo | Função |
|---|------------|---------|--------|
| 4 | **Humanized Latency** | `_shared/humanized-latency.ts` | Simula digitação humana |
| 5 | **Z-API Client** | `_shared/zapi-client.ts` | Envia mensagem via API |

**Fluxo de envio:**
```typescript
// 1. Calcula delay humanizado (50-200ms por caractere)
const delay = applyFullHumanization(response.length);

// 2. Envia indicador de "digitando..."
await sendTypingIndicatorWithAgent(phone, agentId);

// 3. Aguarda delay
await new Promise(r => setTimeout(r, delay));

// 4. Envia mensagem
await sendWhatsAppMessage(phone, response, credentials);

// 5. Salva no banco
await supabase.from('chatbot_mensagens').insert({
  conversa_id, role: 'assistant', content: response
});
```

---

#### 🟣 ETAPA 5: PERSISTÊNCIA E SYNC

| # | Componente | Arquivo | Função |
|---|------------|---------|--------|
| 6 | **Conversation Update** | `_shared/conversation-update.ts` | Atualiza metadados |
| 7 | **Bitrix Sync** | `_shared/bitrix-sync.ts` | Sincroniza com CRM |
| 8 | **Data Persistence** | `_shared/data-persistence.ts` | Salva dados extraídos |
| 9 | **Learning** | `_shared/continuous-improvement.ts` | Avalia e aprende |

---

### Tabelas Envolvidas no Fluxo

| Tabela | Operação | Descrição |
|--------|----------|-----------|
| `whatsapp_webhook_events` | INSERT | Log do webhook recebido |
| `message_buffers` | INSERT/UPDATE | Buffer de mensagens |
| `chatbot_conversas` | SELECT/UPDATE | Dados da conversa |
| `chatbot_mensagens` | INSERT | Histórico de mensagens |
| `rag_chunks` | SELECT | Busca RAG |
| `working_memory` | SELECT/INSERT | Memória de sessão |
| `rule_memory` | SELECT | Regras do agente |
| `configuracoes_sistema` | SELECT | Configurações |
| `bitrix24_sync_logs` | INSERT | Log de sync CRM |

---

### Pipeline V2 (Alternativo/Experimental)

Quando `pipeline_v2_enabled=true`, o fluxo usa:

```
INTAKE → DETERMINISTIC_ROUTER → CONTEXT → REASONING → ACTION → VALIDATION → LEARNING
```

| Stage | Arquivo | Descrição |
|-------|---------|-----------|
| Intake | `pipeline/intake.ts` | Normaliza entrada |
| Router | `pipeline/deterministic-router.ts` | Bypass LLM para coleta |
| Context | `pipeline/context.ts` | Carrega memória |
| Reasoning | `pipeline/reasoning.ts` | Decisão via LLM |
| Action | `pipeline/action.ts` | Executa tool calls |
| Validation | `pipeline/validation.ts` | Guardrails |
| Learning | `pipeline/learning.ts` | Persistência |

---

### Métricas de Performance

| Etapa | Tempo Típico | Timeout |
|-------|--------------|---------|
| z-api-webhook | 50-100ms | 30s |
| Buffer wait | 4000ms | 5s |
| Media transcription | 2-5s | 30s |
| RAG search | 100-500ms | 10s |
| LLM call | 1-3s | 30s |
| Guardrails | 50-100ms | - |
| Z-API send | 100-300ms | 10s |
| **TOTAL** | 3-8s | - |

---
> Gerado em: 2026-02-02
> Projeto: COESA Energia - Sistema de Automação Comercial

---

## 📊 VISÃO GERAL

| Métrica | Valor |
|---------|-------|
| **Tabelas no Banco** | 95 |
| **Edge Functions** | 74 |
| **Módulos Compartilhados** | 73 |
| **Páginas Frontend** | 23 |
| **Componentes React** | 100+ |
| **Hooks Customizados** | 24 |

---

## 🗂️ ESTRUTURA DE ARQUIVOS

```
📁 COESA-SOFIA-BOT/
│
├── 📁 src/                          # Frontend React
│   ├── 📁 pages/                    # 23 páginas
│   │   ├── Index.tsx                # Landing page pública
│   │   ├── Auth.tsx                 # Autenticação
│   │   ├── Dashboard.tsx            # Painel principal
│   │   ├── Admin.tsx                # Administração
│   │   ├── AIGym.tsx                # Central de Agentes IA
│   │   ├── AgentSettings.tsx        # Config. individual do agente
│   │   ├── Assinantes.tsx           # Propostas PF
│   │   ├── AssinantesClienteGD.tsx  # Propostas Cliente GD
│   │   ├── AssinantesIniciais.tsx   # Propostas iniciais
│   │   ├── CRM.tsx                  # Integração Bitrix24
│   │   ├── Configuracoes.tsx        # Configurações do sistema
│   │   ├── DetectionPatterns.tsx    # Padrões de detecção IA
│   │   ├── FluxoCaixa.tsx           # Fluxo de caixa
│   │   ├── Historico.tsx            # Histórico de conversas
│   │   ├── ProposalTemplateEditor.tsx # Editor de templates
│   │   ├── PropostaPublica.tsx      # Proposta pública (cliente)
│   │   ├── PropostaPublicaRedirect.tsx # Redirecionamento
│   │   ├── RAGDashboard.tsx         # Dashboard RAG/KB
│   │   ├── SolicitarPropostaDefinitiva.tsx # Upload docs
│   │   ├── Treinamento.tsx          # Treinamento da IA
│   │   ├── Usineiros.tsx            # Gestão usineiros
│   │   └── WhatsApp.tsx             # Painel WhatsApp/Sofia
│   │
│   ├── 📁 components/               # 100+ componentes
│   │   ├── 📁 admin/                # Componentes administrativos
│   │   │   ├── ActivityLog.tsx
│   │   │   ├── AdminNotifications.tsx
│   │   │   ├── ChatbotAnalytics.tsx
│   │   │   ├── CreateUserDialog.tsx
│   │   │   ├── DistribuidorasManager.tsx
│   │   │   ├── DocumentMetrics.tsx
│   │   │   ├── EmployeePerformance.tsx
│   │   │   ├── EmployeeRanking.tsx
│   │   │   ├── GoalsProgress.tsx
│   │   │   ├── MonthlyComparison.tsx
│   │   │   ├── PerformanceCharts.tsx
│   │   │   ├── RecurringErrorsPanel.tsx
│   │   │   ├── SetGoalsDialog.tsx
│   │   │   ├── UserStatsCard.tsx
│   │   │   └── UsersList.tsx
│   │   │
│   │   ├── 📁 ai-gym/               # Central de Agentes
│   │   │   ├── AgentCard.tsx
│   │   │   ├── AgentCategorySidebar.tsx
│   │   │   ├── AgentDetectionPatterns.tsx
│   │   │   ├── AgentEditor.tsx
│   │   │   ├── AgentFlowsInsights.tsx
│   │   │   ├── AgentMetrics.tsx
│   │   │   ├── AgentRAGMetrics.tsx
│   │   │   ├── AgentSecretsManager.tsx
│   │   │   ├── AgentSimulator.tsx
│   │   │   ├── AgentTestRunner.tsx
│   │   │   ├── AgentToolsManager.tsx
│   │   │   ├── AgentTriageConfig.tsx
│   │   │   ├── AgentVersionHistory.tsx
│   │   │   ├── AgentsGrid.tsx
│   │   │   ├── AgentsTable.tsx
│   │   │   ├── CollectionRulesEditor.tsx
│   │   │   ├── CreateAgentDialog.tsx
│   │   │   ├── ImportAgentDialog.tsx
│   │   │   ├── KnowledgeBaseManager.tsx
│   │   │   ├── LLMModelSelector.tsx
│   │   │   ├── ManualCallTrigger.tsx
│   │   │   ├── OutboundCallMetrics.tsx
│   │   │   ├── OutboundCallQueue.tsx
│   │   │   ├── PatternVersionHistory.tsx
│   │   │   ├── PromptModulesEditor.tsx
│   │   │   ├── SortableAgentCard.tsx
│   │   │   ├── VoiceInboundConfig.tsx
│   │   │   ├── VoiceModeConfig.tsx
│   │   │   ├── VoiceOutboundConfig.tsx
│   │   │   ├── VoiceSimulator.tsx
│   │   │   ├── ZApiCredentialsConfig.tsx
│   │   │   └── ZApiIntegrationDocs.tsx
│   │   │
│   │   ├── 📁 chat/                 # Chat/Chatbot
│   │   │   ├── ChatInput.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   └── ProposalChatbot.tsx
│   │   │
│   │   ├── 📁 crm/                  # Integração CRM
│   │   │   ├── BitrixLogDialog.tsx
│   │   │   ├── DocumentsCell.tsx
│   │   │   ├── MissingProposalAlert.tsx
│   │   │   ├── ReprocessBitrixBulkButton.tsx
│   │   │   └── ReprocessBitrixLeadDialog.tsx
│   │   │
│   │   ├── 📁 dashboard/            # Dashboard pessoal
│   │   │   └── PersonalDashboard.tsx
│   │   │
│   │   ├── 📁 home/                 # Landing page
│   │   │   ├── AboutSection.tsx
│   │   │   ├── BenefitsSection.tsx
│   │   │   ├── CalculatorSection.tsx
│   │   │   ├── CTASection.tsx
│   │   │   ├── EconomyCalculator.tsx
│   │   │   ├── FAQSection.tsx
│   │   │   ├── HeroSection.tsx
│   │   │   ├── HomeFooter.tsx
│   │   │   ├── HomeNavbar.tsx
│   │   │   ├── HowItWorksSection.tsx
│   │   │   ├── PlansSection.tsx
│   │   │   ├── SimulationForm.tsx
│   │   │   ├── StatsCounter.tsx
│   │   │   ├── ThankYouModal.tsx
│   │   │   ├── WhatsAppFloatingButton.tsx
│   │   │   └── WhyChooseSection.tsx
│   │   │
│   │   ├── 📁 pdf/                  # Geração de PDFs
│   │   │   ├── PDFPreviewNew.tsx
│   │   │   ├── PropostaAssinantePDF.tsx
│   │   │   └── PropostaClienteGDPDF.tsx
│   │   │
│   │   ├── 📁 proposal-editor/      # Editor de propostas
│   │   │   ├── CanvasElement.tsx
│   │   │   ├── DraggableWidget.tsx
│   │   │   ├── EditorCanvas.tsx
│   │   │   ├── EditorHeader.tsx
│   │   │   ├── ElementToolbar.tsx
│   │   │   ├── PageNavigator.tsx
│   │   │   ├── PropertiesPanel.tsx
│   │   │   ├── TemplateManager.tsx
│   │   │   ├── TemplatePreview.tsx
│   │   │   └── WidgetsPanel.tsx
│   │   │
│   │   ├── 📁 rag/                  # RAG/Knowledge Base
│   │   │   ├── RAGChunkSearch.tsx
│   │   │   ├── RAGDocumentsList.tsx
│   │   │   ├── RAGHealthCheck.tsx
│   │   │   ├── RAGImpactAnalytics.tsx
│   │   │   ├── RAGOneDriveBrowser.tsx
│   │   │   ├── RAGOneDriveConfig.tsx
│   │   │   ├── RAGPermissionsMatrix.tsx
│   │   │   ├── RAGQualityAlerts.tsx
│   │   │   ├── RAGSearchTest.tsx
│   │   │   ├── RAGSyncMonitor.tsx
│   │   │   ├── RAGUploadDialog.tsx
│   │   │   └── RAGValidationDashboard.tsx
│   │   │
│   │   ├── 📁 settings/             # Configurações
│   │   │   ├── AddRecipientDialog.tsx
│   │   │   ├── AutomationFieldsConfig.tsx
│   │   │   ├── AutomationSchedulerConfig.tsx
│   │   │   ├── BitrixStagesManager.tsx
│   │   │   ├── CronogramaGD2Manager.tsx
│   │   │   ├── CustomBitrixContactFieldsManager.tsx
│   │   │   ├── CustomBitrixFieldsManager.tsx
│   │   │   ├── EmailPreferences.tsx
│   │   │   ├── NotificationFlowsTester.tsx
│   │   │   ├── NotificationLogsViewer.tsx
│   │   │   ├── NotificationRecipientsManager.tsx
│   │   │   ├── PipelineV2Config.tsx
│   │   │   ├── ProposalDefaultsConfig.tsx
│   │   │   ├── TestPhonesManager.tsx
│   │   │   └── TyposCleanupManager.tsx
│   │   │
│   │   ├── 📁 training/             # Treinamento IA
│   │   │   ├── BehavioralProfiles.tsx
│   │   │   ├── OperatorFeedback.tsx
│   │   │   ├── RegressionTestSuite.tsx
│   │   │   ├── ResponseEvaluations.tsx
│   │   │   └── RetroactiveLearning.tsx
│   │   │
│   │   ├── 📁 ui/                   # shadcn/ui (50+ componentes)
│   │   │
│   │   └── 📁 whatsapp/             # Painel WhatsApp
│   │       ├── AntiSpamConfig.tsx
│   │       ├── AttendantConfig.tsx
│   │       ├── AttendantMetrics.tsx
│   │       ├── CoesaContactsManager.tsx
│   │       ├── DeliveryFailuresAlert.tsx
│   │       ├── ElevenLabsFallbackAlert.tsx
│   │       ├── EscalatedConversations.tsx
│   │       ├── NudgeConfig.tsx
│   │       ├── NudgeMetrics.tsx
│   │       ├── OperatorCommandLogs.tsx
│   │       ├── PendingDataLeads.tsx
│   │       ├── SofiaAudioConfig.tsx
│   │       ├── SofiaCapabilitiesConfig.tsx
│   │       ├── SofiaMetrics.tsx
│   │       ├── StuckLeadsRescueConfig.tsx
│   │       ├── UsefulCommands.tsx
│   │       ├── WebhookDiagnostics.tsx
│   │       └── ZApiCredentialsDiagnostic.tsx
│   │
│   ├── 📁 hooks/                    # 24 hooks customizados
│   │   ├── use-mobile.tsx
│   │   ├── use-toast.ts
│   │   ├── useAgentVoiceConfig.ts
│   │   ├── useBitrixStages.ts
│   │   ├── useCRMConfig.ts
│   │   ├── useCalculationConfigs.ts
│   │   ├── useConfiguracoes.ts
│   │   ├── useCronogramaGD2.ts
│   │   ├── useDataComparison.ts
│   │   ├── useEconomyCalculator.ts
│   │   ├── useFAQs.ts
│   │   ├── useFormOptions.ts
│   │   ├── useGoalNotifications.ts
│   │   ├── useParametrosMacro.ts
│   │   ├── usePlanosComerciais.ts
│   │   ├── useProposalTemplates.ts
│   │   ├── usePropostasStatusConfig.ts
│   │   ├── useSofiaAudioSettings.ts
│   │   ├── useSofiaCapabilities.ts
│   │   ├── useSofiaWhatsAppStatus.ts
│   │   ├── useTitularidadePJValidation.ts
│   │   ├── useTitularidadeValidation.ts
│   │   ├── useUIConfig.ts
│   │   └── useUserRole.ts
│   │
│   ├── 📁 contexts/
│   │   └── AuthContext.tsx
│   │
│   ├── 📁 lib/                      # Utilitários
│   │   ├── calculations.ts
│   │   ├── calculations-cliente-gd.ts
│   │   ├── calculations-constants.ts
│   │   ├── cep-utils.ts
│   │   ├── cpf-cnpj-utils.ts
│   │   ├── default-proposal-template.ts
│   │   ├── docs-tracking-utils.ts
│   │   ├── email-utils.ts
│   │   ├── export-utils.ts
│   │   ├── image-quality-validator.ts
│   │   ├── pdf-generator.ts
│   │   ├── public-proposal-url.ts
│   │   ├── utils.ts
│   │   └── whatsapp-utils.ts
│   │
│   └── 📁 integrations/
│       └── supabase/
│           ├── client.ts            # Cliente Supabase
│           └── types.ts             # Tipos auto-gerados
│
├── 📁 supabase/
│   ├── 📁 functions/                # 74 Edge Functions
│   │   ├── 📁 _shared/              # 73 módulos compartilhados
│   │   │   ├── 📁 pipeline/         # Pipeline V2 (8 módulos)
│   │   │   │   ├── action.ts
│   │   │   │   ├── behavioral-profile.ts
│   │   │   │   ├── config.ts
│   │   │   │   ├── context.ts
│   │   │   │   ├── deterministic-router.ts
│   │   │   │   ├── index.ts
│   │   │   │   ├── intake.ts
│   │   │   │   ├── learning.ts
│   │   │   │   ├── memory-reader.ts
│   │   │   │   ├── operator-feedback.ts
│   │   │   │   ├── reasoning.ts
│   │   │   │   ├── self-evaluation.ts
│   │   │   │   ├── tools.ts
│   │   │   │   ├── types.ts
│   │   │   │   └── validation.ts
│   │   │   │
│   │   │   ├── 📁 utils/
│   │   │   │   └── phone-utils.ts
│   │   │   │
│   │   │   └── [65+ módulos principais]
│   │   │
│   │   └── [74 pastas de Edge Functions]
│   │
│   ├── config.toml                  # Configuração Supabase
│   └── 📁 migrations/               # Migrações SQL
│
└── 📁 public/
    ├── favicon.ico
    ├── placeholder.svg
    └── robots.txt
```

---

## 🔌 EDGE FUNCTIONS (74 Total)

### 🤖 Core IA (Sofia/Maria/Julia/Iago/Jaime)

| Função | Descrição | Webhook |
|--------|-----------|---------|
| `sofia-webhook` | **Principal** - Processa mensagens WhatsApp | Z-API |
| `sofia-pipeline` | Pipeline V2 modular | Interno |
| `sofia-voice-webhook` | Voz inbound (Retell) | Retell |
| `sofia-voice-outbound-webhook` | Voz outbound | Retell |
| `maria-webhook` | Agente SAC | Z-API |
| `julia-webhook` | Agente Cobrança | Z-API |
| `iago-webhook` | Agente Iago | Z-API |
| `jaime-webhook` | Agente Jaime | Z-API |

### 📊 Schedulers (Automações)

| Função | Descrição | Frequência |
|--------|-----------|------------|
| `chatbot-followup-scheduler` | Follow-ups automáticos | 5 min |
| `chatbot-nudge-scheduler` | Nudges de reengajamento | 5 min |
| `pending-response-scheduler` | Respostas pendentes | 2 min |
| `pending-task-scheduler` | Tarefas pendentes | 2 min |
| `stuck-leads-rescue-scheduler` | Resgate de leads travados | 30 min |
| `message-retry-scheduler` | Retry de mensagens falhas | 5 min |
| `proposal-retry-scheduler` | Retry de propostas | 10 min |
| `document-recovery-scheduler` | Recuperação de docs | 30 min |
| `technical-failure-recovery-scheduler` | Recuperação falhas técnicas | 15 min |
| `auto-learning-scheduler` | Aprendizado automático | Diário |
| `sofia-daily-stats` | Estatísticas diárias | Diário 23:55 |
| `sofia-weekly-stats` | Estatísticas semanais | Domingo 23:55 |
| `operator-commands-poller` | Polling comandos operador | 10s |

### 🔗 Integrações Bitrix24

| Função | Descrição |
|--------|-----------|
| `bitrix24-webhook` | Webhook principal Bitrix |
| `bitrix24-deal-webhook` | Webhook de deals |
| `bitrix24-sync` | Sincronização bidirecional |
| `bitrix24-sync-cliente-gd` | Sync Cliente GD |
| `bitrix24-update-lead` | Atualização de leads |
| `bitrix24-update-customer` | Atualização de clientes |
| `bitrix24-verify-customer` | Verificação de cliente |
| `bitrix24-upload-pdf` | Upload de PDFs |
| `bitrix24-link-webhook` | Link de proposta |
| `bitrix24-force-update-link` | Forçar atualização link |
| `bitrix24-get-stages` | Obter estágios do funil |
| `bitrix24-list-fields` | Listar campos |
| `sofia-bitrix-lead` | Criação de lead via Sofia |

### 📄 Documentos e Propostas

| Função | Descrição |
|--------|-----------|
| `public-proposal` | API de proposta pública |
| `proposal-chatbot` | Chatbot da proposta |
| `extrair-dados-documentos` | Extração IA de documentos |
| `extrair-dados-contrato-social` | Extração contrato social PJ |
| `contract-sent-webhook` | Webhook contrato enviado |

### 🧠 RAG / Knowledge Base

| Função | Descrição |
|--------|-----------|
| `rag-search` | Busca semântica |
| `rag-upload` | Upload de documentos |
| `process-rag-document` | Processamento RAG |
| `process-kb-document` | Processamento KB |
| `rag-batch-processor` | Processamento em lote |
| `rag-conversation-processor` | Conversas → RAG |
| `rag-premium-scripts` | Scripts premium |

### 📱 Z-API / WhatsApp

| Função | Descrição |
|--------|-----------|
| `z-api-webhook` | Webhook Z-API |
| `z-api-send-message` | Envio de mensagens |
| `z-api-add-contact` | Adicionar contato |
| `zapi-credentials-check` | Verificar credenciais |

### 🔊 Voz (Retell / ElevenLabs)

| Função | Descrição |
|--------|-----------|
| `retell-call-webhook` | Webhook Retell |
| `retell-create-outbound-call` | Criar chamada outbound |
| `retell-web-call-token` | Token para web call |
| `elevenlabs-tts` | Text-to-Speech |
| `elevenlabs-conversation-token` | Token de conversa |

### ☁️ OneDrive

| Função | Descrição |
|--------|-----------|
| `onedrive-sync` | Sincronização |
| `onedrive-list-folder` | Listar pasta |
| `onedrive-create-folder` | Criar pasta |
| `onedrive-get-drive-id` | Obter Drive ID |
| `onedrive-list-site-drives` | Listar drives do site |

### 🔧 Utilitários

| Função | Descrição |
|--------|-----------|
| `manage-users` | Gestão de usuários |
| `send-notification-email` | Envio de e-mails |
| `create-lead-from-site` | Lead do site |
| `aneel-tarifas` | Consulta tarifas ANEEL |
| `aneel-bandeiras` | Consulta bandeiras |
| `import-cidades` | Importar cidades |
| `cleanup-sofia-audio` | Limpeza de áudios |
| `cleanup-typos` | Limpeza de typos |
| `ensure-learning-folders` | Criar pastas learning |
| `retroactive-learning-processor` | Processador retroativo |
| `sofia-regression-tests` | Testes de regressão |
| `sofia-hot-lead-alert` | Alerta hot leads |
| `agent-source-export` | Exportar agente |
| `agent-source-upload` | Importar agente |

---

## 🗄️ SCHEMA DO BANCO DE DADOS (95 Tabelas)

### 📊 Tabelas Principais

#### Agentes IA
| Tabela | Descrição |
|--------|-----------|
| `ai_agents` | Configuração dos agentes (sofIA, marIA, julIA, etc.) |
| `ai_agent_versions` | Versionamento de agentes |
| `ai_agent_interactions` | Métricas de interações |
| `agent_secrets` | Segredos por agente |
| `agent_prompt_modules` | Módulos de prompt por agente |
| `prompt_modules` | Catálogo de módulos de prompt |

#### Conversas
| Tabela | Descrição |
|--------|-----------|
| `chatbot_conversas` | **Principal** - Conversas WhatsApp |
| `chatbot_mensagens` | Histórico de mensagens |
| `chatbot_followups` | Follow-ups agendados |
| `chatbot_mensagens_pendentes` | Mensagens com falha (retry) |

#### Propostas
| Tabela | Descrição |
|--------|-----------|
| `propostas_assinantes` | Propostas PF |
| `propostas_cliente_gd` | Propostas Cliente GD |
| `proposal_templates` | Templates de proposta |
| `proposta_access_tokens` | Tokens de acesso |

#### CRM / Bitrix24
| Tabela | Descrição |
|--------|-----------|
| `bitrix24_sync_logs` | Logs de sincronização |
| `bitrix24_sync_locks` | Locks para evitar race conditions |
| `bitrix_stages_config` | Configuração de estágios |

#### RAG / Knowledge Base
| Tabela | Descrição |
|--------|-----------|
| `rag_chunks` | Chunks de documentos |
| `rag_documents` | Documentos processados |
| `rag_queries_log` | Log de buscas |
| `rag_usage_analytics` | Analytics de uso |
| `working_memory` | Memória de trabalho (sessão) |
| `rule_memory` | Regras aprendidas |
| `interaction_patterns` | Padrões de interação |

#### Configurações
| Tabela | Descrição |
|--------|-----------|
| `configuracoes_sistema` | **Config central** (~200 chaves) |
| `configuracoes_audit_log` | Auditoria de mudanças |
| `planos_comerciais` | Planos disponíveis |
| `cronograma_gd2` | Cronograma GD2 |

#### Concessionárias / Tarifas
| Tabela | Descrição |
|--------|-----------|
| `concessionarias` | Distribuidoras de energia |
| `distribuidora_typos` | Correção de typos |
| `bandeiras_tarifarias` | Bandeiras ANEEL |
| `cidades` | Cidades com índice solarimétrico |

#### Usuários / Admin
| Tabela | Descrição |
|--------|-----------|
| `profiles` | Perfis de usuários |
| `user_roles` | Papéis (admin, comercial, etc.) |
| `activity_logs` | Log de atividades |
| `admin_notifications` | Notificações admin |

#### Atendimento Humano
| Tabela | Descrição |
|--------|-----------|
| `whatsapp_atendentes` | Atendentes cadastrados |
| `operator_command_logs` | Log de comandos (#ASSUMIR, etc.) |

#### Aprendizado / Treinamento
| Tabela | Descrição |
|--------|-----------|
| `batch_learning_jobs` | Jobs de aprendizado |
| `batch_learning_evaluations` | Avaliações de respostas |
| `auto_learning_runs` | Execuções de auto-learning |
| `sofia_regression_tests` | Casos de teste |
| `sofia_regression_runs` | Execuções de testes |
| `client_behavioral_profiles` | Perfis comportamentais |
| `business_rules_guardrails` | Guardrails determinísticos |

#### Chamadas de Voz
| Tabela | Descrição |
|--------|-----------|
| `outbound_call_queue` | Fila de chamadas outbound |
| `outbound_call_logs` | Log de chamadas |

#### Buffers / Anti-duplicação
| Tabela | Descrição |
|--------|-----------|
| `message_buffers` | Buffer humanizado |
| `cross_webhook_locks` | Locks entre webhooks |
| `message_dedup_cache` | Cache de deduplicação |

---

## 🔄 FLUXO DE DADOS

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ENTRADA DE MENSAGENS                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│   Z-API       │           │    Retell     │           │    Site       │
│  (WhatsApp)   │           │    (Voz)      │           │  (Landing)    │
└───────────────┘           └───────────────┘           └───────────────┘
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│ z-api-webhook │           │ sofia-voice-  │           │ create-lead-  │
│               │           │ webhook       │           │ from-site     │
└───────────────┘           └───────────────┘           └───────────────┘
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SOFIA-WEBHOOK (Principal)                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ 1. Media Processing (áudio, imagem, PDF → texto)                    │    │
│  │ 2. Buffer Humanizado (agrupa mensagens rápidas)                     │    │
│  │ 3. Operator Commands (#ASSUMIR, #RESOLVIDO)                         │    │
│  │ 4. Pre-LLM Hard Stops (regras determinísticas)                      │    │
│  │ 5. Pipeline V2 (se ativo)                                           │    │
│  │    └── Intake → Context → Reasoning → Action → Learning             │    │
│  │ 6. Legacy Flow (se Pipeline V2 desativado)                          │    │
│  │ 7. Humanized Response (typing indicator + latência)                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│ RAG Search    │           │ LLM (Gemini/  │           │ Bitrix24      │
│ (Knowledge)   │           │ GPT/Claude)   │           │ Sync          │
└───────────────┘           └───────────────┘           └───────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RESPOSTA AO CLIENTE                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ z-api-send-msg  │  │ elevenlabs-tts  │  │ Proposta PDF    │             │
│  │ (WhatsApp)      │  │ (Áudio)         │  │ (Link)          │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔗 INTEGRAÇÕES EXTERNAS

### Comunicação
| Serviço | Uso | Credenciais |
|---------|-----|-------------|
| **Z-API** | WhatsApp Business | Instance ID, Token, Security Token |
| **Retell AI** | Voz inbound/outbound | API Key |
| **ElevenLabs** | Text-to-Speech | API Key |

### CRM
| Serviço | Uso | Credenciais |
|---------|-----|-------------|
| **Bitrix24** | Gestão de leads/deals | Webhook URL, User ID |

### IA / LLM
| Serviço | Uso | Credenciais |
|---------|-----|-------------|
| **Lovable AI Gateway** | Gemini/GPT nativos | (Nativo - sem key) |
| **OpenAI** | GPT-4/5 (opcional) | API Key |
| **Anthropic** | Claude (opcional) | API Key |
| **Google AI** | Gemini (opcional) | API Key |

### Storage
| Serviço | Uso | Credenciais |
|---------|-----|-------------|
| **OneDrive/SharePoint** | Backup de documentos | OAuth |
| **Supabase Storage** | PDFs, áudios, imagens | (Nativo) |

### Dados Externos
| Serviço | Uso | Credenciais |
|---------|-----|-------------|
| **ANEEL API** | Tarifas e bandeiras | (Público) |
| **ViaCEP** | Validação de CEP | (Público) |

---

## 📋 MÓDULOS COMPARTILHADOS (_shared/)

### Core
| Módulo | Linhas | Descrição |
|--------|--------|-----------|
| `llm-client.ts` | ~500 | Cliente LLM (Lovable AI Gateway + fallbacks) |
| `system-prompt-builder.ts` | ~400 | Construtor de prompts do sistema |
| `conversation-manager.ts` | ~350 | Gestão de conversas |
| `config-loader.ts` | ~200 | Carregador de configurações |

### Pipeline V2
| Módulo | Descrição |
|--------|-----------|
| `pipeline/intake.ts` | Normalização de entrada |
| `pipeline/context.ts` | Construção de contexto |
| `pipeline/reasoning.ts` | Raciocínio LLM |
| `pipeline/action.ts` | Execução de ações |
| `pipeline/learning.ts` | Aprendizado |
| `pipeline/deterministic-router.ts` | Roteamento determinístico |
| `pipeline/behavioral-profile.ts` | Perfis comportamentais |
| `pipeline/memory-reader.ts` | Leitura de memória |

### Fluxos de Negócio
| Módulo | Descrição |
|--------|-----------|
| `triage-flow.ts` | Triagem inicial |
| `guided-script-fsm.ts` | Máquina de estados (coleta) |
| `disqualification-flow.ts` | Desqualificação |
| `proposal-link-sender.ts` | Envio de propostas |
| `document-collection-flow.ts` | Coleta de documentos |
| `economy-simulator.ts` | Simulação de economia |

### Guardrails / Segurança
| Módulo | Descrição |
|--------|-----------|
| `pre-llm-hard-stops.ts` | Bloqueios pré-LLM |
| `guardrails-enforcer.ts` | Aplicação de guardrails |
| `llm-guardrails.ts` | Guardrails pós-LLM |
| `anti-spam.ts` | Proteção anti-spam |
| `rate-limiter.ts` | Rate limiting |
| `outbound-guard.ts` | Guard de mensagens saída |

### Integrações
| Módulo | Descrição |
|--------|-----------|
| `bitrix-client.ts` | Cliente Bitrix24 |
| `bitrix-sync.ts` | Sincronização Bitrix |
| `zapi-client.ts` | Cliente Z-API |
| `tts-client.ts` | Cliente TTS |
| `rag-search-client.ts` | Cliente RAG |

### Utilitários
| Módulo | Descrição |
|--------|-----------|
| `media-handler.ts` | Processamento de mídia |
| `data-extraction.ts` | Extração de dados |
| `validation-utils.ts` | Validações |
| `history-sanitizer.ts` | Sanitização de histórico |
| `message-buffer.ts` | Buffer humanizado |
| `humanized-latency.ts` | Latência humanizada |
| `operator-commands.ts` | Comandos de operador |

---

## 📊 MÉTRICAS DO PROJETO

### Complexidade
- **Linhas de código backend (estimado):** ~50.000
- **Linhas de código frontend (estimado):** ~30.000
- **Tabelas com RLS:** 85/95 (89%)
- **Edge Functions com testes:** 3/74 (4%)

### Cobertura de Features
| Feature | Status |
|---------|--------|
| WhatsApp Text | ✅ 100% |
| WhatsApp Audio | ✅ 100% |
| WhatsApp Imagem | ✅ 100% |
| WhatsApp PDF | ✅ 100% |
| Voz Inbound | ✅ 100% |
| Voz Outbound | ⚠️ 80% |
| RAG/Knowledge Base | ✅ 100% |
| Bitrix24 Sync | ✅ 100% |
| Multi-Agentes | ✅ 100% |
| Pipeline V2 | ✅ 100% |
| Buffer Humanizado | ✅ 100% |
| Testes de Regressão | ⚠️ 60% |

---

## 🔐 SEGURANÇA

### RLS (Row Level Security)
- 85 tabelas com RLS ativado
- Políticas por `user_id` ou `is_admin()`
- Service role para Edge Functions

### Autenticação
- Supabase Auth (email/password)
- Função `is_admin()` para permissões
- Tokens de acesso para propostas públicas

### Secrets Management
- Secrets por agente na tabela `agent_secrets`
- Environment variables no Supabase
- Não exposição de keys no frontend

---

## 📝 PRÓXIMOS PASSOS (ROADMAP SUGERIDO)

### Fase 2: Identificar Problemas
1. Auditar logs de erro recentes
2. Testar fluxos críticos end-to-end
3. Verificar integrações quebradas
4. Identificar performance issues

### Fase 3: Priorizar Correções
1. Bugs críticos (bloqueiam produção)
2. Melhorias de estabilidade
3. Otimizações de performance
4. Novas features

---

> **Documento gerado automaticamente pela auditoria do Lovable**
