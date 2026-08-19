-- Criar tabela de planos comerciais
CREATE TABLE public.planos_comerciais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  fidelidade_anos INTEGER NOT NULL,
  desconto_percentual NUMERIC NOT NULL,
  consumo_minimo_kwh INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  destaque BOOLEAN DEFAULT false,
  unlock BOOLEAN DEFAULT false,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.planos_comerciais ENABLE ROW LEVEL SECURITY;

-- Política de leitura pública (planos são públicos)
CREATE POLICY "Planos comerciais são visíveis por todos" 
ON public.planos_comerciais 
FOR SELECT 
USING (true);

-- Política de escrita apenas para usuários autenticados
CREATE POLICY "Usuários autenticados podem gerenciar planos" 
ON public.planos_comerciais 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Inserir planos atuais (migrando do hardcode)
INSERT INTO public.planos_comerciais (nome, fidelidade_anos, desconto_percentual, consumo_minimo_kwh, ativo, destaque, unlock, ordem) VALUES
('Plano Inicial', 3, 10, 0, true, false, false, 1),
('Plano Economia', 4, 12, 0, true, true, false, 2),
('Plano Premium', 5, 15, 0, true, false, false, 3),
('Plano Master', 5, 18, 500, true, false, true, 4);

-- Adicionar novas configurações do sistema
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
('empresa_endereco', 'Av. Paulista, 1000, São Paulo - SP', 'Endereço físico da empresa'),
('empresa_domain', '@coesaenergia.com.br', 'Domínio permitido para cadastro de usuários'),
('multa_rescisoria_percentual', '20', 'Percentual de multa rescisória'),
('prazo_compensacao_dias', '90', 'Prazo em dias para início da compensação'),
('cleanup_audio_horas', '24', 'Horas para manter áudios temporários'),
('documento_recuperacao_horas', '48', 'Cutoff em horas para recuperação de documentos'),
('cache_ttl_segundos', '300', 'TTL de cache em segundos'),
('followup_score_alto', '80', 'Score mínimo para follow-up em 24h'),
('followup_score_medio', '60', 'Score mínimo para follow-up em 48h'),
('followup_score_baixo', '30', 'Score mínimo para follow-up em 72h'),
('plano_unlock_threshold', '500', 'Consumo mínimo em kWh para desbloquear plano Master'),
('plano_unlock_desconto', '18', 'Desconto do plano Master desbloqueado'),
('plano_unlock_fidelidade', '5', 'Fidelidade em anos do plano Master'),
('nudge_documento_delay_1', '2', 'Horas até primeiro nudge de documento'),
('nudge_documento_delay_2', '6', 'Horas até segundo nudge de documento'),
('nudge_documento_delay_3', '24', 'Horas até terceiro nudge de documento'),
('nudge_contrato_delay_1', '4', 'Horas até primeiro nudge de contrato'),
('nudge_contrato_delay_2', '24', 'Horas até segundo nudge de contrato'),
('nudge_contrato_delay_3', '48', 'Horas até terceiro nudge de contrato'),
('max_nudge_attempts', '3', 'Número máximo de tentativas de nudge'),
('quiet_hours_start', '20', 'Hora de início do período silencioso'),
('quiet_hours_end', '8', 'Hora de fim do período silencioso')
ON CONFLICT (chave) DO NOTHING;

-- Trigger para updated_at
CREATE TRIGGER update_planos_comerciais_updated_at
BEFORE UPDATE ON public.planos_comerciais
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();