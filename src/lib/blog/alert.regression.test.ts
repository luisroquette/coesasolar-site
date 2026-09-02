// REGRESSÃO 02/09/2026: alerta em tempo real na 1ª falha do dia — antes só aparecia no
// relatório do Sentinel do dia seguinte, tarde demais pra intervenção no mesmo dia útil.
// Fail-open obrigatório: erro no envio nunca pode propagar e derrubar o pipeline principal.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendFailureAlertEmail } from './alert';

describe('REGRESSÃO 02/09/2026: sendFailureAlertEmail', () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  });

  it('sem RESEND_API_KEY: pula o envio (fail-open), nunca lança', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendFailureAlertEmail({ keyword: 'x', error: 'y', runDate: '2026-09-02' })).resolves.toBeUndefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('envia pro destinatário fixo com from verificado (coesasolar.com.br) e assunto com a data', async () => {
    process.env.RESEND_API_KEY = 're_test';
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200 });

    await sendFailureAlertEmail({ keyword: 'placa solar', error: 'deepseek_structure_failed', runDate: '2026-09-02' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer re_test' }),
      }),
    );
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.to).toEqual(['testroquette@gmail.com']);
    expect(body.from).toContain('coesasolar.com.br');
    expect(body.subject).toContain('2026-09-02');
    expect(body.text).toContain('deepseek_structure_failed');
    expect(body.text).toContain('placa solar');
  });

  it('Resend responde erro HTTP: não lança (fail-open, só loga aviso)', async () => {
    process.env.RESEND_API_KEY = 're_test';
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 422 });
    await expect(sendFailureAlertEmail({ keyword: 'x', error: 'y', runDate: '2026-09-02' })).resolves.toBeUndefined();
  });

  it('fetch lança (rede indisponível): não propaga (fail-open, nunca derruba o pipeline)', async () => {
    process.env.RESEND_API_KEY = 're_test';
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));
    await expect(sendFailureAlertEmail({ keyword: 'x', error: 'y', runDate: '2026-09-02' })).resolves.toBeUndefined();
  });
});
