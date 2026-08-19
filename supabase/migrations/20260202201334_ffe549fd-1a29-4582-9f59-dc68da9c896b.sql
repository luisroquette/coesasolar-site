
-- ═══════════════════════════════════════════════════════════════════════════════
-- P2: Fix RLS Policies - Corrigir políticas USING(true) críticas
-- Sprint 1 do Plano de Remediação RLS (Continuação após falha parcial)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Nota: As primeiras 3 políticas (agent_prompt_modules, agent_secrets, crm_contatos)
-- já foram aplicadas na tentativa anterior antes do erro de sintaxe.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Adicionar política para admins visualizarem todos os contatos
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drop primeiro para evitar duplicata
DROP POLICY IF EXISTS "Admins can view all contacts" ON crm_contatos;
CREATE POLICY "Admins can view all contacts" ON crm_contatos
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all contacts" ON crm_contatos;
CREATE POLICY "Admins can update all contacts" ON crm_contatos
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete all contacts" ON crm_contatos;
CREATE POLICY "Admins can delete all contacts" ON crm_contatos
  FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. BATCH_LEARNING_EVALUATIONS - Restringir UPDATE para admins
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated users can update evaluations" ON batch_learning_evaluations;

CREATE POLICY "Admins can update evaluations" ON batch_learning_evaluations
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. BATCH_LEARNING_JOBS - Restringir UPDATE para admins
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated users can update batch jobs" ON batch_learning_jobs;

CREATE POLICY "Admins can update batch jobs" ON batch_learning_jobs
  FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. CLIENT_BEHAVIORAL_PROFILES - Converter service_role check
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Service role full access to client_behavioral_profiles" ON client_behavioral_profiles;

CREATE POLICY "Service role full access to client_behavioral_profiles" ON client_behavioral_profiles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. CROSS_WEBHOOK_LOCKS - Converter service_role check
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Service role full access" ON cross_webhook_locks;

CREATE POLICY "Service role full access" ON cross_webhook_locks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. CHATBOT_MENSAGENS_PENDENTES - Converter service_role check
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Service role full access" ON chatbot_mensagens_pendentes;

CREATE POLICY "Service role full access" ON chatbot_mensagens_pendentes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins can view pending messages" ON chatbot_mensagens_pendentes;
CREATE POLICY "Admins can view pending messages" ON chatbot_mensagens_pendentes
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. BITRIX24_SYNC_LOCKS - Converter service_role check
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Service role can manage sync locks" ON bitrix24_sync_locks;

CREATE POLICY "Service role can manage sync locks" ON bitrix24_sync_locks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
