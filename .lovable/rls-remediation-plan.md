# 🔒 Plano de Remediação RLS - Políticas USING(true)

**Data:** 2026-02-02  
**Total de Políticas Afetadas:** ~50  
**Classificação:** Por Prioridade de Risco

---

## 📊 Resumo Executivo

| Prioridade | Quantidade | Descrição |
|------------|------------|-----------|
| 🔴 CRÍTICA | 8 | Dados sensíveis de usuário/propostas - REQUER user_id |
| 🟠 ALTA | 12 | Dados administrativos - REQUER is_admin() |
| 🟡 MÉDIA | 18 | Dados compartilhados da equipe - REQUER authenticated |
| 🟢 BAIXA | 12 | Dados de configuração/lookup - OK como estão |

---

## 🔴 PRIORIDADE CRÍTICA (Fase 1 - Imediata)

### Tabelas que REQUEREM restrição por `user_id`

Estas tabelas contêm dados pessoais/financeiros vinculados a usuários específicos:

| Tabela | Coluna FK | Políticas Afetadas | Correção |
|--------|-----------|-------------------|----------|
| **propostas_assinantes** | `user_id` | INSERT, UPDATE, DELETE | `auth.uid() = user_id` |
| **propostas_usineiros** | `user_id` | INSERT, UPDATE, DELETE | `auth.uid() = user_id` |
| **crm_contatos** | `user_id` | SELECT, UPDATE, DELETE | `auth.uid() = user_id` |
| **employee_goals** | `user_id` | SELECT, UPDATE, DELETE | `auth.uid() = user_id OR is_admin(auth.uid())` |
| **email_preferences** | `user_id` | ALL | `auth.uid() = user_id` |
| **profiles** | `user_id` | UPDATE | `auth.uid() = user_id` |
| **dados_empresa_pj** | `proposta_id` → user | SELECT (após insert) | Via join com proposta |
| **whatsapp_blacklist** | `created_by` | DELETE | `auth.uid() = created_by OR is_admin()` |

### Migração SQL Sugerida (Fase 1):

```sql
-- PROPOSTAS_ASSINANTES
DROP POLICY IF EXISTS "Users can insert own propostas" ON propostas_assinantes;
CREATE POLICY "Users can insert own propostas" ON propostas_assinantes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own propostas" ON propostas_assinantes;
CREATE POLICY "Users can update own propostas" ON propostas_assinantes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- CRM_CONTATOS
DROP POLICY IF EXISTS "Service role can insert contacts" ON crm_contatos;
CREATE POLICY "Users can insert own contacts" ON crm_contatos
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own contacts" ON crm_contatos;  
CREATE POLICY "Users can update own contacts" ON crm_contatos
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- EMPLOYEE_GOALS (próprio ou admin)
DROP POLICY IF EXISTS "Authenticated users can view employee_goals" ON employee_goals;
CREATE POLICY "Users view own or admin all" ON employee_goals
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin(auth.uid()));
```

---

## 🟠 PRIORIDADE ALTA (Fase 2 - Admin Only)

### Tabelas que REQUEREM `is_admin(auth.uid())`

Dados de configuração do sistema que apenas admins devem modificar:

| Tabela | Operações Afetadas | Correção |
|--------|-------------------|----------|
| **ai_agents** | INSERT, UPDATE, DELETE | `is_admin(auth.uid())` |
| **ai_agent_versions** | INSERT, UPDATE, DELETE | `is_admin(auth.uid())` |
| **ai_agent_interactions** | INSERT, UPDATE | `is_admin(auth.uid())` |
| **agent_prompt_modules** | ALL exceto SELECT | `is_admin(auth.uid())` |
| **agent_secrets** | ALL exceto SELECT | `is_admin(auth.uid())` |
| **sofia_detection_patterns** | INSERT, UPDATE, DELETE | `is_admin(auth.uid())` |
| **prompt_modules** | INSERT, UPDATE, DELETE | `is_admin(auth.uid())` |
| **business_rules_guardrails** | INSERT, UPDATE, DELETE | `is_admin(auth.uid())` |
| **configuracoes_sistema** | UPDATE | `is_admin(auth.uid())` |
| **rag_documents** | DELETE | `is_admin(auth.uid())` |
| **rag_permissions** | ALL | `is_admin(auth.uid())` |
| **outbound_campaigns** | INSERT, UPDATE, DELETE | `is_admin(auth.uid())` |

### Migração SQL Sugerida (Fase 2):

```sql
-- AGENT_PROMPT_MODULES
DROP POLICY IF EXISTS "Usuários autenticados podem modificar agent prompt modules" ON agent_prompt_modules;
CREATE POLICY "Admins can modify agent prompt modules" ON agent_prompt_modules
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- AGENT_SECRETS
DROP POLICY IF EXISTS "Authenticated users can manage agent secrets" ON agent_secrets;
CREATE POLICY "Admins can manage agent secrets" ON agent_secrets
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- SOFIA_DETECTION_PATTERNS
DROP POLICY IF EXISTS "Authenticated users can modify detection patterns" ON sofia_detection_patterns;
CREATE POLICY "Admins can modify detection patterns" ON sofia_detection_patterns
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));
```

---

## 🟡 PRIORIDADE MÉDIA (Fase 3 - Equipe)

### Tabelas compartilhadas por toda equipe autenticada

Dados operacionais que todos os funcionários precisam acessar, mas escritas devem ser controladas:

| Tabela | SELECT | INSERT | UPDATE/DELETE |
|--------|--------|--------|---------------|
| **chatbot_conversas** | ✅ authenticated | ⚠️ service_role only | ⚠️ service_role only |
| **chatbot_mensagens** | ✅ authenticated | ⚠️ service_role only | ❌ never |
| **batch_learning_**** | ✅ authenticated | ✅ authenticated | 🔒 is_admin |
| **rag_sync_****** | ✅ authenticated | 🔒 service_role | 🔒 service_role |
| **bitrix24_sync_**** | 🔒 is_admin | 🔒 service_role | 🔒 service_role |
| **distribuidora_typos** | ✅ authenticated | 🔒 service_role | 🔒 is_admin |
| **webhook_logs** | 🔒 is_admin | 🔒 service_role | ❌ never |

### Migração SQL Sugerida (Fase 3):

```sql
-- BATCH_LEARNING_EVALUATIONS - manter INSERT livre, restringir UPDATE
DROP POLICY IF EXISTS "Authenticated users can update evaluations" ON batch_learning_evaluations;
CREATE POLICY "Admins can update evaluations" ON batch_learning_evaluations
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()));

-- CHATBOT_MENSAGENS - apenas service_role insere
DROP POLICY IF EXISTS "Service role can insert messages" ON chatbot_mensagens;
CREATE POLICY "Service role inserts messages" ON chatbot_mensagens
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
```

---

## 🟢 PRIORIDADE BAIXA (Fase 4 - Lookup/Config)

### Tabelas que podem manter USING(true) para SELECT

Dados públicos ou de referência sem informação sensível:

| Tabela | Justificativa | Ação |
|--------|--------------|------|
| **bandeiras_tarifarias** | Dados públicos de tarifas | ✅ Manter |
| **cidades** | Lookup geográfico | ✅ Manter |
| **concessionarias** | Dados públicos de utilities | ✅ Manter |
| **cronograma_gd2** | Dados regulatórios públicos | ✅ Manter |
| **distribuidoras_config** | Configuração de distribuidoras | ✅ Manter SELECT |
| **deterministic_response_templates** | Templates de resposta | ✅ Manter SELECT |
| **bitrix_stages_config** | Configuração CRM | ✅ Manter SELECT |
| **quick_replies** | Respostas rápidas | ✅ Manter SELECT |
| **proposal_templates** | Templates de proposta | ✅ Manter SELECT |

---

## 🔐 Políticas SERVICE_ROLE (Manter Como Estão)

Estas políticas são intencionalmente permissivas para Edge Functions:

| Tabela | Razão |
|--------|-------|
| **chatbot_conversas** | Criadas por webhooks externos |
| **chatbot_mensagens** | Inseridas por pipeline Sofia |
| **chatbot_followups** | Agendadas por sistema |
| **message_buffers** | Buffer interno do sistema |
| **message_processing_locks** | Locks de concorrência |
| **cross_webhook_locks** | Locks entre webhooks |
| **rag_embedding_cache** | Cache de embeddings |
| **rag_usage_logs** | Logs de uso |
| **outbound_message_hashes** | Deduplicação |
| **client_behavioral_profiles** | Perfis comportamentais |

⚠️ **IMPORTANTE:** Estas tabelas devem ter políticas que checam `auth.role() = 'service_role'` em vez de `true`.

---

## 📋 Ordem de Execução Recomendada

### Sprint 1 (Crítico - 1-2 dias)
1. [ ] propostas_assinantes
2. [ ] propostas_usineiros  
3. [ ] crm_contatos
4. [ ] email_preferences
5. [ ] employee_goals
6. [ ] profiles (UPDATE)

### Sprint 2 (Admin - 2-3 dias)
7. [ ] ai_agents (CUD)
8. [ ] agent_prompt_modules (CUD)
9. [ ] agent_secrets (CUD)
10. [ ] sofia_detection_patterns (CUD)
11. [ ] prompt_modules (CUD)
12. [ ] business_rules_guardrails (CUD)
13. [ ] configuracoes_sistema (U)
14. [ ] rag_permissions
15. [ ] outbound_campaigns

### Sprint 3 (Operacional - 1-2 dias)
16. [ ] batch_learning_* (UPDATE → admin)
17. [ ] chatbot_* (INSERT → service_role)
18. [ ] webhook_logs (SELECT → admin)
19. [ ] distribuidora_typos (CUD → admin/service)

### Sprint 4 (Cleanup)
20. [ ] Converter USING(true) service_role → auth.role() = 'service_role'
21. [ ] Auditar tabelas restantes

---

## 🧪 Teste de Regressão

Após cada Sprint, validar:

```sql
-- Verificar políticas restantes com USING(true)
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies 
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true')
ORDER BY tablename;
```

### Testes Funcionais:
1. Login como funcionário → criar proposta → deve funcionar
2. Login como funcionário → ver proposta de outro → deve falhar
3. Login como admin → ver todas propostas → deve funcionar
4. Webhook Z-API → criar conversa → deve funcionar (service_role)
5. Edge function → inserir log → deve funcionar (service_role)

---

## 📝 Notas de Implementação

### Pattern para user_id:
```sql
CREATE POLICY "policy_name" ON table_name
  FOR operation TO authenticated
  USING (auth.uid() = user_id);
```

### Pattern para admin-only:
```sql
CREATE POLICY "policy_name" ON table_name  
  FOR operation TO authenticated
  USING (is_admin(auth.uid()));
```

### Pattern para user_id + admin:
```sql
CREATE POLICY "policy_name" ON table_name
  FOR operation TO authenticated
  USING (auth.uid() = user_id OR is_admin(auth.uid()));
```

### Pattern para service_role:
```sql
CREATE POLICY "policy_name" ON table_name
  FOR operation
  USING (auth.role() = 'service_role');
```

---

**Próximo Passo:** Aprovar plano e iniciar Sprint 1?
