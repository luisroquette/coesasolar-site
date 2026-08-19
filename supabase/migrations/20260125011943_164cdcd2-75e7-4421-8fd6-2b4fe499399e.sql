-- Zero Hardcode: Constantes de Cálculo e Propostas
-- Migrar todas as constantes hardcoded para configuracoes_sistema

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES

-- ===== DISPONIBILIDADE MÍNIMA =====
('calc_disponibilidade_monofasico', '30', 'Disponibilidade mínima Monofásico em kWh'),
('calc_disponibilidade_bifasico', '50', 'Disponibilidade mínima Bifásico em kWh'),
('calc_disponibilidade_trifasico', '100', 'Disponibilidade mínima Trifásico em kWh'),

-- ===== PLANO UNLOCK =====
('calc_unlock_threshold', '3000', 'Consumo mínimo (kWh) para desbloquear plano UNLOCK 30%'),
('calc_unlock_desconto', '30', 'Percentual de desconto do plano UNLOCK'),
('calc_unlock_fidelidade', '4', 'Fidelidade em anos do plano UNLOCK'),

-- ===== INFERÊNCIA TIPO INSTALAÇÃO =====
('calc_inferir_tipo_threshold', '1000', 'Consumo threshold para inferir Trifásico (acima) ou Bifásico (abaixo)'),
('calc_inferir_tipo_mono_threshold', '200', 'Consumo threshold para inferir Monofásico (usado no calculator)'),

-- ===== IMPOSTOS FEDERAIS =====
('calc_pis_aliquota', '0.0065', 'Alíquota PIS (0.65%)'),
('calc_cofins_aliquota', '0.03', 'Alíquota COFINS (3.00%)'),
('calc_pis_cofins_total', '0.0365', 'PIS + COFINS total (3.65%)'),

-- ===== USINEIROS =====
('calc_vida_util_anos', '25', 'Vida útil em anos para cálculo de usineiros'),
('calc_degradacao_anual', '0.005', 'Degradação anual de painéis (0.5%)'),
('calc_irpj_aliquota', '0.15', 'Alíquota IRPJ (15%)'),
('calc_csll_aliquota', '0.09', 'Alíquota CSLL (9%)'),
('calc_adicional_irpj', '0.10', 'Adicional IRPJ sobre lucro > 240k (10%)'),
('calc_irpj_adicional_threshold', '240000', 'Limite anual para adicional IRPJ'),
('calc_presumido_percentual', '0.32', 'Percentual de presunção Lucro Presumido (32%)'),
('calc_pis_cofins_usineiro', '0.0925', 'PIS+COFINS para usineiros (9.25%)'),

-- ===== INFLAÇÃO =====
('calc_inflacao_energetica_default', '0.07', 'Inflação energética anual padrão (7%)'),

-- ===== GD2 =====
('calc_gd2_transicao_inicio', '2024', 'Ano início transição GD2'),
('calc_gd2_transicao_fim', '2028', 'Ano fim transição GD2 (100%)'),
('calc_gd2_percentuais', '{"2024": 0.15, "2025": 0.30, "2026": 0.45, "2027": 0.60, "2028": 0.75, "2029": 0.90, "2030": 1.00}', 'Percentuais GD2 por ano (JSON)')

ON CONFLICT (chave) DO UPDATE 
SET valor = EXCLUDED.valor,
    descricao = EXCLUDED.descricao,
    updated_at = now();