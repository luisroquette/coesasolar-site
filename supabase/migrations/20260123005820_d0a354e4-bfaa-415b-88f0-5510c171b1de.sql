-- ═══════════════════════════════════════════════════════════════
-- ZERO HARDCODE FASE 5: Templates de Mídia, Delay, RAG-FIRST e Operador
-- ═══════════════════════════════════════════════════════════════

-- CATEGORIA: media_capability (Mensagens de capacidades de mídia)
INSERT INTO sofia_message_templates (category, template_key, template_text, variables, description, priority) VALUES
('media_capability', 'audio_disabled', 'Oi! 👋 No momento estou com a transcrição de áudio em manutenção. Pode me enviar por texto? 📝', '{}', 'Mensagem quando transcrição de áudio está desativada', 100),
('media_capability', 'audio_inaudible', 'Desculpa, não consegui ouvir o áudio. Pode repetir por texto? 🎤', '{}', 'Mensagem quando áudio é inaudível', 100),
('media_capability', 'image_disabled', E'Oi! 👋 No momento estou com a análise de imagens em manutenção. Pode me descrever o que está na imagem? 📝\n\nSe for sua conta de luz, me informe:\n• Valor da última fatura\n• Nome da distribuidora (CEMIG, Coelba ou CPFL Paulista)', '{}', 'Mensagem quando análise de imagem está desativada', 100),
('media_capability', 'image_analysis_failed', 'Recebi sua imagem! 📷 Infelizmente não consegui analisá-la. Pode me descrever o que ela mostra?', '{}', 'Mensagem quando análise de imagem falha', 100),
('media_capability', 'pdf_disabled', E'Oi! 👋 No momento estou com a leitura de PDFs em manutenção. Pode me enviar como *foto* ou me descrever o conteúdo? 📝\n\nSe for sua conta de luz, me informe:\n• Valor da última fatura\n• Nome da distribuidora (CEMIG, Coelba ou CPFL Paulista)', '{}', 'Mensagem quando análise de PDF está desativada', 100),
('media_capability', 'pdf_analysis_failed', 'Recebi seu PDF! 📄 Infelizmente não consegui ler o conteúdo. Pode me enviar como imagem ou me contar o que tem nele?', '{}', 'Mensagem quando análise de PDF falha', 100),
('media_capability', 'unsupported_document', 'Recebi seu documento! 📄 No momento, só consigo analisar arquivos PDF. Pode me enviar nesse formato?', '{}', 'Mensagem quando documento não é PDF', 100)
ON CONFLICT DO NOTHING;

-- CATEGORIA: delay_intent (Mensagens de intenção de delay)
INSERT INTO sofia_message_templates (category, template_key, template_text, variables, description, priority) VALUES
('delay_intent', 'acknowledgment', 'Perfeito, fico no aguardo! 😊', '{}', 'Confirmação quando cliente diz que vai enviar depois', 100)
ON CONFLICT DO NOTHING;

-- CATEGORIA: rag_first (Bloco RAG-FIRST do system prompt)
INSERT INTO sofia_message_templates (category, template_key, template_text, variables, description, priority) VALUES
('rag_first', 'header', E'═══════════════════════════════════════════════════════════════\n🎯 FONTE PRIMÁRIA DE CONHECIMENTO (RAG-FIRST)\n═══════════════════════════════════════════════════════════════', '{}', 'Cabeçalho do bloco RAG-FIRST', 100),
('rag_first', 'attention', E'⚠️ ATENÇÃO CRÍTICA: Os documentos abaixo foram recuperados especificamente \npara responder à pergunta do cliente. ELES TÊM PRIORIDADE SOBRE TUDO.', '{}', 'Aviso de prioridade do RAG', 100),
('rag_first', 'sources_line', E'📂 Fontes consultadas: {formatted_categories}\n📊 Documentos relevantes: {results_count}', '{formatted_categories,results_count}', 'Linha de fontes consultadas', 100),
('rag_first', 'protocol_header', '📋 PROTOCOLO RAG-FIRST (OBRIGATÓRIO):', '{}', 'Cabeçalho do protocolo', 100),
('rag_first', 'protocol_rule_1', '1. ✅ USE PRIMEIRO: As informações acima são a FONTE DA VERDADE', '{}', 'Regra 1 do protocolo', 100),
('rag_first', 'protocol_rule_2', '2. ✅ DADOS ESPECÍFICOS: Valores, percentuais, CNPJs, prazos dos documentos', '{}', 'Regra 2 do protocolo', 100),
('rag_first', 'protocol_rule_3', '3. ✅ LINGUAGEM NATURAL: Fale como se você soubesse, não cite "documentos"', '{}', 'Regra 3 do protocolo', 100),
('rag_first', 'protocol_rule_4', '4. ✅ CONFLITOS: Se houver conflito com instruções abaixo, CONFIE NOS DOCUMENTOS', '{}', 'Regra 4 do protocolo', 100),
('rag_first', 'protocol_rule_5', '5. ✅ COBERTURA: Se os documentos cobrem a pergunta, NÃO use instruções hardcoded', '{}', 'Regra 5 do protocolo', 100),
('rag_first', 'protocol_dont_1', '- Ignorar dados específicos dos documentos', '{}', 'Não fazer 1', 100),
('rag_first', 'protocol_dont_2', '- Mencionar "segundo nossos documentos" ou "conforme registros"', '{}', 'Não fazer 2', 100),
('rag_first', 'protocol_dont_3', '- Contradizer informações dos documentos com conhecimento geral', '{}', 'Não fazer 3', 100)
ON CONFLICT DO NOTHING;

-- CATEGORIA: operator (Mensagens de comandos de operador)
INSERT INTO sofia_message_templates (category, template_key, template_text, variables, description, priority) VALUES
('operator', 'takeover_detected', E'✅ *COMANDO DETECTADO*\n\n🔇 IA pausada para *{client_name}*\n📱 {phone}\n\n_Detectado via histórico. Use #RESOLVIDO quando terminar._', '{client_name,phone}', 'Confirmação de #ASSUMIR detectado via histórico', 100)
ON CONFLICT DO NOTHING;

-- ADICIONAR delay_intent_phrases e mentions_media na tabela sofia_detection_patterns
-- (se a tabela existir, pois alguns padrões podem estar lá)
INSERT INTO sofia_detection_patterns (category, pattern, description, is_active, priority) VALUES
-- Delay intent phrases
('delay_intent', 'já vou mandar', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'vou enviar', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'vou mandar', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'chegando em casa', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'espera um pouco', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'daqui a pouco', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'minutos', 'Indica que vai enviar depois', true, 90),
('delay_intent', 'minutinho', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'minutinhos', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'quando chegar', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'mais tarde', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'já já', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'jaja', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'logo logo', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'to chegando', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'estou chegando', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'tô chegando', 'Indica que vai enviar depois', true, 100),
('delay_intent', 'em breve', 'Indica que vai enviar depois', true, 100),
-- Mentions media phrases
('mentions_media', 'enviei', 'Indica que enviou mídia', true, 100),
('mentions_media', 'mandei', 'Indica que enviou mídia', true, 100),
('mentions_media', 'segue', 'Indica que enviou mídia', true, 100),
('mentions_media', 'essa é minha conta', 'Indica que enviou mídia', true, 100),
('mentions_media', 'essa é minha fatura', 'Indica que enviou mídia', true, 100),
('mentions_media', 'veja minha', 'Indica que enviou mídia', true, 100),
('mentions_media', 'olha aqui', 'Indica que enviou mídia', true, 100),
('mentions_media', 'olha a minha', 'Indica que enviou mídia', true, 100),
('mentions_media', 'tá aqui', 'Indica que enviou mídia', true, 100),
('mentions_media', 'está aqui', 'Indica que enviou mídia', true, 100),
('mentions_media', 'minha conta de luz', 'Indica que enviou mídia', true, 100),
('mentions_media', 'minha fatura', 'Indica que enviou mídia', true, 100),
('mentions_media', 'enviando', 'Indica que enviou mídia', true, 100),
('mentions_media', 'mandando', 'Indica que enviou mídia', true, 100),
('mentions_media', 'segue a foto', 'Indica que enviou mídia', true, 100),
('mentions_media', 'segue a fatura', 'Indica que enviou mídia', true, 100),
('mentions_media', 'essa aqui é', 'Indica que enviou mídia', true, 100),
('mentions_media', 'aqui está', 'Indica que enviou mídia', true, 100)
ON CONFLICT DO NOTHING;