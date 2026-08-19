-- Inserir template de prompt de triagem para Zero Hardcode
INSERT INTO sofia_message_templates (
  category, 
  subcategory,
  template_key, 
  template_text, 
  variables, 
  is_active, 
  priority, 
  description
) VALUES (
  'ai_prompts',
  'triage',
  'triagem_non_commercial_detection',
  'Analise a mensagem de um lead/cliente e determine se ele está buscando ATENDIMENTO DE SUPORTE (já é cliente/não quer comprar) ou se quer COMPRAR/ADERIR (novo cliente potencial).

EXCEÇÃO CRÍTICA - Correção de dados em proposta comercial:
Se o cliente menciona:
- "proposta está errada", "valor errado na proposta", "esse valor está errado"
- "meu gasto é X não Y", "minha conta é X não Y"
- "errei o valor", "coloquei errado", "informei errado"
- Qualquer correção de VALOR/CONSUMO/DADOS que foram fornecidos anteriormente
→ Isso é COMERCIAL (correção de dados para proposta em andamento)
→ Só classifique como invoice_issues se mencionar FATURA/BOLETO COESA já PAGO

IMPORTANTE: Se o cliente fizer perguntas genéricas de ORIENTAÇÃO como "como descubro?", "como faço?", "onde vejo?", "não sei", "o que é?", "me explica" - isso é COMERCIAL.

Sinais de que JÁ É CLIENTE ou NÃO QUER COMPRAR (não-comercial):
- Pergunta sobre status de contrato já assinado
- Menciona boleto, pagamento, fatura COESA que já recebeu
- Quer saber de homologação, ativação, créditos do contrato dele
- Reclamação sobre serviço atual da COESA
- Quer atualizar dados cadastrais de contrato existente
- Menciona indicação/bonificação de cliente
- Familiar/terceiro sendo cliente ("minha mãe é cliente")
- Pergunta sobre instalação de placas solares (não vendemos)
- Oferecendo serviços/parceria
- Confunde COESA com concessionária/governo
- Pedindo dados institucionais (CNPJ, endereço)
- Diz que número está errado ou nunca pediu contato
- Retornando ligação anterior
- Contexto corporativo/condomínio
- Pedindo visita presencial

Sinais de que QUER COMPRAR (comercial):
- Pergunta como funciona o serviço
- Quer saber preços, descontos
- Pede simulação, proposta
- Primeiro contato querendo conhecer
- Envia conta de luz para análise
- CORREÇÃO DE DADOS de proposta em andamento
- Perguntas de orientação sem contexto de cliente

Mensagem: "${message}"

Responda APENAS com JSON válido:
{
  "isNonCommercial": true/false,
  "confidence": 0.0 a 1.0,
  "category": "billing" | "contract_status" | "invoice_issues" | "cadastral" | "complaint" | "referral" | "support_generic" | "third_party" | "service_not_offered" | "corporate" | "scheduling" | "return_contact" | "identity_confusion" | "institutional" | "partner_b2b" | "forwarding" | "wrong_number" | "commercial" | "unknown",
  "reasoning": "breve explicação"
}',
  ARRAY['message'],
  true,
  100,
  'Prompt de IA para detectar intenção não-comercial. Zero Hardcode: editável via banco.'
) ON CONFLICT (category, template_key) DO UPDATE SET
  template_text = EXCLUDED.template_text,
  description = EXCLUDED.description,
  updated_at = now();