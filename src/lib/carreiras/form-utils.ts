// Helpers puros do formulário de candidatura (sem I/O — testáveis isoladamente)

const CV_MAX_BYTES = 4 * 1024 * 1024; // 4MB (cap de body Vercel no painel é 4,5MB)

export interface CandidaturaCampos {
  nome: string;
  email: string;
  whatsapp: string;
  cidade: string;
  consent: boolean;
  cv: File | null;
}

export function coletarUtm(searchParams: URLSearchParams): Record<string, string> {
  const utm: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith('utm_')) utm[key] = value;
  }
  return utm;
}

export function validarClient(campos: CandidaturaCampos): string[] {
  const erros: string[] = [];
  if (!campos.nome.trim()) erros.push('Informe seu nome.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(campos.email)) erros.push('Informe um e-mail válido.');
  if (campos.whatsapp.replace(/\D/g, '').length < 10) erros.push('Informe um WhatsApp válido.');
  if (!campos.cidade.trim()) erros.push('Informe sua cidade.');
  if (!campos.consent) erros.push('É necessário autorizar o uso dos seus dados.');
  if (!campos.cv) {
    erros.push('Anexe seu currículo em PDF.');
  } else {
    if (campos.cv.type !== 'application/pdf' && !campos.cv.name.toLowerCase().endsWith('.pdf')) {
      erros.push('O currículo deve ser um arquivo PDF.');
    }
    if (campos.cv.size > CV_MAX_BYTES) erros.push('O currículo deve ter até 4MB.');
  }
  return erros;
}

export function montarFormData(
  campos: { nome: string; email: string; whatsapp: string; cidade: string; linkedin?: string; consent: boolean; cv: File | null; website: string },
  vagaSlug: string,
  utm: Record<string, string>,
): FormData {
  const fd = new FormData();
  fd.append('vaga_slug', vagaSlug);
  fd.append('nome', campos.nome);
  fd.append('email', campos.email);
  fd.append('whatsapp', campos.whatsapp);
  fd.append('cidade', campos.cidade);
  if (campos.linkedin) fd.append('linkedin', campos.linkedin);
  fd.append('utm', JSON.stringify(utm));
  fd.append('consent', String(campos.consent));
  fd.append('website', campos.website);
  if (campos.cv) fd.append('cv', campos.cv);
  return fd;
}
