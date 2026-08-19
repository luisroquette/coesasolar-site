// src/app/api/blog/audit-links/route.ts
// GET protegido por CRON_SECRET: roda a auditoria completa de links quebrados,
// grava o snapshot em blog_broken_links e devolve o relatório.
import { NextRequest, NextResponse } from 'next/server';
import { runLinkAudit } from '@/lib/blog/link-audit';

// Auditoria é semanal; blogs muito grandes (centenas de artigos) podem
// estourar o teto — nesse caso, rode a auditoria em partes via chamadas manuais.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const report = await runLinkAudit();
    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[blog/audit-links] Falhou:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
