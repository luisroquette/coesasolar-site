// Helpers puros do formulário de candidatura (sem I/O — testáveis isoladamente)

const CV_MAX_BYTES = 4 * 1024 * 1024; // 4MB (cap de body Vercel no painel é 4,5MB)

export interface CampoExtraForm {
  id: string;
  tipo: 'texto_curto' | 'texto_longo' | 'selecao' | 'sim_nao' | 'anexo';
  label: string;
  obrigatorio: boolean;
  opcoes: string[];
}

export interface FormacaoForm {
  instituicao: string;
  curso: string;
  nivel?: string;
  inicio?: string;
  fim?: string;
  cursando?: boolean;
}

export interface ExperienciaForm {
  empresa: string;
  cargo: string;
  inicio?: string;
  fim?: string;
  atual?: boolean;
  descricao?: string;
}

export interface IdiomaForm {
  idioma: string;
  nivel?: 'basico' | 'intermediario' | 'avancado' | 'fluente' | 'nativo';
}

export interface CandidaturaCampos {
  nome: string;
  email: string;
  whatsapp: string;
  cidade: string;
  consent: boolean;
  cv: File | null;
  portfolioUrl?: string;
  portfolioArquivo?: File | null;
  portfolioObrigatorio?: boolean;
  camposExtras?: CampoExtraForm[];
  respostasExtras?: Record<string, string>;
  arquivosExtras?: Record<string, File | null>;
}

export function coletarUtm(searchParams: URLSearchParams): Record<string, string> {
  const utm: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith('utm_')) utm[key] = value;
  }
  return utm;
}

/** Máscara progressiva de WhatsApp BR: (99) 99999-9999, aplicada enquanto digita. */
export function formatarWhatsapp(valorDigitado: string): string {
  const digitos = valorDigitado.replace(/\D/g, '').slice(0, 11);
  if (digitos.length <= 2) return digitos ? `(${digitos}` : '';
  if (digitos.length <= 7) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
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
  if (campos.portfolioUrl && campos.portfolioArquivo) {
    erros.push('Envie o portfólio como link OU arquivo, não os dois.');
  }
  if (campos.portfolioObrigatorio && !campos.portfolioUrl?.trim() && !campos.portfolioArquivo) {
    erros.push('Anexe ou informe o link do portfólio.');
  }
  if (campos.portfolioArquivo) {
    const PORTFOLIO_MAX_BYTES = 1.5 * 1024 * 1024;
    if (campos.portfolioArquivo.size > PORTFOLIO_MAX_BYTES) {
      erros.push('O arquivo de portfólio deve ter até 1,5MB — para arquivos maiores, envie um link.');
    }
    if (campos.cv && campos.cv.size + campos.portfolioArquivo.size > 4_300_000) {
      erros.push('Currículo + portfólio juntos passam do limite — envie o portfólio como link.');
    }
  }
  for (const campo of campos.camposExtras ?? []) {
    if (campo.obrigatorio && campo.tipo !== 'anexo' && !(campos.respostasExtras?.[campo.id] ?? '').trim()) {
      erros.push(`Informe: ${campo.label}.`);
    }
    if (campo.obrigatorio && campo.tipo === 'anexo' && !campos.arquivosExtras?.[campo.id]) {
      erros.push(`Anexe: ${campo.label}.`);
    }
  }
  return erros;
}

/**
 * Decide o valor final de um campo do form após a extração por IA do CV.
 * Só usa o valor extraído se o campo estiver vazio NO MOMENTO DA ESCRITA — nunca
 * sobrescreve o que o candidato já digitou. Deve ser chamada dentro do updater
 * funcional do setState (`setNome((prev) => preencherSeVazio(prev, dados.nome))`)
 * para que `atual` reflita o estado mais recente, não o capturado no início do fetch.
 */
export function preencherSeVazio(atual: string, extraido: string | undefined): string {
  return atual || extraido || atual;
}

export function preencherListaSeVazia<T>(atual: T[], extraido: T[] | undefined): T[] {
  return atual.length > 0 || !Array.isArray(extraido) ? atual : extraido;
}

export function listaDeTexto(valor: string): string[] {
  return valor.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}

export function periodoInvalido(inicio?: string, fim?: string): boolean {
  return Boolean(inicio && fim && fim < inicio);
}

/** Normaliza um número BR (com ou sem 55/+55, com ou sem formatação) em link wa.me. */
export function montarLinkWhatsapp(whatsapp: string): string {
  const digitos = whatsapp.replace(/\D/g, '');
  const comPais = digitos.startsWith('55') && digitos.length >= 12 ? digitos : `55${digitos}`;
  return `https://wa.me/${comPais}`;
}

export function montarFormData(
  campos: {
    nome: string; email: string; whatsapp: string; cidade: string; linkedin?: string;
    consent: boolean; cv: File | null; website: string;
    portfolioUrl?: string; portfolioArquivo?: File | null;
    pretensaoSalarial?: string; disponibilidade?: string;
    resumoProfissional?: string; anosExperiencia?: string; fontePreenchimento?: 'manual' | 'ia_cv';
    cargoAtual?: string; formacoes?: FormacaoForm[]; experiencias?: ExperienciaForm[];
    habilidades?: string[]; idiomas?: IdiomaForm[]; certificacoes?: string[];
  },
  vagaSlug: string,
  utm: Record<string, string>,
  extras?: { respostasExtras?: Record<string, string>; arquivosExtras?: Record<string, File | null> },
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
  if (campos.portfolioUrl) fd.append('portfolio_url', campos.portfolioUrl);
  if (campos.portfolioArquivo) fd.append('portfolio', campos.portfolioArquivo);
  if (campos.pretensaoSalarial) fd.append('pretensao_salarial', campos.pretensaoSalarial);
  if (campos.disponibilidade) fd.append('disponibilidade', campos.disponibilidade);
  if (campos.resumoProfissional) fd.append('resumo_profissional', campos.resumoProfissional);
  if (campos.anosExperiencia) fd.append('anos_experiencia', campos.anosExperiencia);
  if (campos.fontePreenchimento) fd.append('fonte_preenchimento', campos.fontePreenchimento);
  if (campos.cargoAtual) fd.append('cargo_atual', campos.cargoAtual);
  fd.append('formacoes', JSON.stringify(campos.formacoes ?? []));
  fd.append('experiencias', JSON.stringify(campos.experiencias ?? []));
  fd.append('habilidades', JSON.stringify(campos.habilidades ?? []));
  fd.append('idiomas', JSON.stringify(campos.idiomas ?? []));
  fd.append('certificacoes', JSON.stringify(campos.certificacoes ?? []));
  if (extras?.respostasExtras && Object.keys(extras.respostasExtras).length > 0) {
    fd.append('respostas_extras', JSON.stringify(extras.respostasExtras));
  }
  if (extras?.arquivosExtras) {
    for (const [campoId, arquivo] of Object.entries(extras.arquivosExtras)) {
      if (arquivo) fd.append(`resposta_arquivo_${campoId}`, arquivo);
    }
  }
  return fd;
}
