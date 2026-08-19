# 📊 LOGS, ANALYTICS E MONITORING

> **Sistema completo de observabilidade da plataforma Coesa**  
> Última atualização: 2026-02-02

---

## 🎯 VISÃO GERAL

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CAMADAS DE OBSERVABILIDADE                                │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────┐
                    │     DASHBOARDS UI       │
                    │  (React Components)     │
                    └───────────┬─────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Analytics     │    │   Monitoring    │    │    Alertas      │
│                 │    │                 │    │                 │
│ • Conversão     │    │ • Saúde RAG     │    │ • Guardrails    │
│ • Funil         │    │ • Performance   │    │ • Erros         │
│ • A/B Tests     │    │ • Sincronização │    │ • Escalações    │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │    SUPABASE TABLES    │
                    │                       │
                    │ • chatbot_conversas   │
                    │ • chatbot_mensagens   │
                    │ • rag_usage_logs      │
                    │ • guardrail_events    │
                    │ • activity_logs       │
                    └───────────────────────┘
```

---

## 📈 1. ANALYTICS DE CONVERSÃO

### Componente: `ChatbotAnalytics`
**Arquivo:** `src/components/admin/ChatbotAnalytics.tsx`

#### Métricas Calculadas

| Métrica | Fórmula | Descrição |
|---------|---------|-----------|
| **Total Conversas** | `COUNT(chatbot_conversas)` | Volume total |
| **Taxa Fallback** | `needs_human_fallback / total * 100` | % que precisou de humano |
| **Lead Score Médio** | `AVG(lead_score)` | Score médio (0-100) |
| **Modo Premium** | `sofia_mode = 'closer_premium' / total` | % em modo closer |
| **Conversões** | `event_conversion = true` | Leads fechados |

#### Funil de Conversão

```typescript
interface FunnelStats {
  simulation: number;      // Pediram simulação
  proposalSent: number;    // Proposta enviada
  objectionDetected: number; // Objeção detectada
  drop: number;            // Desistências
  conversion: number;      // Conversões
  total: number;           // Total de leads
}

// Eventos rastreados em chatbot_conversas:
// event_simulation, event_proposal_sent, event_objection_detected, 
// event_drop, event_conversion
```

#### Testes A/B

```typescript
interface ABTestResult {
  variant: string;         // 'A' | 'B'
  totalConversas: number;  
  conversions: number;
  conversionRate: number;  // conversions / total * 100
}

// Campo: chatbot_conversas.ab_variant
```

#### Análise de Objeções

```typescript
const OBJECTION_TYPES = {
  PRECO: { label: '💰 Preço', suggestion: 'Reforçar economia vs custo atual' },
  CONFIANCA: { label: '🔒 Confiança', suggestion: 'Mostrar cases e CNPJ antes' },
  CONTRATO: { label: '📋 Contrato/Multa', suggestion: 'Antecipar multa no discurso' },
  TEMPO: { label: '⏰ Tempo', suggestion: 'Criar urgência genuína' },
  COMPLEXIDADE: { label: '🤔 Complexidade', suggestion: 'Simplificar explicação inicial' },
  AUTORIDADE: { label: '👥 Autoridade', suggestion: 'Oferecer material para compartilhar' },
};
```

---

## 📊 2. MÉTRICAS DA SOFIA

### Componente: `SofiaMetrics`
**Arquivo:** `src/components/whatsapp/SofiaMetrics.tsx`

#### Métricas Principais

| Card | Fonte | Descrição |
|------|-------|-----------|
| **Leads Criados** | `bitrix24_lead_id NOT NULL` | Sincronizados com CRM |
| **Leads Atualizados** | `dados_coletados.keys > 2` | Com dados coletados |
| **Movimentações** | `bitrix24_stage != 'NEW'` | Que avançaram etapa |
| **Taxa Conversão** | `leads_bitrix / total_conversas` | Conversas → Leads |

#### Filtros Temporais

```typescript
type DateFilter = 'today' | 'week' | 'month' | 'all';

// Gráfico de tendência diária com AreaChart (recharts)
interface DailyData {
  date: string;
  dateLabel: string;
  leads: number;
  updates: number;
  moves: number;
}
```

#### Breakdown por Estágio

```typescript
const STAGE_NAMES = {
  'NEW': 'Novo',
  'UC_9SLRPP': 'Proposta Inicial',
  'UC_JENEX5': 'Proposta Definitiva',
  'UC_XIM123': 'Aguardando Assinatura',
  'WON': 'Fechado Ganho',
  'LOSE': 'Fechado Perdido',
};
```

---

## 🔍 3. RAG IMPACT ANALYTICS

### Componente: `RAGImpactAnalytics`
**Arquivo:** `src/components/rag/RAGImpactAnalytics.tsx`

#### Tabela: `rag_usage_logs`

```sql
CREATE TABLE rag_usage_logs (
  id UUID PRIMARY KEY,
  agent_id TEXT,
  query_text TEXT,
  results_count INTEGER,
  top_similarity FLOAT,
  avg_similarity FLOAT,
  documents_accessed TEXT[],
  categories_accessed TEXT[],
  response_time_ms INTEGER,
  client_phone TEXT,
  funnel_stage TEXT,
  chunks_used JSONB,
  created_at TIMESTAMPTZ
);
```

#### Métricas RAG

| Métrica | Cálculo | Objetivo |
|---------|---------|----------|
| **Hit Rate** | `queries_with_results / total * 100` | > 80% |
| **Similaridade Média** | `AVG(top_similarity) * 100` | > 50% |
| **Tempo Médio** | `AVG(response_time_ms)` | < 500ms |
| **Sem Resultados** | `results_count = 0` | < 20% |

#### Cores de Similaridade

```typescript
const getSimilarityColor = (similarity: number) => {
  if (similarity >= 70) return 'text-green-600';   // Excelente
  if (similarity >= 50) return 'text-blue-600';    // Bom
  if (similarity >= 35) return 'text-yellow-600';  // Aceitável
  return 'text-red-600';                           // Baixo
};
```

---

## 🛡️ 4. GUARDRAIL EVENTS (Erros Recorrentes)

### Componente: `RecurringErrorsPanel`
**Arquivo:** `src/components/admin/RecurringErrorsPanel.tsx`

#### Tabela: `sofia_guardrail_events`

```sql
CREATE TABLE sofia_guardrail_events (
  id UUID PRIMARY KEY,
  conversa_id UUID,
  cliente_telefone TEXT,
  cliente_nome TEXT,
  category TEXT,           -- triagem_indevida, link_nao_verificado, etc.
  block_type TEXT,
  severity TEXT,
  original_message TEXT,   -- Mensagem original da LLM
  corrected_message TEXT,  -- Mensagem corrigida
  context JSONB,
  status TEXT,             -- 'open', 'resolved', 'rule_applied'
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ
);
```

#### Categorias de Erro

| Categoria | Ícone | Descrição |
|-----------|-------|-----------|
| `triagem_indevida` | 💬 | Sofia fez triagem quando não deveria |
| `link_nao_verificado` | 🔗 | Link enviado sem verificação |
| `docs_whatsapp` | 📎 | Pediu docs via WhatsApp (bloqueado) |
| `abaixo_linha_corte` | 💰 | Processou lead < R$300 |

#### Workflow de Resolução

```
1. Evento detectado → status = 'open'
2. Operador visualiza detalhes (original vs corrigido)
3. Opções:
   a) Resolver manualmente → status = 'resolved'
   b) Aplicar nova regra → status = 'rule_applied'
   c) Resolver em lote (bulk)
```

---

## 📝 5. ACTIVITY LOGS (Auditoria)

### Componente: `ActivityLog`
**Arquivo:** `src/components/admin/ActivityLog.tsx`

#### Tabela: `activity_logs`

```sql
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY,
  user_id UUID,
  user_email TEXT,
  user_nome TEXT,
  action TEXT,           -- 'create', 'update', 'delete'
  entity_type TEXT,      -- 'proposta_assinante', 'proposta_usineiro'
  entity_id UUID,
  entity_name TEXT,
  details JSONB,
  created_at TIMESTAMPTZ
);
```

#### Ações Rastreadas

| Ação | Ícone | Cor |
|------|-------|-----|
| `create` | ➕ | Verde |
| `update` | ✏️ | Azul |
| `delete` | 🗑️ | Vermelho |

---

## 🔔 6. LOGS DE OPERADOR

### Componente: `OperatorCommandLogs`
**Arquivo:** `src/components/whatsapp/OperatorCommandLogs.tsx`

#### Tabela: `operator_command_logs`

```sql
CREATE TABLE operator_command_logs (
  id UUID PRIMARY KEY,
  command TEXT,           -- '#ASSUMIR', '#RESOLVIDO', etc.
  operator_phone TEXT,
  operator_name TEXT,
  client_phone TEXT,
  client_name TEXT,
  action_result TEXT,
  created_at TIMESTAMPTZ
);
```

#### Comandos Registrados

| Comando | Ação | Badge |
|---------|------|-------|
| `#ASSUMIR` / `#MEU` / `#TAKEOVER` | Operador assume conversa | 🔴 Destructive |
| `#RESOLVIDO` / `#DEVOLVER` / `#SOFIA` | Devolve para Sofia | 🟢 Default |

#### Realtime

```typescript
// Subscrição em tempo real
const channel = supabase
  .channel('operator_command_logs_changes')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'operator_command_logs',
  }, (payload) => {
    setLogs(prev => [payload.new, ...prev].slice(0, limit));
  })
  .subscribe();
```

---

## 📞 7. OUTBOUND CALL METRICS

### Componente: `OutboundCallMetrics`
**Arquivo:** `src/components/ai-gym/OutboundCallMetrics.tsx`

#### Tabelas

```sql
-- Resultados das ligações
CREATE TABLE outbound_call_results (
  id UUID PRIMARY KEY,
  outcome TEXT,           -- 'answered', 'no_answer', 'busy'
  intent_detected TEXT,   -- 'positive_whatsapp', 'positive', 'negative'
  created_at TIMESTAMPTZ
);

-- Fila de ligações
CREATE TABLE outbound_call_queue (
  id UUID PRIMARY KEY,
  attempts INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ
);
```

#### Métricas

| Card | Cálculo |
|------|---------|
| **Total** | `COUNT(results)` |
| **Hoje** | `created_at LIKE today%` |
| **Atendidas** | `outcome = 'answered'` |
| **Não Atendidas** | `outcome IN ('no_answer', 'busy')` |
| **Positivas** | `intent_detected LIKE 'positive%' / answered` |
| **Média Tentativas** | `AVG(queue.attempts) WHERE completed` |

---

## 📊 8. SYNC LOGS (Bitrix24)

### Tabela: `bitrix24_sync_logs`

```sql
CREATE TABLE bitrix24_sync_logs (
  id UUID PRIMARY KEY,
  action TEXT,            -- 'create_lead', 'update_lead', 'move_stage'
  bitrix24_lead_id TEXT,
  proposta_id UUID,
  status TEXT,            -- 'success', 'error'
  error_message TEXT,
  request_data JSONB,
  response_data JSONB,
  created_at TIMESTAMPTZ
);
```

---

## 🏥 9. RAG HEALTH CHECK

### Componente: `RAGHealthCheck`
**Arquivo:** `src/components/rag/RAGHealthCheck.tsx`

#### Logs de Telemetria

```typescript
// Registrado em cada consulta RAG
interface RAGHealthLog {
  triggered: boolean;
  skip_reason?: 'rag_skip_greetings' | 'message_too_short' | 'deterministic_match';
  query_time_ms: number;
  chunks_returned: number;
  top_similarity: number;
}
```

---

## ✅ 10. REGRESSION TEST SUITE

### Componente: `RegressionTestSuite`
**Arquivo:** `src/components/training/RegressionTestSuite.tsx`

#### Execução Automática

```sql
-- pg_cron: Executa diariamente às 09:00
SELECT cron.schedule(
  'daily-regression-tests',
  '0 9 * * *',
  'SELECT net.http_post(
    ''https://cvcdweqybgfxywcelriq.supabase.co/functions/v1/sofia-regression-tests'',
    ''{}''::jsonb
  )'
);
```

#### Métricas de Testes

| Status | Descrição |
|--------|-----------|
| ✅ `passed` | Resposta correta |
| ❌ `failed` | Resposta incorreta |
| ⏭️ `skipped` | Teste desabilitado |

---

## 🔗 TABELAS DE LOGS CONSOLIDADAS

| Tabela | Propósito | Retenção |
|--------|-----------|----------|
| `chatbot_conversas` | Estado de cada conversa | Indefinido |
| `chatbot_mensagens` | Histórico de mensagens | Indefinido |
| `rag_usage_logs` | Queries ao sistema RAG | 90 dias |
| `sofia_guardrail_events` | Violações de guardrail | Indefinido |
| `activity_logs` | Auditoria de usuários | Indefinido |
| `operator_command_logs` | Comandos de operador | 30 dias |
| `outbound_call_results` | Resultados de ligações | Indefinido |
| `bitrix24_sync_logs` | Sync com CRM | 30 dias |
| `response_evaluations` | Self-evaluation loop | 90 dias |
| `batch_learning_evaluations` | Avaliações de aprendizado | Indefinido |

---

## 📱 DASHBOARDS DISPONÍVEIS

| Dashboard | Rota | Componentes |
|-----------|------|-------------|
| **Admin** | `/admin` | ChatbotAnalytics, ActivityLog, RecurringErrorsPanel |
| **WhatsApp** | `/whatsapp` | SofiaMetrics, OperatorCommandLogs, EscalatedConversations |
| **RAG** | `/rag-dashboard` | RAGImpactAnalytics, RAGHealthCheck, RAGValidationDashboard |
| **AI Gym** | `/ai-gym` | AgentMetrics, OutboundCallMetrics, AgentFlowsInsights |
| **Treinamento** | `/treinamento` | RegressionTestSuite, ResponseEvaluations, RetroactiveLearning |

---

**Resumo:** Sistema completo de observabilidade com 10+ dashboards cobrindo analytics de conversão, saúde do RAG, auditoria de usuários, erros recorrentes e testes de regressão automatizados.
