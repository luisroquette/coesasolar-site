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

    expect(source).toContain('COESA_PROPOSTAS_OPENROUTER_API_KEY');
    expect(source).not.toContain("? 'OPENROUTER_API_KEY'");
  });
});
