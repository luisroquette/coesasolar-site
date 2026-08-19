import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { getStrictCorsHeaders, handleCorsPrelight, errorResponse } from '../_shared/security-helpers.ts';
import { validateTTS, parseAndValidate } from '../_shared/zod-schemas.ts';

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    // Validate and parse request body
    const parseResult = await parseAndValidate(req, validateTTS);
    if (!parseResult.success) {
      console.warn('[TTS] Validation failed:', parseResult.error);
      return errorResponse(parseResult.error, parseResult.status, req);
    }

    const { text, voiceId } = parseResult.data;
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');

    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    // Use provided voiceId or default Sofia voice
    // Default to a friendly female voice if not specified
    const voice = voiceId || Deno.env.get('SOFIA_VOICE_ID') || 'EXAVITQu4vr4xnSDxMaL'; // Sarah - friendly female voice

    console.log(`[TTS] Generating audio for text (${text.length} chars) with voice ${voice}`);

    // Use OGG/Opus format for WhatsApp PTT compatibility
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=ogg_opus`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TTS] ElevenLabs API error:', response.status, errorText);
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = base64Encode(audioBuffer);

    console.log(`[TTS] Generated audio: ${audioBuffer.byteLength} bytes`);

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        format: 'ogg',
        mimeType: 'audio/ogg',
        size: audioBuffer.byteLength 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    console.error('[TTS] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
