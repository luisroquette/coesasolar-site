-- Deletar learned typos que são palavras genéricas (causaram o bug)
DELETE FROM distribuidora_typos_log 
WHERE LOWER(typo_detectado) IN ('energia', 'ener', 'energ', 'solar', 'conta', 'luz', 'coesa', 'desconto', 'economizar', 'economiza');

-- Resetar a conversa do Thácio para que a Sofia possa atendê-lo corretamente
UPDATE chatbot_conversas 
SET 
  dados_coletados = COALESCE(dados_coletados, '{}'::jsonb) - 'distribuidoraInformada' - 'distribuidoraNaoAtendida',
  sofia_mode = 'standard',
  awaiting_response = true
WHERE cliente_telefone = '553497952915';