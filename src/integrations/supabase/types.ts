export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string
          id: string
          user_email: string | null
          user_id: string | null
          user_nome: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type: string
          id?: string
          user_email?: string | null
          user_id?: string | null
          user_nome?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string
          id?: string
          user_email?: string | null
          user_id?: string | null
          user_nome?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          admin_user_id: string | null
          created_at: string | null
          created_by_nome: string | null
          created_by_user_id: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string | null
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string | null
          created_by_nome?: string | null
          created_by_user_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type?: string | null
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string | null
          created_by_nome?: string | null
          created_by_user_id?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string | null
        }
        Relationships: []
      }
      agent_configurations: {
        Row: {
          agent_id: string
          config_key: string
          config_namespace: string
          config_value: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_secret_reference: boolean | null
          secret_key_name: string | null
          updated_at: string
          updated_by: string | null
          value_type: string
        }
        Insert: {
          agent_id: string
          config_key: string
          config_namespace?: string
          config_value: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_secret_reference?: boolean | null
          secret_key_name?: string | null
          updated_at?: string
          updated_by?: string | null
          value_type?: string
        }
        Update: {
          agent_id?: string
          config_key?: string
          config_namespace?: string
          config_value?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_secret_reference?: boolean | null
          secret_key_name?: string | null
          updated_at?: string
          updated_by?: string | null
          value_type?: string
        }
        Relationships: []
      }
      agent_prompt_modules: {
        Row: {
          agent_id: string
          created_at: string
          custom_variables: Json | null
          id: string
          is_enabled: boolean | null
          module_id: string
          priority_override: number | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          custom_variables?: Json | null
          id?: string
          is_enabled?: boolean | null
          module_id: string
          priority_override?: number | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          custom_variables?: Json | null
          id?: string
          is_enabled?: boolean | null
          module_id?: string
          priority_override?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_prompt_modules_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_prompt_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "prompt_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_secrets: {
        Row: {
          agent_id: string
          created_at: string
          description: string | null
          id: string
          is_configured: boolean | null
          mode: string
          secret_key: string
          secret_name: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_configured?: boolean | null
          mode: string
          secret_key: string
          secret_name: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_configured?: boolean | null
          mode?: string
          secret_key?: string
          secret_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_secrets_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_interactions: {
        Row: {
          agent_id: string
          conversa_id: string | null
          created_at: string
          id: string
          intent_detected: string | null
          resolution_status: string | null
          response_time_ms: number | null
          tools_used: string[] | null
          user_satisfaction: number | null
        }
        Insert: {
          agent_id: string
          conversa_id?: string | null
          created_at?: string
          id?: string
          intent_detected?: string | null
          resolution_status?: string | null
          response_time_ms?: number | null
          tools_used?: string[] | null
          user_satisfaction?: number | null
        }
        Update: {
          agent_id?: string
          conversa_id?: string | null
          created_at?: string
          id?: string
          intent_detected?: string | null
          resolution_status?: string | null
          response_time_ms?: number | null
          tools_used?: string[] | null
          user_satisfaction?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_interactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_versions: {
        Row: {
          agent_id: string
          brain_snapshot: Json
          changelog: string | null
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean | null
          version: string
        }
        Insert: {
          agent_id: string
          brain_snapshot: Json
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean | null
          version: string
        }
        Update: {
          agent_id?: string
          brain_snapshot?: Json
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_versions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          agent_id: string
          automations: Json | null
          avatar_emoji: string | null
          bitrix24_user_id: string | null
          channels: string[] | null
          collection_rules: Json | null
          created_at: string
          created_by: string | null
          description: string | null
          guardrails: Json | null
          id: string
          intents: Json | null
          kb_sources: Json | null
          metrics: Json | null
          name: string
          owners: Json | null
          persona: Json | null
          published_at: string | null
          published_by: string | null
          queues: Json | null
          role: string
          status: string
          tests: Json | null
          tools_config: Json | null
          triage_config: Json | null
          updated_at: string
          updated_by: string | null
          version: string
          voice_config: Json | null
          zapi_instance_id: string | null
          zapi_security_token: string | null
          zapi_token: string | null
        }
        Insert: {
          agent_id: string
          automations?: Json | null
          avatar_emoji?: string | null
          bitrix24_user_id?: string | null
          channels?: string[] | null
          collection_rules?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          guardrails?: Json | null
          id?: string
          intents?: Json | null
          kb_sources?: Json | null
          metrics?: Json | null
          name: string
          owners?: Json | null
          persona?: Json | null
          published_at?: string | null
          published_by?: string | null
          queues?: Json | null
          role: string
          status?: string
          tests?: Json | null
          tools_config?: Json | null
          triage_config?: Json | null
          updated_at?: string
          updated_by?: string | null
          version?: string
          voice_config?: Json | null
          zapi_instance_id?: string | null
          zapi_security_token?: string | null
          zapi_token?: string | null
        }
        Update: {
          agent_id?: string
          automations?: Json | null
          avatar_emoji?: string | null
          bitrix24_user_id?: string | null
          channels?: string[] | null
          collection_rules?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          guardrails?: Json | null
          id?: string
          intents?: Json | null
          kb_sources?: Json | null
          metrics?: Json | null
          name?: string
          owners?: Json | null
          persona?: Json | null
          published_at?: string | null
          published_by?: string | null
          queues?: Json | null
          role?: string
          status?: string
          tests?: Json | null
          tools_config?: Json | null
          triage_config?: Json | null
          updated_at?: string
          updated_by?: string | null
          version?: string
          voice_config?: Json | null
          zapi_instance_id?: string | null
          zapi_security_token?: string | null
          zapi_token?: string | null
        }
        Relationships: []
      }
      auto_learning_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          started_at: string
          stats: Json | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          started_at?: string
          stats?: Json | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          started_at?: string
          stats?: Json | null
          status?: string
        }
        Relationships: []
      }
      bandeiras_tarifarias: {
        Row: {
          ano_mes: string
          bandeira: string
          created_at: string
          id: string
          updated_at: string
          valor_kwh: number
        }
        Insert: {
          ano_mes: string
          bandeira: string
          created_at?: string
          id?: string
          updated_at?: string
          valor_kwh: number
        }
        Update: {
          ano_mes?: string
          bandeira?: string
          created_at?: string
          id?: string
          updated_at?: string
          valor_kwh?: number
        }
        Relationships: []
      }
      batch_learning_evaluations: {
        Row: {
          approved_rule_id: string | null
          chunk_id: string
          client_message: string
          created_at: string | null
          document_id: string | null
          id: string
          issues: Json | null
          job_id: string
          overall_score: number | null
          pair_index: number | null
          proposed_rule: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          rule_status: string | null
          scores: Json | null
          sofia_response: string
        }
        Insert: {
          approved_rule_id?: string | null
          chunk_id: string
          client_message: string
          created_at?: string | null
          document_id?: string | null
          id?: string
          issues?: Json | null
          job_id: string
          overall_score?: number | null
          pair_index?: number | null
          proposed_rule?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_status?: string | null
          scores?: Json | null
          sofia_response: string
        }
        Update: {
          approved_rule_id?: string | null
          chunk_id?: string
          client_message?: string
          created_at?: string | null
          document_id?: string | null
          id?: string
          issues?: Json | null
          job_id?: string
          overall_score?: number | null
          pair_index?: number | null
          proposed_rule?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_status?: string | null
          scores?: Json | null
          sofia_response?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_learning_evaluations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "batch_learning_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_learning_jobs: {
        Row: {
          completed_at: string | null
          config: Json | null
          created_at: string | null
          created_by: string | null
          error_message: string | null
          errors_found: number | null
          id: string
          processed_chunks: number | null
          rules_approved: number | null
          rules_extracted: number | null
          started_at: string | null
          status: string
          total_chunks: number | null
        }
        Insert: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          errors_found?: number | null
          id?: string
          processed_chunks?: number | null
          rules_approved?: number | null
          rules_extracted?: number | null
          started_at?: string | null
          status?: string
          total_chunks?: number | null
        }
        Update: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          errors_found?: number | null
          id?: string
          processed_chunks?: number | null
          rules_approved?: number | null
          rules_extracted?: number | null
          started_at?: string | null
          status?: string
          total_chunks?: number | null
        }
        Relationships: []
      }
      bitrix_stages_config: {
        Row: {
          block_message: string | null
          created_at: string
          descricao: string | null
          id: string
          is_active: boolean | null
          is_blocked: boolean | null
          nome: string
          recommended_fast_path: string | null
          recommended_mode: string | null
          should_skip_data_collection: boolean | null
          should_skip_triage: boolean | null
          sort_order: number | null
          stage_id: string
          updated_at: string
        }
        Insert: {
          block_message?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          is_active?: boolean | null
          is_blocked?: boolean | null
          nome: string
          recommended_fast_path?: string | null
          recommended_mode?: string | null
          should_skip_data_collection?: boolean | null
          should_skip_triage?: boolean | null
          sort_order?: number | null
          stage_id: string
          updated_at?: string
        }
        Update: {
          block_message?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          is_active?: boolean | null
          is_blocked?: boolean | null
          nome?: string
          recommended_fast_path?: string | null
          recommended_mode?: string | null
          should_skip_data_collection?: boolean | null
          should_skip_triage?: boolean | null
          sort_order?: number | null
          stage_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      bitrix24_sync_locks: {
        Row: {
          acquired_at: string | null
          created_at: string | null
          id: string
          lead_id: string
          lock_key: string
        }
        Insert: {
          acquired_at?: string | null
          created_at?: string | null
          id?: string
          lead_id: string
          lock_key: string
        }
        Update: {
          acquired_at?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string
          lock_key?: string
        }
        Relationships: []
      }
      bitrix24_sync_logs: {
        Row: {
          action: string
          bitrix24_lead_id: string | null
          created_at: string
          error_message: string | null
          id: string
          proposta_id: string | null
          request_data: Json | null
          response_data: Json | null
          status: string
        }
        Insert: {
          action: string
          bitrix24_lead_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          proposta_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          status?: string
        }
        Update: {
          action?: string
          bitrix24_lead_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          proposta_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bitrix24_sync_logs_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas_assinantes"
            referencedColumns: ["id"]
          },
        ]
      }
      business_rules_guardrails: {
        Row: {
          action_type: string
          agent_ids: string[] | null
          block_patterns: Json | null
          created_at: string | null
          description: string
          enforcement_point: string
          funnel_stages: string[] | null
          id: string
          is_active: boolean | null
          priority: number | null
          replacement_template: string | null
          rule_code: string
          rule_name: string
          severity: string
          trigger_patterns: Json | null
          updated_at: string | null
        }
        Insert: {
          action_type?: string
          agent_ids?: string[] | null
          block_patterns?: Json | null
          created_at?: string | null
          description: string
          enforcement_point: string
          funnel_stages?: string[] | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          replacement_template?: string | null
          rule_code: string
          rule_name: string
          severity?: string
          trigger_patterns?: Json | null
          updated_at?: string | null
        }
        Update: {
          action_type?: string
          agent_ids?: string[] | null
          block_patterns?: Json | null
          created_at?: string | null
          description?: string
          enforcement_point?: string
          funnel_stages?: string[] | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          replacement_template?: string | null
          rule_code?: string
          rule_name?: string
          severity?: string
          trigger_patterns?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      chatbot_conversas: {
        Row: {
          ab_variant: string | null
          agent_id: string
          all_docs_complete_at: string | null
          arquivos_anexados: Json | null
          atendente_notificado_at: string | null
          atendente_notificado_id: string | null
          atendente_notificado_nome: string | null
          audio_oferecido: boolean | null
          awaiting_response: boolean | null
          bitrix24_lead_id: string | null
          bitrix24_stage: string | null
          cliente_aceita_audio: boolean | null
          cliente_email: string | null
          cliente_nome: string | null
          cliente_telefone: string | null
          contract_nudge_count: number | null
          contrato_assinado: boolean | null
          contrato_assinado_at: string | null
          contrato_enviado_at: string | null
          created_at: string
          dados_coletados: Json | null
          detected_objection: string | null
          docs_received_page: Json | null
          docs_received_whatsapp: Json | null
          docs_source: string | null
          ended_at: string | null
          escalated_at: string | null
          escalation_reason: string | null
          event_conversion: boolean | null
          event_drop: boolean | null
          event_objection_detected: boolean | null
          event_proposal_sent: boolean | null
          event_simulation: boolean | null
          field_attempts: number | null
          first_doc_received_at: string | null
          followup_count: number | null
          followup_sent_at: string | null
          followup_stage: string | null
          fsm_expected_field: string | null
          has_simulation: boolean | null
          human_agent_id: string | null
          human_agent_nome: string | null
          human_intervention_count: number | null
          human_resolution_time_seconds: number | null
          human_resolved_at: string | null
          id: string
          last_deterministic_response_at: string | null
          last_human_message_at: string | null
          last_message_at: string | null
          last_processed_command_id: string | null
          last_rescue_at: string | null
          last_sofia_message_at: string | null
          lead_score: number | null
          lead_source: string | null
          master_offer_accepted: boolean | null
          master_offer_at: string | null
          master_offer_expires_at: string | null
          needs_human_fallback: boolean | null
          next_contract_nudge_at: string | null
          next_followup_at: string | null
          next_nudge_at: string | null
          next_rescue_at: string | null
          nudge_count: number | null
          objection_cooldown_until: string | null
          pending_task: string | null
          pending_task_created_at: string | null
          pending_task_retries: number | null
          proposta_id: string | null
          proposta_link_sent_at: string | null
          rescue_attempts: number | null
          rescue_reason: string | null
          response_times_seconds: number[] | null
          session_id: string
          sofia_mode: string | null
          total_messages: number | null
          whatsapp_provider: string | null
        }
        Insert: {
          ab_variant?: string | null
          agent_id?: string
          all_docs_complete_at?: string | null
          arquivos_anexados?: Json | null
          atendente_notificado_at?: string | null
          atendente_notificado_id?: string | null
          atendente_notificado_nome?: string | null
          audio_oferecido?: boolean | null
          awaiting_response?: boolean | null
          bitrix24_lead_id?: string | null
          bitrix24_stage?: string | null
          cliente_aceita_audio?: boolean | null
          cliente_email?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          contract_nudge_count?: number | null
          contrato_assinado?: boolean | null
          contrato_assinado_at?: string | null
          contrato_enviado_at?: string | null
          created_at?: string
          dados_coletados?: Json | null
          detected_objection?: string | null
          docs_received_page?: Json | null
          docs_received_whatsapp?: Json | null
          docs_source?: string | null
          ended_at?: string | null
          escalated_at?: string | null
          escalation_reason?: string | null
          event_conversion?: boolean | null
          event_drop?: boolean | null
          event_objection_detected?: boolean | null
          event_proposal_sent?: boolean | null
          event_simulation?: boolean | null
          field_attempts?: number | null
          first_doc_received_at?: string | null
          followup_count?: number | null
          followup_sent_at?: string | null
          followup_stage?: string | null
          fsm_expected_field?: string | null
          has_simulation?: boolean | null
          human_agent_id?: string | null
          human_agent_nome?: string | null
          human_intervention_count?: number | null
          human_resolution_time_seconds?: number | null
          human_resolved_at?: string | null
          id?: string
          last_deterministic_response_at?: string | null
          last_human_message_at?: string | null
          last_message_at?: string | null
          last_processed_command_id?: string | null
          last_rescue_at?: string | null
          last_sofia_message_at?: string | null
          lead_score?: number | null
          lead_source?: string | null
          master_offer_accepted?: boolean | null
          master_offer_at?: string | null
          master_offer_expires_at?: string | null
          needs_human_fallback?: boolean | null
          next_contract_nudge_at?: string | null
          next_followup_at?: string | null
          next_nudge_at?: string | null
          next_rescue_at?: string | null
          nudge_count?: number | null
          objection_cooldown_until?: string | null
          pending_task?: string | null
          pending_task_created_at?: string | null
          pending_task_retries?: number | null
          proposta_id?: string | null
          proposta_link_sent_at?: string | null
          rescue_attempts?: number | null
          rescue_reason?: string | null
          response_times_seconds?: number[] | null
          session_id: string
          sofia_mode?: string | null
          total_messages?: number | null
          whatsapp_provider?: string | null
        }
        Update: {
          ab_variant?: string | null
          agent_id?: string
          all_docs_complete_at?: string | null
          arquivos_anexados?: Json | null
          atendente_notificado_at?: string | null
          atendente_notificado_id?: string | null
          atendente_notificado_nome?: string | null
          audio_oferecido?: boolean | null
          awaiting_response?: boolean | null
          bitrix24_lead_id?: string | null
          bitrix24_stage?: string | null
          cliente_aceita_audio?: boolean | null
          cliente_email?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          contract_nudge_count?: number | null
          contrato_assinado?: boolean | null
          contrato_assinado_at?: string | null
          contrato_enviado_at?: string | null
          created_at?: string
          dados_coletados?: Json | null
          detected_objection?: string | null
          docs_received_page?: Json | null
          docs_received_whatsapp?: Json | null
          docs_source?: string | null
          ended_at?: string | null
          escalated_at?: string | null
          escalation_reason?: string | null
          event_conversion?: boolean | null
          event_drop?: boolean | null
          event_objection_detected?: boolean | null
          event_proposal_sent?: boolean | null
          event_simulation?: boolean | null
          field_attempts?: number | null
          first_doc_received_at?: string | null
          followup_count?: number | null
          followup_sent_at?: string | null
          followup_stage?: string | null
          fsm_expected_field?: string | null
          has_simulation?: boolean | null
          human_agent_id?: string | null
          human_agent_nome?: string | null
          human_intervention_count?: number | null
          human_resolution_time_seconds?: number | null
          human_resolved_at?: string | null
          id?: string
          last_deterministic_response_at?: string | null
          last_human_message_at?: string | null
          last_message_at?: string | null
          last_processed_command_id?: string | null
          last_rescue_at?: string | null
          last_sofia_message_at?: string | null
          lead_score?: number | null
          lead_source?: string | null
          master_offer_accepted?: boolean | null
          master_offer_at?: string | null
          master_offer_expires_at?: string | null
          needs_human_fallback?: boolean | null
          next_contract_nudge_at?: string | null
          next_followup_at?: string | null
          next_nudge_at?: string | null
          next_rescue_at?: string | null
          nudge_count?: number | null
          objection_cooldown_until?: string | null
          pending_task?: string | null
          pending_task_created_at?: string | null
          pending_task_retries?: number | null
          proposta_id?: string | null
          proposta_link_sent_at?: string | null
          rescue_attempts?: number | null
          rescue_reason?: string | null
          response_times_seconds?: number[] | null
          session_id?: string
          sofia_mode?: string | null
          total_messages?: number | null
          whatsapp_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_conversas_atendente_notificado_id_fkey"
            columns: ["atendente_notificado_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_atendentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_conversas_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas_assinantes"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_followups: {
        Row: {
          cliente_email: string | null
          cliente_nome: string | null
          cliente_telefone: string | null
          conversa_id: string
          created_at: string
          detected_objection: string | null
          error_message: string | null
          followup_stage: string
          id: string
          lead_score: number | null
          message: string
          sent_at: string | null
          status: string
          whatsapp_message_id: string | null
        }
        Insert: {
          cliente_email?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          conversa_id: string
          created_at?: string
          detected_objection?: string | null
          error_message?: string | null
          followup_stage: string
          id?: string
          lead_score?: number | null
          message: string
          sent_at?: string | null
          status?: string
          whatsapp_message_id?: string | null
        }
        Update: {
          cliente_email?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          conversa_id?: string
          created_at?: string
          detected_objection?: string | null
          error_message?: string | null
          followup_stage?: string
          id?: string
          lead_score?: number | null
          message?: string
          sent_at?: string | null
          status?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_followups_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_mensagens: {
        Row: {
          content: string
          conversa_id: string
          created_at: string
          handler_type: string | null
          id: string
          is_quick_reply: boolean | null
          message_id: string | null
          role: string
        }
        Insert: {
          content: string
          conversa_id: string
          created_at?: string
          handler_type?: string | null
          id?: string
          is_quick_reply?: boolean | null
          message_id?: string | null
          role: string
        }
        Update: {
          content?: string
          conversa_id?: string
          created_at?: string
          handler_type?: string | null
          id?: string
          is_quick_reply?: boolean | null
          message_id?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_mensagens_pendentes: {
        Row: {
          agent_id: string
          conversa_id: string | null
          created_at: string
          id: string
          max_tentativas: number | null
          mensagem: string
          resolution_status: string | null
          resolved_at: string | null
          retry_at: string
          telefone: string
          tentativas: number | null
          ultimo_erro: string | null
          ultimo_status_code: number | null
        }
        Insert: {
          agent_id?: string
          conversa_id?: string | null
          created_at?: string
          id?: string
          max_tentativas?: number | null
          mensagem: string
          resolution_status?: string | null
          resolved_at?: string | null
          retry_at?: string
          telefone: string
          tentativas?: number | null
          ultimo_erro?: string | null
          ultimo_status_code?: number | null
        }
        Update: {
          agent_id?: string
          conversa_id?: string | null
          created_at?: string
          id?: string
          max_tentativas?: number | null
          mensagem?: string
          resolution_status?: string | null
          resolved_at?: string | null
          retry_at?: string
          telefone?: string
          tentativas?: number | null
          ultimo_erro?: string | null
          ultimo_status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_mensagens_pendentes_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      cidades: {
        Row: {
          cidade: string
          created_at: string
          id: string
          indice_solarimetrico: number
          uf: string
        }
        Insert: {
          cidade: string
          created_at?: string
          id?: string
          indice_solarimetrico: number
          uf: string
        }
        Update: {
          cidade?: string
          created_at?: string
          id?: string
          indice_solarimetrico?: number
          uf?: string
        }
        Relationships: []
      }
      circuit_breaker_state: {
        Row: {
          circuit_id: string
          config: Json
          created_at: string
          failure_count: number
          last_failure_at: string | null
          last_success_at: string | null
          opened_at: string | null
          state: string
          success_count: number
          updated_at: string
        }
        Insert: {
          circuit_id: string
          config?: Json
          created_at?: string
          failure_count?: number
          last_failure_at?: string | null
          last_success_at?: string | null
          opened_at?: string | null
          state?: string
          success_count?: number
          updated_at?: string
        }
        Update: {
          circuit_id?: string
          config?: Json
          created_at?: string
          failure_count?: number
          last_failure_at?: string | null
          last_success_at?: string | null
          opened_at?: string | null
          state?: string
          success_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      client_behavioral_profiles: {
        Row: {
          avg_message_length: number | null
          avg_response_time_seconds: number | null
          clarifications_needed: number | null
          confused_score: number | null
          dominant_profile: string | null
          elderly_score: number | null
          first_seen_at: string | null
          id: string
          last_conversa_id: string | null
          last_updated_at: string | null
          objections_count: number | null
          objective_score: number | null
          phone: string
          preferred_tone: string | null
          profile_confidence: number | null
          skeptical_score: number | null
          technical_score: number | null
          total_conversations: number | null
          total_messages_analyzed: number | null
        }
        Insert: {
          avg_message_length?: number | null
          avg_response_time_seconds?: number | null
          clarifications_needed?: number | null
          confused_score?: number | null
          dominant_profile?: string | null
          elderly_score?: number | null
          first_seen_at?: string | null
          id?: string
          last_conversa_id?: string | null
          last_updated_at?: string | null
          objections_count?: number | null
          objective_score?: number | null
          phone: string
          preferred_tone?: string | null
          profile_confidence?: number | null
          skeptical_score?: number | null
          technical_score?: number | null
          total_conversations?: number | null
          total_messages_analyzed?: number | null
        }
        Update: {
          avg_message_length?: number | null
          avg_response_time_seconds?: number | null
          clarifications_needed?: number | null
          confused_score?: number | null
          dominant_profile?: string | null
          elderly_score?: number | null
          first_seen_at?: string | null
          id?: string
          last_conversa_id?: string | null
          last_updated_at?: string | null
          objections_count?: number | null
          objective_score?: number | null
          phone?: string
          preferred_tone?: string | null
          profile_confidence?: number | null
          skeptical_score?: number | null
          technical_score?: number | null
          total_conversations?: number | null
          total_messages_analyzed?: number | null
        }
        Relationships: []
      }
      coesa_contatos: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          identificador: string
          is_active: boolean
          nome: string
          telefone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          identificador: string
          is_active?: boolean
          nome: string
          telefone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          identificador?: string
          is_active?: boolean
          nome?: string
          telefone?: string
          updated_at?: string
        }
        Relationships: []
      }
      concessionarias: {
        Row: {
          created_at: string
          id: string
          modalidade: string | null
          nome: string
          pis_cofins: number | null
          sigla_aneel: string | null
          subgrupo: string | null
          tarifa_com_impostos: number | null
          tarifa_media: number | null
          te: number | null
          tusd: number | null
          tusd_fio_b: number | null
          uf: string | null
          ultima_atualizacao: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          modalidade?: string | null
          nome: string
          pis_cofins?: number | null
          sigla_aneel?: string | null
          subgrupo?: string | null
          tarifa_com_impostos?: number | null
          tarifa_media?: number | null
          te?: number | null
          tusd?: number | null
          tusd_fio_b?: number | null
          uf?: string | null
          ultima_atualizacao?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          modalidade?: string | null
          nome?: string
          pis_cofins?: number | null
          sigla_aneel?: string | null
          subgrupo?: string | null
          tarifa_com_impostos?: number | null
          tarifa_media?: number | null
          te?: number | null
          tusd?: number | null
          tusd_fio_b?: number | null
          uf?: string | null
          ultima_atualizacao?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: []
      }
      configuracoes_audit_log: {
        Row: {
          alterado_por_email: string | null
          alterado_por_id: string | null
          alterado_por_nome: string | null
          chave: string
          created_at: string
          id: string
          ip_address: string | null
          user_agent: string | null
          valor_anterior: string | null
          valor_novo: string
        }
        Insert: {
          alterado_por_email?: string | null
          alterado_por_id?: string | null
          alterado_por_nome?: string | null
          chave: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          valor_anterior?: string | null
          valor_novo: string
        }
        Update: {
          alterado_por_email?: string | null
          alterado_por_id?: string | null
          alterado_por_nome?: string | null
          chave?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          valor_anterior?: string | null
          valor_novo?: string
        }
        Relationships: []
      }
      configuracoes_sistema: {
        Row: {
          chave: string
          created_at: string
          descricao: string | null
          id: string
          updated_at: string
          valor: string
        }
        Insert: {
          chave: string
          created_at?: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor: string
        }
        Update: {
          chave?: string
          created_at?: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      crm_contatos: {
        Row: {
          bitrix24_lead_id: string | null
          bitrix24_stage: string | null
          cep: string | null
          cidade: string | null
          cpf_cnpj: string | null
          created_at: string
          criado_por_email: string | null
          criado_por_nome: string | null
          email: string | null
          endereco: string | null
          id: string
          nome: string
          observacoes: string | null
          origem: string | null
          proposta_id: string | null
          proposta_tipo: string | null
          status: string | null
          telefone: string | null
          uf: string | null
          ultima_interacao: string | null
          ultimo_erro: string | null
          updated_at: string
          user_id: string
          valor_potencial: number | null
        }
        Insert: {
          bitrix24_lead_id?: string | null
          bitrix24_stage?: string | null
          cep?: string | null
          cidade?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          criado_por_email?: string | null
          criado_por_nome?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          origem?: string | null
          proposta_id?: string | null
          proposta_tipo?: string | null
          status?: string | null
          telefone?: string | null
          uf?: string | null
          ultima_interacao?: string | null
          ultimo_erro?: string | null
          updated_at?: string
          user_id: string
          valor_potencial?: number | null
        }
        Update: {
          bitrix24_lead_id?: string | null
          bitrix24_stage?: string | null
          cep?: string | null
          cidade?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          criado_por_email?: string | null
          criado_por_nome?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          origem?: string | null
          proposta_id?: string | null
          proposta_tipo?: string | null
          status?: string | null
          telefone?: string | null
          uf?: string | null
          ultima_interacao?: string | null
          ultimo_erro?: string | null
          updated_at?: string
          user_id?: string
          valor_potencial?: number | null
        }
        Relationships: []
      }
      crm_data_updates_log: {
        Row: {
          agent_id: string
          bitrix_update_success: boolean | null
          confirmed_by_client: boolean | null
          conversa_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          error_message: string | null
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          agent_id?: string
          bitrix_update_success?: boolean | null
          confirmed_by_client?: boolean | null
          conversa_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          agent_id?: string
          bitrix_update_success?: boolean | null
          confirmed_by_client?: boolean | null
          conversa_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_data_updates_log_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      cronograma_gd2: {
        Row: {
          ano: number
          created_at: string | null
          descricao: string | null
          id: string
          percentual: number
          updated_at: string | null
        }
        Insert: {
          ano: number
          created_at?: string | null
          descricao?: string | null
          id?: string
          percentual: number
          updated_at?: string | null
        }
        Update: {
          ano?: number
          created_at?: string | null
          descricao?: string | null
          id?: string
          percentual?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      cross_webhook_locks: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          lead_id: string | null
          lock_purpose: string | null
          locked_at: string
          locked_by: string
          phone_normalized: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          lead_id?: string | null
          lock_purpose?: string | null
          locked_at?: string
          locked_by: string
          phone_normalized: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          lead_id?: string | null
          lock_purpose?: string | null
          locked_at?: string
          locked_by?: string
          phone_normalized?: string
        }
        Relationships: []
      }
      dados_empresa_pj: {
        Row: {
          admin_cep: string | null
          admin_cidade: string | null
          admin_cpf: string
          admin_data_nascimento: string | null
          admin_endereco: string | null
          admin_estado_civil: string | null
          admin_nacionalidade: string | null
          admin_nome_completo: string
          admin_profissao: string | null
          admin_rg: string | null
          admin_rg_orgao: string | null
          admin_uf: string | null
          cnpj: string
          contrato_social_url: string | null
          created_at: string | null
          data_constituicao: string | null
          id: string
          inscricao_estadual: string | null
          natureza_juridica: string | null
          nire: string | null
          objeto_social: string | null
          proposta_id: string | null
          quadro_societario: Json | null
          razao_social: string
          sede_bairro: string | null
          sede_cep: string | null
          sede_cidade: string | null
          sede_complemento: string | null
          sede_logradouro: string | null
          sede_numero: string | null
          sede_uf: string | null
          updated_at: string | null
        }
        Insert: {
          admin_cep?: string | null
          admin_cidade?: string | null
          admin_cpf: string
          admin_data_nascimento?: string | null
          admin_endereco?: string | null
          admin_estado_civil?: string | null
          admin_nacionalidade?: string | null
          admin_nome_completo: string
          admin_profissao?: string | null
          admin_rg?: string | null
          admin_rg_orgao?: string | null
          admin_uf?: string | null
          cnpj: string
          contrato_social_url?: string | null
          created_at?: string | null
          data_constituicao?: string | null
          id?: string
          inscricao_estadual?: string | null
          natureza_juridica?: string | null
          nire?: string | null
          objeto_social?: string | null
          proposta_id?: string | null
          quadro_societario?: Json | null
          razao_social: string
          sede_bairro?: string | null
          sede_cep?: string | null
          sede_cidade?: string | null
          sede_complemento?: string | null
          sede_logradouro?: string | null
          sede_numero?: string | null
          sede_uf?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_cep?: string | null
          admin_cidade?: string | null
          admin_cpf?: string
          admin_data_nascimento?: string | null
          admin_endereco?: string | null
          admin_estado_civil?: string | null
          admin_nacionalidade?: string | null
          admin_nome_completo?: string
          admin_profissao?: string | null
          admin_rg?: string | null
          admin_rg_orgao?: string | null
          admin_uf?: string | null
          cnpj?: string
          contrato_social_url?: string | null
          created_at?: string | null
          data_constituicao?: string | null
          id?: string
          inscricao_estadual?: string | null
          natureza_juridica?: string | null
          nire?: string | null
          objeto_social?: string | null
          proposta_id?: string | null
          quadro_societario?: Json | null
          razao_social?: string
          sede_bairro?: string | null
          sede_cep?: string | null
          sede_cidade?: string | null
          sede_complemento?: string | null
          sede_logradouro?: string | null
          sede_numero?: string | null
          sede_uf?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dados_empresa_pj_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas_assinantes"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_recipients: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          nome: string
          notification_types: string[] | null
          notify_via: string[] | null
          telefone: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          nome: string
          notification_types?: string[] | null
          notify_via?: string[] | null
          telefone: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          nome?: string
          notification_types?: string[] | null
          notify_via?: string[] | null
          telefone?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      deterministic_response_templates: {
        Row: {
          agent_id: string
          created_at: string
          current_state: string
          expected_field: string
          id: string
          is_active: boolean
          metadata: Json | null
          next_expected_field: string | null
          next_state: string | null
          priority: number
          response_template: string
          updated_at: string
          validation_result: string
        }
        Insert: {
          agent_id?: string
          created_at?: string
          current_state: string
          expected_field: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          next_expected_field?: string | null
          next_state?: string | null
          priority?: number
          response_template: string
          updated_at?: string
          validation_result: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          current_state?: string
          expected_field?: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          next_expected_field?: string | null
          next_state?: string | null
          priority?: number
          response_template?: string
          updated_at?: string
          validation_result?: string
        }
        Relationships: []
      }
      distribuidora_typos: {
        Row: {
          confirmation_count: number | null
          created_at: string | null
          distribuidora_id: string
          id: string
          is_confirmed: boolean | null
          pattern_regex: string | null
          typo: string
        }
        Insert: {
          confirmation_count?: number | null
          created_at?: string | null
          distribuidora_id: string
          id?: string
          is_confirmed?: boolean | null
          pattern_regex?: string | null
          typo: string
        }
        Update: {
          confirmation_count?: number | null
          created_at?: string | null
          distribuidora_id?: string
          id?: string
          is_confirmed?: boolean | null
          pattern_regex?: string | null
          typo?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribuidora_typos_distribuidora_id_fkey"
            columns: ["distribuidora_id"]
            isOneToOne: false
            referencedRelation: "distribuidoras_config"
            referencedColumns: ["id"]
          },
        ]
      }
      distribuidora_typos_log: {
        Row: {
          cliente_telefone: string | null
          confirmado: boolean | null
          contexto_mensagem: string | null
          conversa_id: string | null
          created_at: string
          distribuidora_final: string | null
          id: string
          sugestao: string
          typo_detectado: string
        }
        Insert: {
          cliente_telefone?: string | null
          confirmado?: boolean | null
          contexto_mensagem?: string | null
          conversa_id?: string | null
          created_at?: string
          distribuidora_final?: string | null
          id?: string
          sugestao: string
          typo_detectado: string
        }
        Update: {
          cliente_telefone?: string | null
          confirmado?: boolean | null
          contexto_mensagem?: string | null
          conversa_id?: string | null
          created_at?: string
          distribuidora_final?: string | null
          id?: string
          sugestao?: string
          typo_detectado?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribuidora_typos_log_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      distribuidoras_config: {
        Row: {
          bitrix_value: string | null
          clarification_message: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_atendida: boolean | null
          nome: string
          nome_normalizado: string
          parent_id: string | null
          priority: number | null
          rejection_message: string | null
          requires_clarification: boolean | null
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          bitrix_value?: string | null
          clarification_message?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_atendida?: boolean | null
          nome: string
          nome_normalizado: string
          parent_id?: string | null
          priority?: number | null
          rejection_message?: string | null
          requires_clarification?: boolean | null
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          bitrix_value?: string | null
          clarification_message?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_atendida?: boolean | null
          nome?: string
          nome_normalizado?: string
          parent_id?: string | null
          priority?: number | null
          rejection_message?: string | null
          requires_clarification?: boolean | null
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distribuidoras_config_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "distribuidoras_config"
            referencedColumns: ["id"]
          },
        ]
      }
      document_recovery_logs: {
        Row: {
          all_docs_complete: boolean | null
          bitrix_lead_id: string | null
          bitrix_stage_after: string | null
          bitrix_stage_before: string | null
          cliente_telefone: string | null
          conversa_id: string | null
          created_at: string
          document_name: string | null
          document_type: string
          document_url: string | null
          error_message: string | null
          id: string
          original_event_at: string | null
          original_event_id: string | null
          recovery_source: string | null
          was_successful: boolean | null
        }
        Insert: {
          all_docs_complete?: boolean | null
          bitrix_lead_id?: string | null
          bitrix_stage_after?: string | null
          bitrix_stage_before?: string | null
          cliente_telefone?: string | null
          conversa_id?: string | null
          created_at?: string
          document_name?: string | null
          document_type: string
          document_url?: string | null
          error_message?: string | null
          id?: string
          original_event_at?: string | null
          original_event_id?: string | null
          recovery_source?: string | null
          was_successful?: boolean | null
        }
        Update: {
          all_docs_complete?: boolean | null
          bitrix_lead_id?: string | null
          bitrix_stage_after?: string | null
          bitrix_stage_before?: string | null
          cliente_telefone?: string | null
          conversa_id?: string | null
          created_at?: string
          document_name?: string | null
          document_type?: string
          document_url?: string | null
          error_message?: string | null
          id?: string
          original_event_at?: string | null
          original_event_id?: string | null
          recovery_source?: string | null
          was_successful?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "document_recovery_logs_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      document_recovery_metrics: {
        Row: {
          created_at: string
          document_type: string
          failed_recoveries: number | null
          id: string
          led_to_complete_docs: number | null
          metric_date: string
          recovery_source: string
          successful_recoveries: number | null
          total_attempts: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_type: string
          failed_recoveries?: number | null
          id?: string
          led_to_complete_docs?: number | null
          metric_date: string
          recovery_source: string
          successful_recoveries?: number | null
          total_attempts?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_type?: string
          failed_recoveries?: number | null
          id?: string
          led_to_complete_docs?: number | null
          metric_date?: string
          recovery_source?: string
          successful_recoveries?: number | null
          total_attempts?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          notification_id: string | null
          notification_type: string | null
          recipient_email: string
          recipient_user_id: string | null
          status: string | null
          subject: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          notification_id?: string | null
          notification_type?: string | null
          recipient_email: string
          recipient_user_id?: string | null
          status?: string | null
          subject: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          notification_id?: string | null
          notification_type?: string | null
          recipient_email?: string
          recipient_user_id?: string | null
          status?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "admin_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      email_preferences: {
        Row: {
          created_at: string
          email_enabled: boolean | null
          id: string
          notify_meta_atingida: boolean | null
          notify_novo_usuario: boolean | null
          notify_proposta_aceita: boolean | null
          notify_proposta_criada: boolean | null
          notify_proposta_excluida: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_enabled?: boolean | null
          id?: string
          notify_meta_atingida?: boolean | null
          notify_novo_usuario?: boolean | null
          notify_proposta_aceita?: boolean | null
          notify_proposta_criada?: boolean | null
          notify_proposta_excluida?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_enabled?: boolean | null
          id?: string
          notify_meta_atingida?: boolean | null
          notify_novo_usuario?: boolean | null
          notify_proposta_aceita?: boolean | null
          notify_proposta_criada?: boolean | null
          notify_proposta_excluida?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      employee_goals: {
        Row: {
          conversao_meta: number | null
          created_at: string | null
          created_by: string | null
          id: string
          month: number
          propostas_meta: number | null
          updated_at: string | null
          user_id: string
          valor_meta: number | null
          year: number
        }
        Insert: {
          conversao_meta?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          month: number
          propostas_meta?: number | null
          updated_at?: string | null
          user_id: string
          valor_meta?: number | null
          year: number
        }
        Update: {
          conversao_meta?: number | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          month?: number
          propostas_meta?: number | null
          updated_at?: string | null
          user_id?: string
          valor_meta?: number | null
          year?: number
        }
        Relationships: []
      }
      evaluation_dataset: {
        Row: {
          categoria: string
          contexto: string
          correcao_aplicada: string | null
          created_at: string | null
          id: number
          mensagem_lead: string
          phone_id: string | null
          problema: string
          resposta_agente: string | null
          resposta_esperada: string
          severidade: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          categoria: string
          contexto: string
          correcao_aplicada?: string | null
          created_at?: string | null
          id?: number
          mensagem_lead: string
          phone_id?: string | null
          problema: string
          resposta_agente?: string | null
          resposta_esperada: string
          severidade: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          categoria?: string
          contexto?: string
          correcao_aplicada?: string | null
          created_at?: string | null
          id?: number
          mensagem_lead?: string
          phone_id?: string | null
          problema?: string
          resposta_agente?: string | null
          resposta_esperada?: string
          severidade?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      few_shot_examples: {
        Row: {
          agent_id: string
          context: string | null
          created_at: string
          expected_output: string
          id: string
          input: string
          is_active: boolean
          is_approved: boolean
          metadata: Json | null
          quality_score: number | null
          source_conversation_id: string | null
          updated_at: string
        }
        Insert: {
          agent_id?: string
          context?: string | null
          created_at?: string
          expected_output: string
          id?: string
          input: string
          is_active?: boolean
          is_approved?: boolean
          metadata?: Json | null
          quality_score?: number | null
          source_conversation_id?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          context?: string | null
          created_at?: string
          expected_output?: string
          id?: string
          input?: string
          is_active?: boolean
          is_approved?: boolean
          metadata?: Json | null
          quality_score?: number | null
          source_conversation_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fluxo_caixa: {
        Row: {
          ano: number
          arrendamento: number | null
          contabilidade: number | null
          created_at: string
          ebitda: number | null
          fluxo_caixa_descontado: number | null
          fluxo_caixa_livre: number | null
          geracao_mwh: number | null
          id: string
          irpj_csll: number | null
          lucro_liquido: number | null
          om: number | null
          parcela_financiamento: number | null
          pis_cofins: number | null
          proposta_usineiro_id: string
          receita_bruta: number | null
          receita_liquida: number | null
          seguro: number | null
        }
        Insert: {
          ano: number
          arrendamento?: number | null
          contabilidade?: number | null
          created_at?: string
          ebitda?: number | null
          fluxo_caixa_descontado?: number | null
          fluxo_caixa_livre?: number | null
          geracao_mwh?: number | null
          id?: string
          irpj_csll?: number | null
          lucro_liquido?: number | null
          om?: number | null
          parcela_financiamento?: number | null
          pis_cofins?: number | null
          proposta_usineiro_id: string
          receita_bruta?: number | null
          receita_liquida?: number | null
          seguro?: number | null
        }
        Update: {
          ano?: number
          arrendamento?: number | null
          contabilidade?: number | null
          created_at?: string
          ebitda?: number | null
          fluxo_caixa_descontado?: number | null
          fluxo_caixa_livre?: number | null
          geracao_mwh?: number | null
          id?: string
          irpj_csll?: number | null
          lucro_liquido?: number | null
          om?: number | null
          parcela_financiamento?: number | null
          pis_cofins?: number | null
          proposta_usineiro_id?: string
          receita_bruta?: number | null
          receita_liquida?: number | null
          seguro?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fluxo_caixa_proposta_usineiro_id_fkey"
            columns: ["proposta_usineiro_id"]
            isOneToOne: false
            referencedRelation: "propostas_usineiros"
            referencedColumns: ["id"]
          },
        ]
      }
      forbidden_typo_words: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          word: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          word: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          word?: string
        }
        Relationships: []
      }
      fraude_alertas: {
        Row: {
          cpf_cnpj_conta: string | null
          cpf_identificacao: string | null
          created_at: string | null
          dados_extraidos: Json | null
          id: string
          ip_cliente: string | null
          observacoes: string | null
          proposta_id: string | null
          resolvido: boolean | null
          resolvido_em: string | null
          resolvido_por: string | null
          tipo_alerta: string
          user_agent: string | null
        }
        Insert: {
          cpf_cnpj_conta?: string | null
          cpf_identificacao?: string | null
          created_at?: string | null
          dados_extraidos?: Json | null
          id?: string
          ip_cliente?: string | null
          observacoes?: string | null
          proposta_id?: string | null
          resolvido?: boolean | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          tipo_alerta: string
          user_agent?: string | null
        }
        Update: {
          cpf_cnpj_conta?: string | null
          cpf_identificacao?: string | null
          created_at?: string | null
          dados_extraidos?: Json | null
          id?: string
          ip_cliente?: string | null
          observacoes?: string | null
          proposta_id?: string | null
          resolvido?: boolean | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          tipo_alerta?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fraude_alertas_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas_assinantes"
            referencedColumns: ["id"]
          },
        ]
      }
      fsm_trace_logs: {
        Row: {
          agent_id: string
          conversa_id: string | null
          created_at: string
          events: Json
          id: string
          phone: string | null
          summary: Json | null
          trace_id: string
        }
        Insert: {
          agent_id?: string
          conversa_id?: string | null
          created_at?: string
          events?: Json
          id?: string
          phone?: string | null
          summary?: Json | null
          trace_id: string
        }
        Update: {
          agent_id?: string
          conversa_id?: string | null
          created_at?: string
          events?: Json
          id?: string
          phone?: string | null
          summary?: Json | null
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fsm_trace_logs_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      human_takeovers: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          phone_normalized: string
          resolved_at: string | null
          resolved_by_name: string | null
          resolved_by_phone: string | null
          taken_over_at: string
          taken_over_by_name: string | null
          taken_over_by_phone: string | null
          updated_at: string
          whatsapp_provider: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          phone_normalized: string
          resolved_at?: string | null
          resolved_by_name?: string | null
          resolved_by_phone?: string | null
          taken_over_at?: string
          taken_over_by_name?: string | null
          taken_over_by_phone?: string | null
          updated_at?: string
          whatsapp_provider?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          phone_normalized?: string
          resolved_at?: string | null
          resolved_by_name?: string | null
          resolved_by_phone?: string | null
          taken_over_at?: string
          taken_over_by_name?: string | null
          taken_over_by_phone?: string | null
          updated_at?: string
          whatsapp_provider?: string
        }
        Relationships: []
      }
      icms_estados: {
        Row: {
          base_legal: string | null
          created_at: string
          icms_isenta_compensacao: boolean | null
          icms_percentual: number
          id: string
          nome_estado: string
          observacoes: string | null
          observacoes_gd: string | null
          uf: string
          updated_at: string
          vigencia_ate: string | null
        }
        Insert: {
          base_legal?: string | null
          created_at?: string
          icms_isenta_compensacao?: boolean | null
          icms_percentual: number
          id?: string
          nome_estado: string
          observacoes?: string | null
          observacoes_gd?: string | null
          uf: string
          updated_at?: string
          vigencia_ate?: string | null
        }
        Update: {
          base_legal?: string | null
          created_at?: string
          icms_isenta_compensacao?: boolean | null
          icms_percentual?: number
          id?: string
          nome_estado?: string
          observacoes?: string | null
          observacoes_gd?: string | null
          uf?: string
          updated_at?: string
          vigencia_ate?: string | null
        }
        Relationships: []
      }
      improvement_proposals: {
        Row: {
          agent_id: string
          applied_at: string | null
          category: string
          confidence: number
          created_at: string
          evidence: Json | null
          expected_impact: string | null
          id: string
          problem_description: string
          proposed_change: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_level: string
          rollback_at: string | null
          rollback_reason: string | null
          run_id: string | null
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agent_id?: string
          applied_at?: string | null
          category: string
          confidence?: number
          created_at?: string
          evidence?: Json | null
          expected_impact?: string | null
          id?: string
          problem_description: string
          proposed_change: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string
          rollback_at?: string | null
          rollback_reason?: string | null
          run_id?: string | null
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          applied_at?: string | null
          category?: string
          confidence?: number
          created_at?: string
          evidence?: Json | null
          expected_impact?: string | null
          id?: string
          problem_description?: string
          proposed_change?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string
          rollback_at?: string | null
          rollback_reason?: string | null
          run_id?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      infra_metrics: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          metric_name: string
          metric_value: number
          threshold_critical: number | null
          threshold_warning: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_name: string
          metric_value: number
          threshold_critical?: number | null
          threshold_warning?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_name?: string
          metric_value?: number
          threshold_critical?: number | null
          threshold_warning?: number | null
        }
        Relationships: []
      }
      interaction_patterns: {
        Row: {
          agent_id: string
          created_at: string
          failure_response: Json | null
          id: string
          is_active: boolean
          pattern_type: string
          sample_count: number | null
          success_rate: number | null
          successful_response: Json | null
          trigger_pattern: Json
          updated_at: string
        }
        Insert: {
          agent_id?: string
          created_at?: string
          failure_response?: Json | null
          id?: string
          is_active?: boolean
          pattern_type: string
          sample_count?: number | null
          success_rate?: number | null
          successful_response?: Json | null
          trigger_pattern: Json
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          failure_response?: Json | null
          id?: string
          is_active?: boolean
          pattern_type?: string
          sample_count?: number | null
          success_rate?: number | null
          successful_response?: Json | null
          trigger_pattern?: Json
          updated_at?: string
        }
        Relationships: []
      }
      learning_processed_conversations: {
        Row: {
          content_hash: string
          created_at: string
          error_message: string | null
          few_shots_created: number | null
          file_name: string
          id: string
          message_count: number | null
          processing_time_ms: number | null
          rules_extracted: number | null
          status: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          error_message?: string | null
          few_shots_created?: number | null
          file_name: string
          id?: string
          message_count?: number | null
          processing_time_ms?: number | null
          rules_extracted?: number | null
          status?: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          error_message?: string | null
          few_shots_created?: number | null
          file_name?: string
          id?: string
          message_count?: number | null
          processing_time_ms?: number | null
          rules_extracted?: number | null
          status?: string
        }
        Relationships: []
      }
      llm_usage_log: {
        Row: {
          agent_id: string
          conversa_id: string | null
          cost_usd: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
        }
        Insert: {
          agent_id?: string
          conversa_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
        }
        Update: {
          agent_id?: string
          conversa_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "llm_usage_log_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_desqualificacao: {
        Row: {
          created_at: string
          emoji: string | null
          id: string
          is_active: boolean | null
          mensagem_cliente: string
          mensagem_crm: string
          motivo: string
          motivo_label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          emoji?: string | null
          id?: string
          is_active?: boolean | null
          mensagem_cliente: string
          mensagem_crm: string
          motivo: string
          motivo_label: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          emoji?: string | null
          id?: string
          is_active?: boolean | null
          mensagem_cliente?: string
          mensagem_crm?: string
          motivo?: string
          motivo_label?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_buffers: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          is_processing: boolean
          last_message_at: string
          messages: Json
          phone: string
          session_started_at: string
          updated_at: string
        }
        Insert: {
          agent_id?: string
          created_at?: string
          id?: string
          is_processing?: boolean
          last_message_at?: string
          messages?: Json
          phone: string
          session_started_at?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          is_processing?: boolean
          last_message_at?: string
          messages?: Json
          phone?: string
          session_started_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_processing_locks: {
        Row: {
          agent_id: string
          expires_at: string
          locked_at: string
          locked_by: string
          phone_normalized: string
        }
        Insert: {
          agent_id?: string
          expires_at?: string
          locked_at?: string
          locked_by: string
          phone_normalized: string
        }
        Update: {
          agent_id?: string
          expires_at?: string
          locked_at?: string
          locked_by?: string
          phone_normalized?: string
        }
        Relationships: []
      }
      n8n_event_log: {
        Row: {
          attempts: number | null
          created_at: string | null
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          response_body: string | null
          response_code: number | null
          sent_at: string | null
          status: string | null
          webhook_url: string | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          payload: Json
          response_body?: string | null
          response_code?: number | null
          sent_at?: string | null
          status?: string | null
          webhook_url?: string | null
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          response_body?: string | null
          response_code?: number | null
          sent_at?: string | null
          status?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      n8n_notification_config: {
        Row: {
          created_at: string
          event_description: string | null
          event_label: string
          event_type: string
          id: string
          is_enabled: boolean
          platforms: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_description?: string | null
          event_label: string
          event_type: string
          id?: string
          is_enabled?: boolean
          platforms?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_description?: string | null
          event_label?: string
          event_type?: string
          id?: string
          is_enabled?: boolean
          platforms?: Json
          updated_at?: string
        }
        Relationships: []
      }
      observability_snapshots: {
        Row: {
          agent_id: string
          alerts: Json | null
          created_at: string
          generated_at: string
          id: string
          passive_context: Json | null
          period: string
          phase_latency: Json | null
          rag_quality: Json | null
          rule_memory: Json | null
          summary: Json
          target_comparison: Json | null
        }
        Insert: {
          agent_id: string
          alerts?: Json | null
          created_at?: string
          generated_at?: string
          id?: string
          passive_context?: Json | null
          period?: string
          phase_latency?: Json | null
          rag_quality?: Json | null
          rule_memory?: Json | null
          summary?: Json
          target_comparison?: Json | null
        }
        Update: {
          agent_id?: string
          alerts?: Json | null
          created_at?: string
          generated_at?: string
          id?: string
          passive_context?: Json | null
          period?: string
          phase_latency?: Json | null
          rag_quality?: Json | null
          rule_memory?: Json | null
          summary?: Json
          target_comparison?: Json | null
        }
        Relationships: []
      }
      operator_command_logs: {
        Row: {
          action_result: string | null
          client_name: string | null
          client_phone: string | null
          command: string
          conversa_id: string | null
          created_at: string
          id: string
          operator_name: string | null
          operator_phone: string | null
        }
        Insert: {
          action_result?: string | null
          client_name?: string | null
          client_phone?: string | null
          command: string
          conversa_id?: string | null
          created_at?: string
          id?: string
          operator_name?: string | null
          operator_phone?: string | null
        }
        Update: {
          action_result?: string | null
          client_name?: string | null
          client_phone?: string | null
          command?: string
          conversa_id?: string | null
          created_at?: string
          id?: string
          operator_name?: string | null
          operator_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operator_command_logs_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      operator_feedback: {
        Row: {
          agent_id: string
          client_name: string | null
          client_phone: string | null
          conversa_id: string | null
          correct_response: string | null
          correction_reason: string | null
          created_at: string
          extracted_rule_text: string | null
          feedback_type: string
          id: string
          learned_rule_id: string | null
          operator_id: string | null
          operator_name: string | null
          operator_phone: string | null
          processed_at: string | null
          rule_extraction_status: string | null
          sofia_response: string | null
          trigger_message: string | null
        }
        Insert: {
          agent_id?: string
          client_name?: string | null
          client_phone?: string | null
          conversa_id?: string | null
          correct_response?: string | null
          correction_reason?: string | null
          created_at?: string
          extracted_rule_text?: string | null
          feedback_type: string
          id?: string
          learned_rule_id?: string | null
          operator_id?: string | null
          operator_name?: string | null
          operator_phone?: string | null
          processed_at?: string | null
          rule_extraction_status?: string | null
          sofia_response?: string | null
          trigger_message?: string | null
        }
        Update: {
          agent_id?: string
          client_name?: string | null
          client_phone?: string | null
          conversa_id?: string | null
          correct_response?: string | null
          correction_reason?: string | null
          created_at?: string
          extracted_rule_text?: string | null
          feedback_type?: string
          id?: string
          learned_rule_id?: string | null
          operator_id?: string | null
          operator_name?: string | null
          operator_phone?: string | null
          processed_at?: string | null
          rule_extraction_status?: string | null
          sofia_response?: string | null
          trigger_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operator_feedback_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      orchestrator_phase_logs: {
        Row: {
          action: string | null
          adapter_class: string | null
          agent_id: string
          conversa_id: string | null
          created_at: string | null
          duration_ms: number | null
          ended_at: string | null
          error_message: string | null
          error_type: string | null
          handled: boolean | null
          id: string
          message_id: string | null
          metadata: Json | null
          phase_index: number
          phase_name: string
          response_summary: string | null
          skip_reason: string | null
          skipped: boolean | null
          started_at: string
          status: string
          trace_id: string
        }
        Insert: {
          action?: string | null
          adapter_class?: string | null
          agent_id?: string
          conversa_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          ended_at?: string | null
          error_message?: string | null
          error_type?: string | null
          handled?: boolean | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          phase_index: number
          phase_name: string
          response_summary?: string | null
          skip_reason?: string | null
          skipped?: boolean | null
          started_at: string
          status?: string
          trace_id: string
        }
        Update: {
          action?: string | null
          adapter_class?: string | null
          agent_id?: string
          conversa_id?: string | null
          created_at?: string | null
          duration_ms?: number | null
          ended_at?: string | null
          error_message?: string | null
          error_type?: string | null
          handled?: boolean | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          phase_index?: number
          phase_name?: string
          response_summary?: string | null
          skip_reason?: string | null
          skipped?: boolean | null
          started_at?: string
          status?: string
          trace_id?: string
        }
        Relationships: []
      }
      outbound_call_queue: {
        Row: {
          attempts: number | null
          bitrix_lead_id: string | null
          campaign_id: string | null
          conversa_id: string | null
          created_at: string
          customer_name: string | null
          id: string
          last_attempt_at: string | null
          lead_context: Json | null
          phone: string
          priority: number | null
          retell_call_id: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number | null
          bitrix_lead_id?: string | null
          campaign_id?: string | null
          conversa_id?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          last_attempt_at?: string | null
          lead_context?: Json | null
          phone: string
          priority?: number | null
          retell_call_id?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number | null
          bitrix_lead_id?: string | null
          campaign_id?: string | null
          conversa_id?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          last_attempt_at?: string | null
          lead_context?: Json | null
          phone?: string
          priority?: number | null
          retell_call_id?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_call_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "outbound_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_call_queue_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_call_results: {
        Row: {
          call_duration_seconds: number | null
          created_at: string
          id: string
          intent_detected: string | null
          next_action: string | null
          outcome: string | null
          queue_id: string
          recording_url: string | null
          retell_call_id: string | null
          retell_response: Json | null
          sentiment: string | null
          summary: string | null
          transcript: string | null
        }
        Insert: {
          call_duration_seconds?: number | null
          created_at?: string
          id?: string
          intent_detected?: string | null
          next_action?: string | null
          outcome?: string | null
          queue_id: string
          recording_url?: string | null
          retell_call_id?: string | null
          retell_response?: Json | null
          sentiment?: string | null
          summary?: string | null
          transcript?: string | null
        }
        Update: {
          call_duration_seconds?: number | null
          created_at?: string
          id?: string
          intent_detected?: string | null
          next_action?: string | null
          outcome?: string | null
          queue_id?: string
          recording_url?: string | null
          retell_call_id?: string | null
          retell_response?: Json | null
          sentiment?: string | null
          summary?: string | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbound_call_results_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "outbound_call_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          max_attempts: number | null
          name: string
          retry_delay_hours: number | null
          schedule_config: Json | null
          status: string
          target_criteria: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          max_attempts?: number | null
          name: string
          retry_delay_hours?: number | null
          schedule_config?: Json | null
          status?: string
          target_criteria?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          max_attempts?: number | null
          name?: string
          retry_delay_hours?: number | null
          schedule_config?: Json | null
          status?: string
          target_criteria?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      outbound_message_hashes: {
        Row: {
          agent_id: string
          blocked_count: number
          content_hash: string
          created_at: string
          id: string
          message_preview: string | null
          phone_normalized: string
          sent_at: string
        }
        Insert: {
          agent_id?: string
          blocked_count?: number
          content_hash: string
          created_at?: string
          id?: string
          message_preview?: string | null
          phone_normalized: string
          sent_at?: string
        }
        Update: {
          agent_id?: string
          blocked_count?: number
          content_hash?: string
          created_at?: string
          id?: string
          message_preview?: string | null
          phone_normalized?: string
          sent_at?: string
        }
        Relationships: []
      }
      parametros_macro: {
        Row: {
          ano: number
          cdi: number | null
          created_at: string
          fio_b: number | null
          id: string
          igpm: number | null
          inflacao_energetica: number | null
          ipca: number | null
          updated_at: string
        }
        Insert: {
          ano: number
          cdi?: number | null
          created_at?: string
          fio_b?: number | null
          id?: string
          igpm?: number | null
          inflacao_energetica?: number | null
          ipca?: number | null
          updated_at?: string
        }
        Update: {
          ano?: number
          cdi?: number | null
          created_at?: string
          fio_b?: number | null
          id?: string
          igpm?: number | null
          inflacao_energetica?: number | null
          ipca?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      pattern_change_tracker: {
        Row: {
          change_type: string
          changed_by: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          pattern_id: string | null
        }
        Insert: {
          change_type: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          pattern_id?: string | null
        }
        Update: {
          change_type?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          pattern_id?: string | null
        }
        Relationships: []
      }
      pending_learned_rules: {
        Row: {
          actions: Json | null
          client_message_sample: string | null
          conditions: Json | null
          confidence: number
          created_at: string
          description: string | null
          id: string
          issue_detected: string | null
          learning_type: string
          name: string
          priority: number
          reviewed_at: string | null
          reviewed_by: string | null
          rule_type: string
          sofia_response_sample: string | null
          source_conversation_id: string | null
          source_pair_index: number | null
          status: string
          updated_at: string
        }
        Insert: {
          actions?: Json | null
          client_message_sample?: string | null
          conditions?: Json | null
          confidence?: number
          created_at?: string
          description?: string | null
          id?: string
          issue_detected?: string | null
          learning_type?: string
          name: string
          priority?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_type?: string
          sofia_response_sample?: string | null
          source_conversation_id?: string | null
          source_pair_index?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          actions?: Json | null
          client_message_sample?: string | null
          conditions?: Json | null
          confidence?: number
          created_at?: string
          description?: string | null
          id?: string
          issue_detected?: string | null
          learning_type?: string
          name?: string
          priority?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_type?: string
          sofia_response_sample?: string | null
          source_conversation_id?: string | null
          source_pair_index?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_execution_log: {
        Row: {
          action_duration_ms: number | null
          actions_executed: Json | null
          context_duration_ms: number | null
          context_memory_count: number | null
          context_rules_count: number | null
          conversa_id: string | null
          created_at: string
          error_message: string | null
          facts_saved: number | null
          id: string
          intake_duration_ms: number | null
          intake_result: Json | null
          learning_duration_ms: number | null
          message_id: string | null
          patterns_updated: number | null
          pipeline_version: string
          reasoning_duration_ms: number | null
          reasoning_model: string | null
          reasoning_tokens_in: number | null
          reasoning_tokens_out: number | null
          reasoning_tool_calls: Json | null
          success: boolean
          total_duration_ms: number | null
          validation_blocks: Json | null
          validation_duration_ms: number | null
          validation_passed: boolean | null
        }
        Insert: {
          action_duration_ms?: number | null
          actions_executed?: Json | null
          context_duration_ms?: number | null
          context_memory_count?: number | null
          context_rules_count?: number | null
          conversa_id?: string | null
          created_at?: string
          error_message?: string | null
          facts_saved?: number | null
          id?: string
          intake_duration_ms?: number | null
          intake_result?: Json | null
          learning_duration_ms?: number | null
          message_id?: string | null
          patterns_updated?: number | null
          pipeline_version?: string
          reasoning_duration_ms?: number | null
          reasoning_model?: string | null
          reasoning_tokens_in?: number | null
          reasoning_tokens_out?: number | null
          reasoning_tool_calls?: Json | null
          success?: boolean
          total_duration_ms?: number | null
          validation_blocks?: Json | null
          validation_duration_ms?: number | null
          validation_passed?: boolean | null
        }
        Update: {
          action_duration_ms?: number | null
          actions_executed?: Json | null
          context_duration_ms?: number | null
          context_memory_count?: number | null
          context_rules_count?: number | null
          conversa_id?: string | null
          created_at?: string
          error_message?: string | null
          facts_saved?: number | null
          id?: string
          intake_duration_ms?: number | null
          intake_result?: Json | null
          learning_duration_ms?: number | null
          message_id?: string | null
          patterns_updated?: number | null
          pipeline_version?: string
          reasoning_duration_ms?: number | null
          reasoning_model?: string | null
          reasoning_tokens_in?: number | null
          reasoning_tokens_out?: number | null
          reasoning_tool_calls?: Json | null
          success?: boolean
          total_duration_ms?: number | null
          validation_blocks?: Json | null
          validation_duration_ms?: number | null
          validation_passed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_execution_log_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      planos_comerciais: {
        Row: {
          ativo: boolean | null
          consumo_minimo_kwh: number | null
          consumo_range: string | null
          created_at: string | null
          desconto_percentual: number
          destaque: boolean | null
          features: string[] | null
          fidelidade_anos: number
          id: string
          nome: string
          ordem: number | null
          unlock: boolean | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          consumo_minimo_kwh?: number | null
          consumo_range?: string | null
          created_at?: string | null
          desconto_percentual: number
          destaque?: boolean | null
          features?: string[] | null
          fidelidade_anos: number
          id?: string
          nome: string
          ordem?: number | null
          unlock?: boolean | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          consumo_minimo_kwh?: number | null
          consumo_range?: string | null
          created_at?: string | null
          desconto_percentual?: number
          destaque?: boolean | null
          features?: string[] | null
          fidelidade_anos?: number
          id?: string
          nome?: string
          ordem?: number | null
          unlock?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cargo: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          nome: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cargo?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          nome?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cargo?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          nome?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prompt_modules: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          module_key: string
          module_name: string
          priority: number | null
          template: string
          updated_at: string
          variables: Json | null
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          module_key: string
          module_name: string
          priority?: number | null
          template: string
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          module_key?: string
          module_name?: string
          priority?: number | null
          template?: string
          updated_at?: string
          variables?: Json | null
        }
        Relationships: []
      }
      proposal_generation_queue: {
        Row: {
          bitrix_lead_id: string
          cliente_nome: string | null
          cliente_telefone: string | null
          conversa_id: string | null
          created_at: string | null
          failure_reason: string | null
          id: string
          max_retries: number | null
          request_data: Json | null
          resolved_at: string | null
          retry_at: string
          retry_count: number | null
          status: string | null
        }
        Insert: {
          bitrix_lead_id: string
          cliente_nome?: string | null
          cliente_telefone?: string | null
          conversa_id?: string | null
          created_at?: string | null
          failure_reason?: string | null
          id?: string
          max_retries?: number | null
          request_data?: Json | null
          resolved_at?: string | null
          retry_at?: string
          retry_count?: number | null
          status?: string | null
        }
        Update: {
          bitrix_lead_id?: string
          cliente_nome?: string | null
          cliente_telefone?: string | null
          conversa_id?: string | null
          created_at?: string | null
          failure_reason?: string | null
          id?: string
          max_retries?: number | null
          request_data?: Json | null
          resolved_at?: string | null
          retry_at?: string
          retry_count?: number | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_generation_queue_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          pages: Json
          thumbnail_url: string | null
          type: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          pages?: Json
          thumbnail_url?: string | null
          type: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          pages?: Json
          thumbnail_url?: string | null
          type?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      proposal_views: {
        Row: {
          duration_seconds: number
          fingerprint: string | null
          id: string
          ip_address: string | null
          proposal_id: string
          user_agent: string | null
          viewed_at: string
        }
        Insert: {
          duration_seconds?: number
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          proposal_id: string
          user_agent?: string | null
          viewed_at?: string
        }
        Update: {
          duration_seconds?: number
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          proposal_id?: string
          user_agent?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposal_views_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "propostas_assinantes"
            referencedColumns: ["id"]
          },
        ]
      }
      propostas_assinantes: {
        Row: {
          bitrix24_deal_id: string | null
          bitrix24_last_sync: string | null
          bitrix24_lead_id: string | null
          cip: number | null
          cliente_cep: string | null
          cliente_cidade: string | null
          cliente_cpf_cnpj: string | null
          cliente_email: string | null
          cliente_endereco: string | null
          cliente_nome: string
          cliente_telefone: string | null
          cliente_uf: string | null
          concessionaria: string | null
          consumo_medio: number | null
          created_at: string
          crm_contato_id: string | null
          dados_inferidos: boolean | null
          dados_pj_id: string | null
          definitive_ready_at: string | null
          desconto_concorrente: number | null
          desconto_percentual: number | null
          economia_acumulada: number | null
          economia_adicional_mensal: number | null
          economia_anual: number | null
          economia_mensal: number | null
          fidelidade_anos: number | null
          id: string
          meses_restantes_concorrente: number | null
          multa_rescisoria: number | null
          nome_concorrente: string | null
          numero_instalacao: string | null
          numero_ucs: number | null
          payback_multa_meses: number | null
          pdf_url: string | null
          responsavel_comercial: string | null
          status: string | null
          tarifa: number | null
          tipo_instalacao: string | null
          tipo_proposta: string | null
          tipo_proposta_sub: string | null
          updated_at: string
          user_id: string | null
          valor_conta_original: number | null
        }
        Insert: {
          bitrix24_deal_id?: string | null
          bitrix24_last_sync?: string | null
          bitrix24_lead_id?: string | null
          cip?: number | null
          cliente_cep?: string | null
          cliente_cidade?: string | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_nome: string
          cliente_telefone?: string | null
          cliente_uf?: string | null
          concessionaria?: string | null
          consumo_medio?: number | null
          created_at?: string
          crm_contato_id?: string | null
          dados_inferidos?: boolean | null
          dados_pj_id?: string | null
          definitive_ready_at?: string | null
          desconto_concorrente?: number | null
          desconto_percentual?: number | null
          economia_acumulada?: number | null
          economia_adicional_mensal?: number | null
          economia_anual?: number | null
          economia_mensal?: number | null
          fidelidade_anos?: number | null
          id?: string
          meses_restantes_concorrente?: number | null
          multa_rescisoria?: number | null
          nome_concorrente?: string | null
          numero_instalacao?: string | null
          numero_ucs?: number | null
          payback_multa_meses?: number | null
          pdf_url?: string | null
          responsavel_comercial?: string | null
          status?: string | null
          tarifa?: number | null
          tipo_instalacao?: string | null
          tipo_proposta?: string | null
          tipo_proposta_sub?: string | null
          updated_at?: string
          user_id?: string | null
          valor_conta_original?: number | null
        }
        Update: {
          bitrix24_deal_id?: string | null
          bitrix24_last_sync?: string | null
          bitrix24_lead_id?: string | null
          cip?: number | null
          cliente_cep?: string | null
          cliente_cidade?: string | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_nome?: string
          cliente_telefone?: string | null
          cliente_uf?: string | null
          concessionaria?: string | null
          consumo_medio?: number | null
          created_at?: string
          crm_contato_id?: string | null
          dados_inferidos?: boolean | null
          dados_pj_id?: string | null
          definitive_ready_at?: string | null
          desconto_concorrente?: number | null
          desconto_percentual?: number | null
          economia_acumulada?: number | null
          economia_adicional_mensal?: number | null
          economia_anual?: number | null
          economia_mensal?: number | null
          fidelidade_anos?: number | null
          id?: string
          meses_restantes_concorrente?: number | null
          multa_rescisoria?: number | null
          nome_concorrente?: string | null
          numero_instalacao?: string | null
          numero_ucs?: number | null
          payback_multa_meses?: number | null
          pdf_url?: string | null
          responsavel_comercial?: string | null
          status?: string | null
          tarifa?: number | null
          tipo_instalacao?: string | null
          tipo_proposta?: string | null
          tipo_proposta_sub?: string | null
          updated_at?: string
          user_id?: string | null
          valor_conta_original?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "propostas_assinantes_crm_contato_id_fkey"
            columns: ["crm_contato_id"]
            isOneToOne: false
            referencedRelation: "crm_contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_assinantes_dados_pj_id_fkey"
            columns: ["dados_pj_id"]
            isOneToOne: false
            referencedRelation: "dados_empresa_pj"
            referencedColumns: ["id"]
          },
        ]
      }
      propostas_usineiros: {
        Row: {
          area_hectares: number | null
          arrendamento_mensal: number | null
          capex_por_wp: number | null
          capex_total: number | null
          cidade: string | null
          concessionaria: string | null
          contabilidade_mensal: number | null
          created_at: string
          desconto_cliente_final: number | null
          ebitda_anual: number | null
          financiamento_carencia_meses: number | null
          financiamento_prazo_meses: number | null
          financiamento_taxa: number | null
          financiamento_tipo_taxa: string | null
          financiamento_valor: number | null
          geracao_mensal_mwh: number | null
          id: string
          nome_projeto: string
          om_percentual: number | null
          oversizing: number | null
          payback_anos: number | null
          potencia_mwp: number | null
          quantidade_modulos: number | null
          receita_bruta_anual: number | null
          regime_tributario: string | null
          seguro_anual: number | null
          spe: string | null
          status: string | null
          taxa_administracao: number | null
          tipo_comercializacao: string | null
          tipo_gd: string | null
          tir: number | null
          uf: string | null
          updated_at: string
          user_id: string
          vpl: number | null
        }
        Insert: {
          area_hectares?: number | null
          arrendamento_mensal?: number | null
          capex_por_wp?: number | null
          capex_total?: number | null
          cidade?: string | null
          concessionaria?: string | null
          contabilidade_mensal?: number | null
          created_at?: string
          desconto_cliente_final?: number | null
          ebitda_anual?: number | null
          financiamento_carencia_meses?: number | null
          financiamento_prazo_meses?: number | null
          financiamento_taxa?: number | null
          financiamento_tipo_taxa?: string | null
          financiamento_valor?: number | null
          geracao_mensal_mwh?: number | null
          id?: string
          nome_projeto: string
          om_percentual?: number | null
          oversizing?: number | null
          payback_anos?: number | null
          potencia_mwp?: number | null
          quantidade_modulos?: number | null
          receita_bruta_anual?: number | null
          regime_tributario?: string | null
          seguro_anual?: number | null
          spe?: string | null
          status?: string | null
          taxa_administracao?: number | null
          tipo_comercializacao?: string | null
          tipo_gd?: string | null
          tir?: number | null
          uf?: string | null
          updated_at?: string
          user_id: string
          vpl?: number | null
        }
        Update: {
          area_hectares?: number | null
          arrendamento_mensal?: number | null
          capex_por_wp?: number | null
          capex_total?: number | null
          cidade?: string | null
          concessionaria?: string | null
          contabilidade_mensal?: number | null
          created_at?: string
          desconto_cliente_final?: number | null
          ebitda_anual?: number | null
          financiamento_carencia_meses?: number | null
          financiamento_prazo_meses?: number | null
          financiamento_taxa?: number | null
          financiamento_tipo_taxa?: string | null
          financiamento_valor?: number | null
          geracao_mensal_mwh?: number | null
          id?: string
          nome_projeto?: string
          om_percentual?: number | null
          oversizing?: number | null
          payback_anos?: number | null
          potencia_mwp?: number | null
          quantidade_modulos?: number | null
          receita_bruta_anual?: number | null
          regime_tributario?: string | null
          seguro_anual?: number | null
          spe?: string | null
          status?: string | null
          taxa_administracao?: number | null
          tipo_comercializacao?: string | null
          tipo_gd?: string | null
          tir?: number | null
          uf?: string | null
          updated_at?: string
          user_id?: string
          vpl?: number | null
        }
        Relationships: []
      }
      rag_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          hit_count: number | null
          id: string
          query_hash: string
          results: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at?: string
          hit_count?: number | null
          id?: string
          query_hash: string
          results?: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          hit_count?: number | null
          id?: string
          query_hash?: string
          results?: Json
        }
        Relationships: []
      }
      rag_category_labels: {
        Row: {
          category_key: string
          created_at: string | null
          display_label: string
          id: string
          is_active: boolean | null
          priority: number | null
          updated_at: string | null
        }
        Insert: {
          category_key: string
          created_at?: string | null
          display_label: string
          id?: string
          is_active?: boolean | null
          priority?: number | null
          updated_at?: string | null
        }
        Update: {
          category_key?: string
          created_at?: string | null
          display_label?: string
          id?: string
          is_active?: boolean | null
          priority?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rag_chunks: {
        Row: {
          char_count: number | null
          chunk_index: number
          chunk_type: string | null
          content: string
          created_at: string | null
          document_id: string
          embedding: string | null
          exemplar_reason: string | null
          id: string
          is_active: boolean | null
          is_exemplar: boolean | null
          learning_type: string | null
          metadata: Json | null
          quality_score: number | null
          token_count: number | null
        }
        Insert: {
          char_count?: number | null
          chunk_index: number
          chunk_type?: string | null
          content: string
          created_at?: string | null
          document_id: string
          embedding?: string | null
          exemplar_reason?: string | null
          id?: string
          is_active?: boolean | null
          is_exemplar?: boolean | null
          learning_type?: string | null
          metadata?: Json | null
          quality_score?: number | null
          token_count?: number | null
        }
        Update: {
          char_count?: number | null
          chunk_index?: number
          chunk_type?: string | null
          content?: string
          created_at?: string | null
          document_id?: string
          embedding?: string | null
          exemplar_reason?: string | null
          id?: string
          is_active?: boolean | null
          is_exemplar?: boolean | null
          learning_type?: string | null
          metadata?: Json | null
          quality_score?: number | null
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rag_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "rag_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_conversion_attribution: {
        Row: {
          avg_similarity_session: number | null
          chunks_in_session: Json | null
          conversa_id: string | null
          conversion_type: string
          converted_at: string
          created_at: string
          id: string
          rag_influenced: boolean | null
          top_chunk_categories: string[] | null
          total_rag_queries: number | null
        }
        Insert: {
          avg_similarity_session?: number | null
          chunks_in_session?: Json | null
          conversa_id?: string | null
          conversion_type: string
          converted_at?: string
          created_at?: string
          id?: string
          rag_influenced?: boolean | null
          top_chunk_categories?: string[] | null
          total_rag_queries?: number | null
        }
        Update: {
          avg_similarity_session?: number | null
          chunks_in_session?: Json | null
          conversa_id?: string | null
          conversion_type?: string
          converted_at?: string
          created_at?: string
          id?: string
          rag_influenced?: boolean | null
          top_chunk_categories?: string[] | null
          total_rag_queries?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rag_conversion_attribution_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_documents: {
        Row: {
          category: string
          chunk_count: number | null
          content_hash: string | null
          content_raw: string | null
          created_at: string | null
          created_by: string | null
          external_modified_at: string | null
          file_name: string
          file_type: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          learning_type: string | null
          metadata: Json | null
          processing_error: string | null
          processing_status: string | null
          source_id: string | null
          source_path: string | null
          source_type: string
          subcategory: string | null
          total_tokens: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string
          chunk_count?: number | null
          content_hash?: string | null
          content_raw?: string | null
          created_at?: string | null
          created_by?: string | null
          external_modified_at?: string | null
          file_name: string
          file_type?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          learning_type?: string | null
          metadata?: Json | null
          processing_error?: string | null
          processing_status?: string | null
          source_id?: string | null
          source_path?: string | null
          source_type?: string
          subcategory?: string | null
          total_tokens?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          chunk_count?: number | null
          content_hash?: string | null
          content_raw?: string | null
          created_at?: string | null
          created_by?: string | null
          external_modified_at?: string | null
          file_name?: string
          file_type?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          learning_type?: string | null
          metadata?: Json | null
          processing_error?: string | null
          processing_status?: string | null
          source_id?: string | null
          source_path?: string | null
          source_type?: string
          subcategory?: string | null
          total_tokens?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rag_embedding_cache: {
        Row: {
          created_at: string | null
          embedding: string
          id: string
          last_used_at: string | null
          query_hash: string
          query_text: string
          use_count: number | null
        }
        Insert: {
          created_at?: string | null
          embedding: string
          id?: string
          last_used_at?: string | null
          query_hash: string
          query_text: string
          use_count?: number | null
        }
        Update: {
          created_at?: string | null
          embedding?: string
          id?: string
          last_used_at?: string | null
          query_hash?: string
          query_text?: string
          use_count?: number | null
        }
        Relationships: []
      }
      rag_onedrive_config: {
        Row: {
          client_id: string | null
          created_at: string | null
          drive_id: string | null
          folder_category_mapping: Json | null
          id: string
          is_configured: boolean | null
          last_sync_at: string | null
          next_sync_at: string | null
          root_folder_path: string | null
          sync_enabled: boolean | null
          sync_interval_hours: number | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          drive_id?: string | null
          folder_category_mapping?: Json | null
          id?: string
          is_configured?: boolean | null
          last_sync_at?: string | null
          next_sync_at?: string | null
          root_folder_path?: string | null
          sync_enabled?: boolean | null
          sync_interval_hours?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          drive_id?: string | null
          folder_category_mapping?: Json | null
          id?: string
          is_configured?: boolean | null
          last_sync_at?: string | null
          next_sync_at?: string | null
          root_folder_path?: string | null
          sync_enabled?: boolean | null
          sync_interval_hours?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rag_permissions: {
        Row: {
          access_level: string | null
          agent_id: string
          category: string
          created_at: string | null
          created_by: string | null
          id: string
          priority: number | null
          updated_at: string | null
        }
        Insert: {
          access_level?: string | null
          agent_id: string
          category: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          priority?: number | null
          updated_at?: string | null
        }
        Update: {
          access_level?: string | null
          agent_id?: string
          category?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          priority?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rag_quality_alerts: {
        Row: {
          agent_id: string
          alert_type: string
          created_at: string
          id: string
          is_resolved: boolean | null
          message: string
          metric_value: number | null
          period_days: number | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          threshold_value: number | null
          title: string
        }
        Insert: {
          agent_id: string
          alert_type: string
          created_at?: string
          id?: string
          is_resolved?: boolean | null
          message: string
          metric_value?: number | null
          period_days?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          threshold_value?: number | null
          title: string
        }
        Update: {
          agent_id?: string
          alert_type?: string
          created_at?: string
          id?: string
          is_resolved?: boolean | null
          message?: string
          metric_value?: number | null
          period_days?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          threshold_value?: number | null
          title?: string
        }
        Relationships: []
      }
      rag_search_log: {
        Row: {
          chunks_returned: number | null
          chunks_used: Json | null
          created_at: string | null
          funnel_stage: string | null
          id: string
          phone_id: string | null
          query_text: string
          top_similarity: number | null
        }
        Insert: {
          chunks_returned?: number | null
          chunks_used?: Json | null
          created_at?: string | null
          funnel_stage?: string | null
          id?: string
          phone_id?: string | null
          query_text: string
          top_similarity?: number | null
        }
        Update: {
          chunks_returned?: number | null
          chunks_used?: Json | null
          created_at?: string | null
          funnel_stage?: string | null
          id?: string
          phone_id?: string | null
          query_text?: string
          top_similarity?: number | null
        }
        Relationships: []
      }
      rag_search_logs: {
        Row: {
          agent_id: string
          avg_similarity: number | null
          categories_searched: string[] | null
          created_at: string | null
          execution_time_ms: number | null
          id: string
          query_embedding: string | null
          query_text: string
          results_count: number | null
          top_similarity: number | null
          was_useful: boolean | null
        }
        Insert: {
          agent_id: string
          avg_similarity?: number | null
          categories_searched?: string[] | null
          created_at?: string | null
          execution_time_ms?: number | null
          id?: string
          query_embedding?: string | null
          query_text: string
          results_count?: number | null
          top_similarity?: number | null
          was_useful?: boolean | null
        }
        Update: {
          agent_id?: string
          avg_similarity?: number | null
          categories_searched?: string[] | null
          created_at?: string | null
          execution_time_ms?: number | null
          id?: string
          query_embedding?: string | null
          query_text?: string
          results_count?: number | null
          top_similarity?: number | null
          was_useful?: boolean | null
        }
        Relationships: []
      }
      rag_sync_logs: {
        Row: {
          chunks_created: number | null
          completed_at: string | null
          documents_added: number | null
          documents_failed: number | null
          documents_scanned: number | null
          documents_skipped: number | null
          documents_updated: number | null
          error_details: Json | null
          error_message: string | null
          id: string
          metadata: Json | null
          source_type: string | null
          started_at: string | null
          status: string
          sync_type: string
          total_tokens_processed: number | null
          triggered_by: string | null
        }
        Insert: {
          chunks_created?: number | null
          completed_at?: string | null
          documents_added?: number | null
          documents_failed?: number | null
          documents_scanned?: number | null
          documents_skipped?: number | null
          documents_updated?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          source_type?: string | null
          started_at?: string | null
          status?: string
          sync_type?: string
          total_tokens_processed?: number | null
          triggered_by?: string | null
        }
        Update: {
          chunks_created?: number | null
          completed_at?: string | null
          documents_added?: number | null
          documents_failed?: number | null
          documents_scanned?: number | null
          documents_skipped?: number | null
          documents_updated?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          source_type?: string | null
          started_at?: string | null
          status?: string
          sync_type?: string
          total_tokens_processed?: number | null
          triggered_by?: string | null
        }
        Relationships: []
      }
      rag_sync_queue: {
        Row: {
          attempts: number | null
          category: string | null
          created_at: string | null
          document_id: string | null
          file_name: string
          file_path: string | null
          file_size: number | null
          id: string
          last_error: string | null
          last_modified_at: string | null
          max_attempts: number | null
          mime_type: string | null
          onedrive_item_id: string
          priority: number | null
          processed_at: string | null
          started_at: string | null
          status: string | null
          sync_log_id: string | null
          worker_id: string | null
        }
        Insert: {
          attempts?: number | null
          category?: string | null
          created_at?: string | null
          document_id?: string | null
          file_name: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          last_error?: string | null
          last_modified_at?: string | null
          max_attempts?: number | null
          mime_type?: string | null
          onedrive_item_id: string
          priority?: number | null
          processed_at?: string | null
          started_at?: string | null
          status?: string | null
          sync_log_id?: string | null
          worker_id?: string | null
        }
        Update: {
          attempts?: number | null
          category?: string | null
          created_at?: string | null
          document_id?: string | null
          file_name?: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          last_error?: string | null
          last_modified_at?: string | null
          max_attempts?: number | null
          mime_type?: string | null
          onedrive_item_id?: string
          priority?: number | null
          processed_at?: string | null
          started_at?: string | null
          status?: string | null
          sync_log_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rag_sync_queue_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "rag_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rag_sync_queue_sync_log_id_fkey"
            columns: ["sync_log_id"]
            isOneToOne: false
            referencedRelation: "rag_sync_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_usage_logs: {
        Row: {
          agent_id: string
          avg_similarity: number | null
          categories_accessed: string[] | null
          chunks_used: Json | null
          client_phone: string | null
          conversa_id: string | null
          conversation_id: string | null
          created_at: string
          documents_accessed: string[] | null
          funnel_stage: string | null
          id: string
          mensagem_id: string | null
          query_text: string
          response_time_ms: number | null
          results_count: number
          skip_reason: string | null
          tokens_used: number | null
          top_similarity: number | null
          total_chunks: number | null
          trigger_confidence: string | null
          was_skipped: boolean | null
        }
        Insert: {
          agent_id: string
          avg_similarity?: number | null
          categories_accessed?: string[] | null
          chunks_used?: Json | null
          client_phone?: string | null
          conversa_id?: string | null
          conversation_id?: string | null
          created_at?: string
          documents_accessed?: string[] | null
          funnel_stage?: string | null
          id?: string
          mensagem_id?: string | null
          query_text: string
          response_time_ms?: number | null
          results_count?: number
          skip_reason?: string | null
          tokens_used?: number | null
          top_similarity?: number | null
          total_chunks?: number | null
          trigger_confidence?: string | null
          was_skipped?: boolean | null
        }
        Update: {
          agent_id?: string
          avg_similarity?: number | null
          categories_accessed?: string[] | null
          chunks_used?: Json | null
          client_phone?: string | null
          conversa_id?: string | null
          conversation_id?: string | null
          created_at?: string
          documents_accessed?: string[] | null
          funnel_stage?: string | null
          id?: string
          mensagem_id?: string | null
          query_text?: string
          response_time_ms?: number | null
          results_count?: number
          skip_reason?: string | null
          tokens_used?: number | null
          top_similarity?: number | null
          total_chunks?: number | null
          trigger_confidence?: string | null
          was_skipped?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "rag_usage_logs_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_violations: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          phone: string
          request_count: number
          violation_type: string
        }
        Insert: {
          agent_id?: string
          created_at?: string
          id?: string
          phone: string
          request_count: number
          violation_type: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          phone?: string
          request_count?: number
          violation_type?: string
        }
        Relationships: []
      }
      regression_test_runs: {
        Row: {
          created_at: string
          duration_ms: number
          executed_at: string
          failed: number
          id: string
          passed: number
          results: Json
          total_tests: number
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number
          executed_at?: string
          failed?: number
          id?: string
          passed?: number
          results?: Json
          total_tests?: number
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number
          executed_at?: string
          failed?: number
          id?: string
          passed?: number
          results?: Json
          total_tests?: number
          triggered_by?: string | null
        }
        Relationships: []
      }
      response_evaluations: {
        Row: {
          accuracy_score: number | null
          agent_id: string
          clarity_score: number | null
          client_message: string | null
          client_sentiment: number | null
          conversa_id: string | null
          created_at: string
          evaluation_duration_ms: number | null
          evaluation_reasoning: string | null
          funnel_stage: string | null
          id: string
          issues_detected: Json | null
          message_id: string | null
          model_used: string | null
          overall_score: number | null
          progression_score: number | null
          requires_review: boolean | null
          review_action: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sofia_response: string | null
          suggestions: string | null
          tone_score: number | null
        }
        Insert: {
          accuracy_score?: number | null
          agent_id?: string
          clarity_score?: number | null
          client_message?: string | null
          client_sentiment?: number | null
          conversa_id?: string | null
          created_at?: string
          evaluation_duration_ms?: number | null
          evaluation_reasoning?: string | null
          funnel_stage?: string | null
          id?: string
          issues_detected?: Json | null
          message_id?: string | null
          model_used?: string | null
          overall_score?: number | null
          progression_score?: number | null
          requires_review?: boolean | null
          review_action?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sofia_response?: string | null
          suggestions?: string | null
          tone_score?: number | null
        }
        Update: {
          accuracy_score?: number | null
          agent_id?: string
          clarity_score?: number | null
          client_message?: string | null
          client_sentiment?: number | null
          conversa_id?: string | null
          created_at?: string
          evaluation_duration_ms?: number | null
          evaluation_reasoning?: string | null
          funnel_stage?: string | null
          id?: string
          issues_detected?: Json | null
          message_id?: string | null
          model_used?: string | null
          overall_score?: number | null
          progression_score?: number | null
          requires_review?: boolean | null
          review_action?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sofia_response?: string | null
          suggestions?: string | null
          tone_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "response_evaluations_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_memory: {
        Row: {
          action: Json
          agent_id: string
          condition: Json
          confidence: number | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          last_applied_at: string | null
          learned_from: string | null
          learned_from_feedback_id: string | null
          learning_source: string | null
          name: string
          priority: number
          rule_type: string
          times_applied: number | null
          updated_at: string
        }
        Insert: {
          action?: Json
          agent_id?: string
          condition?: Json
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_applied_at?: string | null
          learned_from?: string | null
          learned_from_feedback_id?: string | null
          learning_source?: string | null
          name: string
          priority?: number
          rule_type: string
          times_applied?: number | null
          updated_at?: string
        }
        Update: {
          action?: Json
          agent_id?: string
          condition?: Json
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          last_applied_at?: string | null
          learned_from?: string | null
          learned_from_feedback_id?: string | null
          learning_source?: string | null
          name?: string
          priority?: number
          rule_type?: string
          times_applied?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_memory_learned_from_feedback_id_fkey"
            columns: ["learned_from_feedback_id"]
            isOneToOne: false
            referencedRelation: "operator_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      sofia_detection_patterns: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          pattern: string
          pattern_type: string
          priority: number | null
          response_template: string | null
          updated_at: string | null
          updated_by: string | null
          updated_by_email: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          pattern: string
          pattern_type?: string
          priority?: number | null
          response_template?: string | null
          updated_at?: string | null
          updated_by?: string | null
          updated_by_email?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          pattern?: string
          pattern_type?: string
          priority?: number | null
          response_template?: string | null
          updated_at?: string | null
          updated_by?: string | null
          updated_by_email?: string | null
        }
        Relationships: []
      }
      sofia_detection_patterns_versions: {
        Row: {
          changelog: string | null
          created_at: string
          created_by: string | null
          created_by_email: string | null
          id: string
          patterns_added: number | null
          patterns_modified: number | null
          patterns_removed: number | null
          snapshot: Json
          total_patterns: number
          version_number: number
        }
        Insert: {
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          patterns_added?: number | null
          patterns_modified?: number | null
          patterns_removed?: number | null
          snapshot: Json
          total_patterns: number
          version_number: number
        }
        Update: {
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          id?: string
          patterns_added?: number | null
          patterns_modified?: number | null
          patterns_removed?: number | null
          snapshot?: Json
          total_patterns?: number
          version_number?: number
        }
        Relationships: []
      }
      sofia_guardrail_events: {
        Row: {
          agent_id: string | null
          applied_rule_id: string | null
          block_type: string | null
          category: string
          cliente_nome: string | null
          cliente_telefone: string | null
          context: Json | null
          conversa_id: string | null
          corrected_message: string | null
          created_at: string | null
          id: string
          original_message: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          applied_rule_id?: string | null
          block_type?: string | null
          category: string
          cliente_nome?: string | null
          cliente_telefone?: string | null
          context?: Json | null
          conversa_id?: string | null
          corrected_message?: string | null
          created_at?: string | null
          id?: string
          original_message?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          applied_rule_id?: string | null
          block_type?: string | null
          category?: string
          cliente_nome?: string | null
          cliente_telefone?: string | null
          context?: Json | null
          conversa_id?: string | null
          corrected_message?: string | null
          created_at?: string | null
          id?: string
          original_message?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sofia_guardrail_events_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      sofia_message_templates: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          priority: number | null
          subcategory: string | null
          template_key: string
          template_text: string
          updated_at: string | null
          variables: string[] | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          subcategory?: string | null
          template_key: string
          template_text: string
          updated_at?: string | null
          variables?: string[] | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          priority?: number | null
          subcategory?: string | null
          template_key?: string
          template_text?: string
          updated_at?: string | null
          variables?: string[] | null
        }
        Relationships: []
      }
      solicitacoes_proposta_definitiva: {
        Row: {
          cliente_cep: string
          cliente_cidade: string | null
          cliente_cpf_cnpj: string
          cliente_email: string | null
          cliente_endereco: string
          cliente_nome: string
          cliente_telefone: string | null
          cliente_uf: string | null
          concessionaria: string | null
          consumo_medio_real: number | null
          conta_luz_url: string
          contrato_social_url: string | null
          created_at: string | null
          dados_retificados: boolean | null
          divergencias_detectadas: Json | null
          documento_identificacao_url: string
          id: string
          nome_retificado: string | null
          numero_instalacao: string
          numero_ucs: number | null
          observacoes: string | null
          proposta_inicial_id: string | null
          status: string | null
          tipo_instalacao: string
          tipo_pessoa: string
          updated_at: string | null
        }
        Insert: {
          cliente_cep: string
          cliente_cidade?: string | null
          cliente_cpf_cnpj: string
          cliente_email?: string | null
          cliente_endereco: string
          cliente_nome: string
          cliente_telefone?: string | null
          cliente_uf?: string | null
          concessionaria?: string | null
          consumo_medio_real?: number | null
          conta_luz_url: string
          contrato_social_url?: string | null
          created_at?: string | null
          dados_retificados?: boolean | null
          divergencias_detectadas?: Json | null
          documento_identificacao_url: string
          id?: string
          nome_retificado?: string | null
          numero_instalacao: string
          numero_ucs?: number | null
          observacoes?: string | null
          proposta_inicial_id?: string | null
          status?: string | null
          tipo_instalacao: string
          tipo_pessoa: string
          updated_at?: string | null
        }
        Update: {
          cliente_cep?: string
          cliente_cidade?: string | null
          cliente_cpf_cnpj?: string
          cliente_email?: string | null
          cliente_endereco?: string
          cliente_nome?: string
          cliente_telefone?: string | null
          cliente_uf?: string | null
          concessionaria?: string | null
          consumo_medio_real?: number | null
          conta_luz_url?: string
          contrato_social_url?: string | null
          created_at?: string | null
          dados_retificados?: boolean | null
          divergencias_detectadas?: Json | null
          documento_identificacao_url?: string
          id?: string
          nome_retificado?: string | null
          numero_instalacao?: string
          numero_ucs?: number | null
          observacoes?: string | null
          proposta_inicial_id?: string | null
          status?: string | null
          tipo_instalacao?: string
          tipo_pessoa?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_proposta_definitiva_proposta_inicial_id_fkey"
            columns: ["proposta_inicial_id"]
            isOneToOne: false
            referencedRelation: "propostas_assinantes"
            referencedColumns: ["id"]
          },
        ]
      }
      unanswered_detection_attempts: {
        Row: {
          agent_id: string
          conversa_id: string
          created_at: string
          detection_delay_seconds: number | null
          id: string
          message_content: string | null
          message_created_at: string | null
          message_id: string | null
          processed_at: string | null
          result: string | null
          result_details: string | null
        }
        Insert: {
          agent_id?: string
          conversa_id: string
          created_at?: string
          detection_delay_seconds?: number | null
          id?: string
          message_content?: string | null
          message_created_at?: string | null
          message_id?: string | null
          processed_at?: string | null
          result?: string | null
          result_details?: string | null
        }
        Update: {
          agent_id?: string
          conversa_id?: string
          created_at?: string
          detection_delay_seconds?: number | null
          id?: string
          message_content?: string | null
          message_created_at?: string | null
          message_id?: string | null
          processed_at?: string | null
          result?: string | null
          result_details?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unanswered_detection_attempts_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      voice_call_logs: {
        Row: {
          call_id: string
          caller_phone: string | null
          confidence_level: string
          conversation_stage: string
          created_at: string
          handoff_required: boolean
          id: string
          intent_detected: string
          metadata: Json | null
          next_action: string
          processing_time_ms: number | null
          reply_text: string
          transcribed_text: string
        }
        Insert: {
          call_id: string
          caller_phone?: string | null
          confidence_level: string
          conversation_stage: string
          created_at?: string
          handoff_required?: boolean
          id?: string
          intent_detected: string
          metadata?: Json | null
          next_action: string
          processing_time_ms?: number | null
          reply_text: string
          transcribed_text: string
        }
        Update: {
          call_id?: string
          caller_phone?: string | null
          confidence_level?: string
          conversation_stage?: string
          created_at?: string
          handoff_required?: boolean
          id?: string
          intent_detected?: string
          metadata?: Json | null
          next_action?: string
          processing_time_ms?: number | null
          reply_text?: string
          transcribed_text?: string
        }
        Relationships: []
      }
      whatsapp_atendentes: {
        Row: {
          created_at: string
          escalacoes_recebidas: number | null
          escalacoes_resolvidas: number | null
          id: string
          is_active: boolean | null
          is_plantao: boolean | null
          last_escalation_at: string | null
          nome: string
          telefone: string
          tempo_medio_resolucao_segundos: number | null
          total_tempo_resolucao_segundos: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          escalacoes_recebidas?: number | null
          escalacoes_resolvidas?: number | null
          id?: string
          is_active?: boolean | null
          is_plantao?: boolean | null
          last_escalation_at?: string | null
          nome: string
          telefone: string
          tempo_medio_resolucao_segundos?: number | null
          total_tempo_resolucao_segundos?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          escalacoes_recebidas?: number | null
          escalacoes_resolvidas?: number | null
          id?: string
          is_active?: boolean | null
          is_plantao?: boolean | null
          last_escalation_at?: string | null
          nome?: string
          telefone?: string
          tempo_medio_resolucao_segundos?: number | null
          total_tempo_resolucao_segundos?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_blacklist: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          motivo: string
          telefone: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          motivo: string
          telefone: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          motivo?: string
          telefone?: string
        }
        Relationships: []
      }
      whatsapp_daily_volume: {
        Row: {
          created_at: string
          data: string
          id: string
          limite_do_dia: number
          mensagens_enviadas: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: string
          id?: string
          limite_do_dia?: number
          mensagens_enviadas?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          limite_do_dia?: number
          mensagens_enviadas?: number
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_lid_phone_mapping: {
        Row: {
          agent_id: string
          chat_lid: string
          created_at: string
          id: string
          last_seen_at: string
          phone_normalized: string
        }
        Insert: {
          agent_id?: string
          chat_lid: string
          created_at?: string
          id?: string
          last_seen_at?: string
          phone_normalized: string
        }
        Update: {
          agent_id?: string
          chat_lid?: string
          created_at?: string
          id?: string
          last_seen_at?: string
          phone_normalized?: string
        }
        Relationships: []
      }
      whatsapp_test_phones: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_webhook_events: {
        Row: {
          body_parsed: Json | null
          body_raw: string | null
          chat_id: string | null
          content_type: string | null
          error_message: string | null
          event_type: string | null
          id: string
          message_preview: string | null
          parsed_ok: boolean | null
          phone: string | null
          processing_status: string | null
          provider: string
          received_at: string
          request_method: string | null
        }
        Insert: {
          body_parsed?: Json | null
          body_raw?: string | null
          chat_id?: string | null
          content_type?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          message_preview?: string | null
          parsed_ok?: boolean | null
          phone?: string | null
          processing_status?: string | null
          provider?: string
          received_at?: string
          request_method?: string | null
        }
        Update: {
          body_parsed?: Json | null
          body_raw?: string | null
          chat_id?: string | null
          content_type?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          message_preview?: string | null
          parsed_ok?: boolean | null
          phone?: string | null
          processing_status?: string | null
          provider?: string
          received_at?: string
          request_method?: string | null
        }
        Relationships: []
      }
      working_memory: {
        Row: {
          confidence: number | null
          conversa_id: string | null
          created_at: string
          id: string
          key: string
          memory_type: string
          source: string
          turn_number: number | null
          updated_at: string
          valid_until: string | null
          value: Json
        }
        Insert: {
          confidence?: number | null
          conversa_id?: string | null
          created_at?: string
          id?: string
          key: string
          memory_type: string
          source: string
          turn_number?: number | null
          updated_at?: string
          valid_until?: string | null
          value: Json
        }
        Update: {
          confidence?: number | null
          conversa_id?: string | null
          created_at?: string
          id?: string
          key?: string
          memory_type?: string
          source?: string
          turn_number?: number | null
          updated_at?: string
          valid_until?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "working_memory_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "chatbot_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_funnel_by_source: {
        Row: {
          com_proposta: number | null
          convertidos: number | null
          fonte: string | null
          taxa_conversao: number | null
          total_leads: number | null
        }
        Relationships: []
      }
      v_funnel_conversion_rates: {
        Row: {
          com_proposta: number | null
          com_proposta_inicial: number | null
          contrato_assinado: number | null
          contrato_enviado: number | null
          docs_completos: number | null
          taxa_contrato_to_assinado: number | null
          taxa_conversao_total: number | null
          taxa_docs_to_contrato: number | null
          taxa_lead_to_proposta: number | null
          taxa_proposta_to_docs: number | null
          total_leads: number | null
        }
        Relationships: []
      }
      v_funnel_daily: {
        Row: {
          assinaturas_mesmo_dia: number | null
          data: string | null
          leads_perdidos: number | null
          novos_leads: number | null
          propostas_mesmo_dia: number | null
        }
        Relationships: []
      }
      v_funnel_dropoff: {
        Row: {
          avg_dias_no_stage: number | null
          dropoff_stage: string | null
          percentual: number | null
          quantidade: number | null
        }
        Relationships: []
      }
      v_funnel_stage_counts: {
        Row: {
          contrato_assinado: number | null
          contrato_enviado: number | null
          docs_completos: number | null
          link_enviado: number | null
          proposta_criada: number | null
          total_leads: number | null
        }
        Relationships: []
      }
      v_funnel_stage_duration: {
        Row: {
          avg_hours: number | null
          count: number | null
          stage: string | null
        }
        Relationships: []
      }
      v_funnel_weekly_comparison: {
        Row: {
          conversoes: number | null
          leads: number | null
          period: string | null
          propostas: number | null
        }
        Relationships: []
      }
      v_llm_daily_costs: {
        Row: {
          agent_id: string | null
          avg_cost_per_call: number | null
          calls: number | null
          date: string | null
          model: string | null
          total_cost_usd: number | null
          total_input_tokens: number | null
          total_output_tokens: number | null
        }
        Relationships: []
      }
      v_llm_monthly_costs: {
        Row: {
          agent_id: string | null
          avg_cost_per_call: number | null
          calls: number | null
          model: string | null
          month: string | null
          total_cost_usd: number | null
        }
        Relationships: []
      }
      v_orchestrator_trace: {
        Row: {
          adapter_class: string | null
          agent_id: string | null
          conversa_id: string | null
          ended_at: string | null
          has_errors: boolean | null
          phase_count: number | null
          phases: Json | null
          started_at: string | null
          total_duration_ms: number | null
          trace_id: string | null
        }
        Relationships: []
      }
      v_phase_bottlenecks_by_agent: {
        Row: {
          adapter_class: string | null
          agent_id: string | null
          avg_ms: number | null
          error_count: number | null
          handle_rate_pct: number | null
          max_ms: number | null
          p95_ms: number | null
          phase_name: string | null
          slow_count: number | null
          total_executions: number | null
        }
        Relationships: []
      }
      v_phase_performance_hourly: {
        Row: {
          agent_id: string | null
          avg_duration_ms: number | null
          executions: number | null
          failed_count: number | null
          handled_count: number | null
          hour: string | null
          max_duration_ms: number | null
          min_duration_ms: number | null
          p95_duration_ms: number | null
          p99_duration_ms: number | null
          phase_name: string | null
          skipped_count: number | null
        }
        Relationships: []
      }
      v_slow_phases: {
        Row: {
          agent_id: string | null
          conversa_id: string | null
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          error_type: string | null
          metadata: Json | null
          phase_name: string | null
          status: string | null
          trace_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_cross_webhook_lock: {
        Args: {
          p_lead_id: string
          p_lock_duration_seconds?: number
          p_locked_by: string
          p_phone: string
          p_purpose?: string
        }
        Returns: {
          acquired: boolean
          existing_lock_by: string
          existing_lock_purpose: string
          lock_id: string
        }[]
      }
      acquire_phone_lock: {
        Args: {
          p_agent_id: string
          p_instance_id: string
          p_lock_duration_seconds?: number
          p_phone: string
        }
        Returns: boolean
      }
      add_to_message_buffer: {
        Args: {
          p_agent_id: string
          p_message_id: string
          p_message_text: string
          p_phone: string
          p_timestamp?: string
        }
        Returns: {
          buffer_id: string
          is_new_session: boolean
          message_count: number
          session_started_at: string
        }[]
      }
      attribute_rag_conversion: {
        Args: { p_conversa_id: string; p_conversion_type: string }
        Returns: undefined
      }
      check_buffer_ready: {
        Args: {
          p_agent_id: string
          p_phone: string
          p_silence_window_ms?: number
        }
        Returns: {
          buffer_id: string
          is_ready: boolean
          message_count: number
          messages: Json
          ms_since_last_message: number
          session_started_at: string
        }[]
      }
      check_rag_quality_alerts: {
        Args: never
        Returns: {
          agents_checked: number
          alerts_created: number
        }[]
      }
      claim_conversation_for_processing: {
        Args: { p_conversa_id: string; p_new_timestamp: string }
        Returns: {
          conversation_created_at: string
          previous_last_message_at: string
          previous_last_sofia_message_at: string
        }[]
      }
      claim_email_processing_if_no_proposal: {
        Args: { p_conversa_id: string; p_message_id: string }
        Returns: {
          blocked_reason: string
          proposal_already_sent: boolean
          proposal_link: string
          proposta_id: string
          should_process: boolean
        }[]
      }
      claim_message_buffer: {
        Args: { p_agent_id: string; p_phone: string }
        Returns: {
          buffer_id: string
          claimed: boolean
          message_count: number
          messages: Json
        }[]
      }
      claim_rag_sync_batch: {
        Args: { p_batch_size?: number }
        Returns: {
          attempts: number | null
          category: string | null
          created_at: string | null
          document_id: string | null
          file_name: string
          file_path: string | null
          file_size: number | null
          id: string
          last_error: string | null
          last_modified_at: string | null
          max_attempts: number | null
          mime_type: string | null
          onedrive_item_id: string
          priority: number | null
          processed_at: string | null
          started_at: string | null
          status: string | null
          sync_log_id: string | null
          worker_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "rag_sync_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_rag_sync_batch_for_worker: {
        Args: { p_batch_size?: number; p_worker_id: string }
        Returns: {
          attempts: number | null
          category: string | null
          created_at: string | null
          document_id: string | null
          file_name: string
          file_path: string | null
          file_size: number | null
          id: string
          last_error: string | null
          last_modified_at: string | null
          max_attempts: number | null
          mime_type: string | null
          onedrive_item_id: string
          priority: number | null
          processed_at: string | null
          started_at: string | null
          status: string | null
          sync_log_id: string | null
          worker_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "rag_sync_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_expired_rag_cache: { Args: never; Returns: undefined }
      cleanup_old_embedding_cache: { Args: never; Returns: number }
      cleanup_old_infra_metrics: { Args: never; Returns: number }
      cleanup_old_logs: { Args: never; Returns: number }
      cleanup_old_observability_snapshots: {
        Args: { retention_days?: number }
        Returns: number
      }
      cleanup_old_orchestrator_phase_logs: { Args: never; Returns: number }
      cleanup_old_outbound_hashes: { Args: never; Returns: number }
      cleanup_old_rate_limit_violations: { Args: never; Returns: number }
      cleanup_old_sync_locks: { Args: never; Returns: undefined }
      cleanup_stale_message_buffers: { Args: never; Returns: number }
      cleanup_stale_rag_processing: { Args: never; Returns: number }
      clear_message_buffer: {
        Args: { p_agent_id: string; p_phone: string }
        Returns: boolean
      }
      count_unique_fingerprints: {
        Args: { p_proposal_id: string }
        Returns: number
      }
      extend_cross_webhook_lock: {
        Args: {
          p_additional_seconds?: number
          p_locked_by: string
          p_phone: string
        }
        Returns: boolean
      }
      extend_phone_lock: {
        Args: {
          p_additional_seconds?: number
          p_instance_id: string
          p_phone: string
        }
        Returns: boolean
      }
      find_distribuidora: {
        Args: { p_input: string }
        Returns: {
          clarification_message: string
          id: string
          is_atendida: boolean
          matched_via: string
          nome: string
          nome_normalizado: string
          parent_id: string
          rejection_message: string
          requires_clarification: boolean
          uf: string
        }[]
      }
      get_active_rag_workers: {
        Args: never
        Returns: {
          items_processing: number
          last_activity: string
          worker_id: string
        }[]
      }
      get_learning_exemplars: {
        Args: { p_learning_type: string; p_limit?: number }
        Returns: {
          category: string
          content: string
          exemplar_reason: string
          file_name: string
          id: string
          learning_type: string
          quality_score: number
          subcategory: string
        }[]
      }
      get_rag_agent_metrics: {
        Args: { p_agent_id: string; p_days?: number }
        Returns: {
          avg_response_time_ms: number
          avg_results_count: number
          avg_similarity: number
          queries_by_day: Json
          queries_with_results: number
          top_categories: Json
          top_documents: Json
          total_queries: number
          total_tokens_used: number
        }[]
      }
      get_rag_impact_analytics: {
        Args: { p_agent_id?: string; p_days?: number }
        Returns: {
          avg_chunks_used: number
          avg_top_similarity: number
          conversions_with_rag: number
          conversions_without_rag: number
          hit_rate: number
          period: string
          queries_no_results: number
          queries_with_results: number
          rag_conversion_rate: number
          top_categories: Json
          total_queries: number
        }[]
      }
      get_rag_stats: {
        Args: never
        Returns: {
          avg_chunks_per_doc: number
          documents_by_category: Json
          documents_by_status: Json
          last_sync_at: string
          total_chunks: number
          total_documents: number
          total_tokens: number
        }[]
      }
      get_rag_sync_queue_stats: {
        Args: { p_sync_log_id?: string }
        Returns: {
          avg_process_time_ms: number
          completed: number
          estimated_remaining_minutes: number
          failed: number
          pending: number
          processing: number
          skipped: number
          total: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      log_activity: {
        Args: {
          p_action: string
          p_details?: Json
          p_entity_id?: string
          p_entity_name?: string
          p_entity_type: string
        }
        Returns: string
      }
      mark_proposal_sent_atomic: {
        Args: { p_conversa_id: string; p_proposta_id?: string }
        Returns: boolean
      }
      match_rag_chunks: {
        Args: {
          filter_agent?: string
          filter_categories?: string[]
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          category: string
          chunk_index: number
          content: string
          document_id: string
          exemplar_reason: string
          file_name: string
          id: string
          is_exemplar: boolean
          learning_type: string
          metadata: Json
          similarity: number
          source_path: string
          subcategory: string
        }[]
      }
      match_rag_chunks_v2: {
        Args: {
          filter_chunk_types?: string[]
          filter_funnel_stage?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          chunk_type: string
          content: string
          document_category: string
          document_name: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      normalize_br_phone: { Args: { phone: string }; Returns: string }
      notify_admins: {
        Args: {
          p_entity_id?: string
          p_entity_type?: string
          p_message: string
          p_title: string
          p_type?: string
        }
        Returns: undefined
      }
      release_cross_webhook_lock: {
        Args: { p_locked_by: string; p_phone: string }
        Returns: boolean
      }
      release_phone_lock: {
        Args: { p_instance_id: string; p_phone: string }
        Returns: boolean
      }
      sum_proposal_view_duration: {
        Args: { p_proposal_id: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "funcionario"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "funcionario"],
    },
  },
} as const
