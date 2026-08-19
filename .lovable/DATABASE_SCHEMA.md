# 🗄️ DATABASE SCHEMA COMPLETO - SOFIA BOT V2

> **Documentação do Supabase Schema**  
> Total: **95 tabelas** | **200+ índices** | **100+ políticas RLS**

---

## 📊 VISÃO GERAL POR CATEGORIA

| Categoria | Tabelas | Descrição |
|-----------|---------|-----------|
| **WhatsApp/Chatbot** | 12 | Conversas, mensagens, followups |
| **AI Agents** | 8 | Configuração multi-agente |
| **RAG/Knowledge** | 10 | Base de conhecimento |
| **Propostas** | 8 | Assinantes, usineiros, templates |
| **CRM/Bitrix** | 6 | Integração CRM |
| **Configurações** | 8 | Sistema, distribuidoras |
| **Voice/Chamadas** | 4 | Ligações de voz |
| **Usuários/Auth** | 5 | Profiles, roles |
| **Analytics/Logs** | 12 | Métricas, eventos |
| **Operacional** | 22 | Locks, buffers, queues |

---

## 🟢 CORE: CONVERSAS WHATSAPP

### `chatbot_conversas` ⭐ (TABELA PRINCIPAL)
> Armazena o estado completo de cada conversa

```sql
CREATE TABLE chatbot_conversas (
  -- Identificação
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  agent_id TEXT DEFAULT 'sofia',
  
  -- Cliente
  cliente_nome TEXT,
  cliente_email TEXT,
  cliente_telefone TEXT, -- Normalizado: 55XXXXXXXXXXX (13 dígitos)
  
  -- Estado do Funil
  bitrix24_lead_id TEXT,
  bitrix24_stage TEXT,
  proposta_id UUID REFERENCES propostas_assinantes(id),
  proposta_link_sent_at TIMESTAMPTZ,
  sofia_mode TEXT, -- 'auto' | 'paused' | 'human'
  
  -- Coleta de Dados
  dados_coletados JSONB, -- {nome, cpf, consumo, tarifa, concessionaria...}
  arquivos_anexados JSONB,
  docs_received_whatsapp JSONB,
  docs_received_page JSONB,
  docs_source TEXT, -- 'whatsapp' | 'page'
  first_doc_received_at TIMESTAMPTZ,
  all_docs_complete_at TIMESTAMPTZ,
  
  -- FSM (Máquina de Estados Finita)
  fsm_expected_field TEXT, -- Campo que está sendo coletado
  field_attempts INTEGER DEFAULT 0,
  
  -- Eventos de Funil
  event_simulation BOOLEAN DEFAULT false,
  event_proposal_sent BOOLEAN DEFAULT false,
  event_objection_detected BOOLEAN DEFAULT false,
  event_conversion BOOLEAN DEFAULT false,
  event_drop BOOLEAN DEFAULT false,
  
  -- Follow-up & Nudge
  followup_count INTEGER DEFAULT 0,
  followup_sent_at TIMESTAMPTZ,
  followup_stage TEXT,
  next_followup_at TIMESTAMPTZ,
  nudge_count INTEGER DEFAULT 0,
  next_nudge_at TIMESTAMPTZ,
  
  -- Contrato
  contrato_enviado_at TIMESTAMPTZ,
  contrato_assinado BOOLEAN DEFAULT false,
  contrato_assinado_at TIMESTAMPTZ,
  contract_nudge_count INTEGER DEFAULT 0,
  next_contract_nudge_at TIMESTAMPTZ,
  
  -- Objeções
  detected_objection TEXT,
  objection_cooldown_until TIMESTAMPTZ,
  
  -- Master Offer (oferta final)
  master_offer_at TIMESTAMPTZ,
  master_offer_expires_at TIMESTAMPTZ,
  master_offer_accepted BOOLEAN DEFAULT false,
  
  -- Lead Scoring
  lead_score INTEGER,
  lead_source TEXT,
  
  -- Atendimento Humano
  human_agent_id UUID,
  human_agent_nome TEXT,
  human_intervention_count INTEGER DEFAULT 0,
  human_resolved_at TIMESTAMPTZ,
  human_resolution_time_seconds INTEGER,
  needs_human_fallback BOOLEAN DEFAULT false,
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,
  
  -- Atendente Notificado
  atendente_notificado_id UUID REFERENCES whatsapp_atendentes(id),
  atendente_notificado_at TIMESTAMPTZ,
  atendente_notificado_nome TEXT,
  
  -- Tarefas Pendentes
  pending_task TEXT,
  pending_task_created_at TIMESTAMPTZ,
  pending_task_retries INTEGER DEFAULT 0,
  
  -- Resgate de Leads Parados
  rescue_attempts INTEGER DEFAULT 0,
  rescue_reason TEXT,
  last_rescue_at TIMESTAMPTZ,
  next_rescue_at TIMESTAMPTZ,
  
  -- Timing
  created_at TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  last_human_message_at TIMESTAMPTZ,
  last_sofia_message_at TIMESTAMPTZ,
  last_deterministic_response_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  
  -- Métricas
  total_messages INTEGER DEFAULT 0,
  response_times_seconds INTEGER[],
  awaiting_response BOOLEAN DEFAULT false,
  
  -- Áudio
  audio_oferecido BOOLEAN DEFAULT false,
  cliente_aceita_audio BOOLEAN,
  
  -- Comandos de Operador
  last_processed_command_id UUID,
  
  -- A/B Testing
  ab_variant TEXT,
  
  -- Simulação
  has_simulation BOOLEAN DEFAULT false,
  
  -- Provider
  whatsapp_provider TEXT DEFAULT 'default'
);

-- ÍNDICES CRÍTICOS
CREATE INDEX idx_conversas_telefone ON chatbot_conversas(cliente_telefone);
CREATE INDEX idx_conversas_session ON chatbot_conversas(session_id);
CREATE INDEX idx_conversas_agent ON chatbot_conversas(agent_id);
CREATE INDEX idx_conversas_bitrix ON chatbot_conversas(bitrix24_lead_id);
CREATE INDEX idx_conversas_proposta ON chatbot_conversas(proposta_id);
CREATE INDEX idx_conversas_pending_task ON chatbot_conversas(pending_task) WHERE pending_task IS NOT NULL;
CREATE INDEX idx_conversas_next_followup ON chatbot_conversas(next_followup_at) WHERE next_followup_at IS NOT NULL;
CREATE INDEX idx_conversas_next_nudge ON chatbot_conversas(next_nudge_at) WHERE next_nudge_at IS NOT NULL;
CREATE INDEX idx_conversas_last_message ON chatbot_conversas(last_message_at DESC);
```

---

### `chatbot_mensagens`
> Histórico de mensagens de cada conversa

```sql
CREATE TABLE chatbot_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES chatbot_conversas(id),
  role TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  message_id TEXT, -- ID do WhatsApp para deduplicação
  is_quick_reply BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mensagens_conversa ON chatbot_mensagens(conversa_id);
CREATE INDEX idx_mensagens_created ON chatbot_mensagens(created_at DESC);
CREATE UNIQUE INDEX idx_mensagens_message_id ON chatbot_mensagens(message_id) WHERE message_id IS NOT NULL;
```

---

### `chatbot_followups`
> Follow-ups programados e enviados

```sql
CREATE TABLE chatbot_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES chatbot_conversas(id),
  followup_stage TEXT NOT NULL, -- '24h', '48h', '72h', 'custom'
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending' | 'sent' | 'failed'
  
  -- Contexto do Lead
  cliente_nome TEXT,
  cliente_telefone TEXT,
  cliente_email TEXT,
  lead_score INTEGER,
  detected_objection TEXT,
  
  -- Resultado
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  whatsapp_message_id TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_followups_conversa ON chatbot_followups(conversa_id);
CREATE INDEX idx_followups_status ON chatbot_followups(status);
```

---

### `chatbot_mensagens_pendentes`
> Fila de retry para mensagens que falharam

```sql
CREATE TABLE chatbot_mensagens_pendentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  agent_id TEXT DEFAULT 'sofia',
  conversa_id UUID REFERENCES chatbot_conversas(id),
  
  -- Retry Logic
  tentativas INTEGER DEFAULT 0,
  max_tentativas INTEGER DEFAULT 5,
  retry_at TIMESTAMPTZ DEFAULT now(),
  ultimo_erro TEXT,
  ultimo_status_code INTEGER,
  
  -- Resolução
  resolution_status TEXT, -- 'success' | 'failed' | 'expired'
  resolved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pendentes_retry ON chatbot_mensagens_pendentes(retry_at) WHERE resolution_status IS NULL;
CREATE INDEX idx_pendentes_phone ON chatbot_mensagens_pendentes(telefone);
```

---

## 🤖 AI AGENTS (Multi-Agente)

### `ai_agents` ⭐
> Configuração de cada agente de IA

```sql
CREATE TABLE ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL UNIQUE, -- 'sofia', 'maria', 'julia'...
  name TEXT NOT NULL,
  description TEXT,
  role TEXT NOT NULL, -- 'sdr', 'sac', 'closer'
  status TEXT DEFAULT 'draft', -- 'draft' | 'active' | 'paused'
  version TEXT DEFAULT '0.1.0',
  
  -- Visual
  avatar_emoji TEXT DEFAULT '🤖',
  
  -- Channels
  channels TEXT[] DEFAULT ARRAY['whatsapp'],
  
  -- Prompt & Persona
  persona JSONB DEFAULT '{}',
  
  -- Guardrails
  guardrails JSONB DEFAULT '{}',
  
  -- Intents
  intents JSONB DEFAULT '[]',
  
  -- Tools
  tools_config JSONB DEFAULT '[]',
  
  -- Knowledge Base
  kb_sources JSONB DEFAULT '[]',
  
  -- Tests
  tests JSONB DEFAULT '[]',
  
  -- Collection Rules (FSM)
  collection_rules JSONB,
  
  -- Metrics
  metrics JSONB DEFAULT '{}',
  
  -- Triage Config
  triage_config JSONB,
  
  -- Z-API Credentials (por agente)
  zapi_instance_id TEXT,
  zapi_token TEXT,
  zapi_security_token TEXT,
  
  -- Bitrix
  bitrix24_user_id TEXT,
  
  -- Voice Config
  voice_config JSONB DEFAULT '{
    "inbound": {"enabled": false, "provider": "retell"},
    "outbound": {"enabled": false, "provider": "retell"}
  }',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  published_by UUID
);

CREATE UNIQUE INDEX idx_agents_agent_id ON ai_agents(agent_id);
CREATE INDEX idx_agents_status ON ai_agents(status);
```

---

### `ai_agent_versions`
> Versionamento de agentes (histórico)

```sql
CREATE TABLE ai_agent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id),
  version TEXT NOT NULL,
  brain_snapshot JSONB NOT NULL, -- Cópia completa do estado
  changelog TEXT,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);
```

---

### `ai_agent_interactions`
> Métricas de interação por agente

```sql
CREATE TABLE ai_agent_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id),
  conversa_id UUID,
  intent_detected TEXT,
  resolution_status TEXT, -- 'resolved' | 'escalated' | 'dropped'
  response_time_ms INTEGER,
  tools_used TEXT[],
  user_satisfaction INTEGER, -- 1-5
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

### `agent_secrets`
> Segredos por agente (API keys)

```sql
CREATE TABLE agent_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id),
  secret_name TEXT NOT NULL, -- 'OPENAI_API_KEY', 'ELEVENLABS_KEY'
  secret_key TEXT NOT NULL, -- Nome no vault
  mode TEXT NOT NULL, -- 'production' | 'development'
  description TEXT,
  is_configured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_agent_secrets_unique ON agent_secrets(agent_id, secret_name, mode);
```

---

### `agent_prompt_modules`
> Módulos de prompt por agente

```sql
CREATE TABLE agent_prompt_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id),
  module_id UUID NOT NULL REFERENCES prompt_modules(id),
  is_enabled BOOLEAN DEFAULT true,
  priority_override INTEGER,
  custom_variables JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_agent_modules_unique ON agent_prompt_modules(agent_id, module_id);
```

---

### `prompt_modules`
> Biblioteca de módulos de prompt reutilizáveis

```sql
CREATE TABLE prompt_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- 'greeting', 'objection', 'closing'
  template TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  priority INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);
```

---

## 📄 PROPOSTAS

### `propostas_assinantes` ⭐
> Propostas de energia solar para clientes

```sql
CREATE TABLE propostas_assinantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT UNIQUE, -- ID público para URL
  user_id UUID, -- Quem criou (pode ser null se Sofia)
  
  -- Cliente
  cliente_nome TEXT NOT NULL,
  cliente_cpf_cnpj TEXT,
  cliente_email TEXT,
  cliente_telefone TEXT,
  cliente_endereco TEXT,
  cliente_cidade TEXT,
  cliente_uf TEXT,
  cliente_cep TEXT,
  
  -- Energia
  concessionaria TEXT,
  numero_instalacao TEXT,
  tipo_instalacao TEXT DEFAULT 'Monofásico',
  consumo_medio_kwh NUMERIC,
  valor_conta_atual NUMERIC,
  tarifa_kwh NUMERIC,
  
  -- Proposta Calculada
  desconto_percentual NUMERIC DEFAULT 10,
  fidelidade_meses INTEGER DEFAULT 36,
  economia_mensal NUMERIC,
  economia_acumulada NUMERIC,
  
  -- Plano
  plano_id UUID REFERENCES planos_comerciais(id),
  plano_nome TEXT,
  
  -- Status
  status TEXT DEFAULT 'rascunho', -- 'rascunho' | 'enviada' | 'aceita' | 'recusada'
  
  -- CRM
  bitrix24_lead_id TEXT,
  bitrix24_deal_id TEXT,
  
  -- Origem
  origem TEXT, -- 'manual' | 'sofia' | 'site' | 'bitrix'
  lead_source TEXT,
  
  -- Comercial
  responsavel_comercial TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  enviada_at TIMESTAMPTZ,
  aceita_at TIMESTAMPTZ,
  recusada_at TIMESTAMPTZ
);

CREATE INDEX idx_propostas_user ON propostas_assinantes(user_id);
CREATE INDEX idx_propostas_public_id ON propostas_assinantes(public_id);
CREATE INDEX idx_propostas_bitrix ON propostas_assinantes(bitrix24_lead_id);
CREATE INDEX idx_propostas_status ON propostas_assinantes(status);
```

---

### `propostas_usineiros`
> Propostas para usinas solares

```sql
CREATE TABLE propostas_usineiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  nome_projeto TEXT NOT NULL,
  potencia_mwp NUMERIC,
  capex_total NUMERIC,
  status TEXT DEFAULT 'rascunho',
  -- ... outros campos de usina
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

### `proposal_templates`
> Templates visuais para propostas PDF

```sql
CREATE TABLE proposal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT DEFAULT 'assinante',
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  pages JSONB DEFAULT '[]', -- Estrutura das páginas
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

### `planos_comerciais`
> Planos de desconto disponíveis

```sql
CREATE TABLE planos_comerciais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  desconto_percentual NUMERIC NOT NULL,
  fidelidade_meses INTEGER NOT NULL,
  descricao TEXT,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 🧠 RAG / KNOWLEDGE BASE

### `rag_documents` ⭐
> Documentos na base de conhecimento

```sql
CREATE TABLE rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_path TEXT,
  file_size INTEGER,
  mime_type TEXT,
  
  -- Categorização
  category TEXT, -- 'faq', 'legal', 'pricing', 'process'
  subcategory TEXT,
  source_path TEXT,
  source_type TEXT, -- 'upload' | 'onedrive' | 'url'
  
  -- Processamento
  processing_status TEXT DEFAULT 'pending', -- 'pending' | 'processing' | 'completed' | 'failed'
  chunk_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  error_message TEXT,
  
  -- Metadados
  metadata JSONB DEFAULT '{}',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- OneDrive
  onedrive_item_id TEXT,
  onedrive_modified_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_rag_docs_category ON rag_documents(category);
CREATE INDEX idx_rag_docs_status ON rag_documents(processing_status);
CREATE INDEX idx_rag_docs_active ON rag_documents(is_active);
```

---

### `rag_chunks`
> Chunks de texto com embeddings

```sql
CREATE TABLE rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI embedding dimension
  
  -- Learning
  learning_type TEXT, -- 'good_response' | 'correction' | 'objection_handle'
  is_exemplar BOOLEAN DEFAULT false,
  exemplar_reason TEXT,
  
  -- Metadados
  metadata JSONB DEFAULT '{}',
  token_count INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chunks_document ON rag_chunks(document_id);
CREATE INDEX idx_chunks_embedding ON rag_chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_chunks_exemplar ON rag_chunks(is_exemplar) WHERE is_exemplar = true;
```

---

### `rag_permissions`
> Permissões de acesso por agente

```sql
CREATE TABLE rag_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  category TEXT NOT NULL,
  access_level TEXT DEFAULT 'full', -- 'none' | 'read' | 'full'
  priority INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_rag_perms_unique ON rag_permissions(agent_id, category);
```

---

### `rag_usage_logs`
> Logs de uso do RAG para analytics

```sql
CREATE TABLE rag_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT,
  conversa_id UUID,
  query TEXT,
  results_count INTEGER DEFAULT 0,
  total_chunks INTEGER,
  top_similarity NUMERIC,
  chunks_used TEXT[],
  categories_accessed TEXT[],
  documents_accessed TEXT[],
  response_time_ms INTEGER,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rag_logs_agent ON rag_usage_logs(agent_id);
CREATE INDEX idx_rag_logs_created ON rag_usage_logs(created_at DESC);
```

---

### `rag_cache`
> Cache de buscas frequentes

```sql
CREATE TABLE rag_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash TEXT NOT NULL,
  agent_id TEXT,
  results JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_rag_cache_hash ON rag_cache(query_hash, agent_id);
```

---

### `rag_sync_queue`
> Fila de sincronização OneDrive

```sql
CREATE TABLE rag_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_log_id UUID,
  file_path TEXT NOT NULL,
  onedrive_item_id TEXT,
  operation TEXT DEFAULT 'upsert',
  status TEXT DEFAULT 'pending',
  priority INTEGER DEFAULT 50,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  worker_id TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sync_queue_status ON rag_sync_queue(status);
CREATE INDEX idx_sync_queue_worker ON rag_sync_queue(worker_id) WHERE status = 'processing';
```

---

## 🏢 CRM / BITRIX24

### `crm_contatos`
> Contatos sincronizados do CRM

```sql
CREATE TABLE crm_contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  
  -- Dados do Contato
  nome TEXT,
  cpf_cnpj TEXT,
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  
  -- CRM
  origem TEXT, -- 'proposta_assinante' | 'bitrix' | 'site'
  proposta_id UUID REFERENCES propostas_assinantes(id),
  proposta_tipo TEXT,
  valor_potencial NUMERIC,
  
  -- Interações
  ultima_interacao TIMESTAMPTZ,
  total_interacoes INTEGER DEFAULT 0,
  
  -- Tracking
  criado_por_email TEXT,
  criado_por_nome TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_contatos_telefone ON crm_contatos(telefone);
CREATE INDEX idx_crm_contatos_proposta ON crm_contatos(proposta_id);
```

---

### `bitrix24_sync_logs`
> Logs de sincronização com Bitrix

```sql
CREATE TABLE bitrix24_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL, -- 'create_lead' | 'update_lead' | 'upload_pdf'
  proposta_id UUID REFERENCES propostas_assinantes(id),
  bitrix24_lead_id TEXT,
  status TEXT NOT NULL, -- 'success' | 'error'
  request_data JSONB,
  response_data JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

### `bitrix_stages_config`
> Configuração dos estágios do Kanban

```sql
CREATE TABLE bitrix_stages_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  sort_order INTEGER,
  is_active BOOLEAN DEFAULT true,
  is_blocked BOOLEAN DEFAULT false,
  block_message TEXT,
  should_skip_triage BOOLEAN DEFAULT false,
  should_skip_data_collection BOOLEAN DEFAULT false,
  recommended_mode TEXT,
  recommended_fast_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## ⚙️ CONFIGURAÇÕES

### `configuracoes_sistema` ⭐
> Configurações globais do sistema (key-value)

```sql
CREATE TABLE configuracoes_sistema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT NOT NULL UNIQUE,
  valor TEXT NOT NULL,
  tipo TEXT DEFAULT 'text', -- 'text' | 'json' | 'number' | 'boolean'
  descricao TEXT,
  categoria TEXT,
  is_editable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_config_chave ON configuracoes_sistema(chave);
```

**Chaves importantes:**
- `sofia_whatsapp_enabled` - Liga/desliga a Sofia
- `bitrix24_webhook_url` - URL do Bitrix
- `bitrix24_stage_*` - Mapeamento de estágios
- `default_desconto` - Desconto padrão
- `default_fidelidade` - Fidelidade padrão

---

### `distribuidoras_config`
> Distribuidoras de energia suportadas

```sql
CREATE TABLE distribuidoras_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  nome_normalizado TEXT NOT NULL,
  uf TEXT,
  is_atendida BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 50,
  requires_clarification BOOLEAN DEFAULT false,
  clarification_message TEXT,
  rejection_message TEXT,
  parent_id UUID REFERENCES distribuidoras_config(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_distrib_nome ON distribuidoras_config(nome_normalizado);
CREATE INDEX idx_distrib_uf ON distribuidoras_config(uf);
```

---

### `distribuidora_typos`
> Correção automática de erros de digitação

```sql
CREATE TABLE distribuidora_typos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typo TEXT NOT NULL,
  distribuidora_id UUID REFERENCES distribuidoras_config(id),
  is_confirmed BOOLEAN DEFAULT false,
  occurrences INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_typos_unique ON distribuidora_typos(LOWER(typo));
```

---

### `concessionarias`
> Dados de tarifas ANEEL

```sql
CREATE TABLE concessionarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  sigla_aneel TEXT,
  uf TEXT,
  tarifa_media NUMERIC,
  tarifa_com_impostos NUMERIC,
  tusd NUMERIC,
  tusd_fio_b NUMERIC,
  te NUMERIC,
  pis_cofins NUMERIC,
  subgrupo TEXT,
  modalidade TEXT,
  vigencia_inicio DATE,
  ultima_atualizacao TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 👤 USUÁRIOS / AUTH

### `profiles`
> Perfis de usuários do sistema

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE, -- Referência ao auth.users
  email TEXT,
  nome TEXT,
  telefone TEXT,
  avatar_url TEXT,
  empresa TEXT,
  cargo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_profiles_user ON profiles(user_id);
```

---

### `user_roles`
> Roles de usuários (RBAC)

```sql
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role TEXT NOT NULL, -- 'admin' | 'funcionario'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_user_roles_unique ON user_roles(user_id, role);
```

---

### `whatsapp_atendentes`
> Atendentes humanos de WhatsApp

```sql
CREATE TABLE whatsapp_atendentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  is_available BOOLEAN DEFAULT true,
  max_conversas INTEGER DEFAULT 10,
  conversas_ativas INTEGER DEFAULT 0,
  agents_assigned TEXT[], -- Quais agentes pode atender
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 📞 VOICE / CHAMADAS

### `voice_call_logs`
> Logs de chamadas de voz

```sql
CREATE TABLE voice_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL,
  agent_id TEXT,
  phone TEXT,
  direction TEXT, -- 'inbound' | 'outbound'
  status TEXT, -- 'initiated' | 'ringing' | 'answered' | 'ended' | 'failed'
  duration_seconds INTEGER,
  transcript TEXT,
  recording_url TEXT,
  metadata JSONB DEFAULT '{}',
  conversa_id UUID REFERENCES chatbot_conversas(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ
);
```

---

### `outbound_campaigns`
> Campanhas de ligação outbound

```sql
CREATE TABLE outbound_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT DEFAULT 'draft', -- 'draft' | 'active' | 'paused' | 'completed'
  target_phones JSONB DEFAULT '[]',
  schedule_config JSONB,
  stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 📊 ANALYTICS / LOGS

### `activity_logs`
> Log de atividades de usuários

```sql
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  user_email TEXT,
  user_nome TEXT,
  action TEXT NOT NULL, -- 'create' | 'update' | 'delete'
  entity_type TEXT NOT NULL, -- 'proposta_assinante' | 'ai_agent'
  entity_id UUID,
  entity_name TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_user ON activity_logs(user_id);
CREATE INDEX idx_activity_entity ON activity_logs(entity_type);
CREATE INDEX idx_activity_created ON activity_logs(created_at DESC);
```

---

### `whatsapp_webhook_events`
> Todos os eventos recebidos do WhatsApp

```sql
CREATE TABLE whatsapp_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT DEFAULT 'chatapp',
  phone TEXT,
  chat_id TEXT,
  message_preview TEXT,
  payload_full JSONB,
  parsed_ok BOOLEAN DEFAULT false,
  error_message TEXT,
  processing_time_ms INTEGER,
  conversa_id UUID,
  received_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_webhook_phone ON whatsapp_webhook_events(phone);
CREATE INDEX idx_webhook_received ON whatsapp_webhook_events(received_at DESC);
```

---

### `sofia_detection_patterns`
> Padrões de detecção da IA

```sql
CREATE TABLE sofia_detection_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL, -- 'objection' | 'intent' | 'entity'
  subcategory TEXT,
  pattern TEXT NOT NULL, -- Regex ou keyword
  response_template TEXT,
  action TEXT, -- 'respond' | 'escalate' | 'ignore'
  priority INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT true,
  examples JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 🔒 OPERACIONAL (Locks, Buffers, Queues)

### `message_processing_locks`
> Locks para evitar processamento duplicado

```sql
CREATE TABLE message_processing_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_normalized TEXT NOT NULL,
  agent_id TEXT,
  locked_by TEXT NOT NULL, -- ID da instância
  locked_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX idx_locks_phone ON message_processing_locks(phone_normalized);
```

---

### `message_buffers`
> Buffer de mensagens para humanização

```sql
CREATE TABLE message_buffers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  agent_id TEXT,
  messages JSONB DEFAULT '[]',
  session_started_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  is_processing BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_buffer_phone ON message_buffers(phone, agent_id);
```

---

### `cross_webhook_locks`
> Locks cross-webhook (evita race conditions)

```sql
CREATE TABLE cross_webhook_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_normalized TEXT NOT NULL UNIQUE,
  lead_id TEXT,
  locked_by TEXT NOT NULL,
  lock_purpose TEXT DEFAULT 'processing',
  locked_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
```

---

### `outbound_message_hashes`
> Deduplicação de mensagens outbound

```sql
CREATE TABLE outbound_message_hashes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_hash TEXT NOT NULL,
  phone TEXT NOT NULL,
  agent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_outbound_hash ON outbound_message_hashes(message_hash, phone);
```

---

## 🔄 APRENDIZADO

### `client_behavioral_profiles`
> Perfis comportamentais de clientes

```sql
CREATE TABLE client_behavioral_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  
  -- Scores (0-100)
  objective_score INTEGER, -- Objetivo vs. emocional
  skeptical_score INTEGER, -- Cético vs. confiante
  technical_score INTEGER, -- Técnico vs. leigo
  elderly_score INTEGER, -- Idoso vs. jovem
  confused_score INTEGER, -- Confuso vs. claro
  
  -- Perfil dominante
  dominant_profile TEXT, -- 'objective' | 'skeptical' | 'technical'
  profile_confidence NUMERIC,
  preferred_tone TEXT, -- 'formal' | 'casual' | 'technical'
  
  -- Métricas
  avg_message_length INTEGER,
  avg_response_time_seconds INTEGER,
  clarifications_needed INTEGER,
  objections_count INTEGER,
  
  -- Histórico
  total_conversations INTEGER DEFAULT 0,
  total_messages_analyzed INTEGER DEFAULT 0,
  last_conversa_id UUID,
  
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

### `rag_conversion_attribution`
> Atribuição de conversões ao RAG

```sql
CREATE TABLE rag_conversion_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL,
  conversion_type TEXT NOT NULL, -- 'proposal_sent' | 'contract_signed'
  rag_influenced BOOLEAN DEFAULT false,
  chunks_in_session JSONB DEFAULT '[]',
  top_chunk_categories TEXT[],
  avg_similarity_session NUMERIC,
  total_rag_queries INTEGER DEFAULT 0,
  converted_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 📈 SUMÁRIO DE ÍNDICES

| Tabela | Índices | Propósito |
|--------|---------|-----------|
| `chatbot_conversas` | 12 | Busca por telefone, agente, status |
| `chatbot_mensagens` | 3 | Busca por conversa, dedup message_id |
| `rag_chunks` | 3 | Busca por embedding (IVFFlat) |
| `propostas_assinantes` | 5 | Busca por user, status, bitrix |
| `whatsapp_webhook_events` | 2 | Logs por telefone e tempo |
| `activity_logs` | 4 | Auditoria por user, entity |

---

## 🔐 RLS POLICIES (Resumo)

| Tabela | Política | Condição |
|--------|----------|----------|
| `profiles` | Próprio usuário | `auth.uid() = user_id` |
| `propostas_assinantes` | Próprio ou admin | `user_id = auth.uid() OR is_admin()` |
| `ai_agents` | Authenticated | `auth.role() = 'authenticated'` |
| `configuracoes_sistema` | Admin only (write) | `is_admin(auth.uid())` |
| `chatbot_*` | Service role | Service role bypass |

---

## 🔧 FUNÇÕES DO BANCO

| Função | Propósito |
|--------|-----------|
| `normalize_br_phone(phone)` | Normaliza telefone BR (12→13 dígitos) |
| `find_distribuidora(input)` | Busca distribuidora com fuzzy match |
| `acquire_phone_lock(phone, agent, instance)` | Adquire lock de processamento |
| `release_phone_lock(phone, instance)` | Libera lock |
| `match_rag_chunks(embedding, threshold, count)` | Busca semântica com vector |
| `claim_conversation_for_processing(id)` | Lock atômico de conversa |
| `mark_proposal_sent_atomic(id)` | Marca proposta enviada atomicamente |
| `is_admin(user_id)` | Verifica se é admin |
| `log_activity(...)` | Registra atividade |

---

**Última atualização:** 2026-02-02  
**Total de tabelas:** 95  
**Total de índices:** 200+  
**Total de políticas RLS:** 100+
