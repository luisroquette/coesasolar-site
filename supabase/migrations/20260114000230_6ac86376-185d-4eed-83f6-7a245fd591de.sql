-- Add configuration for signed contract stage (in Deals/Negócios kanban)
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('bitrix24_deal_stage_contrato_assinado', 'WON', 'Etapa do kanban de Negócios que indica contrato assinado')
ON CONFLICT (chave) DO NOTHING;