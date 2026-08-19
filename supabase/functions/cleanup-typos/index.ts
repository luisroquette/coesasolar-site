import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface CleanupStats {
  oldPendingDeleted: number;
  rejectedDeleted: number;
  lowQualityDeleted: number;
  totalDeleted: number;
  lowQualityPatterns: string[];
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    console.log('[CLEANUP-TYPOS] Starting manual cleanup...');
    
    const stats: CleanupStats = {
      oldPendingDeleted: 0,
      rejectedDeleted: 0,
      lowQualityDeleted: 0,
      totalDeleted: 0,
      lowQualityPatterns: [],
    };
    
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // 1. Delete typos older than 30 days that were never confirmed/rejected (null status)
    const { data: oldPending, error: errorOldPending } = await supabase
      .from('distribuidora_typos_log')
      .delete()
      .is('confirmado', null)
      .lt('created_at', thirtyDaysAgo.toISOString())
      .select('id');
    
    if (errorOldPending) {
      console.error('[CLEANUP-TYPOS] Error deleting old pending typos:', errorOldPending);
    } else {
      stats.oldPendingDeleted = oldPending?.length || 0;
      console.log(`[CLEANUP-TYPOS] Deleted ${stats.oldPendingDeleted} old pending typos (>30 days)`);
    }
    
    // 2. Delete rejected typos (confirmado = false) older than 7 days
    const { data: rejected, error: errorRejected } = await supabase
      .from('distribuidora_typos_log')
      .delete()
      .eq('confirmado', false)
      .lt('created_at', sevenDaysAgo.toISOString())
      .select('id');
    
    if (errorRejected) {
      console.error('[CLEANUP-TYPOS] Error deleting old rejected typos:', errorRejected);
    } else {
      stats.rejectedDeleted = rejected?.length || 0;
      console.log(`[CLEANUP-TYPOS] Deleted ${stats.rejectedDeleted} old rejected typos (>7 days)`);
    }
    
    // 3. Analyze and clean up typos with very low confirmation rate
    const { data: typoStats, error: statsError } = await supabase
      .from('distribuidora_typos_log')
      .select('typo_detectado, sugestao, confirmado, created_at')
      .lt('created_at', sevenDaysAgo.toISOString());
    
    if (statsError) {
      console.error('[CLEANUP-TYPOS] Error fetching typo stats:', statsError);
    } else if (typoStats && typoStats.length > 0) {
      // Group by typo+sugestao and calculate confirmation rate
      const aggregated: Record<string, { confirmed: number; rejected: number; pending: number }> = {};
      
      for (const t of typoStats) {
        const key = `${t.typo_detectado?.toLowerCase()?.trim()}|${t.sugestao?.toLowerCase()?.trim()}`;
        if (!aggregated[key]) {
          aggregated[key] = { confirmed: 0, rejected: 0, pending: 0 };
        }
        
        if (t.confirmado === true) aggregated[key].confirmed++;
        else if (t.confirmado === false) aggregated[key].rejected++;
        else aggregated[key].pending++;
      }
      
      // Delete typos with low confirmation rate (>3 total occurrences, <20% confirmation rate)
      for (const [key, s] of Object.entries(aggregated)) {
        const total = s.confirmed + s.rejected + s.pending;
        const confirmationRate = total > 0 ? s.confirmed / total : 0;
        
        if (total >= 3 && confirmationRate < 0.2) {
          const [typo, sugestao] = key.split('|');
          stats.lowQualityPatterns.push(`"${typo}" -> "${sugestao}" (${(confirmationRate * 100).toFixed(0)}%)`);
          
          const { data: deleted } = await supabase
            .from('distribuidora_typos_log')
            .delete()
            .ilike('typo_detectado', typo)
            .ilike('sugestao', sugestao)
            .select('id');
          
          stats.lowQualityDeleted += deleted?.length || 0;
        }
      }
      
      console.log(`[CLEANUP-TYPOS] Deleted ${stats.lowQualityDeleted} low-quality typos`);
    }
    
    stats.totalDeleted = stats.oldPendingDeleted + stats.rejectedDeleted + stats.lowQualityDeleted;
    
    console.log('[CLEANUP-TYPOS] Cleanup completed:', stats);
    
    return new Response(JSON.stringify({
      success: true,
      stats,
      message: `Limpeza concluída: ${stats.totalDeleted} registros removidos`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error: unknown) {
    console.error('[CLEANUP-TYPOS] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao executar limpeza';
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
