import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('LLM custom provider routing', () => {
  it('routes OpenAI and DeepSeek templates through OpenRouter only', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/ai-gym/LLMModelSelector.tsx'),
      'utf8',
    );

    expect(source).not.toContain('https://api.openai.com/v1');
    expect(source).not.toContain('https://api.deepseek.com/v1');
    expect(source.match(/https:\/\/openrouter\.ai\/api\/v1/g)).toHaveLength(2);
  });

  it('requests only the dedicated project key', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/screens/AgentSettings.tsx'),
      'utf8',
    );

    expect(source).toContain('COESASOLAR_OPENROUTER_API_KEY');
    expect(source).not.toContain("? 'OPENROUTER_API_KEY'");
  });

  it('uses only live OpenRouter replacements for retired Gemini and OpenAI TTS models', () => {
    const correctionSource = fs.readFileSync(
      path.join(process.cwd(), 'supabase/functions/generate-error-correction/index.ts'),
      'utf8',
    );
    const ttsSource = fs.readFileSync(
      path.join(process.cwd(), 'supabase/functions/_shared/tts-client.ts'),
      'utf8',
    );

    expect(correctionSource).toContain('google/gemini-2.5-flash');
    expect(correctionSource).not.toContain('google/gemini-2.0-flash');
    expect(ttsSource).toContain("openaiModel: 'x-ai/grok-voice-tts-1.0'");
    expect(ttsSource).toContain("openaiVoice: 'eve'");
    expect(ttsSource).not.toContain("openaiModel: 'tts-1'");
  });
});
