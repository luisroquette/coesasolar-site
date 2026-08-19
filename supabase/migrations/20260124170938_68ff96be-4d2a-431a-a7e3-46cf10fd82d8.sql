-- Economy Calculator Configurations (Zero Hardcode)
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
-- Disponibilidade por tipo de instalação
('economy_disponibilidade_monofasico', '30', 'Disponibilidade mínima monofásico (kWh)'),
('economy_disponibilidade_bifasico', '50', 'Disponibilidade mínima bifásico (kWh)'),
('economy_disponibilidade_trifasico', '100', 'Disponibilidade mínima trifásico (kWh)'),
-- CIP e Tarifa
('economy_cip_default', '25', 'CIP default para simulação (R$)'),
('economy_tarifa_fallback', '0.79', 'Tarifa fallback quando não informada (R$/kWh)'),
-- Impostos
('economy_pis_cofins_aliquota', '0.0365', 'Alíquota PIS/COFINS não compensável'),
-- Projeção
('economy_inflacao_energetica', '0.07', 'Inflação energética anual para projeção'),
-- Plano UNLOCK
('economy_unlock_threshold', '3000', 'Consumo mínimo (kWh) para desbloquear plano 30%'),
-- Defaults
('economy_desconto_default', '25', 'Desconto padrão selecionado na calculadora (%)'),
('economy_fidelidade_default', '3', 'Fidelidade padrão em anos')
ON CONFLICT (chave) DO NOTHING;