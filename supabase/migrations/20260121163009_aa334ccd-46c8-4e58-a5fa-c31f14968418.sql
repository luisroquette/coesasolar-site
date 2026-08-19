-- Tabela para armazenar templates de propostas editáveis
CREATE TABLE proposal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('inicial', 'definitiva')),
  pages JSONB NOT NULL DEFAULT '[]',
  thumbnail_url TEXT,
  is_active BOOLEAN DEFAULT false,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_proposal_templates_type ON proposal_templates(type);
CREATE INDEX idx_proposal_templates_active ON proposal_templates(is_active);

-- RLS
ALTER TABLE proposal_templates ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem gerenciar templates
CREATE POLICY "Admins can manage templates"
  ON proposal_templates FOR ALL
  USING (is_admin(auth.uid()));

-- Usuários autenticados podem ver templates ativos
CREATE POLICY "Authenticated can view active templates"
  ON proposal_templates FOR SELECT
  USING (is_active = true AND auth.uid() IS NOT NULL);

-- Trigger para updated_at
CREATE TRIGGER update_proposal_templates_updated_at
  BEFORE UPDATE ON proposal_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();