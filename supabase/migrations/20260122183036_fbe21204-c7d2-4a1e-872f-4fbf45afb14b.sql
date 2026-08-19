-- ═══════════════════════════════════════════════════════════════
-- TABELA: mensagens_desqualificacao
-- Mensagens de desqualificação configuráveis por motivo
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.mensagens_desqualificacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  motivo VARCHAR(50) NOT NULL UNIQUE,
  motivo_label VARCHAR(100) NOT NULL,
  mensagem_cliente TEXT NOT NULL,
  mensagem_crm TEXT NOT NULL,
  emoji VARCHAR(10) DEFAULT '🚫',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Comentário da tabela
COMMENT ON TABLE public.mensagens_desqualificacao IS 'Mensagens de desqualificação configuráveis para diferentes motivos';

-- ═══════════════════════════════════════════════════════════════
-- DADOS INICIAIS (migração das mensagens hardcoded)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO public.mensagens_desqualificacao (motivo, motivo_label, mensagem_cliente, mensagem_crm, emoji) VALUES
(
  'grupo_a',
  'Cliente do Grupo A (alta tensão)',
  E'Entendi! Você está no *Grupo A* (alta tensão) 🏭\n\nInfelizmente, nosso modelo atual atende exclusivamente clientes do *Grupo B* (baixa tensão/residencial e pequenos comércios).\n\nMas não se preocupe! Posso anotar seu contato para quando expandirmos para o Grupo A. Deseja que eu faça isso? 📋',
  'Cliente do Grupo A (alta tensão) - fora do escopo',
  '🏭'
),
(
  'tarifa_social',
  'Cliente com tarifa social/baixa renda',
  E'Notei que você conta com o benefício da *Tarifa Social*! 🏠\n\nEsse é um ótimo programa que já oferece um desconto significativo na sua conta de energia. Nosso modelo de economia por assinatura solar não se aplica a contas com esse benefício.\n\nFicamos felizes que você já tem esse apoio! Se sua situação mudar no futuro, pode nos chamar. 💚',
  'Cliente com tarifa social/baixa renda',
  '🏠'
),
(
  'distribuidora_nao_atendida',
  'Distribuidora não atendida pela COESA',
  E'Hmm... Sentimos muito, mas ainda não atendemos a sua região. 😔\n\nA distribuidora que você mencionou está no nosso plano de expansão e, em breve, estaremos por aí!\n\nPosso salvar seu contato e te chamar quando iniciarmos as operações na sua área? 📋',
  'Distribuidora não atendida pela COESA',
  '😔'
),
(
  'distribuidora_nao_reconhecida',
  'Distribuidora não reconhecida',
  E'Hmm... Não reconheci essa distribuidora. 🤔\n\nSe você for de outra região, posso salvar seu contato para avisá-lo quando expandirmos! 📋',
  'Distribuidora não reconhecida pelo sistema',
  '🤔'
),
(
  'outro',
  'Outro motivo de desqualificação',
  E'Infelizmente não conseguimos prosseguir com sua solicitação neste momento.\n\nMas seu contato ficará salvo, e entraremos em contato assim que pudermos atendê-lo! 📋',
  'Outro motivo de desqualificação',
  '🚫'
)
ON CONFLICT (motivo) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.mensagens_desqualificacao ENABLE ROW LEVEL SECURITY;

-- Leitura pública (edge functions precisam acessar)
CREATE POLICY "Mensagens desqualificação são públicas para leitura"
ON public.mensagens_desqualificacao
FOR SELECT
USING (true);

-- Apenas admins podem modificar (via service role)
CREATE POLICY "Apenas service role pode modificar mensagens"
ON public.mensagens_desqualificacao
FOR ALL
USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- TRIGGER: updated_at
-- ═══════════════════════════════════════════════════════════════

CREATE TRIGGER update_mensagens_desqualificacao_updated_at
BEFORE UPDATE ON public.mensagens_desqualificacao
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();