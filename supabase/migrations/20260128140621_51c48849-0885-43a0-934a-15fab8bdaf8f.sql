-- =====================================================
-- PHASE 3: Rule Memory Entry (Pipeline v2 Hard Constraint)
-- Nota: Patterns e Templates já foram inseridos na migration anterior
-- =====================================================

INSERT INTO rule_memory (agent_id, rule_type, name, description, condition, action, priority, confidence, learned_from, learning_source, is_active)
VALUES
  (
    'sofia',
    'hard_constraint',
    'Rapport ético para objeção sem fidelidade',
    E'Quando cliente pede contrato SEM FIDELIDADE, usar técnica de rapport que:\n1. Transfere a responsabilidade para um dilema moral do cliente\n2. Usa perguntas retóricas para fazê-lo enxergar nossa perspectiva\n3. Apela ao senso de justiça e altruísmo\n4. NUNCA ceder à fidelidade zero - é cláusula pétrea\n5. Se persistir 2x, escalar para humano',
    '{"trigger": "objection_no_fidelidade", "patterns": ["sem fidelidade", "tirar a fidelidade", "permanência me incomoda", "sem permanencia", "sem contrato"]}'::jsonb,
    '{"use_template": "objections:no_fidelidade_rapport", "fallback_template": "objections:no_fidelidade_final", "tone": "empático mas firme", "escalate_if_persists": true, "max_attempts_before_escalation": 2}'::jsonb,
    100,
    1.0,
    'manual',
    'manual',
    true
  );