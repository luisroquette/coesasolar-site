// src/lib/blog/alert.ts
// Alerta em tempo real na 1ª falha do dia (achado 02/09/2026): sem isso, uma falha só vira
// visível no relatório do Sentinel do dia SEGUINTE — tarde demais pra intervenção manual no
// mesmo dia útil (foi exatamente a intervenção manual do dono que salvou a publicação de
// hoje). Fail-open: erro no envio do e-mail NUNCA derruba o pipeline — só fica sem alerta.
const ALERT_TO = 'testroquette@gmail.com';
const ALERT_FROM = 'Coesa Solar Blog <alertas@coesasolar.com.br>';

export interface FailureAlertInput {
  keyword: string | undefined;
  error: string;
  runDate: string;
}

export async function sendFailureAlertEmail(input: FailureAlertInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[alert] RESEND_API_KEY não configurada — alerta pulado (fail-open).');
    return;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: ALERT_FROM,
        to: [ALERT_TO],
        subject: `⚠️ coesasolar.com.br/blog não publicou hoje (${input.runDate})`,
        text: [
          `Keyword: ${input.keyword ?? '(não resolvida)'}`,
          `Erro: ${input.error}`,
          '',
          'Esta é a 1ª falha do dia — ainda há tentativas automáticas restantes (13:30 e',
          '18:50 UTC, se ainda não passaram), mas isso pode indicar um problema real que vale',
          'intervenção manual agora em vez de esperar.',
          '',
          'Retrigger manual: curl -H "Authorization: Bearer $CRON_SECRET" https://coesasolar.com.br/api/blog/generate',
        ].join('\n'),
      }),
    });
    if (!response.ok) {
      console.warn(`[alert] Resend respondeu ${response.status} — alerta pode não ter sido entregue.`);
    }
  } catch (err) {
    console.warn('[alert] Falha ao enviar alerta (fail-open, nunca derruba o pipeline):', err);
  }
}
