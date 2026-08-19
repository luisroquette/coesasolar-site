import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

// Fallback - sobrescrito pelo banco
const FALLBACK_MAX_AGE_HOURS = 24;

async function loadMaxAgeHours(supabase: any): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'cleanup_audio_max_age_hours')
      .single();
    
    if (error || !data) return FALLBACK_MAX_AGE_HOURS;
    return parseInt(data.valor) || FALLBACK_MAX_AGE_HOURS;
  } catch {
    return FALLBACK_MAX_AGE_HOURS;
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    console.log('🧹 Starting sofia-audio cleanup...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Load max age from database
    const MAX_AGE_HOURS = await loadMaxAgeHours(supabase);
    console.log(`📅 Using max age: ${MAX_AGE_HOURS} hours`);

    // List all files in the bucket
    const { data: files, error: listError } = await supabase.storage
      .from('sofia-audio')
      .list('', { limit: 1000 });

    if (listError) {
      console.error('❌ Error listing files:', listError);
      throw listError;
    }

    if (!files || files.length === 0) {
      console.log('✅ No files to clean up');
      return new Response(
        JSON.stringify({ success: true, deleted: 0, message: 'No files to clean up' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📁 Found ${files.length} files in sofia-audio bucket`);

    const now = new Date();
    const maxAgeMs = MAX_AGE_HOURS * 60 * 60 * 1000;
    const filesToDelete: string[] = [];

    for (const file of files) {
      // Skip folders
      if (!file.name || file.id === null) continue;

      const createdAt = new Date(file.created_at);
      const ageMs = now.getTime() - createdAt.getTime();

      if (ageMs > maxAgeMs) {
        filesToDelete.push(file.name);
        console.log(`🗑️ Marking for deletion: ${file.name} (age: ${Math.round(ageMs / 1000 / 60)} minutes)`);
      }
    }

    if (filesToDelete.length === 0) {
      console.log('✅ No old files to delete');
      return new Response(
        JSON.stringify({ 
          success: true, 
          deleted: 0, 
          total: files.length,
          message: 'No files older than 24 hours' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🗑️ Deleting ${filesToDelete.length} old files...`);

    const { data: deleteData, error: deleteError } = await supabase.storage
      .from('sofia-audio')
      .remove(filesToDelete);

    if (deleteError) {
      console.error('❌ Error deleting files:', deleteError);
      throw deleteError;
    }

    console.log(`✅ Successfully deleted ${filesToDelete.length} files`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        deleted: filesToDelete.length,
        total: files.length,
        remaining: files.length - filesToDelete.length,
        deletedFiles: filesToDelete
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Cleanup error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
