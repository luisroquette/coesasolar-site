-- Adicionar configuração do novo estágio para concessionárias não atendidas
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES (
  'bitrix24_stage_concessionaria_nao_atendida',
  'UC_56ZLAR',
  'Estágio Bitrix24 para leads descartados por concessionária não atendida. Permite reativação futura quando novas regiões forem atendidas.'
);