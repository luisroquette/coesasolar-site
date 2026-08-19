-- ═══════════════════════════════════════════════════════════════
-- FASE 9: Zero Hardcode - hesitation.ts, discount-objection.ts, billing-education.ts, audio-handler.ts
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- 1. HESITATION AI PROMPT (migrar prompt hardcoded)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, priority, description)
VALUES 
  ('ai_prompts', 'hesitation', 'hesitation_analysis_prompt', 
   'Analise a mensagem do cliente e determine se ele está expressando HESITAÇÃO ou OBJEÇÃO sobre fechar negócio.

Sinais de hesitação incluem:
- Pedindo tempo para pensar
- Mencionando precisar consultar alguém
- Expressando dúvidas sobre confiança/credibilidade
- Reclamando de preço, prazo ou condições
- Usando tom defensivo ou evasivo
- Fazendo perguntas que indicam desconfiança
- Dando respostas curtas e frias quando antes estava engajado

Responda APENAS com JSON:
{
  "hesitating": true/false,
  "confidence": "high" | "medium" | "low",
  "reason": "breve descrição do motivo da hesitação ou null"
}', 
   ARRAY[]::text[], 100, 'Prompt de análise de hesitação por IA')
ON CONFLICT (category, template_key) DO UPDATE SET
  template_text = EXCLUDED.template_text,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════
-- 2. AUDIO OFFER MESSAGES (migrar mensagens de oferta de áudio)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, priority, description)
VALUES 
  ('audio', 'offer', 'audio_offer_multiple_doubts', 
   '💡 _Vi que você tem várias dúvidas! Quer que eu te explique por áudio? Fica mais fácil de entender!_', 
   ARRAY[]::text[], 100, 'Oferta de áudio quando há múltiplas dúvidas'),
  ('audio', 'offer', 'audio_offer_complex_topic', 
   '💡 _Esse assunto é um pouco mais técnico. Quer que eu te explique por áudio? Fica mais claro!_', 
   ARRAY[]::text[], 100, 'Oferta de áudio para tópicos complexos'),
  ('audio', 'offer', 'audio_offer_long_response', 
   '💡 _Quer que eu te explique por áudio? Às vezes fica mais fácil de entender!_', 
   ARRAY[]::text[], 100, 'Oferta de áudio para respostas longas')
ON CONFLICT (category, template_key) DO UPDATE SET
  template_text = EXCLUDED.template_text,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════
-- 3. DISCOUNT OBJECTION RESPONSES (mensagens de objeção de desconto)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, priority, description)
VALUES 
  ('sales', 'discount_objection', 'master_offer_response', 
   '{greeting}entendi sua preocupação! 💚

Para consumos acima de {consumo_limite} kWh como o seu, temos o *Plano UNLOCK* com *{master_desconto}% de desconto* e {master_fidelidade} anos de fidelidade.

É nosso plano premium, com a maior economia possível! 🔓

Quer que eu gere uma simulação com esse plano especial pra você?', 
   ARRAY['greeting', 'consumo_limite', 'master_desconto', 'master_fidelidade']::text[], 100, 'Resposta carta na manga - oferta master'),
  
  ('sales', 'discount_objection', 'max_discount_explanation', 
   '{greeting}entendo! Os {desconto}% são o máximo que conseguimos oferecer com segurança para consumos até {consumo_limite} kWh. 😊

Mas olha: isso representa {economia_anual} por ano de economia garantida, sem você precisar fazer nada!

E o melhor: é um desconto fixo que você não precisa se preocupar - todo mês vem automático na sua conta.

Quer seguir com a proposta? Qualquer dúvida, estou aqui!', 
   ARRAY['greeting', 'desconto', 'consumo_limite', 'economia_anual']::text[], 100, 'Explicação do limite de desconto'),
  
  ('sales', 'economy_confirmation', 'economy_confirmation_response', 
   '{greeting}isso mesmo! 🎉

Com {desconto}% de desconto, você economiza aproximadamente {economia_mensal}/mês de forma garantida!

Quer avançar para a proposta definitiva? Vou precisar só de alguns documentos simples pra gerar seu contrato. 📋', 
   ARRAY['greeting', 'desconto', 'economia_mensal']::text[], 100, 'Confirmação de economia')
ON CONFLICT (category, template_key) DO UPDATE SET
  template_text = EXCLUDED.template_text,
  variables = EXCLUDED.variables,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════
-- 4. BILLING EDUCATION RESPONSES (respostas educativas sobre conta)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO sofia_message_templates (category, subcategory, template_key, template_text, variables, priority, description)
VALUES 
  ('billing_education', 'cip', 'cip_explanation', 
   '{greeting}ótima pergunta! 💡

A *CIP (Contribuição de Iluminação Pública)* é uma taxa cobrada pela prefeitura para custear os postes de luz das ruas.

🏛️ Essa taxa é *municipal* - não tem relação com seu consumo ou com a COESA.
📊 Aparece separada na sua fatura e varia conforme a cidade.

*Nosso desconto de {desconto}%* é aplicado sobre a *energia consumida*, não sobre taxas municipais. Mesmo assim, você economiza bastante no final!

Ficou mais claro? Posso te ajudar com mais alguma dúvida? 😊', 
   ARRAY['greeting', 'desconto']::text[], 100, 'Explicação sobre CIP'),
  
  ('billing_education', 'disponibilidade', 'disponibilidade_explanation', 
   '{greeting}boa pergunta! ⚡

A *taxa de disponibilidade* (ou custo mínimo) é o que você paga para ter a rede elétrica disponível na sua casa, mesmo se não consumir nada.

📊 Para {tipo_instalacao}, o mínimo é *{taxa_minima}* por mês.
🔌 Isso cobre a manutenção da rede, transformadores, postes, etc.

*Nosso desconto de {desconto}%* é aplicado sobre o *consumo acima desse mínimo*. Quanto mais você consome, maior a economia em reais!

Quer que eu simule quanto você economizaria com seu consumo atual? 📈', 
   ARRAY['greeting', 'tipo_instalacao', 'taxa_minima', 'desconto']::text[], 100, 'Explicação sobre taxa de disponibilidade'),
  
  ('billing_education', 'desconto_base', 'desconto_base_explanation', 
   '{greeting}deixa eu explicar direitinho! 📊

Nosso desconto de *{desconto}%* é aplicado sobre a *energia consumida* (kWh), que é a maior parte da sua conta.

❌ *NÃO incide sobre:*
• CIP/COSIP (taxa da prefeitura)
• Taxa de disponibilidade (custo mínimo)
• Bandeiras tarifárias

✅ *INCIDE sobre:*
• Todo o seu consumo de energia (kWh)
• TUSD e TE (componentes da tarifa)

Na prática, se sua conta é R$ 500, cerca de R$ 400-450 é consumo. Você economiza {desconto}% disso = *R$ {economia_exemplo} por mês*!

Quer que eu faça o cálculo exato com sua conta? 🧮', 
   ARRAY['greeting', 'desconto', 'economia_exemplo']::text[], 100, 'Explicação sobre base do desconto'),
  
  ('billing_education', 'comparativo', 'comparativo_explanation', 
   '{greeting}ótima pergunta sobre o mercado! 🏢

A COESA é diferente de outras empresas de energia solar porque:

✅ *Sem instalação:* Você não precisa colocar nada no seu telhado
✅ *Sem investimento:* Zero custo de adesão
✅ *Desconto garantido:* {desconto}% todo mês, por contrato
✅ *Regulamentado:* Lei 14.300/2022, fiscalizado pela ANEEL

📊 Outras empresas pedem investimento de R$ 15.000 a R$ 50.000 em painéis. Com a COESA, você economiza *desde o primeiro mês*, sem gastar nada!

Quer saber mais sobre como funciona? 😊', 
   ARRAY['greeting', 'desconto']::text[], 100, 'Comparativo com concorrência'),
  
  ('billing_education', 'bandeiras', 'bandeiras_explanation', 
   '{greeting}boa pergunta sobre as bandeiras! 🚦

As *bandeiras tarifárias* são cobradas quando há escassez de água nas hidrelétricas:

🟢 *Verde:* Sem taxa extra
🟡 *Amarela:* Pequena taxa extra
🔴 *Vermelha:* Taxa maior (patamar 1 e 2)

Com a COESA, você continua pagando as bandeiras, mas:

✅ Nosso desconto de *{desconto}%* reduz o impacto!
✅ Energia solar não depende de água = mais estabilidade
✅ Quanto mais cara a energia, maior sua economia em R$!

Se a bandeira subir e sua conta aumentar R$ 50, você paga R$ {economia_bandeira} a menos do que pagaria sem a COESA!

Posso te ajudar com mais alguma dúvida? 💡', 
   ARRAY['greeting', 'desconto', 'economia_bandeira']::text[], 100, 'Explicação sobre bandeiras tarifárias'),
  
  ('billing_education', 'default', 'billing_default', 
   '{greeting}posso te ajudar a entender melhor sua conta de energia! 📊

Quer saber sobre:
• CIP/Iluminação pública
• Taxa de disponibilidade
• Como o desconto é calculado
• Bandeiras tarifárias

É só me perguntar! 😊', 
   ARRAY['greeting']::text[], 50, 'Resposta padrão para educação de fatura')
ON CONFLICT (category, template_key) DO UPDATE SET
  template_text = EXCLUDED.template_text,
  variables = EXCLUDED.variables,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════
-- 5. SYSTEM CONFIGS (constantes de hesitação, desconto, audio)
-- ═══════════════════════════════════════════════════════════════
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('hesitation_ai_model', 'google/gemini-2.5-flash-lite', 'Modelo de IA para detecção de hesitação'),
  ('hesitation_ai_min_length', '30', 'Comprimento mínimo de mensagem para análise de IA'),
  ('hesitation_ai_temperature', '0.1', 'Temperatura do modelo para análise de hesitação'),
  ('hesitation_ai_max_tokens', '200', 'Máximo de tokens para resposta de hesitação'),
  ('consumo_limite_master_kwh', '3000', 'Limite de consumo para oferta do plano MASTER'),
  ('master_desconto_percentual', '30', 'Desconto percentual do plano MASTER'),
  ('master_fidelidade_anos', '4', 'Anos de fidelidade do plano MASTER'),
  ('audio_tts_min_length', '50', 'Comprimento mínimo de texto para TTS'),
  ('audio_tts_link_ratio', '0.5', 'Proporção máxima de links no texto para TTS'),
  ('audio_tts_emoji_ratio', '0.2', 'Proporção máxima de emojis no texto para TTS'),
  ('disponibilidade_monofasico_kwh', '30', 'Taxa mínima para instalação monofásica (kWh)'),
  ('disponibilidade_bifasico_kwh', '50', 'Taxa mínima para instalação bifásica (kWh)'),
  ('disponibilidade_trifasico_kwh', '100', 'Taxa mínima para instalação trifásica (kWh)')
ON CONFLICT (chave) DO UPDATE SET
  valor = EXCLUDED.valor,
  descricao = EXCLUDED.descricao,
  updated_at = now();

-- ═══════════════════════════════════════════════════════════════
-- 6. AUDIO ANNOUNCEMENT PATTERNS (regex para strip de anúncios)
-- Usando coluna correta: pattern
-- ═══════════════════════════════════════════════════════════════
INSERT INTO sofia_detection_patterns (category, pattern_type, pattern, priority, description, is_active)
VALUES 
  ('audio_announcement_strip', 'regex', '^vou te (?:mandar|enviar) (?:um )?[áa]udio[\.!\?]?\s*', 100, 'Padrão: vou te mandar/enviar áudio', true),
  ('audio_announcement_strip', 'regex', '^segue (?:o )?[áa]udio[\.!\?]?\s*', 100, 'Padrão: segue o áudio', true),
  ('audio_announcement_strip', 'regex', '^te mand(?:o|ando|ei) (?:um )?[áa]udio[\.!\?]?\s*', 100, 'Padrão: te mando/mandando/mandei áudio', true),
  ('audio_announcement_strip', 'regex', '^escuta (?:esse )?[áa]udio[\.!\?]?\s*', 100, 'Padrão: escuta esse áudio', true),
  ('audio_announcement_strip', 'regex', '^olha esse [áa]udio[\.!\?]?\s*', 100, 'Padrão: olha esse áudio', true)
ON CONFLICT DO NOTHING;