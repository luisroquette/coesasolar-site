
-- Create evaluation_dataset table
CREATE TABLE IF NOT EXISTS public.evaluation_dataset (
  id SERIAL PRIMARY KEY,
  phone_id TEXT,
  contexto TEXT NOT NULL,
  mensagem_lead TEXT NOT NULL,
  resposta_agente TEXT,
  problema TEXT NOT NULL,
  resposta_esperada TEXT NOT NULL,
  categoria TEXT NOT NULL,
  severidade TEXT NOT NULL,
  status TEXT DEFAULT 'pendente',
  correcao_aplicada TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Validation trigger for categoria, severidade, status
CREATE OR REPLACE FUNCTION public.validate_evaluation_dataset()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  IF NEW.categoria NOT IN ('fluxo', 'compreensao', 'informacao', 'alucinacao', 'raciocinio', 'tom', 'prioridade') THEN
    RAISE EXCEPTION 'categoria inválida: %', NEW.categoria;
  END IF;
  IF NEW.severidade NOT IN ('critica', 'alta', 'media', 'baixa') THEN
    RAISE EXCEPTION 'severidade inválida: %', NEW.severidade;
  END IF;
  IF NEW.status NOT IN ('pendente', 'corrigido', 'regressao') THEN
    RAISE EXCEPTION 'status inválido: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_evaluation_dataset_trigger
BEFORE INSERT OR UPDATE ON public.evaluation_dataset
FOR EACH ROW EXECUTE FUNCTION public.validate_evaluation_dataset();

-- Auto-update updated_at
CREATE TRIGGER update_evaluation_dataset_updated_at
BEFORE UPDATE ON public.evaluation_dataset
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.evaluation_dataset ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read evaluation_dataset"
ON public.evaluation_dataset FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert evaluation_dataset"
ON public.evaluation_dataset FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update evaluation_dataset"
ON public.evaluation_dataset FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete evaluation_dataset"
ON public.evaluation_dataset FOR DELETE TO authenticated USING (true);

-- Insert 10 initial cases
INSERT INTO public.evaluation_dataset (phone_id, contexto, mensagem_lead, resposta_agente, problema, resposta_esperada, categoria, severidade) VALUES
('5533999436304', 'Cliente informou nome "Flor", agente ignorou e usou nome comercial', 'Flor', 'Soares, para calcular sua economia...', 'Usou nome da empresa em vez do nome pessoal', 'Flor, para calcular sua economia...', 'compreensao', 'alta'),
('5533999436304', 'Cliente disse "Não entendi" após proposta com 4 planos', 'Não entendi', 'Soares, para calcular sua economia...', 'Reiniciou funil descartando dados coletados', 'Flor, sem problemas! Resumindo: você pode economizar entre R$191 e R$408...', 'fluxo', 'critica'),
('5533999436304', 'Após envio da proposta inicial', 'flormaia10@hotmail.com', 'Repetiu link já enviado', 'Mensagem duplicada sobre envio do link', 'Enviar link uma única vez e aguardar', 'fluxo', 'baixa'),
('553186698502', 'Cliente informou Cemig após nome e valor R$4.000', 'Cemig', 'Enviou apenas emojis e gráfico sem texto', 'Resposta incoerente sem contexto textual', 'Fernando, com a CEMIG e conta de R$4.000, você pode economizar bastante. Qual seu email?', 'fluxo', 'alta'),
('553186698502', 'Após emojis/gráfico sem contexto', '(erro consecutivo)', 'Mensagem apagada manualmente', 'Conteúdo tão errado que precisou ser apagado', 'Não deveria ter enviado', 'alucinacao', 'critica'),
(NULL, 'Início da conversa', 'Olá! Tenho interesse e queria mais informações', 'Saudação idêntica 3 vezes', 'Spam de mensagens idênticas', 'Saudação única e aguardar', 'fluxo', 'critica'),
(NULL, 'Após cliente informar valores e distribuidora Cemig', 'Cemig', 'Sugeriu Coelba, CPFL Paulista', 'Distribuidoras não atendidas pela COESA', 'Aceitar Cemig ou listar apenas CEMIG e Energisa MG', 'informacao', 'alta'),
(NULL, 'Após coletar todos os dados', '(fluxo automático)', 'Perguntou se conhece energia por assinatura no final do funil', 'Explicação deveria ser no INÍCIO', 'Pergunta sobre energia por assinatura no estado TRIAGEM', 'fluxo', 'alta'),
(NULL, 'Após Sofia confirmar solicitação feita', 'Valor não chegou', 'Pediu aguardar mais, links nunca chegaram', 'Prometeu entrega imediata e falhou', 'Entregar ou escalar proativamente', 'fluxo', 'critica'),
('5511967589990', 'Cliente informou faixa 550 a 570', 'Meu gasto varia de 550,00 à 570,00 mensal', 'Simulação com R$1.120 e plano UNLOCK', 'Somou valores em vez de calcular média', 'Usar média R$560, sem UNLOCK (abaixo de R$600)', 'raciocinio', 'critica');
