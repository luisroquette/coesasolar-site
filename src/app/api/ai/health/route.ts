export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sendFailureAlertEmail } from '@/lib/blog/alert';

const MODEL = 'deepseek/deepseek-v4-flash-0731';

// REGRESSÃO 02/09/2026: rota já existia mas não estava agendada nem alertava em falha —
// virou canário: cron às 7h UTC (2h ANTES do 1º /api/blog/generate, 9h UTC), fora do fluxo
// de produção. Detecta modelo/provedor quebrado ANTES do cron de publicação bater nisso
// (achado real do PR #17: modelo aposentado só apareceu quando o cron real já tinha
// falhado ao vivo).

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.COESASOLAR_OPENROUTER_API_KEY;
  if (!apiKey) {
    await alertCanaryFailure('OpenRouter key not configured');
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
      await alertCanaryFailure(`OpenRouter request failed (HTTP ${response.status})`);
      return NextResponse.json(
        { ok: false, error: 'OpenRouter request failed', providerStatus: response.status },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, model: MODEL });
  } catch (err) {
    await alertCanaryFailure(err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: 'OpenRouter request failed' }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

async function alertCanaryFailure(reason: string): Promise<void> {
  await sendFailureAlertEmail({
    keyword: undefined,
    error: `canary_failed (${MODEL}): ${reason}`,
    runDate: new Date().toISOString().slice(0, 10),
  }).catch(() => {});
}
