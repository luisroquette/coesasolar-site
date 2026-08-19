// src/app/api/blog/leads/route.ts
// POST público: valida, descarta honeypot e entrega via plug de CRM.
import { NextRequest, NextResponse } from 'next/server';
import { deliverLead, isHoneypot, validateLead, type LeadPayload } from '@/lib/blog/lead-capture';
import { AUTOBLOG_PROFILE } from '@/lib/autoblog-profile';

export async function POST(request: NextRequest) {
  if (!AUTOBLOG_PROFILE.integrations.leadCapture.enabled) {
    return NextResponse.json({ error: 'lead_capture_disabled' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const lead: LeadPayload = {
    name: typeof raw.name === 'string' ? raw.name : '',
    email: typeof raw.email === 'string' ? raw.email : '',
    source: typeof raw.source === 'string' ? raw.source : 'desconhecida',
    keyword: typeof raw.keyword === 'string' ? raw.keyword : null,
    note: typeof raw.note === 'string' ? raw.note : null,
  };

  // Bot preencheu o campo invisível — responde sucesso e descarta silenciosamente.
  if (isHoneypot(lead)) {
    return NextResponse.json({ success: true }, { status: 200 });
  }

  const validation = validateLead(lead);
  if (!validation.ok) {
    return NextResponse.json({ error: 'invalid_lead', details: validation.errors }, { status: 400 });
  }

  try {
    await deliverLead(lead);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Lead perdido sem rastro é imperdoável: loga o mínimo para recuperação manual.
    console.error(
      `[blog/leads] Falha ao entregar lead (${message}) — recuperar manualmente. email=${lead.email} fonte=${lead.source}`,
    );
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
