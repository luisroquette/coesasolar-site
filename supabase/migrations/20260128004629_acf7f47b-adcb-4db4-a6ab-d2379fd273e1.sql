-- Corrigir campos obrigatórios para proposta inicial
-- E-mail DEVE ser obrigatório, não "whatsappOuEmail"
UPDATE configuracoes_sistema 
SET valor = '["nome","email","concessionaria","valorConta"]',
    updated_at = now()
WHERE chave = 'automation_required_fields_inicial';

-- Criar log de auditoria
INSERT INTO configuracoes_audit_log (chave, valor_anterior, valor_novo, alterado_por_nome, alterado_por_email)
VALUES (
  'automation_required_fields_inicial',
  '["nome","whatsappOuEmail","concessionaria","valorConta"]',
  '["nome","email","concessionaria","valorConta"]',
  'Lovable AI',
  'ai@lovable.dev'
);