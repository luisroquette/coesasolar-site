import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/ai/health', () => {
  it('rejects requests without the cron secret before calling OpenRouter', async () => {
    vi.stubEnv('CRON_SECRET', 'secret');
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    const response = await GET(new NextRequest('https://example.com/api/ai/health'));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the dedicated CoesaSolar key for a one-token health call', async () => {
    vi.stubEnv('CRON_SECRET', 'secret');
    vi.stubEnv('COESASOLAR_OPENROUTER_API_KEY', 'dedicated-key');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    const response = await GET(new NextRequest('https://example.com/api/ai/health', {
      headers: { authorization: 'Bearer secret' },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, model: 'deepseek/deepseek-v4-flash-0731' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer dedicated-key' });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ max_tokens: 1 });
  });
});
