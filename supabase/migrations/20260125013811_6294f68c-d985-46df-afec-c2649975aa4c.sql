-- ═══════════════════════════════════════════════════════════════════════════
-- ZERO HARDCODE - Phase 5: Automations & Edge Functions
-- Migrating remaining hardcoded constants to configuracoes_sistema
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- AUTOMATION ELIGIBILITY
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('automation_activity_cooldown_minutes', '60', 'Minutos de cooldown após atividade do lead antes de automação')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('fup_valid_stages', 'UC_9SLRPP,PROPOSTA_INICIAL,LEAD_FRIO', 'Estágios válidos para follow-up (comma-separated)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('automation_blocked_stages', 'JUNK,WON,LOST', 'Estágios bloqueados para todas automações (comma-separated)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('automation_paused_modes', 'paused_for_human,descartado,sac_redirect', 'Modos da sofia que pausam automações (comma-separated)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('automation_low_consumption_threshold', '150', 'Threshold para identificar baixo consumo (kWh ou R$)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════════
-- PENDING TASK SCHEDULER
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('pending_task_timeouts', '{"proposta_inicial":2,"gerar_proposta_definitiva":3,"enviar_proposta":3,"confirmar_tipo_instalacao":10,"aguardando_tipo_instalacao":10,"mover_para_definitiva":3,"sincronizar_bitrix":3,"default":5}', 'Timeouts por tipo de task pendente (em minutos) - JSON')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('pending_task_max_retries', '3', 'Máximo de tentativas para tasks pendentes')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('automation_required_fields_definitiva', '["tipoInstalacao","cpfCnpj","endereco"]', 'Campos obrigatórios para proposta definitiva - JSON array')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('automation_required_files_definitiva', '["documento_identidade","fatura"]', 'Arquivos obrigatórios para proposta definitiva - JSON array')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════════
-- Z-API SEND MESSAGE
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('zapi_max_message_length', '4000', 'Tamanho máximo de mensagem WhatsApp')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('zapi_max_retries', '3', 'Máximo de tentativas de envio via Z-API')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('zapi_initial_delay_ms', '1000', 'Delay inicial para retry exponencial (ms)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('zapi_retry_queue_delay_minutes', '5', 'Delay para retry assíncrono de mensagens falhas (minutos)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════════
-- OPERATOR COMMANDS
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('operator_human_cooldown_ms', '30000', 'Cooldown após comando humano (ms)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('operator_reset_command', '#RESET_TESTE', 'Comando para reset de conversa')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('operator_status_command', '#STATUS_TESTE', 'Comando para verificar status')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('operator_ping_command', '#PING_TESTE', 'Comando para health check')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('operator_voice_command', '#VOZ_TESTE', 'Comando para teste de voz')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('operator_help_command', '#AJUDA', 'Comando para exibir ajuda')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('operator_takeover_commands', '#ASSUMIR,#MEU,#TAKEOVER', 'Comandos para assumir atendimento (comma-separated)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('operator_return_commands', '#RESOLVIDO,#DEVOLVER,#SOFIA', 'Comandos para devolver para IA (comma-separated)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════════
-- RATE LIMITER (Complementando valores existentes)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('rate_limit_normal_base_delay_ms', '2000', 'Rate limit normal - delay base (ms)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('rate_limit_normal_max_delay_ms', '6000', 'Rate limit normal - delay máximo (ms)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('rate_limit_normal_jitter_ms', '1500', 'Rate limit normal - jitter (ms)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('rate_limit_recovery_base_delay_ms', '5000', 'Rate limit recovery - delay base (ms)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('rate_limit_recovery_max_delay_ms', '15000', 'Rate limit recovery - delay máximo (ms)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('rate_limit_recovery_jitter_ms', '3000', 'Rate limit recovery - jitter (ms)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('rate_limit_large_batch_threshold', '20', 'Threshold de batch grande para rate limit')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════════
-- QUIET HOURS CONFIG
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('quiet_hours_enabled', 'true', 'Habilitar período de silêncio para automações')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('quiet_hours_start', '20:00', 'Início do período de silêncio (HH:MM)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('quiet_hours_end', '07:00', 'Fim do período de silêncio (HH:MM)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();

INSERT INTO public.configuracoes_sistema (chave, valor, descricao) VALUES
  ('quiet_hours_timezone', 'America/Sao_Paulo', 'Timezone para período de silêncio')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now();