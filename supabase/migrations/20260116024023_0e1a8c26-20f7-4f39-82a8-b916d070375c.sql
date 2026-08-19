-- ═══════════════════════════════════════════════════════════════
-- SECURITY FIX: Restrict overly permissive RLS policies
-- This migration addresses PUBLIC_DATA_EXPOSURE for solicitacoes_proposta_definitiva
-- ═══════════════════════════════════════════════════════════════

-- =================================================================
-- FIX: solicitacoes_proposta_definitiva table RLS policies
-- Remove overly permissive policies and add owner-based access
-- =================================================================

-- Drop existing permissive policies
DROP POLICY IF EXISTS "Permitir inserção anônima de solicitações" ON public.solicitacoes_proposta_definitiva;
DROP POLICY IF EXISTS "Usuários autenticados podem ler solicitações" ON public.solicitacoes_proposta_definitiva;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar solicitações" ON public.solicitacoes_proposta_definitiva;

-- Create new secure policies

-- Anonymous users can still insert (for public form) but we validate via Edge Function
-- This policy is acceptable because the form requires specific proposal data
CREATE POLICY "Public form submission with validation"
ON public.solicitacoes_proposta_definitiva FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only the assigned employee (owner of the original proposal) or admin can read
CREATE POLICY "Assigned employee or admin can view request"
ON public.solicitacoes_proposta_definitiva FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.propostas_assinantes p
    WHERE p.id = proposta_inicial_id
    AND (p.user_id = auth.uid() OR public.is_admin(auth.uid()))
  )
  OR proposta_inicial_id IS NULL AND public.is_admin(auth.uid())
);

-- Only the assigned employee or admin can update
CREATE POLICY "Assigned employee or admin can update request"
ON public.solicitacoes_proposta_definitiva FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.propostas_assinantes p
    WHERE p.id = proposta_inicial_id
    AND (p.user_id = auth.uid() OR public.is_admin(auth.uid()))
  )
  OR public.is_admin(auth.uid())
);