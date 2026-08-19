/**
 * SOFIA PIPELINE 2.0 - VALIDATION LAYER
 * 
 * Fase 4b: Validação e Guardrails
 * Verifica a resposta antes do envio final
 * 
 * Phase 47: Integra guardrails determinísticos carregados do banco
 */

import type { 
  ValidationCheck, 
  ValidationResult,
  ReasoningResult,
  FullContext,
  ActionResult
} from "./types.ts";

import {
  enforcePostLLMGuardrails,
  type GuardrailContext,
} from "../guardrails-enforcer.ts";

// ============================================
// VALIDATION CHECKS
// ============================================

/**
 * Check for contradictions with known facts
 */
function checkContradictions(
  reasoning: ReasoningResult,
  context: FullContext
): ValidationCheck {
  const responseText = reasoning.responseText || '';
  const issues: string[] = [];
  
  // Check client name consistency
  const clientName = context.clientProfile.name;
  if (clientName && responseText.includes('seu nome')) {
    // Simple check - could be enhanced with NLP
    const lowerResponse = responseText.toLowerCase();
    const lowerName = clientName.toLowerCase().split(' ')[0];
    if (lowerResponse.includes('qual') && lowerResponse.includes('nome') && !lowerResponse.includes(lowerName)) {
      // Asking for name when we already have it
      issues.push(`Contradição: perguntando nome quando já sabemos: ${clientName}`);
    }
  }
  
  // Check distributor consistency
  const distributor = context.clientProfile.distribuidora;
  if (distributor && responseText.toLowerCase().includes('qual sua distribuidora')) {
    issues.push(`Contradição: perguntando distribuidora quando já sabemos: ${distributor}`);
  }
  
  return {
    type: 'contradiction_check',
    passed: issues.length === 0,
    message: issues.join('; '),
    severity: issues.length > 0 ? 'warning' : 'info'
  };
}

/**
 * Check compliance with active rules
 */
function checkRuleCompliance(
  reasoning: ReasoningResult,
  context: FullContext
): ValidationCheck {
  const violations: string[] = [];
  
  for (const rule of context.activeRules) {
    if (rule.ruleType === 'guardrail') {
      // Check if any guardrail action says to block
      for (const action of rule.actions) {
        if (action.type === 'block') {
          // Check if response violates the block condition
          const blockPattern = action.parameters.pattern as string;
          if (blockPattern && reasoning.responseText?.match(new RegExp(blockPattern, 'i'))) {
            violations.push(`Violação de regra "${rule.name}": ${rule.description}`);
          }
        }
      }
    }
  }
  
  return {
    type: 'rule_compliance',
    passed: violations.length === 0,
    message: violations.join('; '),
    severity: violations.length > 0 ? 'error' : 'info'
  };
}

/**
 * Check for potential hallucinations
 */
function checkHallucination(
  reasoning: ReasoningResult,
  context: FullContext
): ValidationCheck {
  const responseText = reasoning.responseText || '';
  const issues: string[] = [];
  
  // Check for specific value claims not backed by data
  const moneyPattern = /R\$\s*[\d.,]+/g;
  const moneyMatches = responseText.match(moneyPattern);
  
  if (moneyMatches) {
    for (const match of moneyMatches) {
      const value = parseFloat(match.replace('R$', '').replace('.', '').replace(',', '.').trim());
      
      // If claiming economy value, check if we have calculation data
      if (value > 100 && !context.funnelState.hasSimulation) {
        // Large value claim without simulation
        if (responseText.toLowerCase().includes('economia')) {
          issues.push(`Possível alucinação: valor de economia R$ ${value} sem simulação realizada`);
        }
      }
    }
  }
  
  // Check for percentage claims
  const percentPattern = /(\d+)[%]?\s*(de economia|de desconto|por cento)/gi;
  if (responseText.match(percentPattern) && !context.funnelState.hasSimulation) {
    issues.push('Possível alucinação: percentual de economia mencionado sem simulação');
  }
  
  return {
    type: 'hallucination_detection',
    passed: issues.length === 0,
    message: issues.join('; '),
    severity: issues.length > 0 ? 'warning' : 'info'
  };
}

/**
 * Check response tone
 */
function checkTone(
  reasoning: ReasoningResult,
  context: FullContext
): ValidationCheck {
  const responseText = reasoning.responseText || '';
  const issues: string[] = [];
  
  // Check for overly aggressive language
  const aggressivePatterns = [
    /você (está|tá) errado/i,
    /isso não faz sentido/i,
    /você não entende/i,
    /que absurdo/i,
    /impossível/i
  ];
  
  for (const pattern of aggressivePatterns) {
    if (pattern.test(responseText)) {
      issues.push(`Tom agressivo detectado: ${pattern.source}`);
    }
  }
  
  // Check for inappropriate casual language in formal contexts
  if (context.clientProfile.preferredTone === 'formal') {
    const casualPatterns = [
      /\bgalera\b/i,
      /\bmano\b/i,
      /\bvéi\b/i,
      /\btá ligado\b/i
    ];
    
    for (const pattern of casualPatterns) {
      if (pattern.test(responseText)) {
        issues.push(`Linguagem casual em contexto formal: ${pattern.source}`);
      }
    }
  }
  
  // Check sentiment alignment
  if (context.intake.sentiment < -0.5 && reasoning.responseTone === 'enthusiastic') {
    issues.push('Tom entusiasmado pode não ser apropriado para cliente frustrado');
  }
  
  return {
    type: 'tone_check',
    passed: issues.length === 0,
    message: issues.join('; '),
    severity: issues.length > 0 ? 'warning' : 'info'
  };
}

/**
 * Check for sensitive data exposure
 */
function checkSensitiveData(
  reasoning: ReasoningResult
): ValidationCheck {
  const responseText = reasoning.responseText || '';
  const issues: string[] = [];
  
  // Check for CPF exposure (should be masked)
  const cpfPattern = /\d{3}\.\d{3}\.\d{3}-\d{2}/g;
  if (cpfPattern.test(responseText)) {
    issues.push('CPF completo exposto na resposta - deve ser mascarado');
  }
  
  // Check for full phone numbers
  const phonePattern = /\(?(\d{2})\)?\s*9?\d{4}[-.\s]?\d{4}/g;
  const phoneMatches = responseText.match(phonePattern);
  if (phoneMatches && phoneMatches.length > 1) {
    issues.push('Múltiplos telefones expostos na resposta');
  }
  
  // Check for internal IDs
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  if (uuidPattern.test(responseText)) {
    issues.push('UUID interno exposto na resposta');
  }
  
  // Check for technical errors
  const errorPatterns = [
    /error:/i,
    /exception/i,
    /stack trace/i,
    /undefined/i,
    /null pointer/i,
    /\[object Object\]/i
  ];
  
  for (const pattern of errorPatterns) {
    if (pattern.test(responseText)) {
      issues.push(`Erro técnico exposto: ${pattern.source}`);
    }
  }
  
  return {
    type: 'sensitive_data_check',
    passed: issues.length === 0,
    message: issues.join('; '),
    severity: issues.length > 0 ? 'critical' : 'info'
  };
}

/**
 * Check for broken promises or unrealistic commitments
 */
function checkPromiseGuard(
  reasoning: ReasoningResult,
  context: FullContext
): ValidationCheck {
  const responseText = reasoning.responseText || '';
  const issues: string[] = [];
  
  // Detect time-based promises
  const urgentPromises = [
    { pattern: /em (\d+) minutos/i, maxMinutes: 30 },
    { pattern: /já já/i, maxMinutes: 5 },
    { pattern: /agora mesmo/i, maxMinutes: 2 },
    { pattern: /imediatamente/i, maxMinutes: 1 }
  ];
  
  for (const promise of urgentPromises) {
    if (promise.pattern.test(responseText)) {
      const match = responseText.match(promise.pattern);
      if (match && match[1]) {
        const minutes = parseInt(match[1]);
        if (minutes < promise.maxMinutes) {
          issues.push(`Promessa de tempo muito curta: ${match[0]}`);
        }
      }
    }
  }
  
  // Detect financial promises without backing
  if (!context.funnelState.hasSimulation && !context.funnelState.hasProposal) {
    if (/vou te enviar.*proposta/i.test(responseText)) {
      issues.push('Promessa de proposta sem dados suficientes para gerar');
    }
  }
  
  return {
    type: 'promise_guard',
    passed: issues.length === 0,
    message: issues.join('; '),
    severity: issues.length > 0 ? 'warning' : 'info'
  };
}

/**
 * Check for proper URL handling
 */
function checkURLGuard(
  reasoning: ReasoningResult
): ValidationCheck {
  const responseText = reasoning.responseText || '';
  const issues: string[] = [];
  
  // Check for placeholder URLs
  const placeholderPatterns = [
    /\[PROPOSTA_LINK\]/i,
    /\[LINK\]/i,
    /\{url\}/i,
    /\{link\}/i,
    /example\.com/i,
    /localhost/i
  ];
  
  for (const pattern of placeholderPatterns) {
    if (pattern.test(responseText)) {
      issues.push(`Placeholder de URL não resolvido: ${pattern.source}`);
    }
  }
  
  // Check for broken markdown links
  const brokenLinkPattern = /\[([^\]]+)\]\(\s*\)/;
  if (brokenLinkPattern.test(responseText)) {
    issues.push('Link markdown com URL vazia');
  }
  
  return {
    type: 'url_guard',
    passed: issues.length === 0,
    message: issues.join('; '),
    severity: issues.length > 0 ? 'error' : 'info'
  };
}

// ============================================
// HARD STOP CHECKS (DETERMINISTIC BUSINESS RULES)
// ============================================

/**
 * CRITICAL: Block document requests via WhatsApp
 * Documents must ONLY be collected via platform link
 */
function checkDocumentRequestViaWhatsApp(
  reasoning: ReasoningResult,
  context: FullContext
): ValidationCheck {
  const responseText = reasoning.responseText || '';
  const issues: string[] = [];
  
  // Patterns that indicate asking for documents via chat
  const documentRequestPatterns = [
    /\b(envi[ae]|mand[ae]|anexe|anexar?).{0,30}(documento|rg|cnh|identidade|fatura|conta|contrato|comprovante)/i,
    /\b(documento|rg|cnh|identidade|foto).{0,30}(aqui|no\s+whatsapp|por\s+aqui|nessa\s+conversa)/i,
    /\bpreciso\s+(de|que).{0,30}(documento|rg|cnh|foto|scan|digitaliza)/i,
    /\bpode\s+enviar.{0,30}(documento|rg|cnh|foto|pdf)/i,
    /\baguardando.{0,30}(documento|foto|pdf|comprovante)/i,
    /\bfoto\s+(da|de).{0,20}(conta|fatura|rg|cnh|documento)/i,
    /\b(rg|cnh|documento|identidade).{0,30}(enviar?|mandar?|foto)/i,
  ];
  
  for (const pattern of documentRequestPatterns) {
    if (pattern.test(responseText)) {
      issues.push(`Pedido de documento via WhatsApp detectado: ${pattern.source}`);
    }
  }
  
  return {
    type: 'document_request_whatsapp',
    passed: issues.length === 0,
    message: issues.join('; '),
    severity: issues.length > 0 ? 'critical' : 'info',
    autoFixed: issues.length > 0,
    fixApplied: issues.length > 0 ? 'Substituir por instrução de usar link da plataforma' : undefined
  };
}

/**
 * CRITICAL: Block proposal promises without email
 */
function checkProposalWithoutEmail(
  reasoning: ReasoningResult,
  context: FullContext
): ValidationCheck {
  const responseText = reasoning.responseText || '';
  const issues: string[] = [];
  
  // Check if promising proposal
  const proposalPromisePatterns = [
    /vou\s+(te\s+)?enviar.{0,30}proposta/i,
    /sua\s+proposta.{0,20}(está|vai|será).{0,20}(pronta|enviada)/i,
    /preparan?do\s+sua\s+proposta/i,
    /link\s+da\s+proposta/i,
    /segue.{0,20}proposta/i,
  ];
  
  const isPromisingProposal = proposalPromisePatterns.some(p => p.test(responseText));
  
  if (isPromisingProposal) {
    // Check if we have email
    const funnelData = (context.funnelState as any) || {};
    const hasEmail = !!(
      context.clientProfile?.email ||
      funnelData.email ||
      (context as any).extractedData?.email
    );
    
    if (!hasEmail) {
      issues.push('Promessa de proposta sem email confirmado');
    }
  }
  
  return {
    type: 'proposal_without_email',
    passed: issues.length === 0,
    message: issues.join('; '),
    severity: issues.length > 0 ? 'critical' : 'info',
    autoFixed: issues.length > 0,
    fixApplied: issues.length > 0 ? 'Solicitar email antes de prometer proposta' : undefined
  };
}

/**
 * Check if LLM ignored the minimum bill threshold
 */
function checkMinimumBillMention(
  reasoning: ReasoningResult,
  context: FullContext
): ValidationCheck {
  const responseText = reasoning.responseText || '';
  const issues: string[] = [];
  
  // Get bill value from context
  const funnelData = (context.funnelState as any) || {};
  const valorFatura = 
    funnelData.valorFatura ||
    (context as any).extractedData?.valorFatura ||
    context.clientProfile?.valorFatura;
  
  // If we have a value below threshold (300) but response doesn't acknowledge disqualification
  if (valorFatura && typeof valorFatura === 'number' && valorFatura < 300) {
    const acknowledgesDisqualification = 
      /abaixo.{0,30}(limite|mínimo)/i.test(responseText) ||
      /conta.{0,30}(baixa|pequena)/i.test(responseText) ||
      /inviável/i.test(responseText) ||
      /não\s+atende.{0,30}requisito/i.test(responseText) ||
      /infelizmente/i.test(responseText);
    
    if (!acknowledgesDisqualification) {
      issues.push(`Valor R$ ${valorFatura} abaixo do mínimo R$ 300 mas LLM não reconheceu desqualificação`);
    }
  }
  
  return {
    type: 'minimum_bill_ignored',
    passed: issues.length === 0,
    message: issues.join('; '),
    severity: issues.length > 0 ? 'error' : 'info'
  };
}

/**
 * Check if triage is being triggered after commercial data exists
 */
function checkTriageAfterCommercialData(
  reasoning: ReasoningResult,
  context: FullContext
): ValidationCheck {
  const responseText = reasoning.responseText || '';
  const issues: string[] = [];
  
  // Check if response is asking about client status (triage question)
  const triagePatterns = [
    /já\s+(é|sou)\s+cliente/i,
    /você\s+é\s+cliente/i,
    /já\s+tem\s+contrato/i,
    /cliente\s+ou\s+quer\s+ser/i,
  ];
  
  const isAskingTriageQuestion = triagePatterns.some(p => p.test(responseText));
  
  if (isAskingTriageQuestion) {
    // Check if we already have commercial data
    const funnelData = (context.funnelState as any) || {};
    const hasCommercialData = !!(
      funnelData.distribuidora ||
      funnelData.valorFatura ||
      context.clientProfile?.distribuidora ||
      (context as any).propostaId
    );
    
    if (hasCommercialData) {
      issues.push('Triagem disparada após dados comerciais já coletados');
    }
  }
  
  return {
    type: 'triage_after_commercial_data',
    passed: issues.length === 0,
    message: issues.join('; '),
    severity: issues.length > 0 ? 'warning' : 'info'
  };
}

/**
 * Check response length
 */
function checkLength(
  reasoning: ReasoningResult
): ValidationCheck {
  const responseText = reasoning.responseText || '';
  const issues: string[] = [];
  let autoFixed = false;
  let fixApplied: string | undefined;
  
  // WhatsApp has a 4096 character limit per message
  const MAX_LENGTH = 4000; // Leave some buffer
  const MIN_LENGTH = 10;
  
  if (responseText.length > MAX_LENGTH) {
    issues.push(`Resposta muito longa: ${responseText.length} caracteres (max: ${MAX_LENGTH})`);
  }
  
  if (responseText.length < MIN_LENGTH && responseText.length > 0) {
    issues.push(`Resposta muito curta: ${responseText.length} caracteres`);
  }
  
  // Check for empty response
  if (responseText.trim().length === 0) {
    issues.push('Resposta vazia');
  }
  
  return {
    type: 'length_check',
    passed: issues.length === 0,
    message: issues.join('; '),
    severity: issues.length > 0 ? 'error' : 'info',
    autoFixed,
    fixApplied
  };
}

// ============================================
// RESPONSE MODIFIER
// ============================================

function applyFixes(
  responseText: string,
  checks: ValidationCheck[],
  context: FullContext
): { modified: string; fixesApplied: string[] } {
  let modified = responseText;
  const fixesApplied: string[] = [];
  
  // Fix: Truncate if too long
  const lengthCheck = checks.find(c => c.type === 'length_check');
  if (lengthCheck && !lengthCheck.passed && modified.length > 4000) {
    modified = modified.substring(0, 3900) + '...\n\n(mensagem continuará)';
    fixesApplied.push('Mensagem truncada por exceder limite');
  }
  
  // Fix: Mask exposed CPFs
  const cpfPattern = /(\d{3})\.\d{3}\.(\d{3})-\d{2}/g;
  if (cpfPattern.test(modified)) {
    modified = modified.replace(cpfPattern, '$1.***.***-**');
    fixesApplied.push('CPFs mascarados automaticamente');
  }
  
  // Fix: Remove UUIDs
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const beforeUuid = modified;
  modified = modified.replace(uuidPattern, '[ref]');
  if (modified !== beforeUuid) {
    fixesApplied.push('IDs internos removidos');
  }
  
  // CRITICAL FIX: Replace document request with platform link instruction
  const docCheck = checks.find(c => c.type === 'document_request_whatsapp');
  if (docCheck && !docCheck.passed) {
    const proposalUrl = (context as any).proposalUrl || (context.funnelState as any)?.proposalUrl;
    const clienteName = context.clientProfile?.name || '';
    const firstName = clienteName?.split(' ')[0] || '';
    const greeting = firstName ? `${firstName}, ` : '';
    
    if (proposalUrl) {
      modified = `${greeting}para sua segurança, os documentos devem ser enviados através do link da sua proposta! 🔒

📎 Acesse aqui: ${proposalUrl}

Clique em *"Quero minha Proposta Definitiva"* para anexar os arquivos de forma segura.

Isso protege seus dados pessoais! 💚`;
    } else {
      modified = `${greeting}os documentos devem ser enviados de forma segura através da plataforma! 🔒

Assim que sua proposta estiver pronta, você receberá um link exclusivo para anexar os documentos com total segurança.

Aguarde só mais um pouquinho! 💚`;
    }
    fixesApplied.push('Pedido de documento via WhatsApp substituído por instrução da plataforma');
  }
  
  // CRITICAL FIX: Replace proposal promise with email request
  const emailCheck = checks.find(c => c.type === 'proposal_without_email');
  if (emailCheck && !emailCheck.passed) {
    const clienteName = context.clientProfile?.name || '';
    const firstName = clienteName?.split(' ')[0] || '';
    const greeting = firstName ? `${firstName}, ` : '';
    
    modified = `${greeting}para preparar sua proposta personalizada, preciso do seu *e-mail*! 📧

Assim você recebe todos os detalhes da economia que podemos oferecer.

Qual é o seu e-mail?`;
    fixesApplied.push('Promessa de proposta substituída por solicitação de email');
  }
  
  return { modified, fixesApplied };
}

// ============================================
// MAIN VALIDATION EXECUTOR
// ============================================

export async function executeValidation(
  reasoning: ReasoningResult,
  context: FullContext,
  action: ActionResult,
  supabase?: any
): Promise<ValidationResult> {
  const startTime = Date.now();
  const checks: ValidationCheck[] = [];
  
  console.log('[validation] Running guardrail checks');
  
  // Run all checks (including new hard stops)
  checks.push(checkContradictions(reasoning, context));
  checks.push(checkRuleCompliance(reasoning, context));
  checks.push(checkHallucination(reasoning, context));
  checks.push(checkTone(reasoning, context));
  checks.push(checkSensitiveData(reasoning));
  checks.push(checkPromiseGuard(reasoning, context));
  checks.push(checkURLGuard(reasoning));
  checks.push(checkLength(reasoning));
  
  // Built-in hard stop checks for deterministic business rules
  checks.push(checkDocumentRequestViaWhatsApp(reasoning, context));
  checks.push(checkProposalWithoutEmail(reasoning, context));
  checks.push(checkMinimumBillMention(reasoning, context));
  checks.push(checkTriageAfterCommercialData(reasoning, context));
  
  // Phase 47: Database-loaded guardrails enforcement
  let dbGuardrailModified: string | undefined;
  if (supabase && reasoning.responseText) {
    const guardrailCtx: GuardrailContext = {
      agentId: (context as any).agentId || 'sofia',
      funnelStage: context.funnelState?.stage,
      hasEmail: !!context.clientProfile?.email,
      hasProposalId: !!context.funnelState?.hasProposal,
      proposalUrl: (context as any).proposalUrl,
      clientName: context.clientProfile?.name,
      conversaId: (context as any).conversaId,
      clientPhone: (context as any).clientPhone,
    };
    
    const dbGuardrailResult = await enforcePostLLMGuardrails(
      supabase,
      reasoning.responseText,
      guardrailCtx
    );
    
    if (dbGuardrailResult.triggered) {
      checks.push({
        type: `db_guardrail_${dbGuardrailResult.rule_code}`,
        passed: false,
        message: `Guardrail DB: ${dbGuardrailResult.rule_name} - ${dbGuardrailResult.trigger_match}`,
        severity: dbGuardrailResult.severity as 'critical' | 'error' | 'warning' | 'info',
        autoFixed: dbGuardrailResult.action_taken === 'replaced',
        fixApplied: dbGuardrailResult.action_taken === 'replaced' ? 'Substituído por template do guardrail' : undefined,
      });
      
      if (dbGuardrailResult.modified_text) {
        dbGuardrailModified = dbGuardrailResult.modified_text;
        console.log(`[validation] DB Guardrail applied replacement for: ${dbGuardrailResult.rule_code}`);
      }
    }
  }
  
  // Determine overall pass/fail
  const criticalFailures = checks.filter(c => !c.passed && c.severity === 'critical');
  const errorFailures = checks.filter(c => !c.passed && c.severity === 'error');
  const warnings = checks.filter(c => !c.passed && c.severity === 'warning');
  
  const overallPassed = criticalFailures.length === 0 && errorFailures.length === 0;
  
  // Apply automatic fixes (including critical fixes for hard stops)
  let modifiedResponse: string | undefined = dbGuardrailModified;
  
  if (!modifiedResponse && reasoning.responseText) {
    const { modified, fixesApplied } = applyFixes(reasoning.responseText, checks, context);
    if (fixesApplied.length > 0) {
      modifiedResponse = modified;
      console.log(`[validation] Applied ${fixesApplied.length} fixes:`, fixesApplied);
    }
  }
  
  // Determine if escalation is needed
  const escalationRequired = criticalFailures.length > 0 || 
    (errorFailures.length >= 2) ||
    (warnings.length >= 3);
  
  const escalationReason = escalationRequired
    ? `Validação falhou: ${criticalFailures.length} críticos, ${errorFailures.length} erros, ${warnings.length} avisos`
    : undefined;
  
  const blockedReason = !overallPassed && criticalFailures.length > 0
    ? criticalFailures.map(c => c.message).join('; ')
    : undefined;
  
  const validationDurationMs = Date.now() - startTime;
  
  console.log(`[validation] Completed in ${validationDurationMs}ms: passed=${overallPassed}, escalate=${escalationRequired}, dbGuardrails=${!!dbGuardrailModified}`);
  
  return {
    overallPassed,
    checks,
    blockedReason,
    modifiedResponse,
    escalationRequired,
    escalationReason,
    validationDurationMs
  };
}
