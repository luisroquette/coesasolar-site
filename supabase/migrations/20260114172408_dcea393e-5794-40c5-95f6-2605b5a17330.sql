-- =====================================================
-- CORREÇÃO DE SEGURANÇA: propostas_assinantes
-- =====================================================
-- Remove políticas públicas permissivas
-- O acesso público agora é feito via Edge Function com service_role

-- 1. REMOVER POLÍTICAS VULNERÁVEIS
DROP POLICY IF EXISTS "Public can view proposal by id for acceptance" ON public.propostas_assinantes;
DROP POLICY IF EXISTS "Public can update proposal status for acceptance" ON public.propostas_assinantes;

-- 2. GARANTIR QUE RLS ESTÁ HABILITADO
ALTER TABLE public.propostas_assinantes ENABLE ROW LEVEL SECURITY;

-- 3. VERIFICAR POLÍTICAS EXISTENTES PARA USUÁRIOS AUTENTICADOS
-- (As políticas abaixo já existem, mas vamos garantir que estão corretas)

-- Admins podem ver todas as propostas
DROP POLICY IF EXISTS "Admins can view all proposals" ON public.propostas_assinantes;
CREATE POLICY "Admins can view all proposals"
ON public.propostas_assinantes FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Admins podem atualizar todas as propostas
DROP POLICY IF EXISTS "Admins can update all proposals" ON public.propostas_assinantes;
CREATE POLICY "Admins can update all proposals"
ON public.propostas_assinantes FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

-- Admins podem deletar todas as propostas
DROP POLICY IF EXISTS "Admins can delete all proposals" ON public.propostas_assinantes;
CREATE POLICY "Admins can delete all proposals"
ON public.propostas_assinantes FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));