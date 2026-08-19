 /**
  * ELIGIBILITY CHECK MODULE
  * 
  * Centralized eligibility verification for the qualification flow.
  * Used BEFORE sending economy preview to ensure lead qualifies.
  * 
  * Key behaviors:
  * 1. Check if valorFatura >= minimum threshold (R$ 250)
  * 2. If below minimum AND not yet asked about other accounts → ask first
  * 3. If below minimum AND already asked AND no additional accounts → disqualify
  * 4. If sum of multiple accounts >= minimum → qualify
  * 
  * @module _shared/eligibility-check
  */
 
 import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
 
 // ═══════════════════════════════════════════════════════════════
 // TYPES
 // ═══════════════════════════════════════════════════════════════
 
 export interface MinimumBillCheckResult {
   isEligible: boolean;
   isBelowMinimum: boolean;
   minimumThreshold: number;
   valorDetected: number;
   
   // Multiple units flow
   shouldAskMultipleUnits: boolean;
   askMultipleUnitsMessage: string | null;
   awaitingMultipleUnitsResponse: boolean;
   alreadyAskedMultipleUnits: boolean;
 }
 
 export interface EligibilityDadosColetados {
   valorFatura?: number;
   valorTotalEstimado?: number;
   isMultipleUnits?: boolean;
   already_asked_multiple_units?: boolean;
   awaiting_multiple_units_response?: boolean;
   multiple_units_confirmed_no?: boolean;
 }
 
 // ═══════════════════════════════════════════════════════════════
 // CONFIGURATION LOADER
 // ═══════════════════════════════════════════════════════════════
 
 interface EligibilityConfig {
   consumoMinimoReais: number;
 }
 
 let configCache: { data: EligibilityConfig | null; timestamp: number } = { data: null, timestamp: 0 };
 const CONFIG_TTL_MS = 5 * 60 * 1000; // 5 minutes
 
 async function loadEligibilityConfig(supabase: SupabaseClient): Promise<EligibilityConfig> {
   const now = Date.now();
   if (configCache.data && (now - configCache.timestamp) < CONFIG_TTL_MS) {
     return configCache.data;
   }
 
   const { data: configs } = await supabase
     .from('configuracoes_sistema')
     .select('chave, valor')
     .in('chave', ['consumo_minimo_reais']);
 
   const configMap: Record<string, string> = {};
   configs?.forEach((c: any) => {
     configMap[c.chave] = c.valor;
   });
 
   const result: EligibilityConfig = {
     consumoMinimoReais: parseFloat(configMap.consumo_minimo_reais) || 50,
   };
 
   configCache = { data: result, timestamp: now };
   return result;
 }
 
 // ═══════════════════════════════════════════════════════════════
 // MAIN ELIGIBILITY CHECK
 // ═══════════════════════════════════════════════════════════════
 
 /**
  * Check if a lead meets the minimum bill threshold for qualification
  * 
  * Flow:
  * 1. If valor >= minimum → isEligible = true
  * 2. If valor < minimum AND not asked yet → shouldAskMultipleUnits = true
  * 3. If valor < minimum AND asked AND confirmed no other accounts → isEligible = false
  * 4. If multiple units exist AND sum >= minimum → isEligible = true
  */
 export async function checkMinimumBillEligibility(
   supabase: SupabaseClient,
   valorFatura: number,
   dadosColetados: EligibilityDadosColetados
 ): Promise<MinimumBillCheckResult> {
   const config = await loadEligibilityConfig(supabase);
   const minimum = config.consumoMinimoReais;
   
   // Use valorTotalEstimado if available (for multiple units)
   const effectiveValue = dadosColetados.valorTotalEstimado || valorFatura || 0;
   
   const alreadyAsked = !!dadosColetados.already_asked_multiple_units;
   const awaiting = !!dadosColetados.awaiting_multiple_units_response;
   const confirmedNo = !!dadosColetados.multiple_units_confirmed_no;
   
   console.log(`[ELIGIBILITY_CHECK] Checking: R$ ${effectiveValue} vs minimum R$ ${minimum}`);
   console.log(`[ELIGIBILITY_CHECK] Flags: alreadyAsked=${alreadyAsked}, awaiting=${awaiting}, confirmedNo=${confirmedNo}`);
   
   // Case 1: Value meets minimum → ELIGIBLE
   if (effectiveValue >= minimum) {
     console.log(`[ELIGIBILITY_CHECK] ✅ ELIGIBLE: R$ ${effectiveValue} >= R$ ${minimum}`);
     return {
       isEligible: true,
       isBelowMinimum: false,
       minimumThreshold: minimum,
       valorDetected: effectiveValue,
       shouldAskMultipleUnits: false,
       askMultipleUnitsMessage: null,
       awaitingMultipleUnitsResponse: false,
       alreadyAskedMultipleUnits: alreadyAsked,
     };
   }
   
   // Case 2: Below minimum but haven't asked yet → ASK
   if (!alreadyAsked && !awaiting) {
     console.log(`[ELIGIBILITY_CHECK] ⚠️ Below minimum R$ ${effectiveValue} < R$ ${minimum} - will ask about other accounts`);
     
     const askMessage = buildMultipleUnitsQuestion(effectiveValue, minimum);
     
     return {
       isEligible: false,
       isBelowMinimum: true,
       minimumThreshold: minimum,
       valorDetected: effectiveValue,
       shouldAskMultipleUnits: true,
       askMultipleUnitsMessage: askMessage,
       awaitingMultipleUnitsResponse: false,
       alreadyAskedMultipleUnits: false,
     };
   }
   
   // Case 3: Below minimum and already asked/awaiting → NOT ELIGIBLE YET
   // (The response will be processed in the next message cycle)
   console.log(`[ELIGIBILITY_CHECK] ⏳ Below minimum, awaiting response about other accounts`);
   return {
     isEligible: false,
     isBelowMinimum: true,
     minimumThreshold: minimum,
     valorDetected: effectiveValue,
     shouldAskMultipleUnits: false,
     askMultipleUnitsMessage: null,
     awaitingMultipleUnitsResponse: awaiting,
     alreadyAskedMultipleUnits: alreadyAsked,
   };
 }
 
 // ═══════════════════════════════════════════════════════════════
 // MESSAGE BUILDER
 // ═══════════════════════════════════════════════════════════════
 
 function buildMultipleUnitsQuestion(valorAtual: number, minimo: number): string {
   const faltando = Math.ceil(minimo - valorAtual);
   
   return `Entendi, sua conta está em *R$ ${valorAtual.toFixed(2)}*! 💡
 
 Para que a economia com energia solar faça sentido, o valor mínimo é *R$ ${minimo}/mês*.
 
 Mas tenho uma pergunta: você tem *outras contas de energia*? 🏠🏢
 
 Por exemplo: casa de praia, escritório, comércio, apartamento alugado...
 
 Se a soma das suas contas chegar a R$ ${minimo} ou mais, você pode aproveitar a economia! 
 
 Tem outras unidades consumidoras?`;
 }
 
 // ═══════════════════════════════════════════════════════════════
 // RESPONSE PROCESSOR
 // ═══════════════════════════════════════════════════════════════
 
 export interface MultipleUnitsResponseResult {
   hasOtherAccounts: boolean;
   confirmedNo: boolean;
   unclear: boolean;
   newValorTotal?: number;
 }
 
 /**
  * Process client response to multiple units question
  * Returns whether they have other accounts or not
  */
 export function processMultipleUnitsResponse(
   message: string,
   existingValor: number
 ): MultipleUnitsResponseResult {
   const lower = message.toLowerCase().trim();
   
   // Check for explicit NO
   const noPatterns = [
     /\bn[aã]o\b/,
     /\bapenas\s*(essa|essa aqui|uma|1|uma s[oó])\b/,
     /\bs[oó]\s*(essa|uma|tenho uma)\b/,
     /\binfelizmente\s*n[aã]o\b/,
     /\bn[aã]o\s*tenho\b/,
     /\b(somente|unicamente)\s*(essa|uma)\b/,
   ];
   
   for (const pattern of noPatterns) {
     if (pattern.test(lower)) {
       console.log(`[ELIGIBILITY_CHECK] Client confirmed NO other accounts`);
       return { hasOtherAccounts: false, confirmedNo: true, unclear: false };
     }
   }
   
   // Check for explicit YES or value mentions
   const yesPatterns = [
     /\bsim\b/,
     /\btenho\s*(sim|outras?|mais)\b/,
     /\b(tem|tenho)\s*(\d+)\s*(contas?|unidades?|casas?)\b/,
     /\bmais\s*(\d+)\b/,
     /\boutra\s*(conta|unidade|casa)\b/,
   ];
   
   for (const pattern of yesPatterns) {
     if (pattern.test(lower)) {
       console.log(`[ELIGIBILITY_CHECK] Client indicated HAS other accounts`);
       return { hasOtherAccounts: true, confirmedNo: false, unclear: false };
     }
   }
   
   // Check for new value in the response
   const valueMatch = lower.match(/r?\$?\s*(\d{2,4}(?:[.,]\d{2})?)/);
   if (valueMatch) {
     const newValue = parseFloat(valueMatch[1].replace(',', '.'));
     if (newValue >= 50 && newValue <= 10000) {
       console.log(`[ELIGIBILITY_CHECK] Client mentioned new value: R$ ${newValue}`);
       return { 
         hasOtherAccounts: true, 
         confirmedNo: false, 
         unclear: false,
         newValorTotal: existingValor + newValue,
       };
     }
   }
   
   // Unclear response
   console.log(`[ELIGIBILITY_CHECK] Unclear response about other accounts`);
   return { hasOtherAccounts: false, confirmedNo: false, unclear: true };
 }