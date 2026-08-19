-- ══════════════════════════════════════════════════════════════════════════════
-- FASE 10: Zero Hardcode - Final UI Constants & Intervals
-- ══════════════════════════════════════════════════════════════════════════════

-- Realtime & Polling Intervals
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('interval_delivery_failures_ms', '120000', 'Intervalo de refresh para alertas de falha de entrega (ms)'),
('interval_sofia_metrics_ms', '60000', 'Intervalo de refresh para métricas da Sofia (ms)'),
('interval_zapi_credentials_ms', '300000', 'Intervalo de refresh para credenciais Z-API (ms)'),
('interval_stuck_leads_ms', '60000', 'Intervalo de refresh para leads parados (ms)'),
('interval_pending_leads_ms', '30000', 'Intervalo de polling fallback para leads pendentes (ms)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Realtime List Limits
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('realtime_delivery_failures_limit', '50', 'Limite de falhas de entrega em tempo real'),
('realtime_command_logs_limit', '20', 'Limite de logs de comandos em tempo real'),
('realtime_notifications_limit', '20', 'Limite de notificações em tempo real')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Chart & Display Limits
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('chart_employees_limit', '6', 'Limite de funcionários em gráficos para legibilidade'),
('chart_colors', '["hsl(var(--primary))","hsl(142, 76%, 36%)","hsl(38, 92%, 50%)","hsl(0, 84%, 60%)","hsl(262, 83%, 58%)","hsl(199, 89%, 48%)"]', 'Cores para gráficos de performance'),
('typos_cleanup_display_limit', '20', 'Limite de typos a exibir no cleanup manager'),
('resolved_alerts_display_limit', '5', 'Limite de alertas resolvidos a exibir')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Agent Creation Options (JSON arrays)
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('agent_emoji_options', '["🤖","🧠","💡","🎯","⚡","🔮","🦾","🌟","💼","📞","💬","🎪"]', 'Emojis disponíveis para avatares de agentes'),
('agent_role_options', '[{"value":"sales","label":"Vendas","description":"Agente focado em conversão e vendas"},{"value":"customer_support","label":"SAC / Atendimento","description":"Suporte ao cliente e resolução de problemas"},{"value":"collections","label":"Cobrança","description":"Recuperação de crédito e negociação"},{"value":"onboarding","label":"Onboarding","description":"Ativação e integração de novos clientes"},{"value":"scheduling","label":"Agendamento","description":"Marcação de reuniões e compromissos"},{"value":"custom","label":"Personalizado","description":"Defina um papel customizado"}]', 'Opções de papéis para agentes'),
('agent_channel_options', '[{"value":"whatsapp","label":"WhatsApp"},{"value":"email","label":"E-mail"},{"value":"web","label":"Web Chat"},{"value":"voice","label":"Voz"}]', 'Opções de canais para agentes')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- Query staleTime & refetchInterval defaults
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('query_stale_time_default_ms', '300000', 'StaleTime padrão para React Query (5 min)'),
('query_refetch_interval_default_ms', '30000', 'RefetchInterval padrão para React Query fallback')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();