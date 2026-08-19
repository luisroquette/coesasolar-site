-- Criar tabela de auditoria para alterações de configuração
CREATE TABLE public.configuracoes_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chave TEXT NOT NULL,
  valor_anterior TEXT,
  valor_novo TEXT NOT NULL,
  alterado_por_id UUID,
  alterado_por_email TEXT,
  alterado_por_nome TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar índices para consultas frequentes
CREATE INDEX idx_config_audit_chave ON public.configuracoes_audit_log(chave);
CREATE INDEX idx_config_audit_created_at ON public.configuracoes_audit_log(created_at DESC);
CREATE INDEX idx_config_audit_user ON public.configuracoes_audit_log(alterado_por_id);

-- Habilitar RLS
ALTER TABLE public.configuracoes_audit_log ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver o log de auditoria
CREATE POLICY "Admins can view audit logs"
ON public.configuracoes_audit_log
FOR SELECT
USING (is_admin(auth.uid()));

-- Sistema pode inserir logs (via service role)
CREATE POLICY "System can insert audit logs"
ON public.configuracoes_audit_log
FOR INSERT
WITH CHECK (true);

-- Adicionar comentários
COMMENT ON TABLE public.configuracoes_audit_log IS 'Log de auditoria para alterações em configuracoes_sistema';
COMMENT ON COLUMN public.configuracoes_audit_log.chave IS 'Chave da configuração alterada';
COMMENT ON COLUMN public.configuracoes_audit_log.valor_anterior IS 'Valor antes da alteração (null se era novo)';
COMMENT ON COLUMN public.configuracoes_audit_log.valor_novo IS 'Novo valor após alteração';