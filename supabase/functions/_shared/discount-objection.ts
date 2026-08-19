/**
 * Discount Objection Handler
 * Extracted from sofia-webhook to _shared for reuse
 * Handles discount objection detection and response generation
 */

import { matchesPatternCategory, type PatternEntry } from './detection-patterns.ts';
import { getRenderedTemplate, getTemplateCache } from './message-templates.ts';
// Use unified config loader for hierarchical config resolution
import { loadSystemConfig } from './unified-config-loader.ts';

/**
 * Result of discount objection response generation
 */
export interface DiscountObjectionResult {
  response: string;
  shouldOfferMaster: boolean;
}

/**
 * Detect if message contains a discount objection
 * Uses dynamic patterns from database ONLY
 */
export function detectDiscountObjection(
  message: string,
  patterns: Map<string, PatternEntry>
): boolean {
  return matchesPatternCategory(message, 'discount_objection', patterns);
}

/**
 * Detect economy confirmation from user
 * Uses database patterns via matchesPatternCategory
 */
export function detectEconomyConfirmation(
  message: string, 
  patterns: Map<string, PatternEntry>
): boolean {
  return matchesPatternCategory(message, 'economy_confirmation', patterns);
}

/**
 * Generate response for discount objection (with "carta na manga" / master offer)
 * @param consumoMedio - Average consumption in kWh
 * @param valorFatura - Bill value in R$
 * @param descontoAtual - Current discount percentage
 * @param clienteNome - Client name for personalization
 * @param ofertaMasterJaFeita - Whether master offer was already made
 */
export function generateDiscountObjectionResponse(
  consumoMedio: number | null,
  valorFatura: number | null,
  descontoAtual: number,
  clienteNome: string | null,
  ofertaMasterJaFeita: boolean,
  config?: { consumoLimiteMaster?: number; masterDesconto?: number; masterFidelidade?: number }
): DiscountObjectionResult {
  const nome = clienteNome?.split(' ')[0] || '';
  const greeting = nome ? `${nome}, ` : '';
  const consumoLimiteMaster = config?.consumoLimiteMaster || 3000;
  const masterDesconto = config?.masterDesconto || 30;
  const masterFidelidade = config?.masterFidelidade || 4;
  
  // Estimate consumption if not available
  const consumo = consumoMedio || (valorFatura ? valorFatura / 0.8 : 0);
  
  // If consumption > limit AND hasn't offered MASTER yet, trigger "carta na manga"
  if (consumo > consumoLimiteMaster && !ofertaMasterJaFeita) {
    const response = getRenderedTemplate('sales', 'master_offer_response', {
      greeting,
      consumo_limite: consumoLimiteMaster.toString(),
      master_desconto: masterDesconto.toString(),
      master_fidelidade: masterFidelidade.toString(),
    });
    return { response, shouldOfferMaster: true };
  }
  
  // If consumption <= limit or already offered MASTER
  const economiaAnual = valorFatura ? Math.round(valorFatura * (descontoAtual / 100) * 12) : null;
  const economiaStr = economiaAnual ? `R$ ${economiaAnual.toLocaleString('pt-BR')}` : 'uma boa economia';
  
  const response = getRenderedTemplate('sales', 'max_discount_explanation', {
    greeting,
    desconto: descontoAtual.toString(),
    consumo_limite: consumoLimiteMaster.toString(),
    economia_anual: economiaStr,
  });
  return { response, shouldOfferMaster: false };
}

/**
 * Generate response for economy confirmation
 */
export function generateEconomyConfirmationResponse(
  descontoPercentual: number,
  valorFatura: number | null,
  clienteNome: string | null
): string {
  const nome = clienteNome?.split(' ')[0] || '';
  const greeting = nome ? `${nome}, ` : '';
  const economiaEstimada = valorFatura ? Math.round(valorFatura * (descontoPercentual / 100)) : null;
  const economiaStr = economiaEstimada ? `R$ ${economiaEstimada}` : 'esse valor';
  
  return getRenderedTemplate('sales', 'economy_confirmation_response', {
    greeting,
    desconto: descontoPercentual.toString(),
    economia_mensal: economiaStr,
  });
}

/**
 * Check if message matches assisted mode patterns
 * These are questions Sofia CAN answer even when escalated to human
 * Uses dynamic patterns from database (category: 'assisted_mode')
 */
export function isAssistedModeQuestion(
  message: string,
  patterns: Map<string, PatternEntry>
): boolean {
  return matchesPatternCategory(message, 'assisted_mode', patterns);
}
