-- ═══════════════════════════════════════════════════════════════════════════════
-- PHASE 15: FINAL ZERO HARDCODE - 100% COMPLETION
-- Migrating remaining .limit() constants and fallback image URLs
-- ═══════════════════════════════════════════════════════════════════════════════

-- Query limit for proposal defaults audit log
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES ('query_limit_proposal_audit_log', '20', 'Limite de registros no histórico de auditoria de configurações de proposta')
ON CONFLICT (chave) DO NOTHING;

-- Query limit for delivery failures (4 hour window)
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES ('query_limit_delivery_failures_detail', '50', 'Limite de falhas de entrega exibidas no diálogo de detalhes')
ON CONFLICT (chave) DO NOTHING;