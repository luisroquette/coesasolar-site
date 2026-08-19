-- Fix 1: Remove overly permissive public SELECT policy on propostas_assinantes
-- Public access is now handled through the public-proposal edge function (service_role)
DROP POLICY IF EXISTS "Public can view proposals by ID" ON propostas_assinantes;

-- Create authenticated-only policy: owners, admins, or system proposals
CREATE POLICY "Authenticated users can view own or admin proposals"
ON propostas_assinantes FOR SELECT
TO authenticated
USING (
  (user_id = auth.uid()) OR
  is_admin(auth.uid())
);

-- Fix 2: Restrict ai_agents SELECT to hide token fields from non-admins
-- Drop existing overly permissive policy
DROP POLICY IF EXISTS "Funcionarios can view ai_agents" ON ai_agents;

-- Non-admin authenticated users can view ai_agents but RLS can't filter columns,
-- so we restrict the whole table to admin-only and use edge function for non-admin access
CREATE POLICY "Admins can fully access ai_agents"
ON ai_agents FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- Keep existing update policy restricted to admins
DROP POLICY IF EXISTS "Funcionarios can update ai_agents" ON ai_agents;
CREATE POLICY "Admins can update ai_agents"
ON ai_agents FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));