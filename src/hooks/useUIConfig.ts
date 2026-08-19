import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ═══════════════════════════════════════════════════════════════
// UI Configuration Hook - Zero Hardcode Phase 9 (Final)
// All UI constants loaded from configuracoes_sistema
// ═══════════════════════════════════════════════════════════════

export interface UIConfig {
  // Toast settings
  toastLimit: number;
  toastRemoveDelayMs: number;
  copyFeedbackDelayMs: number;
  refreshFeedbackDelayMs: number;
  
  // Pagination
  activityLogPageSize: number;
  agentsTablePageSize: number;
  ragScriptsLimit: number;
  agentsTableItemsPerPage: number;
  defaultPreviewLimit: number;
  notificationsMaxDisplay: number;
  escalationsDisplayLimit: number;
  
  // Upload limits
  uploadMaxSizeDefaultMb: number;
  uploadMaxSizeContractMb: number;
  uploadAllowedTypes: string[];
  
  // Years for selectors
  availableYears: number[];
  
  // Metrics thresholds
  nudge1ResponseRate: number;
  nudge2ResponseRate: number;
  nudge3ResponseRate: number;
  trendThreshold: number;
  
  // CRM settings
  leadAlertMinAgeHours: number;
  sofiaOrigins: string[];
  
  // PDF dimensions
  pdfA4WidthPx: number;
  pdfA4HeightPx: number;
  
  // RAG categories & search
  ragCategories: string[];
  ragCategoryLabels: Record<string, string>;
  ragDefaultTopK: number;
  ragDefaultMinSimilarity: number;
  
  // Editor constants
  editorConsumoSimuladoKwh: number;
  editorConsumoMinUnlockKwh: number;
  editorDefaultPlans: Array<{ pct: number; nome: string; anos: number; unlock: boolean }>;
  
  // Simulator settings
  simulatorMaxHistoryMsgLength: number;
  simulatorBatchSize: number;
  
  // Import settings
  importPatternsBatchSize: number;
  importPreviewLimit: number;
  
  // Stats counter
  statsCounterSteps: number;
  statsCounterDurationMs: number;
  
  // Phase 10: Intervals & Limits
  intervalDeliveryFailuresMs: number;
  intervalSofiaMetricsMs: number;
  intervalZapiCredentialsMs: number;
  intervalStuckLeadsMs: number;
  intervalPendingLeadsMs: number;
  realtimeDeliveryFailuresLimit: number;
  realtimeCommandLogsLimit: number;
  realtimeNotificationsLimit: number;
  chartEmployeesLimit: number;
  chartColors: string[];
  typosCleanupDisplayLimit: number;
  resolvedAlertsDisplayLimit: number;
  
  // Agent creation options
  agentEmojiOptions: string[];
  agentRoleOptions: Array<{ value: string; label: string; description: string }>;
  agentChannelOptions: Array<{ value: string; label: string }>;
  
  // Phase 11: Query limits
  queryLimitConversas: number;
  queryLimitBandeiras: number;
  queryLimitWarmupDays: number;
  queryLimitPendingLeads: number;
  queryLimitWebhookEvents: number;
  queryLimitRagAlerts: number;
  queryLimitRagChunks: number;
  queryLimitDeliveryFailures: number;
  analyticsTopQuestionsLimit: number;
  analyticsVersionChangesLimit: number;
  pollingFallbackIntervalMs: number;
  
  // Phase 13: Additional intervals & limits
  intervalNudgeMetricsMs: number;
  intervalWebhookDiagnosticsMs: number;
  queryLimitBitrixLogs: number;
  queryLimitCidadesAutocomplete: number;
  
  // Phase 14: Final metric limits (Zero Hardcode 100%)
  queryLimitNudgeMessages: number;
  queryLimitNudgeConversas: number;
  queryLimitDocMetricsConversas: number;
  queryLimitDocMetricsSolicitacoes: number;
  queryLimitDocMetricsPropostas: number;
  queryLimitPatternVersions: number;
  queryLimitOutboundQueue: number;
  queryLimitAdminNotifications: number;
  queryLimitRagQualityAlerts: number;
  
  // Phase 15: Final remaining limits
  queryLimitProposalAuditLog: number;
  queryLimitDeliveryFailuresDetail: number;
  
  loading: boolean;
}

// ═══════════════════════════════════════════════════════════════
// FALLBACK VALUES - Used when database is unavailable
// ═══════════════════════════════════════════════════════════════

const FALLBACK_CONFIG: Omit<UIConfig, 'loading'> = {
  toastLimit: 1,
  toastRemoveDelayMs: 1000000,
  copyFeedbackDelayMs: 2000,
  refreshFeedbackDelayMs: 500,
  activityLogPageSize: 20,
  agentsTablePageSize: 10,
  ragScriptsLimit: 100,
  agentsTableItemsPerPage: 10,
  defaultPreviewLimit: 5,
  notificationsMaxDisplay: 20,
  escalationsDisplayLimit: 10,
  uploadMaxSizeDefaultMb: 10,
  uploadMaxSizeContractMb: 15,
  uploadAllowedTypes: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
  availableYears: [2024, 2025, 2026, 2027, 2028],
  nudge1ResponseRate: 0.50,
  nudge2ResponseRate: 0.35,
  nudge3ResponseRate: 0.15,
  trendThreshold: 5,
  leadAlertMinAgeHours: 1,
  sofiaOrigins: ['whatsapp_sofia', 'bitrix24_webhook'],
  pdfA4WidthPx: 794,
  pdfA4HeightPx: 1123,
  ragCategories: ['vendas', 'sac', 'cobranca', 'geral', 'treinamento', 'regulatorio'],
  ragCategoryLabels: {
    vendas: '🛒 Vendas',
    sac: '🎧 SAC',
    cobranca: '💰 Cobrança',
    geral: '📚 Geral',
    treinamento: '🎓 Treinamento',
    regulatorio: '⚖️ Regulatório',
  },
  ragDefaultTopK: 5,
  ragDefaultMinSimilarity: 0.35,
  editorConsumoSimuladoKwh: 1500,
  editorConsumoMinUnlockKwh: 3000,
  editorDefaultPlans: [
    { pct: 15, nome: 'Start', anos: 1, unlock: false },
    { pct: 20, nome: 'Economia', anos: 2, unlock: false },
    { pct: 25, nome: 'Premium', anos: 3, unlock: false },
    { pct: 30, nome: 'UNLOCK', anos: 4, unlock: true },
  ],
  simulatorMaxHistoryMsgLength: 1800,
  simulatorBatchSize: 100,
  importPatternsBatchSize: 100,
  importPreviewLimit: 20,
  statsCounterSteps: 60,
  statsCounterDurationMs: 2000,
  // Phase 10: Intervals & Limits
  intervalDeliveryFailuresMs: 120000,
  intervalSofiaMetricsMs: 60000,
  intervalZapiCredentialsMs: 300000,
  intervalStuckLeadsMs: 60000,
  intervalPendingLeadsMs: 30000,
  realtimeDeliveryFailuresLimit: 50,
  realtimeCommandLogsLimit: 20,
  realtimeNotificationsLimit: 20,
  chartEmployeesLimit: 6,
  chartColors: ['hsl(var(--primary))', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(0, 84%, 60%)', 'hsl(262, 83%, 58%)', 'hsl(199, 89%, 48%)'],
  typosCleanupDisplayLimit: 20,
  resolvedAlertsDisplayLimit: 5,
  // Agent creation options
  agentEmojiOptions: ['🤖', '🧠', '💡', '🎯', '⚡', '🔮', '🦾', '🌟', '💼', '📞', '💬', '🎪'],
  agentRoleOptions: [
    { value: 'sales', label: 'Vendas', description: 'Agente focado em conversão e vendas' },
    { value: 'customer_support', label: 'SAC / Atendimento', description: 'Suporte ao cliente e resolução de problemas' },
    { value: 'collections', label: 'Cobrança', description: 'Recuperação de crédito e negociação' },
    { value: 'onboarding', label: 'Onboarding', description: 'Ativação e integração de novos clientes' },
    { value: 'scheduling', label: 'Agendamento', description: 'Marcação de reuniões e compromissos' },
    { value: 'custom', label: 'Personalizado', description: 'Defina um papel customizado' },
  ],
  agentChannelOptions: [
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'email', label: 'E-mail' },
    { value: 'web', label: 'Web Chat' },
    { value: 'voice', label: 'Voz' },
  ],
  // Phase 11: Query limits
  queryLimitConversas: 100,
  queryLimitBandeiras: 24,
  queryLimitWarmupDays: 7,
  queryLimitPendingLeads: 50,
  queryLimitWebhookEvents: 50,
  queryLimitRagAlerts: 20,
  queryLimitRagChunks: 50,
  queryLimitDeliveryFailures: 50,
  analyticsTopQuestionsLimit: 20,
  analyticsVersionChangesLimit: 4,
  pollingFallbackIntervalMs: 30000,
  // Phase 13: Additional intervals & limits
  intervalNudgeMetricsMs: 60000,
  intervalWebhookDiagnosticsMs: 10000,
  queryLimitBitrixLogs: 20,
  queryLimitCidadesAutocomplete: 20,
  // Phase 14: Final metric limits
  queryLimitNudgeMessages: 500,
  queryLimitNudgeConversas: 500,
  queryLimitDocMetricsConversas: 500,
  queryLimitDocMetricsSolicitacoes: 500,
  queryLimitDocMetricsPropostas: 500,
  queryLimitPatternVersions: 50,
  queryLimitOutboundQueue: 50,
  queryLimitAdminNotifications: 20,
  queryLimitRagQualityAlerts: 20,
  // Phase 15: Final remaining limits
  queryLimitProposalAuditLog: 20,
  queryLimitDeliveryFailuresDetail: 50,
};

// ═══════════════════════════════════════════════════════════════
// Cache Management
// ═══════════════════════════════════════════════════════════════

let cachedConfig: Omit<UIConfig, 'loading'> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useUIConfig(): UIConfig {
  const [config, setConfig] = useState<Omit<UIConfig, 'loading'>>(cachedConfig || FALLBACK_CONFIG);
  const [loading, setLoading] = useState(!cachedConfig);

  useEffect(() => {
    async function loadConfig() {
      // Use cache if valid
      if (cachedConfig && Date.now() - cacheTimestamp < CACHE_TTL) {
        setConfig(cachedConfig);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('configuracoes_sistema')
          .select('chave, valor')
          .in('chave', [
            'ui_toast_limit',
            'ui_toast_remove_delay_ms',
            'ui_copy_feedback_delay_ms',
            'ui_refresh_feedback_delay_ms',
            'ui_activity_log_page_size',
            'ui_agents_table_page_size',
            'ui_rag_scripts_limit',
            'ui_agents_table_items_per_page',
            'ui_default_preview_limit',
            'ui_notifications_max_display',
            'ui_escalations_display_limit',
            'upload_max_size_default_mb',
            'upload_max_size_contract_mb',
            'upload_allowed_types',
            'ui_available_years',
            'metrics_nudge1_response_rate',
            'metrics_nudge2_response_rate',
            'metrics_nudge3_response_rate',
            'metrics_trend_threshold',
            'crm_lead_alert_min_age_hours',
            'crm_sofia_origins',
            'pdf_a4_width_px',
            'pdf_a4_height_px',
            'rag_categories',
            'rag_category_labels',
            'rag_default_top_k',
            'rag_default_min_similarity',
            'editor_consumo_simulado_kwh',
            'editor_consumo_min_unlock_kwh',
            'editor_default_plans',
            'simulator_max_history_msg_length',
            'simulator_batch_size',
            'import_patterns_batch_size',
            'import_preview_limit',
            'ui_stats_counter_steps',
            'ui_stats_counter_duration_ms',
            // Phase 10
            'interval_delivery_failures_ms',
            'interval_sofia_metrics_ms',
            'interval_zapi_credentials_ms',
            'interval_stuck_leads_ms',
            'interval_pending_leads_ms',
            'realtime_delivery_failures_limit',
            'realtime_command_logs_limit',
            'realtime_notifications_limit',
            'chart_employees_limit',
            'chart_colors',
            'typos_cleanup_display_limit',
            'resolved_alerts_display_limit',
            'agent_emoji_options',
            'agent_role_options',
            'agent_channel_options',
            // Phase 11
            'query_limit_conversas',
            'query_limit_bandeiras',
            'query_limit_warmup_days',
            'query_limit_pending_leads',
            'query_limit_webhook_events',
            'query_limit_rag_alerts',
            'query_limit_rag_chunks',
            'query_limit_delivery_failures',
            'analytics_top_questions_limit',
            'analytics_version_changes_limit',
            'polling_fallback_interval_ms',
            // Phase 13
            'interval_nudge_metrics_ms',
            'interval_webhook_diagnostics_ms',
            'query_limit_bitrix_logs',
            'query_limit_cidades_autocomplete',
            // Phase 14
            'query_limit_nudge_messages',
            'query_limit_nudge_conversas',
            'query_limit_doc_metrics_conversas',
            'query_limit_doc_metrics_solicitacoes',
            'query_limit_doc_metrics_propostas',
            'query_limit_pattern_versions',
            'query_limit_outbound_queue',
            'query_limit_admin_notifications',
            'query_limit_rag_quality_alerts',
            // Phase 15
            'query_limit_proposal_audit_log',
            'query_limit_delivery_failures_detail',
          ]);

        if (error) {
          console.error('[useUIConfig] Error loading config:', error);
          setConfig(FALLBACK_CONFIG);
          setLoading(false);
          return;
        }

        const configMap = new Map(data?.map(d => [d.chave, d.valor]) || []);

        const parseJSON = <T,>(key: string, fallback: T): T => {
          try {
            const val = configMap.get(key);
            return val ? JSON.parse(val) : fallback;
          } catch {
            return fallback;
          }
        };

        const newConfig: Omit<UIConfig, 'loading'> = {
          toastLimit: parseInt(configMap.get('ui_toast_limit') || '') || FALLBACK_CONFIG.toastLimit,
          toastRemoveDelayMs: parseInt(configMap.get('ui_toast_remove_delay_ms') || '') || FALLBACK_CONFIG.toastRemoveDelayMs,
          copyFeedbackDelayMs: parseInt(configMap.get('ui_copy_feedback_delay_ms') || '') || FALLBACK_CONFIG.copyFeedbackDelayMs,
          refreshFeedbackDelayMs: parseInt(configMap.get('ui_refresh_feedback_delay_ms') || '') || FALLBACK_CONFIG.refreshFeedbackDelayMs,
          activityLogPageSize: parseInt(configMap.get('ui_activity_log_page_size') || '') || FALLBACK_CONFIG.activityLogPageSize,
          agentsTablePageSize: parseInt(configMap.get('ui_agents_table_page_size') || '') || FALLBACK_CONFIG.agentsTablePageSize,
          ragScriptsLimit: parseInt(configMap.get('ui_rag_scripts_limit') || '') || FALLBACK_CONFIG.ragScriptsLimit,
          agentsTableItemsPerPage: parseInt(configMap.get('ui_agents_table_items_per_page') || '') || FALLBACK_CONFIG.agentsTableItemsPerPage,
          defaultPreviewLimit: parseInt(configMap.get('ui_default_preview_limit') || '') || FALLBACK_CONFIG.defaultPreviewLimit,
          notificationsMaxDisplay: parseInt(configMap.get('ui_notifications_max_display') || '') || FALLBACK_CONFIG.notificationsMaxDisplay,
          escalationsDisplayLimit: parseInt(configMap.get('ui_escalations_display_limit') || '') || FALLBACK_CONFIG.escalationsDisplayLimit,
          uploadMaxSizeDefaultMb: parseInt(configMap.get('upload_max_size_default_mb') || '') || FALLBACK_CONFIG.uploadMaxSizeDefaultMb,
          uploadMaxSizeContractMb: parseInt(configMap.get('upload_max_size_contract_mb') || '') || FALLBACK_CONFIG.uploadMaxSizeContractMb,
          uploadAllowedTypes: parseJSON('upload_allowed_types', FALLBACK_CONFIG.uploadAllowedTypes),
          availableYears: parseJSON('ui_available_years', FALLBACK_CONFIG.availableYears),
          nudge1ResponseRate: parseFloat(configMap.get('metrics_nudge1_response_rate') || '') || FALLBACK_CONFIG.nudge1ResponseRate,
          nudge2ResponseRate: parseFloat(configMap.get('metrics_nudge2_response_rate') || '') || FALLBACK_CONFIG.nudge2ResponseRate,
          nudge3ResponseRate: parseFloat(configMap.get('metrics_nudge3_response_rate') || '') || FALLBACK_CONFIG.nudge3ResponseRate,
          trendThreshold: parseInt(configMap.get('metrics_trend_threshold') || '') || FALLBACK_CONFIG.trendThreshold,
          leadAlertMinAgeHours: parseInt(configMap.get('crm_lead_alert_min_age_hours') || '') || FALLBACK_CONFIG.leadAlertMinAgeHours,
          sofiaOrigins: parseJSON('crm_sofia_origins', FALLBACK_CONFIG.sofiaOrigins),
          pdfA4WidthPx: parseInt(configMap.get('pdf_a4_width_px') || '') || FALLBACK_CONFIG.pdfA4WidthPx,
          pdfA4HeightPx: parseInt(configMap.get('pdf_a4_height_px') || '') || FALLBACK_CONFIG.pdfA4HeightPx,
          ragCategories: parseJSON('rag_categories', FALLBACK_CONFIG.ragCategories),
          ragCategoryLabels: parseJSON('rag_category_labels', FALLBACK_CONFIG.ragCategoryLabels),
          ragDefaultTopK: parseInt(configMap.get('rag_default_top_k') || '') || FALLBACK_CONFIG.ragDefaultTopK,
          ragDefaultMinSimilarity: parseFloat(configMap.get('rag_default_min_similarity') || '') || FALLBACK_CONFIG.ragDefaultMinSimilarity,
          editorConsumoSimuladoKwh: parseInt(configMap.get('editor_consumo_simulado_kwh') || '') || FALLBACK_CONFIG.editorConsumoSimuladoKwh,
          editorConsumoMinUnlockKwh: parseInt(configMap.get('editor_consumo_min_unlock_kwh') || '') || FALLBACK_CONFIG.editorConsumoMinUnlockKwh,
          editorDefaultPlans: parseJSON('editor_default_plans', FALLBACK_CONFIG.editorDefaultPlans),
          simulatorMaxHistoryMsgLength: parseInt(configMap.get('simulator_max_history_msg_length') || '') || FALLBACK_CONFIG.simulatorMaxHistoryMsgLength,
          simulatorBatchSize: parseInt(configMap.get('simulator_batch_size') || '') || FALLBACK_CONFIG.simulatorBatchSize,
          importPatternsBatchSize: parseInt(configMap.get('import_patterns_batch_size') || '') || FALLBACK_CONFIG.importPatternsBatchSize,
          importPreviewLimit: parseInt(configMap.get('import_preview_limit') || '') || FALLBACK_CONFIG.importPreviewLimit,
          statsCounterSteps: parseInt(configMap.get('ui_stats_counter_steps') || '') || FALLBACK_CONFIG.statsCounterSteps,
          statsCounterDurationMs: parseInt(configMap.get('ui_stats_counter_duration_ms') || '') || FALLBACK_CONFIG.statsCounterDurationMs,
          // Phase 10
          intervalDeliveryFailuresMs: parseInt(configMap.get('interval_delivery_failures_ms') || '') || FALLBACK_CONFIG.intervalDeliveryFailuresMs,
          intervalSofiaMetricsMs: parseInt(configMap.get('interval_sofia_metrics_ms') || '') || FALLBACK_CONFIG.intervalSofiaMetricsMs,
          intervalZapiCredentialsMs: parseInt(configMap.get('interval_zapi_credentials_ms') || '') || FALLBACK_CONFIG.intervalZapiCredentialsMs,
          intervalStuckLeadsMs: parseInt(configMap.get('interval_stuck_leads_ms') || '') || FALLBACK_CONFIG.intervalStuckLeadsMs,
          intervalPendingLeadsMs: parseInt(configMap.get('interval_pending_leads_ms') || '') || FALLBACK_CONFIG.intervalPendingLeadsMs,
          realtimeDeliveryFailuresLimit: parseInt(configMap.get('realtime_delivery_failures_limit') || '') || FALLBACK_CONFIG.realtimeDeliveryFailuresLimit,
          realtimeCommandLogsLimit: parseInt(configMap.get('realtime_command_logs_limit') || '') || FALLBACK_CONFIG.realtimeCommandLogsLimit,
          realtimeNotificationsLimit: parseInt(configMap.get('realtime_notifications_limit') || '') || FALLBACK_CONFIG.realtimeNotificationsLimit,
          chartEmployeesLimit: parseInt(configMap.get('chart_employees_limit') || '') || FALLBACK_CONFIG.chartEmployeesLimit,
          chartColors: parseJSON('chart_colors', FALLBACK_CONFIG.chartColors),
          typosCleanupDisplayLimit: parseInt(configMap.get('typos_cleanup_display_limit') || '') || FALLBACK_CONFIG.typosCleanupDisplayLimit,
          resolvedAlertsDisplayLimit: parseInt(configMap.get('resolved_alerts_display_limit') || '') || FALLBACK_CONFIG.resolvedAlertsDisplayLimit,
          agentEmojiOptions: parseJSON('agent_emoji_options', FALLBACK_CONFIG.agentEmojiOptions),
          agentRoleOptions: parseJSON('agent_role_options', FALLBACK_CONFIG.agentRoleOptions),
          agentChannelOptions: parseJSON('agent_channel_options', FALLBACK_CONFIG.agentChannelOptions),
          // Phase 11
          queryLimitConversas: parseInt(configMap.get('query_limit_conversas') || '') || FALLBACK_CONFIG.queryLimitConversas,
          queryLimitBandeiras: parseInt(configMap.get('query_limit_bandeiras') || '') || FALLBACK_CONFIG.queryLimitBandeiras,
          queryLimitWarmupDays: parseInt(configMap.get('query_limit_warmup_days') || '') || FALLBACK_CONFIG.queryLimitWarmupDays,
          queryLimitPendingLeads: parseInt(configMap.get('query_limit_pending_leads') || '') || FALLBACK_CONFIG.queryLimitPendingLeads,
          queryLimitWebhookEvents: parseInt(configMap.get('query_limit_webhook_events') || '') || FALLBACK_CONFIG.queryLimitWebhookEvents,
          queryLimitRagAlerts: parseInt(configMap.get('query_limit_rag_alerts') || '') || FALLBACK_CONFIG.queryLimitRagAlerts,
          queryLimitRagChunks: parseInt(configMap.get('query_limit_rag_chunks') || '') || FALLBACK_CONFIG.queryLimitRagChunks,
          queryLimitDeliveryFailures: parseInt(configMap.get('query_limit_delivery_failures') || '') || FALLBACK_CONFIG.queryLimitDeliveryFailures,
          analyticsTopQuestionsLimit: parseInt(configMap.get('analytics_top_questions_limit') || '') || FALLBACK_CONFIG.analyticsTopQuestionsLimit,
          analyticsVersionChangesLimit: parseInt(configMap.get('analytics_version_changes_limit') || '') || FALLBACK_CONFIG.analyticsVersionChangesLimit,
          pollingFallbackIntervalMs: parseInt(configMap.get('polling_fallback_interval_ms') || '') || FALLBACK_CONFIG.pollingFallbackIntervalMs,
          // Phase 13
          intervalNudgeMetricsMs: parseInt(configMap.get('interval_nudge_metrics_ms') || '') || FALLBACK_CONFIG.intervalNudgeMetricsMs,
          intervalWebhookDiagnosticsMs: parseInt(configMap.get('interval_webhook_diagnostics_ms') || '') || FALLBACK_CONFIG.intervalWebhookDiagnosticsMs,
          queryLimitBitrixLogs: parseInt(configMap.get('query_limit_bitrix_logs') || '') || FALLBACK_CONFIG.queryLimitBitrixLogs,
          queryLimitCidadesAutocomplete: parseInt(configMap.get('query_limit_cidades_autocomplete') || '') || FALLBACK_CONFIG.queryLimitCidadesAutocomplete,
          // Phase 14: Final metric limits
          queryLimitNudgeMessages: parseInt(configMap.get('query_limit_nudge_messages') || '') || FALLBACK_CONFIG.queryLimitNudgeMessages,
          queryLimitNudgeConversas: parseInt(configMap.get('query_limit_nudge_conversas') || '') || FALLBACK_CONFIG.queryLimitNudgeConversas,
          queryLimitDocMetricsConversas: parseInt(configMap.get('query_limit_doc_metrics_conversas') || '') || FALLBACK_CONFIG.queryLimitDocMetricsConversas,
          queryLimitDocMetricsSolicitacoes: parseInt(configMap.get('query_limit_doc_metrics_solicitacoes') || '') || FALLBACK_CONFIG.queryLimitDocMetricsSolicitacoes,
          queryLimitDocMetricsPropostas: parseInt(configMap.get('query_limit_doc_metrics_propostas') || '') || FALLBACK_CONFIG.queryLimitDocMetricsPropostas,
          queryLimitPatternVersions: parseInt(configMap.get('query_limit_pattern_versions') || '') || FALLBACK_CONFIG.queryLimitPatternVersions,
          queryLimitOutboundQueue: parseInt(configMap.get('query_limit_outbound_queue') || '') || FALLBACK_CONFIG.queryLimitOutboundQueue,
          queryLimitAdminNotifications: parseInt(configMap.get('query_limit_admin_notifications') || '') || FALLBACK_CONFIG.queryLimitAdminNotifications,
          queryLimitRagQualityAlerts: parseInt(configMap.get('query_limit_rag_quality_alerts') || '') || FALLBACK_CONFIG.queryLimitRagQualityAlerts,
          // Phase 15: Final remaining limits
          queryLimitProposalAuditLog: parseInt(configMap.get('query_limit_proposal_audit_log') || '') || FALLBACK_CONFIG.queryLimitProposalAuditLog,
          queryLimitDeliveryFailuresDetail: parseInt(configMap.get('query_limit_delivery_failures_detail') || '') || FALLBACK_CONFIG.queryLimitDeliveryFailuresDetail,
        };

        cachedConfig = newConfig;
        cacheTimestamp = Date.now();
        setConfig(newConfig);
      } catch (err) {
        console.error('[useUIConfig] Unexpected error:', err);
        setConfig(FALLBACK_CONFIG);
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, []);

  return { ...config, loading };
}

// Export fallback for non-React contexts
export { FALLBACK_CONFIG as UI_FALLBACK_CONFIG };
