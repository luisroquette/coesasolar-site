-- Inserir novas chaves de configuração para automação de proposta inicial
-- Presunções de Cálculo
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('cip_default', '25', 'CIP padrão (R$) quando não informado no lead')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('desconto_default', '25', 'Desconto padrão (%) aplicado na proposta inicial')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('fidelidade_default', '36', 'Fidelidade padrão (meses) para proposta inicial')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('consumo_default', '500', 'Consumo padrão (kWh) quando não é possível calcular')
ON CONFLICT (chave) DO NOTHING;

-- Plano UNLOCK
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('plano_unlock_threshold', '3000', 'Consumo mínimo (kWh) para desbloquear plano UNLOCK')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('plano_unlock_desconto', '30', 'Desconto máximo (%) do plano UNLOCK')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('plano_unlock_fidelidade', '48', 'Fidelidade (meses) do plano UNLOCK')
ON CONFLICT (chave) DO NOTHING;

-- Regras de Inferência
INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('inferencia_limite_bifasico', '1000', 'Limite (kWh) para inferir instalação Bifásica (acima = Trifásico)')
ON CONFLICT (chave) DO NOTHING;

INSERT INTO configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('inferencia_permitir_monofasico', 'false', 'Permitir inferência de instalação Monofásica')
ON CONFLICT (chave) DO NOTHING;