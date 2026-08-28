export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

const MODEL = 'deepseek/deepseek-v4-flash-0731';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.COESASOLAR_OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'OpenRouter key not configured' }, { status: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://coesasolar.com.br',
        'X-Title': 'CoesaSolar OpenRouter Health',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'Reply OK' }],
        max_tokens: 1,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: 'OpenRouter request failed', providerStatus: response.status },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, model: MODEL });
  } catch {
    return NextResponse.json({ ok: false, error: 'OpenRouter request failed' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
