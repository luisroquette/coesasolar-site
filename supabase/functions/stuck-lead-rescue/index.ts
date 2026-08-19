/**
 * STUCK LEAD RESCUE
 * 
 * Manual rescue endpoint for leads that got stuck in the wrong column
 * or didn't get their proposal generated.
 * 
 * Phase "Caso Edson" - Creates deterministic rescue for stuck leads
 * 
 * Usage:
 * POST /stuck-lead-rescue
 * Body: { conversaId?: string, phone?: string }
 * 
 * What it does:
 * 1. Reads conversa + dados_coletados
 * 2. If minimum data complete and stage != PROPOSTA_INICIAL: forces stage
 * 3. If minimum data complete and no proposta_id: forces generation
 * 4. Registers admin_notification with result
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/webhook-types.ts';
import { hasMinimumDataForProposal } from '../_shared/funnel-stage.ts';
import { syncToBitrix } from '../_shared/bitrix-sync.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface RescueRequest {
  conversaId?: string;
  phone?: string;
  dryRun?: boolean; // If true, just report what would be done
}

interface RescueResult {
  success: boolean;
  conversaId: string | null;
  actions: string[];
  errors: string[];
  data?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  // Only POST allowed
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    const body: RescueRequest = await req.json();
    const { conversaId, phone, dryRun = false } = body;
    
    if (!conversaId && !phone) {
      return new Response(JSON.stringify({ error: 'Either conversaId or phone is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const result: RescueResult = {
      success: false,
      conversaId: conversaId || null,
      actions: [],
      errors: [],
    };
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Find the conversation
    // ═══════════════════════════════════════════════════════════════
    let conversa: any = null;
    
    if (conversaId) {
      const { data, error } = await supabase
        .from('chatbot_conversas')
        .select('*')
        .eq('id', conversaId)
        .single();
      
      if (error || !data) {
        return new Response(JSON.stringify({ error: `Conversation not found: ${conversaId}` }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      conversa = data;
    } else if (phone) {
      // Normalize phone
      const normalizedPhone = phone.replace(/\D/g, '');
      const { data, error } = await supabase
        .from('chatbot_conversas')
        .select('*')
        .eq('cliente_telefone', normalizedPhone)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error || !data) {
        return new Response(JSON.stringify({ error: `Conversation not found for phone: ${phone}` }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      conversa = data;
    }
    
    result.conversaId = conversa.id;
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Check if minimum data is complete
    // ═══════════════════════════════════════════════════════════════
    const dadosColetados = conversa.dados_coletados || {};
    const clienteNome = conversa.cliente_nome || dadosColetados.nome || 'Cliente';
    const hasMinimum = hasMinimumDataForProposal(dadosColetados, clienteNome);
    
    result.data = {
      nome: dadosColetados.nome || clienteNome,
      email: dadosColetados.email || conversa.cliente_email,
      distribuidora: dadosColetados.distribuidora,
      valorFatura: dadosColetados.valorFatura || dadosColetados.consumo,
      bitrix24Stage: conversa.bitrix24_stage,
      propostaId: conversa.proposta_id,
      propostaLinkSentAt: conversa.proposta_link_sent_at,
      sofiaMode: conversa.sofia_mode,
      hasMinimum,
    };
    
    if (!hasMinimum) {
      result.actions.push('SKIP: Minimum data not complete');
      result.errors.push(`Missing data. Has: nome=${!!clienteNome}, email=${!!dadosColetados.email}, dist=${!!dadosColetados.distribuidora}, valor=${!!(dadosColetados.valorFatura || dadosColetados.consumo)}`);
      
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    result.actions.push('CHECK: Minimum data is COMPLETE');
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Check and fix Bitrix stage
    // ═══════════════════════════════════════════════════════════════
    const targetStage = 'UC_9SLRPP'; // PROPOSTA_INICIAL
    const currentStage = conversa.bitrix24_stage;
    const isDescartado = conversa.sofia_mode === 'descartado' || currentStage === 'JUNK';
    
    if (isDescartado) {
      result.actions.push('SKIP: Lead is marked as descartado/JUNK');
    } else if (currentStage !== targetStage) {
      result.actions.push(`FIX_STAGE: ${currentStage || 'null'} → ${targetStage}`);
      
      if (!dryRun) {
        // Force sync to Bitrix with stage movement
        try {
          const syncResult = await syncToBitrix(
            supabase,
            conversa.id,
            conversa.cliente_telefone,
            clienteNome,
            dadosColetados,
            undefined,
            true // forcarMovimentacao
          );
          
          if (syncResult.success) {
            result.actions.push(`STAGE_SYNCED: ${syncResult.newStage}`);
          } else {
            result.errors.push(`Sync failed: ${syncResult.error}`);
          }
        } catch (syncErr) {
          result.errors.push(`Sync exception: ${syncErr instanceof Error ? syncErr.message : String(syncErr)}`);
        }
      }
    } else {
      result.actions.push('OK: Stage already at PROPOSTA_INICIAL');
    }
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Check and trigger proposal generation
    // ═══════════════════════════════════════════════════════════════
    const hasPropostaId = !!conversa.proposta_id;
    const hasSentLink = !!conversa.proposta_link_sent_at;
    
    if (hasPropostaId && hasSentLink) {
      result.actions.push('OK: Proposal already sent');
    } else if (hasPropostaId && !hasSentLink) {
      result.actions.push('PENDING: Proposal exists but link not sent yet');
      
      if (!dryRun) {
        // Set pending_task to trigger link send
        await supabase
          .from('chatbot_conversas')
          .update({
            pending_task: 'proposta_inicial',
            pending_task_created_at: new Date().toISOString(),
            pending_task_retries: 0,
          })
          .eq('id', conversa.id);
        
        result.actions.push('SET: pending_task=proposta_inicial');
      }
    } else {
      result.actions.push('MISSING: No proposal ID - will trigger generation');
      
      if (!dryRun) {
        // Force sync which should trigger proposal creation
        try {
          const syncResult = await syncToBitrix(
            supabase,
            conversa.id,
            conversa.cliente_telefone,
            clienteNome,
            dadosColetados,
            undefined,
            true
          );
          
          if (syncResult.success) {
            result.actions.push('SYNC_TRIGGERED: Proposal generation initiated');
          } else {
            result.errors.push(`Proposal sync failed: ${syncResult.error}`);
          }
        } catch (syncErr) {
          result.errors.push(`Proposal sync exception: ${syncErr instanceof Error ? syncErr.message : String(syncErr)}`);
        }
        
        // Also set pending_task as backup
        await supabase
          .from('chatbot_conversas')
          .update({
            pending_task: 'proposta_inicial',
            pending_task_created_at: new Date().toISOString(),
            pending_task_retries: 0,
          })
          .eq('id', conversa.id);
        
        result.actions.push('SET: pending_task=proposta_inicial (backup)');
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Create admin notification
    // ═══════════════════════════════════════════════════════════════
    if (!dryRun) {
      await supabase.from('admin_notifications').insert({
        title: '🔧 Stuck Lead Rescue',
        message: `Lead "${clienteNome}" foi resgatado manualmente. Ações: ${result.actions.join('; ')}. Erros: ${result.errors.length > 0 ? result.errors.join('; ') : 'nenhum'}`,
        type: 'proposal_rescue',
        entity_type: 'chatbot_conversa',
        entity_id: conversa.id,
      });
      
      result.actions.push('NOTIFIED: Admin notification created');
    }
    
    result.success = result.errors.length === 0;
    
    console.log(`[STUCK_LEAD_RESCUE] ${dryRun ? '(DRY RUN) ' : ''}Completed for ${conversa.id}: ${result.actions.join(', ')}`);
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (err) {
    console.error('[STUCK_LEAD_RESCUE] Error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
