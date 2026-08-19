-- =====================================================
-- CORREÇÃO DE SEGURANÇA: chatbot_conversas e chatbot_mensagens
-- =====================================================
-- Remove políticas permissivas e implementa acesso adequado
-- Edge Functions usam service_role_key, que ignora RLS

-- =====================================================
-- 1. REMOVER POLÍTICAS VULNERÁVEIS - chatbot_conversas
-- =====================================================
DROP POLICY IF EXISTS "Public can insert conversations" ON public.chatbot_conversas;
DROP POLICY IF EXISTS "Public can update conversations" ON public.chatbot_conversas;
DROP POLICY IF EXISTS "Authenticated users can view conversations" ON public.chatbot_conversas;

-- =====================================================
-- 2. CRIAR POLÍTICAS SEGURAS - chatbot_conversas
-- =====================================================

-- Admins podem ver todas as conversas
-- (já existe, mantém)

-- Funcionários podem ver conversas de propostas que criaram ou foram atribuídas
CREATE POLICY "Users can view conversations from their proposals"
ON public.chatbot_conversas FOR SELECT
TO authenticated
USING (
  -- É o agente humano atribuído
  human_agent_id = auth.uid()
  -- Ou é dono da proposta vinculada
  OR EXISTS (
    SELECT 1 FROM public.propostas_assinantes p
    WHERE p.id = chatbot_conversas.proposta_id
    AND p.user_id = auth.uid()
  )
  -- Ou é admin
  OR public.is_admin(auth.uid())
);

-- Agentes podem atualizar conversas atribuídas a eles
CREATE POLICY "Agents can update assigned conversations"
ON public.chatbot_conversas FOR UPDATE
TO authenticated
USING (
  human_agent_id = auth.uid()
  OR public.is_admin(auth.uid())
);

-- =====================================================
-- 3. REMOVER POLÍTICAS VULNERÁVEIS - chatbot_mensagens  
-- =====================================================
DROP POLICY IF EXISTS "Public can insert messages" ON public.chatbot_mensagens;
DROP POLICY IF EXISTS "Authenticated users can view messages" ON public.chatbot_mensagens;

-- =====================================================
-- 4. CRIAR POLÍTICAS SEGURAS - chatbot_mensagens
-- =====================================================

-- Usuários podem ver mensagens de conversas que têm acesso
CREATE POLICY "Users can view messages from accessible conversations"
ON public.chatbot_mensagens FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chatbot_conversas c
    LEFT JOIN public.propostas_assinantes p ON c.proposta_id = p.id
    WHERE c.id = chatbot_mensagens.conversa_id
    AND (
      c.human_agent_id = auth.uid()
      OR p.user_id = auth.uid()
      OR public.is_admin(auth.uid())
    )
  )
);

-- Agentes podem inserir mensagens em conversas atribuídas a eles
CREATE POLICY "Agents can insert messages in assigned conversations"
ON public.chatbot_mensagens FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chatbot_conversas c
    WHERE c.id = chatbot_mensagens.conversa_id
    AND (
      c.human_agent_id = auth.uid()
      OR public.is_admin(auth.uid())
    )
  )
);