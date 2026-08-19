-- Tabela para armazenar patterns de detecção da sofIA (keywords, regex)
CREATE TABLE public.sofia_detection_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL, -- 'objection', 'hesitation_strong', 'hesitation_moderate', 'positive_feedback', 'negative_feedback', 'neutral_feedback', 'audio_accept', 'audio_reject', 'discount_objection'
  pattern TEXT NOT NULL,
  pattern_type TEXT NOT NULL DEFAULT 'keyword', -- 'keyword' ou 'regex'
  description TEXT, -- descrição opcional do pattern
  priority INTEGER DEFAULT 0, -- para ordenação
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category, pattern)
);

-- Índices para performance
CREATE INDEX idx_sofia_patterns_category ON public.sofia_detection_patterns(category) WHERE is_active = true;
CREATE INDEX idx_sofia_patterns_active ON public.sofia_detection_patterns(is_active);

-- Enable RLS
ALTER TABLE public.sofia_detection_patterns ENABLE ROW LEVEL SECURITY;

-- Políticas: apenas admins podem gerenciar
CREATE POLICY "Admins can manage sofia patterns"
  ON public.sofia_detection_patterns
  FOR ALL
  USING (public.is_admin(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_sofia_detection_patterns_updated_at
  BEFORE UPDATE ON public.sofia_detection_patterns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir patterns de objeção de desconto (regex)
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description) VALUES
('discount_objection', 'descont[oa]', 'regex', 'Menção a desconto'),
('discount_objection', 'promo[çc][ãa]o', 'regex', 'Menção a promoção'),
('discount_objection', 'reduz[ie]', 'regex', 'Pedido de redução'),
('discount_objection', 'abat[ie]', 'regex', 'Pedido de abatimento'),
('discount_objection', 'diminui', 'regex', 'Pedido de diminuição'),
('discount_objection', 'barate', 'regex', 'Pedido de baratear'),
('discount_objection', 'mais\s*barat', 'regex', 'Pedido de mais barato'),
('discount_objection', 'menor\s*pre[çc]o', 'regex', 'Pedido de menor preço'),
('discount_objection', 'menos\s*car[oa]', 'regex', 'Pedido de menos caro'),
('discount_objection', 'n[ãa]o\s*posso\s*pagar', 'regex', 'Não pode pagar'),
('discount_objection', 'fora\s*do\s*or[çc]amento', 'regex', 'Fora do orçamento'),
('discount_objection', 'muito\s*car[oa]', 'regex', 'Muito caro'),
('discount_objection', 'caro\s*demais', 'regex', 'Caro demais'),
('discount_objection', 'pre[çc]o\s*alto', 'regex', 'Preço alto'),
('discount_objection', 'melhor\s*pre[çc]o', 'regex', 'Melhor preço'),
('discount_objection', 'negoci', 'regex', 'Negociação'),
('discount_objection', 'condi[çc][ãa]o\s*especial', 'regex', 'Condição especial'),
('discount_objection', 'bonifica', 'regex', 'Bonificação'),
('discount_objection', 'cortesia', 'regex', 'Cortesia'),
('discount_objection', 'brinde', 'regex', 'Brinde');

-- Inserir keywords de hesitação forte
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description) VALUES
('hesitation_strong', 'não quero', 'keyword', 'Recusa direta'),
('hesitation_strong', 'nao quero', 'keyword', 'Recusa direta'),
('hesitation_strong', 'não tenho interesse', 'keyword', 'Sem interesse'),
('hesitation_strong', 'nao tenho interesse', 'keyword', 'Sem interesse'),
('hesitation_strong', 'sem interesse', 'keyword', 'Sem interesse'),
('hesitation_strong', 'não preciso', 'keyword', 'Não precisa'),
('hesitation_strong', 'nao preciso', 'keyword', 'Não precisa'),
('hesitation_strong', 'para de me ligar', 'keyword', 'Pedido para parar'),
('hesitation_strong', 'pare de ligar', 'keyword', 'Pedido para parar'),
('hesitation_strong', 'não me ligue', 'keyword', 'Não ligar'),
('hesitation_strong', 'golpe', 'keyword', 'Suspeita de golpe'),
('hesitation_strong', 'fraude', 'keyword', 'Suspeita de fraude'),
('hesitation_strong', 'mentira', 'keyword', 'Acusação de mentira'),
('hesitation_strong', 'enganação', 'keyword', 'Acusação de engano'),
('hesitation_strong', 'enganar', 'keyword', 'Acusação de engano'),
('hesitation_strong', 'piramide', 'keyword', 'Suspeita de pirâmide'),
('hesitation_strong', 'pirâmide', 'keyword', 'Suspeita de pirâmide'),
('hesitation_strong', 'cilada', 'keyword', 'Suspeita de cilada'),
('hesitation_strong', 'armação', 'keyword', 'Suspeita de armação'),
('hesitation_strong', 'sacanagem', 'keyword', 'Reclamação forte'),
('hesitation_strong', 'me deixa em paz', 'keyword', 'Pedido para parar'),
('hesitation_strong', 'vou processar', 'keyword', 'Ameaça legal'),
('hesitation_strong', 'vou denunciar', 'keyword', 'Ameaça de denúncia'),
('hesitation_strong', 'procon', 'keyword', 'Menção a PROCON'),
('hesitation_strong', 'reclame aqui', 'keyword', 'Menção a Reclame Aqui');

-- Inserir keywords de hesitação moderada
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description) VALUES
('hesitation_moderate', 'preciso pensar', 'keyword', 'Precisa pensar'),
('hesitation_moderate', 'vou pensar', 'keyword', 'Vai pensar'),
('hesitation_moderate', 'deixa eu ver', 'keyword', 'Vai verificar'),
('hesitation_moderate', 'não sei', 'keyword', 'Incerteza'),
('hesitation_moderate', 'nao sei', 'keyword', 'Incerteza'),
('hesitation_moderate', 'talvez', 'keyword', 'Incerteza'),
('hesitation_moderate', 'depois', 'keyword', 'Adiamento'),
('hesitation_moderate', 'outro momento', 'keyword', 'Adiamento'),
('hesitation_moderate', 'agora não', 'keyword', 'Momento ruim'),
('hesitation_moderate', 'agora nao', 'keyword', 'Momento ruim'),
('hesitation_moderate', 'ocupado', 'keyword', 'Ocupado'),
('hesitation_moderate', 'ocupada', 'keyword', 'Ocupada'),
('hesitation_moderate', 'sem tempo', 'keyword', 'Sem tempo'),
('hesitation_moderate', 'correria', 'keyword', 'Correria'),
('hesitation_moderate', 'consultar', 'keyword', 'Precisa consultar'),
('hesitation_moderate', 'falar com', 'keyword', 'Precisa falar com alguém'),
('hesitation_moderate', 'meu marido', 'keyword', 'Consultar cônjuge'),
('hesitation_moderate', 'minha esposa', 'keyword', 'Consultar cônjuge'),
('hesitation_moderate', 'minha mulher', 'keyword', 'Consultar cônjuge'),
('hesitation_moderate', 'não entendi', 'keyword', 'Não entendeu');

-- Inserir keywords de feedback positivo
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description) VALUES
('positive_feedback', 'ótimo', 'keyword', 'Feedback positivo'),
('positive_feedback', 'otimo', 'keyword', 'Feedback positivo'),
('positive_feedback', 'perfeito', 'keyword', 'Feedback positivo'),
('positive_feedback', 'maravilha', 'keyword', 'Feedback positivo'),
('positive_feedback', 'excelente', 'keyword', 'Feedback positivo'),
('positive_feedback', 'legal', 'keyword', 'Feedback positivo'),
('positive_feedback', 'show', 'keyword', 'Feedback positivo'),
('positive_feedback', 'massa', 'keyword', 'Feedback positivo'),
('positive_feedback', 'top', 'keyword', 'Feedback positivo'),
('positive_feedback', 'adorei', 'keyword', 'Feedback positivo'),
('positive_feedback', 'gostei', 'keyword', 'Feedback positivo'),
('positive_feedback', 'interessante', 'keyword', 'Interesse'),
('positive_feedback', 'quero sim', 'keyword', 'Confirmação'),
('positive_feedback', 'pode ser', 'keyword', 'Aceitação'),
('positive_feedback', 'vamos lá', 'keyword', 'Aceitação'),
('positive_feedback', 'bora', 'keyword', 'Aceitação'),
('positive_feedback', 'fechado', 'keyword', 'Fechamento'),
('positive_feedback', 'combinado', 'keyword', 'Acordo'),
('positive_feedback', 'concordo', 'keyword', 'Concordância'),
('positive_feedback', 'aceito', 'keyword', 'Aceitação');

-- Inserir keywords de feedback negativo
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description) VALUES
('negative_feedback', 'ruim', 'keyword', 'Feedback negativo'),
('negative_feedback', 'péssimo', 'keyword', 'Feedback negativo'),
('negative_feedback', 'pessimo', 'keyword', 'Feedback negativo'),
('negative_feedback', 'horrível', 'keyword', 'Feedback negativo'),
('negative_feedback', 'horrivel', 'keyword', 'Feedback negativo'),
('negative_feedback', 'não gostei', 'keyword', 'Feedback negativo'),
('negative_feedback', 'nao gostei', 'keyword', 'Feedback negativo'),
('negative_feedback', 'decepcionado', 'keyword', 'Decepção'),
('negative_feedback', 'decepcionada', 'keyword', 'Decepção'),
('negative_feedback', 'frustrado', 'keyword', 'Frustração'),
('negative_feedback', 'frustrada', 'keyword', 'Frustração'),
('negative_feedback', 'chateado', 'keyword', 'Chateação'),
('negative_feedback', 'chateada', 'keyword', 'Chateação'),
('negative_feedback', 'irritado', 'keyword', 'Irritação'),
('negative_feedback', 'irritada', 'keyword', 'Irritação'),
('negative_feedback', 'bravo', 'keyword', 'Raiva'),
('negative_feedback', 'brava', 'keyword', 'Raiva'),
('negative_feedback', 'raiva', 'keyword', 'Raiva'),
('negative_feedback', 'absurdo', 'keyword', 'Indignação'),
('negative_feedback', 'vergonha', 'keyword', 'Vergonha');

-- Inserir keywords de feedback neutro
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description) VALUES
('neutral_feedback', 'ok', 'keyword', 'Neutro'),
('neutral_feedback', 'tá', 'keyword', 'Neutro'),
('neutral_feedback', 'ta', 'keyword', 'Neutro'),
('neutral_feedback', 'sim', 'keyword', 'Neutro'),
('neutral_feedback', 'entendi', 'keyword', 'Entendimento'),
('neutral_feedback', 'certo', 'keyword', 'Neutro'),
('neutral_feedback', 'hm', 'keyword', 'Neutro'),
('neutral_feedback', 'uhum', 'keyword', 'Neutro'),
('neutral_feedback', 'aham', 'keyword', 'Neutro'),
('neutral_feedback', 'sei', 'keyword', 'Neutro');

-- Inserir keywords de aceitação de áudio
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description) VALUES
('audio_accept', 'pode mandar', 'keyword', 'Aceita áudio'),
('audio_accept', 'manda', 'keyword', 'Aceita áudio'),
('audio_accept', 'quero ouvir', 'keyword', 'Quer ouvir'),
('audio_accept', 'quero sim', 'keyword', 'Aceita'),
('audio_accept', 'pode ser', 'keyword', 'Aceita'),
('audio_accept', 'pode sim', 'keyword', 'Aceita'),
('audio_accept', 'ok', 'keyword', 'Aceita'),
('audio_accept', 'tá bom', 'keyword', 'Aceita'),
('audio_accept', 'ta bom', 'keyword', 'Aceita'),
('audio_accept', 'beleza', 'keyword', 'Aceita');

-- Inserir keywords de rejeição de áudio
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description) VALUES
('audio_reject', 'não quero áudio', 'keyword', 'Rejeita áudio'),
('audio_reject', 'nao quero audio', 'keyword', 'Rejeita áudio'),
('audio_reject', 'prefiro texto', 'keyword', 'Prefere texto'),
('audio_reject', 'sem áudio', 'keyword', 'Sem áudio'),
('audio_reject', 'sem audio', 'keyword', 'Sem áudio'),
('audio_reject', 'não posso ouvir', 'keyword', 'Não pode ouvir'),
('audio_reject', 'nao posso ouvir', 'keyword', 'Não pode ouvir'),
('audio_reject', 'reunião', 'keyword', 'Em reunião'),
('audio_reject', 'reuniao', 'keyword', 'Em reunião'),
('audio_reject', 'trabalhando', 'keyword', 'Trabalhando'),
('audio_reject', 'não dá pra ouvir', 'keyword', 'Não pode ouvir'),
('audio_reject', 'escreve', 'keyword', 'Prefere escrito');

-- Comentário sobre documentação
COMMENT ON TABLE public.sofia_detection_patterns IS 'Patterns dinâmicos para detecção de intenções da sofIA. Gerenciável via AI Gym.';