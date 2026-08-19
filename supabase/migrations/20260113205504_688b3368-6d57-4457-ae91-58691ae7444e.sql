-- Adicionar configuração para controle de pausa da sofIA no WhatsApp
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES ('sofia_whatsapp_enabled', 'true', 'Controla se a sofIA responde automaticamente no WhatsApp')
ON CONFLICT (chave) DO NOTHING;