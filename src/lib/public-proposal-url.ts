/**
 * Utilitário centralizado para construção de URLs públicas de propostas
 * Garante que todos os links usem:
 * 1. O domínio público configurado (public_app_url)
 * 2. O parâmetro de cache-busting (v=<public_cache_bust>)
 * 3. Rotas diferenciadas por tipo (/proposta-inicial ou /proposta-definitiva)
 */

export type TipoProposta = 'inicial' | 'definitiva';

export interface BuildPublicProposalUrlOptions {
  proposalId: string;
  publicAppUrl: string;
  cacheBust?: string;
  autoDownload?: boolean;
  tipoProposta?: TipoProposta;
}

/**
 * Retorna o path da rota baseado no tipo de proposta
 */
export function getProposalRoutePath(_tipoProposta: TipoProposta = 'inicial'): string {
  return 'proposta';
}

/**
 * Constrói URL pública completa para uma proposta
 * Sempre usa o domínio configurado em public_app_url
 * Inclui parâmetro v= para cache-busting
 * Usa rotas diferenciadas: /proposta-inicial/:id ou /proposta-definitiva/:id
 */
export function buildPublicProposalUrl({
  proposalId,
  publicAppUrl,
  cacheBust,
  autoDownload = false,
  tipoProposta = 'inicial',
}: BuildPublicProposalUrlOptions): string {
  if (!publicAppUrl) {
    // Fallback para origin atual se não configurado
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    publicAppUrl = origin;
  }

  // Remove trailing slash se existir
  const baseUrl = publicAppUrl.replace(/\/$/, '');
  
  // Determina o path baseado no tipo de proposta
  const routePath = getProposalRoutePath(tipoProposta);
  
  // Constrói URL base com rota diferenciada
  let url = `${baseUrl}/${routePath}/${proposalId}`;
  
  // Adiciona parâmetros
  const params = new URLSearchParams();
  
  if (autoDownload) {
    params.set('download', 'true');
  }
  
  if (cacheBust) {
    params.set('v', cacheBust);
  }
  
  const queryString = params.toString();
  if (queryString) {
    url += `?${queryString}`;
  }
  
  return url;
}

/**
 * Gera texto de WhatsApp com link da proposta
 */
export function buildWhatsappText(
  clienteNome: string,
  proposalUrl: string,
  empresaNome = 'COESA Energia'
): string {
  return `Olá ${clienteNome}! Sou da ${empresaNome}.\n\nSegue sua proposta: ${proposalUrl}`;
}

/**
 * Gera body de email com link da proposta
 */
export function buildEmailBody(
  clienteNome: string,
  proposalUrl: string,
  empresaNome = 'COESA'
): string {
  return `Olá ${clienteNome},\n\nSegue o link da sua proposta ${empresaNome}:\n${proposalUrl}\n\nAtenciosamente,\nEquipe ${empresaNome}`;
}
