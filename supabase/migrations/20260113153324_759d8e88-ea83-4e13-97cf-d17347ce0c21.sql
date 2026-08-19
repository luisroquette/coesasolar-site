-- Corrigir propostas onde fidelidade_anos está armazenado em meses (valores > 10)
-- Isso converte 36 → 3, 24 → 2, 18 → 1.5, 12 → 1
UPDATE propostas_assinantes 
SET fidelidade_anos = ROUND(fidelidade_anos / 12.0)
WHERE fidelidade_anos > 10;