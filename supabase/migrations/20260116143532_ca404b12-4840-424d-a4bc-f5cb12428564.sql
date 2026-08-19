-- Remove the FK constraint that's causing the failure
ALTER TABLE propostas_assinantes DROP CONSTRAINT IF EXISTS propostas_assinantes_user_id_fkey;

-- Make user_id nullable (for proposals created by sofIA system)
ALTER TABLE propostas_assinantes ALTER COLUMN user_id DROP NOT NULL;

-- Update RLS policy to allow admins to see system proposals (user_id = NULL)
DROP POLICY IF EXISTS "Users can view their own proposals" ON propostas_assinantes;

CREATE POLICY "Users can view own or system proposals"
  ON propostas_assinantes FOR SELECT
  USING (
    user_id IS NULL 
    OR auth.uid() = user_id 
    OR is_admin(auth.uid())
  );