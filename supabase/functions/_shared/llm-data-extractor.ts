/**
 * LLM-Based Data Extraction Module
 * 
 * HYBRID INTELLIGENT APPROACH:
 * - LLM interprets semantic context (e.g., "3 contas, duas de 150 e uma de 400" = R$ 700)
 * - Regex validates that extracted numeric values actually exist in the original message
 * - This prevents hallucinations while leveraging LLM's natural language understanding
 * 
 * @module _shared/llm-data-extractor
 */

import { callLLMWithFallback, type LLMMessage, type LLMResponse } from './llm-client.ts';
import type { ExtractedClientData } from './data-extraction.ts';
import { getExtractionLimits } from './data-extraction.ts';
import { isValidCPF, isValidCNPJ } from './validation-utils.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface LLMExtractionResult {
  success: boolean;
  data: ExtractedClientData;
  llmRaw?: Record<string, unknown>;
  validationNotes: string[];
  tokensUsed?: number;
}

interface LLMExtractedFields {
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  valorFatura?: number | null;
  consumo?: number | null;
  distribuidora?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  tipoInstalacao?: string | null;
  // Multiple units
  isMultipleUnits?: boolean;
  quantidadeUnidades?: number | null;
  valoresIndividuais?: number[] | null;
  valorTotalEstimado?: number | null;
  contextoCorporativo?: string | null;
  // Special flags
  isGrupoA?: boolean;
  tarifaSocial?: boolean;
  isAreaRural?: boolean;
  cipZero?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// EXTRACTION PROMPT
// ═══════════════════════════════════════════════════════════════

const EXTRACTION_SYSTEM_PROMPT = `Você é um extrator de dados especializado em mensagens de clientes sobre contas de energia elétrica.

TAREFA: Extrair dados estruturados da mensagem do cliente. Retorne APENAS um JSON válido, sem explicações.

REGRAS CRÍTICAS:
1. MÚLTIPLAS CONTAS: Se o cliente mencionar ter mais de uma conta (ex: "tenho 3 contas", "duas de 150 e uma de 400"), calcule o TOTAL.
   - isMultipleUnits: true
   - quantidadeUnidades: número de contas
   - valoresIndividuais: array com cada valor [150, 150, 400]
   - valorTotalEstimado: soma de todos (700)
   
2. CONTEXTO CORPORATIVO: Identifique se é condomínio, empresa, lojas, filiais, etc.

3. VALORES: Extraia valores monetários exatamente como aparecem. Use ponto para decimais.

4. CPF/CNPJ: Extraia apenas os dígitos, sem formatação.

5. Se não encontrar um campo, retorne null para ele.

FORMATO DE SAÍDA (JSON):
{
  "nome": string | null,
  "email": string | null,
  "telefone": string | null,
  "cpf": string | null,
  "cnpj": string | null,
  "valorFatura": number | null,
  "consumo": number | null,
  "distribuidora": string | null,
  "cidade": string | null,
  "uf": string | null,
  "cep": string | null,
  "tipoInstalacao": "Monofásico" | "Bifásico" | "Trifásico" | null,
  "isMultipleUnits": boolean,
  "quantidadeUnidades": number | null,
  "valoresIndividuais": number[] | null,
  "valorTotalEstimado": number | null,
  "contextoCorporativo": string | null,
  "isGrupoA": boolean,
  "tarifaSocial": boolean,
  "isAreaRural": boolean,
  "cipZero": boolean
}`;

// ═══════════════════════════════════════════════════════════════
// REGEX VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Validate that a numeric value exists in the original message
 * This prevents LLM hallucinations
 */
function validateNumericValueInMessage(value: number, message: string): boolean {
  const msgClean = message.toLowerCase().replace(/\s+/g, '');
  
  // Try different formats the number might appear as
  const formatsToCheck = [
    value.toString(),                           // "150"
    value.toFixed(2),                           // "150.00"
    value.toFixed(2).replace('.', ','),         // "150,00"
    Math.round(value).toString(),               // "150" (if was 150.00)
  ];
  
  // Also check for abbreviated thousands (1.500 = 1500)
  if (value >= 1000) {
    const thousands = Math.floor(value / 1000);
    const remainder = value % 1000;
    formatsToCheck.push(`${thousands}.${remainder.toString().padStart(3, '0')}`);
    formatsToCheck.push(`${thousands},${remainder.toString().padStart(3, '0')}`);
  }
  
  for (const format of formatsToCheck) {
    if (msgClean.includes(format.replace(/[.,]/g, ''))) {
      return true;
    }
    // Also check with formatting intact
    if (message.includes(format)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Validate that an array of values all exist in the message
 */
function validateAllValuesInMessage(values: number[], message: string): number[] {
  return values.filter(v => validateNumericValueInMessage(v, message));
}

/**
 * Extract all numeric values from a message for cross-reference
 */
function extractAllNumericValuesFromMessage(message: string): number[] {
  const values: number[] = [];
  const patterns = [
    /r\$\s*(\d+(?:[.,]\d+)?)/gi,
    /(\d+(?:,\d{2}))\s*(?:reais?|rs|r\$)/gi,
    /(?:de\s+)(\d{2,5})(?:\s|$|,)/gi,
  ];
  
  const seen = new Set<number>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const numStr = match[1].replace('.', '').replace(',', '.');
      const num = parseFloat(numStr);
      if (!isNaN(num) && num > 0 && !seen.has(num)) {
        values.push(num);
        seen.add(num);
      }
    }
  }
  
  return values;
}

/**
 * Validate CPF format and checksum
 */
function validateExtractedCPF(cpf: string | null): string | null {
  if (!cpf) return null;
  const digitsOnly = cpf.replace(/\D/g, '');
  if (digitsOnly.length !== 11) return null;
  if (!isValidCPF(digitsOnly)) return null;
  return digitsOnly;
}

/**
 * Validate CNPJ format and checksum
 */
function validateExtractedCNPJ(cnpj: string | null): string | null {
  if (!cnpj) return null;
  const digitsOnly = cnpj.replace(/\D/g, '');
  if (digitsOnly.length !== 14) return null;
  if (!isValidCNPJ(digitsOnly)) return null;
  return digitsOnly;
}

/**
 * Validate email format
 * RELAXED VALIDATION: Allows for minor typos/formatting differences in message
 */
function validateExtractedEmail(email: string | null, message: string): string | null {
  if (!email) return null;
  
  // Basic email pattern
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) return null;
  
  // Normalize both for comparison
  const emailLower = email.toLowerCase().trim();
  const msgNormalized = message.toLowerCase()
    .replace(/\s+/g, '') // Remove all whitespace
    .replace(/[*#]/g, ''); // Remove masking characters
  
  // Extract email parts for flexible matching
  const [localPart, domain] = emailLower.split('@');
  
  // Try exact match first
  if (msgNormalized.includes(emailLower.replace(/\s/g, ''))) {
    return emailLower;
  }
  
  // Try matching domain + partial local (for masked emails like "gal***@gmail.com")
  if (domain && msgNormalized.includes(`@${domain}`)) {
    // Check if at least the first 3 chars of local part appear before @
    const localPrefix = localPart.slice(0, 3);
    if (localPrefix.length >= 3 && msgNormalized.includes(localPrefix)) {
      console.log(`[LLM-EXTRACTOR] Email "${email}" validated via domain+prefix match`);
      return emailLower;
    }
  }
  
  // Try regex extraction from original message as fallback
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  const foundEmails = message.match(emailRegex);
  if (foundEmails && foundEmails.length > 0) {
    // Return the first valid email found in message (trust message over LLM)
    const firstFound = foundEmails[0].toLowerCase();
    console.log(`[LLM-EXTRACTOR] Using email from message regex: "${firstFound}" (LLM suggested: "${email}")`);
    return firstFound;
  }
  
  console.log(`[LLM-EXTRACTOR] Email "${email}" not found in original message - possible hallucination`);
  return null;
}

// ═══════════════════════════════════════════════════════════════
// MAIN EXTRACTION FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Extract client data using LLM with regex validation
 * 
 * @param message - The client's message to extract data from
 * @param apiKey - Lovable AI API key
 * @param existingData - Previously extracted data to merge with
 * @param trackingContext - Context for cost tracking
 */
export async function extractDataWithLLM(
  message: string,
  apiKey: string,
  existingData: ExtractedClientData = {},
  trackingContext?: { supabase?: any; agentId?: string; conversaId?: string }
): Promise<LLMExtractionResult> {
  const validationNotes: string[] = [];
  const limits = getExtractionLimits();
  
  // Skip very short messages
  if (message.length < 3) {
    return {
      success: true,
      data: existingData,
      validationNotes: ['Message too short for extraction'],
    };
  }
  
  const messages: LLMMessage[] = [
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    { role: 'user', content: message },
  ];
  
  try {
    const llmResponse = await callLLMWithFallback(
      messages,
      apiKey,
      {
        models: ['google/gemini-2.5-flash-lite', 'google/gemini-2.5-flash'], // Fast, cheap model for extraction
        temperature: 0.1, // Low temperature for consistent extraction
        max_tokens: 500,
        timeout: 10000, // 10s timeout for extraction
      },
      trackingContext
    );
    
    if (!llmResponse.success || !llmResponse.content) {
      console.warn('[LLM-EXTRACTOR] LLM call failed:', llmResponse.error);
      validationNotes.push(`LLM failed: ${llmResponse.error}`);
      return {
        success: false,
        data: existingData,
        validationNotes,
      };
    }
    
    // Parse LLM response
    let llmData: LLMExtractedFields;
    try {
      // Try to extract JSON from response (may have markdown code blocks)
      let jsonStr = llmResponse.content;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      // Also try to find raw JSON object
      const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonStr = objectMatch[0];
      }
      
      llmData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.warn('[LLM-EXTRACTOR] Failed to parse LLM JSON:', llmResponse.content);
      validationNotes.push('Failed to parse LLM response as JSON');
      return {
        success: false,
        data: existingData,
        validationNotes,
      };
    }
    
    // ═══════════════════════════════════════════════════════════════
    // VALIDATION PHASE - Regex validates LLM's extractions
    // ═══════════════════════════════════════════════════════════════
    
    const data: ExtractedClientData = { ...existingData };
    const messageNumericValues = extractAllNumericValuesFromMessage(message);
    
    console.log(`[LLM-EXTRACTOR] LLM extracted:`, JSON.stringify(llmData, null, 2));
    console.log(`[LLM-EXTRACTOR] Numeric values found in message:`, messageNumericValues);
    
    // Validate and merge: Nome
    if (llmData.nome && !data.nome) {
      // Verify name appears in message (basic check)
      const nameWords = llmData.nome.toLowerCase().split(/\s+/);
      const msgLower = message.toLowerCase();
      const nameFound = nameWords.some(word => word.length > 2 && msgLower.includes(word));
      if (nameFound) {
        data.nome = llmData.nome;
        validationNotes.push(`Nome validated: ${llmData.nome}`);
      } else {
        validationNotes.push(`Nome rejected (not in message): ${llmData.nome}`);
      }
    }
    
    // Validate and merge: Email
    if (llmData.email && !data.email) {
      const validEmail = validateExtractedEmail(llmData.email, message);
      if (validEmail) {
        data.email = validEmail;
        validationNotes.push(`Email validated: ${validEmail}`);
      } else {
        validationNotes.push(`Email rejected: ${llmData.email}`);
      }
    }
    
    // Validate and merge: CPF
    if (llmData.cpf && !data.cpf) {
      const validCPF = validateExtractedCPF(llmData.cpf);
      if (validCPF) {
        data.cpf = validCPF;
        data.tipoCliente = 'PF';
        validationNotes.push(`CPF validated: ${validCPF}`);
      } else {
        data.cpfInvalido = llmData.cpf;
        validationNotes.push(`CPF invalid: ${llmData.cpf}`);
      }
    }
    
    // Validate and merge: CNPJ
    if (llmData.cnpj && !data.cnpj) {
      const validCNPJ = validateExtractedCNPJ(llmData.cnpj);
      if (validCNPJ) {
        data.cnpj = validCNPJ;
        data.tipoCliente = 'PJ';
        validationNotes.push(`CNPJ validated: ${validCNPJ}`);
      } else {
        data.cnpjInvalido = llmData.cnpj;
        validationNotes.push(`CNPJ invalid: ${llmData.cnpj}`);
      }
    }
    
    // Validate and merge: Bill Values (CRITICAL - multiple units support)
    if (!data.valorFatura) {
      if (llmData.isMultipleUnits && llmData.valoresIndividuais && llmData.valoresIndividuais.length > 0) {
        // LLM detected multiple units - validate each value
        const validatedValues = validateAllValuesInMessage(llmData.valoresIndividuais, message);
        
        if (validatedValues.length > 0) {
          const total = validatedValues.reduce((sum, v) => sum + v, 0);
          
          // Check if total is within limits
          if (total >= limits.billValueMin && total <= limits.billValueMax) {
            data.isMultipleUnits = true;
            data.quantidadeUnidades = llmData.quantidadeUnidades || validatedValues.length;
            data.valoresIndividuais = validatedValues;
            data.valorTotalEstimado = total;
            data.valorFatura = total; // Use sum for qualification
            data.contextoCorporativo = llmData.contextoCorporativo || undefined;
            
            validationNotes.push(`Multiple bills validated: ${validatedValues.length} bills = R$ ${total}`);
            console.log(`[LLM-EXTRACTOR] ✅ MULTIPLE BILLS: ${validatedValues.join(' + ')} = R$ ${total}`);
          } else {
            validationNotes.push(`Multiple bills total out of range: R$ ${total}`);
          }
        } else {
          validationNotes.push(`Multiple bills values not found in message: ${llmData.valoresIndividuais}`);
        }
      } else if (llmData.valorFatura) {
        // Single bill value
        if (validateNumericValueInMessage(llmData.valorFatura, message)) {
          if (llmData.valorFatura >= limits.billValueMin && llmData.valorFatura <= limits.billValueMax) {
            data.valorFatura = llmData.valorFatura;
            validationNotes.push(`Single bill validated: R$ ${llmData.valorFatura}`);
          } else {
            validationNotes.push(`Bill value out of range: R$ ${llmData.valorFatura}`);
          }
        } else {
          validationNotes.push(`Bill value not found in message: R$ ${llmData.valorFatura}`);
          
          // Fallback: try to use any valid numeric value from message
          const fallbackValue = messageNumericValues.find(
            v => v >= limits.billValueMin && v <= limits.billValueMax
          );
          if (fallbackValue) {
            data.valorFatura = fallbackValue;
            validationNotes.push(`Fallback bill value used: R$ ${fallbackValue}`);
          }
        }
      }
    }
    
    // Validate and merge: Consumption (kWh)
    if (!data.consumo && llmData.consumo) {
      if (validateNumericValueInMessage(llmData.consumo, message)) {
        if (llmData.consumo >= limits.consumptionMin && llmData.consumo <= limits.consumptionMax) {
          data.consumo = llmData.consumo;
          validationNotes.push(`Consumption validated: ${llmData.consumo} kWh`);
        }
      }
    }
    
    // Validate and merge: Distribuidora (no numeric validation needed)
    if (llmData.distribuidora && !data.distribuidora) {
      // Basic check: at least part of the name should be in message
      const distLower = llmData.distribuidora.toLowerCase();
      const msgLower = message.toLowerCase();
      if (msgLower.includes(distLower) || distLower.split(' ').some(w => w.length > 3 && msgLower.includes(w))) {
        data.distribuidora = llmData.distribuidora;
        validationNotes.push(`Distribuidora validated: ${llmData.distribuidora}`);
      }
    }
    
    // Simple fields (less critical, trust LLM more)
    if (llmData.cidade && !data.cidade) data.cidade = llmData.cidade;
    if (llmData.uf && !data.uf) data.uf = llmData.uf;
    if (llmData.cep && !data.cep) {
      const cepDigits = llmData.cep.replace(/\D/g, '');
      if (cepDigits.length === 8) data.cep = cepDigits;
    }
    if (llmData.tipoInstalacao && !data.tipoInstalacao) {
      if (['Monofásico', 'Bifásico', 'Trifásico'].includes(llmData.tipoInstalacao)) {
        data.tipoInstalacao = llmData.tipoInstalacao as 'Monofásico' | 'Bifásico' | 'Trifásico';
      }
    }
    
    // Boolean flags
    if (llmData.isGrupoA) data.isGrupoA = true;
    if (llmData.tarifaSocial) data.tarifaSocial = true;
    if (llmData.isAreaRural) data.isAreaRural = true;
    if (llmData.cipZero) data.cipZero = true;
    
    console.log(`[LLM-EXTRACTOR] Final extracted data:`, JSON.stringify(data, null, 2));
    console.log(`[LLM-EXTRACTOR] Validation notes:`, validationNotes);
    
    return {
      success: true,
      data,
      llmRaw: llmData as Record<string, unknown>,
      validationNotes,
      tokensUsed: llmResponse.usage?.total_tokens,
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[LLM-EXTRACTOR] Extraction failed:', errorMsg);
    validationNotes.push(`Extraction error: ${errorMsg}`);
    
    return {
      success: false,
      data: existingData,
      validationNotes,
    };
  }
}

/**
 * Quick check if a message likely contains extractable data
 * Used to decide whether to call the more expensive LLM extraction
 */
export function messageContainsExtractableData(message: string): boolean {
  const patterns = [
    // Monetary values
    /r\$|reais?|rs\s*\d/i,
    /\d{2,5}[,.]?\d{0,2}/,
    // Email patterns
    /@[a-z]/i,
    // Document patterns
    /cpf|cnpj/i,
    /\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}/,
    // Energy-related
    /kwh|consumo|conta|fatura|luz|energia/i,
    // Multiple units indicators
    /contas?|unidades?|lojas?|filiais?/i,
    // Location
    /cep|cidade|estado/i,
  ];
  
  return patterns.some(p => p.test(message));
}
