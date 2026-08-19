/**
 * Technical Issues Handler Module
 * Handles detection and resolution of technical issues (broken links, emails, etc.)
 * Extracted from sofia-webhook for modularity
 * 
 * Phase 6: Now uses detection patterns from database (zero hardcode)
 */

import { 
  matchesPatternCategory,
  type PatternEntry 
} from './detection-patterns.ts';

import { getTechIssueMessage } from './message-templates.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type TechnicalIssueType = 
  | 'link_quebrado' 
  | 'email_nao_recebido' 
  | 'pdf_nao_carrega' 
  | 'contrato_nao_chegou'
  | 'proposta_nao_recebida'
  | 'problema_generico'
  | null;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface TechnicalIssueDetection {
  detected: boolean;
  issueType: TechnicalIssueType;
  confidence: ConfidenceLevel;
  originalMessage: string;
}

export interface TechnicalIssueResolution {
  resolved: boolean;
  action: 'reenvio_link' | 'verificacao_email' | 'oferta_whatsapp' | 'escalacao_humana';
  message: string;
  novoLink?: string;
  shouldEscalate: boolean;
  attemptCount: number;
}

// ═══════════════════════════════════════════════════════════════
// DETECTION FUNCTIONS (using database patterns)
// ═══════════════════════════════════════════════════════════════

/**
 * Quick keyword-based detection (fast, before AI)
 * Uses database patterns from sofia_detection_patterns
 */
export function quickDetectTechnicalIssue(
  message: string,
  patterns?: Map<string, PatternEntry>
): TechnicalIssueDetection {
  if (matchesPatternCategory(message, 'tech_link_quebrado', patterns)) {
    return { detected: true, issueType: 'link_quebrado', confidence: 'high', originalMessage: message };
  }
  
  if (matchesPatternCategory(message, 'tech_email_nao_recebido', patterns)) {
    return { detected: true, issueType: 'email_nao_recebido', confidence: 'high', originalMessage: message };
  }
  
  if (matchesPatternCategory(message, 'tech_pdf_nao_carrega', patterns)) {
    return { detected: true, issueType: 'pdf_nao_carrega', confidence: 'high', originalMessage: message };
  }
  
  if (matchesPatternCategory(message, 'tech_contrato_nao_chegou', patterns)) {
    return { detected: true, issueType: 'contrato_nao_chegou', confidence: 'high', originalMessage: message };
  }
  
  return { detected: false, issueType: null, confidence: 'low', originalMessage: message };
}

/**
 * AI-based detection for complex/ambiguous technical issue cases
 * Uses LLM to understand nuanced complaints
 */
export async function aiDetectTechnicalIssue(
  message: string,
  lovableApiKey?: string
): Promise<TechnicalIssueDetection> {
  if (!lovableApiKey) {
    console.log('[TECH_ISSUE] No API key, falling back to quick detection');
    return quickDetectTechnicalIssue(message);
  }
  
  try {
    const prompt = `Analise a mensagem do cliente e determine se ele está relatando um PROBLEMA TÉCNICO.

Problemas técnicos incluem:
- link_quebrado: Link não funciona, página não carrega, erro ao acessar proposta
- email_nao_recebido: Email não chegou, não recebeu proposta por email
- pdf_nao_carrega: PDF não abre, documento corrompido, página em branco
- contrato_nao_chegou: Contrato não foi recebido, aguardando para assinar
- proposta_nao_recebida: Não recebeu a proposta de nenhuma forma
- problema_generico: Outro problema técnico não categorizado

Mensagem do cliente: "${message}"

Responda APENAS com JSON:
{
  "detected": true/false,
  "issueType": "link_quebrado" | "email_nao_recebido" | "pdf_nao_carrega" | "contrato_nao_chegou" | "proposta_nao_recebida" | "problema_generico" | null,
  "confidence": "high" | "medium" | "low"
}`;

    const response = await fetch('https://lovable.dev/api/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      console.log('[TECH_ISSUE] AI detection failed, falling back to keywords');
      return quickDetectTechnicalIssue(message);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        detected: parsed.detected === true,
        issueType: parsed.issueType || null,
        confidence: parsed.confidence || 'medium',
        originalMessage: message,
      };
    }
    
    return quickDetectTechnicalIssue(message);
  } catch (error) {
    console.error('[TECH_ISSUE] AI detection error:', error);
    return quickDetectTechnicalIssue(message);
  }
}

/**
 * Combined detection: quick first, then AI for ambiguous cases
 */
export async function detectTechnicalIssue(
  message: string,
  lovableApiKey?: string,
  patterns?: Map<string, PatternEntry>
): Promise<TechnicalIssueDetection> {
  const quickResult = quickDetectTechnicalIssue(message, patterns);
  
  if (quickResult.detected && quickResult.confidence === 'high') {
    console.log(`[TECH_ISSUE] Quick detection: ${quickResult.issueType}`);
    return quickResult;
  }
  
  if (lovableApiKey) {
    const aiResult = await aiDetectTechnicalIssue(message, lovableApiKey);
    console.log(`[TECH_ISSUE] AI detection: ${aiResult.issueType} (${aiResult.confidence})`);
    return aiResult;
  }
  
  return quickResult;
}

/**
 * Gets attempt count from dados_coletados
 */
export function getTechIssueAttemptCount(
  dadosColetados: Record<string, unknown> | null, 
  issueType: TechnicalIssueType
): number {
  if (!dadosColetados || !issueType) return 0;
  const key = `tech_issue_attempts_${issueType}`;
  return (dadosColetados[key] as number) || 0;
}

/**
 * Generates resolution message based on issue type and attempt count
 */
export function generateResolutionMessage(
  issueType: TechnicalIssueType,
  attemptCount: number,
  clienteNome: string | null,
  context: {
    novoLink?: string;
    emailCadastrado?: string | null;
    hasProposal?: boolean;
  }
): TechnicalIssueResolution {
  const clientFirstName = clienteNome?.split(' ')[0] || '';
  const nextAttempt = attemptCount + 1;
  
  // After 2 failed attempts, escalate to human
  if (nextAttempt > 2) {
    return {
      resolved: false,
      action: 'escalacao_humana',
      message: clientFirstName
        ? `${clientFirstName}, peço desculpas pelo transtorno! 😔 Vou passar seu caso para a minha supervisora, a Chris, que vai resolver isso pra você pessoalmente. Ela entra em contato em breve, ok?`
        : `Peço desculpas pelo transtorno! 😔 Vou passar seu caso para a minha supervisora, a Chris, que vai resolver isso pra você pessoalmente. Ela entra em contato em breve, ok?`,
      shouldEscalate: true,
      attemptCount: nextAttempt,
    };
  }
  
  switch (issueType) {
    case 'link_quebrado':
    case 'pdf_nao_carrega':
    case 'proposta_nao_recebida': {
      if (context.novoLink) {
        const message = nextAttempt === 1
          ? (clientFirstName
            ? `${clientFirstName}, desculpa pelo inconveniente! 😅 Regenerei o link da sua proposta com um novo endereço:\n\n📄 ${context.novoLink}\n\nTenta acessar agora? Qualquer coisa me avisa! 😊`
            : `Desculpa pelo inconveniente! 😅 Regenerei o link da sua proposta:\n\n📄 ${context.novoLink}\n\nTenta acessar agora? Qualquer coisa me avisa! 😊`)
          : (clientFirstName
            ? `${clientFirstName}, vou tentar de outra forma! Gerei um link completamente novo:\n\n📄 ${context.novoLink}\n\nSe ainda não funcionar, posso te enviar por WhatsApp mesmo, ok? Me avisa! 📲`
            : `Vou tentar de outra forma! Gerei um link completamente novo:\n\n📄 ${context.novoLink}\n\nSe ainda não funcionar, posso te enviar por WhatsApp mesmo, ok? Me avisa! 📲`);
        
        return {
          resolved: true,
          action: 'reenvio_link',
          message,
          novoLink: context.novoLink,
          shouldEscalate: false,
          attemptCount: nextAttempt,
        };
      }
      
      return {
        resolved: false,
        action: 'oferta_whatsapp',
        message: clientFirstName
          ? `${clientFirstName}, não encontrei uma proposta vinculada a você ainda. Quer que eu gere uma nova proposta agora? Me passa seu consumo médio mensal (em kWh ou R$) e sua distribuidora que faço na hora! ⚡`
          : `Não encontrei uma proposta vinculada a você ainda. Quer que eu gere uma nova proposta agora? Me passa seu consumo médio mensal (em kWh ou R$) e sua distribuidora que faço na hora! ⚡`,
        shouldEscalate: false,
        attemptCount: nextAttempt,
      };
    }
    
    case 'email_nao_recebido': {
      if (nextAttempt === 1) {
        const emailDisplay = context.emailCadastrado || 'não cadastrado';
        return {
          resolved: false,
          action: 'verificacao_email',
          message: clientFirstName
            ? `${clientFirstName}, o email que tenho cadastrado é: *${emailDisplay}*\n\nEstá correto? Às vezes cai na caixa de spam/lixo eletrônico. Dá uma olhadinha lá! 📧\n\nSe preferir, posso te enviar o link da proposta aqui mesmo pelo WhatsApp! 📲`
            : `O email que tenho cadastrado é: *${emailDisplay}*\n\nEstá correto? Às vezes cai na caixa de spam/lixo eletrônico. Dá uma olhadinha lá! 📧\n\nSe preferir, posso te enviar o link da proposta aqui mesmo pelo WhatsApp! 📲`,
          shouldEscalate: false,
          attemptCount: nextAttempt,
        };
      }
      
      if (context.novoLink) {
        return {
          resolved: true,
          action: 'oferta_whatsapp',
          message: clientFirstName
            ? `${clientFirstName}, sem problemas! Segue o link da sua proposta direto aqui pelo WhatsApp:\n\n📄 ${context.novoLink}\n\nAssim não precisa de email! 😊`
            : `Sem problemas! Segue o link da sua proposta direto aqui pelo WhatsApp:\n\n📄 ${context.novoLink}\n\nAssim não precisa de email! 😊`,
          novoLink: context.novoLink,
          shouldEscalate: false,
          attemptCount: nextAttempt,
        };
      }
      
      return {
        resolved: false,
        action: 'oferta_whatsapp',
        message: clientFirstName
          ? `${clientFirstName}, ainda não localizei uma proposta no seu nome. Vamos gerar uma nova? Me passa seu consumo médio e distribuidora! ⚡`
          : `Ainda não localizei uma proposta no seu nome. Vamos gerar uma nova? Me passa seu consumo médio e distribuidora! ⚡`,
        shouldEscalate: false,
        attemptCount: nextAttempt,
      };
    }
    
    case 'contrato_nao_chegou': {
      return {
        resolved: false,
        action: 'verificacao_email',
        message: clientFirstName
          ? `${clientFirstName}, vou verificar o status do seu contrato! 📋\n\nO contrato é enviado depois que nossa equipe de backoffice analisa os documentos. Às vezes pode demorar algumas horas úteis.\n\nQuer que eu verifique em que etapa está? Me confirma seu nome completo e CPF/CNPJ para eu consultar! 🔍`
          : `Vou verificar o status do seu contrato! 📋\n\nO contrato é enviado depois que nossa equipe de backoffice analisa os documentos. Às vezes pode demorar algumas horas úteis.\n\nQuer que eu verifique em que etapa está? Me confirma seu nome completo e CPF/CNPJ para eu consultar! 🔍`,
        shouldEscalate: false,
        attemptCount: nextAttempt,
      };
    }
    
    default: {
      return {
        resolved: false,
        action: 'oferta_whatsapp',
        message: clientFirstName
          ? `${clientFirstName}, me conta melhor o que está acontecendo? Assim posso te ajudar da melhor forma! 🤔`
          : `Me conta melhor o que está acontecendo? Assim posso te ajudar da melhor forma! 🤔`,
        shouldEscalate: false,
        attemptCount: nextAttempt,
      };
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT COMPLAINT DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Detects if client is complaining about already having sent documents
 * Uses database patterns (tech_document_complaint category)
 */
export function detectDocumentComplaint(
  message: string,
  patterns?: Map<string, PatternEntry>
): boolean {
  return matchesPatternCategory(message, 'tech_document_complaint', patterns);
}

/**
 * Detects if client is complaining about proposal delay
 * Uses database patterns (tech_proposal_delay category)
 */
export function detectProposalDelayComplaint(
  message: string,
  patterns?: Map<string, PatternEntry>
): boolean {
  return matchesPatternCategory(message, 'tech_proposal_delay', patterns);
}

// ═══════════════════════════════════════════════════════════════
// FULL RESOLUTION HANDLER (with database operations)
// ═══════════════════════════════════════════════════════════════

export interface ResolveTechnicalIssueParams {
  supabase: any;
  conversaId: string;
  propostaId: string | null;
  bitrixLeadId: string | null;
  phone: string;
  clienteNome: string | null;
  emailCadastrado: string | null;
  issueType: TechnicalIssueType;
  attemptCount: number;
  dadosColetados: Record<string, unknown> | null;
}

/**
 * Full resolution handler that performs database operations
 * Regenerates links, updates Bitrix, logs recovery, etc.
 */
export async function resolveTechnicalIssue(
  params: ResolveTechnicalIssueParams
): Promise<TechnicalIssueResolution> {
  const {
    supabase,
    conversaId,
    propostaId,
    bitrixLeadId,
    phone,
    clienteNome,
    emailCadastrado,
    issueType,
    attemptCount,
  } = params;

  const clientFirstName = clienteNome?.split(' ')[0] || '';
  const nextAttempt = attemptCount + 1;

  console.log(`[TECH_RESOLVE] Resolving ${issueType}, attempt ${nextAttempt}`);

  // After 2 failed attempts, escalate to human
  if (nextAttempt > 2) {
    console.log(`[TECH_RESOLVE] Max attempts reached, escalating to human`);
    return {
      resolved: false,
      action: 'escalacao_humana',
      message: clientFirstName
        ? `${clientFirstName}, peço desculpas pelo transtorno! 😔 Vou passar seu caso para a minha supervisora, a Chris, que vai resolver isso pra você pessoalmente. Ela entra em contato em breve, ok?`
        : `Peço desculpas pelo transtorno! 😔 Vou passar seu caso para a minha supervisora, a Chris, que vai resolver isso pra você pessoalmente. Ela entra em contato em breve, ok?`,
      shouldEscalate: true,
      attemptCount: nextAttempt,
    };
  }

  // Resolution strategies based on issue type
  switch (issueType) {
    case 'link_quebrado':
    case 'pdf_nao_carrega':
    case 'proposta_nao_recebida': {
      if (propostaId) {
        try {
          const { data: cacheBustConfig } = await supabase
            .from('configuracoes_sistema')
            .select('valor')
            .eq('chave', 'public_cache_bust')
            .single();

          const cacheBust = cacheBustConfig?.valor || Date.now().toString();

          const { data: publicUrlConfig } = await supabase
            .from('configuracoes_sistema')
            .select('valor')
            .eq('chave', 'public_proposal_base_url')
            .single();

          const baseUrl = publicUrlConfig?.valor || 'https://coesa-propose-craft.lovable.app';
          const novoLink = `${baseUrl}/proposta-inicial/${propostaId}?v=${cacheBust}&t=${Date.now()}`;

          // Update Bitrix24 if available
          if (bitrixLeadId) {
            try {
              const { data: bitrixConfig } = await supabase
                .from('configuracoes_sistema')
                .select('chave, valor')
                .in('chave', ['bitrix24_webhook_url', 'bitrix24_custom_field_link_proposta']);

              const configMap: Record<string, string> = {};
              bitrixConfig?.forEach((c: { chave: string; valor: string }) => {
                configMap[c.chave] = c.valor;
              });

              if (configMap.bitrix24_webhook_url) {
                const linkField = configMap.bitrix24_custom_field_link_proposta || 'UF_CRM_1767885928302';
                await fetch(`${configMap.bitrix24_webhook_url}crm.lead.update`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    id: bitrixLeadId,
                    fields: { [linkField]: novoLink },
                  }),
                });
              }
            } catch (e) {
              console.error('[TECH_RESOLVE] Bitrix update failed:', e);
            }
          }

          // Log recovery
          await supabase.from('document_recovery_logs').insert({
            conversa_id: conversaId,
            document_type: 'link_proposta',
            recovery_source: `tech_issue_auto_fix_${issueType}`,
            was_successful: true,
            document_url: novoLink,
            cliente_telefone: phone,
          });

          const message = nextAttempt === 1
            ? (clientFirstName
                ? `${clientFirstName}, desculpa pelo inconveniente! 😅 Regenerei o link da sua proposta com um novo endereço:\n\n📄 ${novoLink}\n\nTenta acessar agora? Qualquer coisa me avisa! 😊`
                : `Desculpa pelo inconveniente! 😅 Regenerei o link da sua proposta:\n\n📄 ${novoLink}\n\nTenta acessar agora? Qualquer coisa me avisa! 😊`)
            : (clientFirstName
                ? `${clientFirstName}, vou tentar de outra forma! Gerei um link completamente novo:\n\n📄 ${novoLink}\n\nSe ainda não funcionar, posso te enviar por WhatsApp mesmo, ok? Me avisa! 📲`
                : `Vou tentar de outra forma! Gerei um link completamente novo:\n\n📄 ${novoLink}\n\nSe ainda não funcionar, posso te enviar por WhatsApp mesmo, ok? Me avisa! 📲`);

          return {
            resolved: true,
            action: 'reenvio_link',
            message,
            novoLink,
            shouldEscalate: false,
            attemptCount: nextAttempt,
          };
        } catch (error) {
          console.error('[TECH_RESOLVE] Link regeneration failed:', error);
        }
      }

      return {
        resolved: false,
        action: 'oferta_whatsapp',
        message: clientFirstName
          ? `${clientFirstName}, não encontrei uma proposta vinculada a você ainda. Quer que eu gere uma nova proposta agora? Me passa seu consumo médio mensal (em kWh ou R$) e sua distribuidora que faço na hora! ⚡`
          : `Não encontrei uma proposta vinculada a você ainda. Quer que eu gere uma nova proposta agora? Me passa seu consumo médio mensal (em kWh ou R$) e sua distribuidora que faço na hora! ⚡`,
        shouldEscalate: false,
        attemptCount: nextAttempt,
      };
    }

    case 'email_nao_recebido': {
      if (nextAttempt === 1) {
        const emailDisplay = emailCadastrado || 'não cadastrado';
        return {
          resolved: false,
          action: 'verificacao_email',
          message: clientFirstName
            ? `${clientFirstName}, o email que tenho cadastrado é: *${emailDisplay}*\n\nEstá correto? Às vezes cai na caixa de spam/lixo eletrônico. Dá uma olhadinha lá! 📧\n\nSe preferir, posso te enviar o link da proposta aqui mesmo pelo WhatsApp! 📲`
            : `O email que tenho cadastrado é: *${emailDisplay}*\n\nEstá correto? Às vezes cai na caixa de spam/lixo eletrônico. Dá uma olhadinha lá! 📧\n\nSe preferir, posso te enviar o link da proposta aqui mesmo pelo WhatsApp! 📲`,
          shouldEscalate: false,
          attemptCount: nextAttempt,
        };
      }

      if (propostaId) {
        const { data: cacheBustConfig } = await supabase
          .from('configuracoes_sistema')
          .select('valor')
          .eq('chave', 'public_cache_bust')
          .single();

        const cacheBust = cacheBustConfig?.valor || Date.now().toString();
        const { data: publicUrlConfig } = await supabase
          .from('configuracoes_sistema')
          .select('valor')
          .eq('chave', 'public_proposal_base_url')
          .single();

        const baseUrl = publicUrlConfig?.valor || 'https://coesa-propose-craft.lovable.app';
        const novoLink = `${baseUrl}/proposta-inicial/${propostaId}?v=${cacheBust}`;

        return {
          resolved: true,
          action: 'oferta_whatsapp',
          message: clientFirstName
            ? `${clientFirstName}, sem problemas! Segue o link da sua proposta direto aqui pelo WhatsApp:\n\n📄 ${novoLink}\n\nAssim não precisa de email! 😊`
            : `Sem problemas! Segue o link da sua proposta direto aqui pelo WhatsApp:\n\n📄 ${novoLink}\n\nAssim não precisa de email! 😊`,
          novoLink,
          shouldEscalate: false,
          attemptCount: nextAttempt,
        };
      }

      return {
        resolved: false,
        action: 'oferta_whatsapp',
        message: clientFirstName
          ? `${clientFirstName}, ainda não localizei uma proposta no seu nome. Vamos gerar uma nova? Me passa seu consumo médio e distribuidora! ⚡`
          : `Ainda não localizei uma proposta no seu nome. Vamos gerar uma nova? Me passa seu consumo médio e distribuidora! ⚡`,
        shouldEscalate: false,
        attemptCount: nextAttempt,
      };
    }

    case 'contrato_nao_chegou': {
      return {
        resolved: false,
        action: 'verificacao_email',
        message: clientFirstName
          ? `${clientFirstName}, vou verificar o status do seu contrato! 📋\n\nO contrato é enviado depois que nossa equipe de backoffice analisa os documentos. Às vezes pode demorar algumas horas úteis.\n\nQuer que eu verifique em que etapa está? Me confirma seu nome completo e CPF/CNPJ para eu consultar! 🔍`
          : `Vou verificar o status do seu contrato! 📋\n\nO contrato é enviado depois que nossa equipe de backoffice analisa os documentos. Às vezes pode demorar algumas horas úteis.\n\nQuer que eu verifique em que etapa está? Me confirma seu nome completo e CPF/CNPJ para eu consultar! 🔍`,
        shouldEscalate: false,
        attemptCount: nextAttempt,
      };
    }

    default: {
      return {
        resolved: false,
        action: 'oferta_whatsapp',
        message: clientFirstName
          ? `${clientFirstName}, me conta melhor o que está acontecendo? Assim posso te ajudar da melhor forma! 🤔`
          : `Me conta melhor o que está acontecendo? Assim posso te ajudar da melhor forma! 🤔`,
        shouldEscalate: false,
        attemptCount: nextAttempt,
      };
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// COMPLETE FLOW HANDLER (Phase 10)
// ═══════════════════════════════════════════════════════════════

export interface TechIssueFlowParams {
  supabase: any;
  conversaId: string;
  phone: string;
  clienteNome: string | null;
  messageText: string;
  messageId: string | null;
  propostaId: string | null;
  bitrixLeadId: string | null;
  emailCadastrado: string | null;
  existingDados: Record<string, unknown>;
  sendMessage: (phone: string, msg: string) => Promise<void>;
  detectionPatterns?: Map<string, any>;
}

export interface TechIssueFlowResult {
  handled: boolean;
  status: string;
  conversaId?: string;
  issueType?: TechnicalIssueType;
  action?: string;
  attemptCount?: number;
  escalated?: boolean;
  novoLink?: string;
}

/**
 * Complete technical issue flow handler
 * Detects, resolves, sends messages, and escalates if needed
 */
export async function handleTechnicalIssueFlow(
  params: TechIssueFlowParams
): Promise<TechIssueFlowResult> {
  const {
    supabase,
    conversaId,
    phone,
    clienteNome,
    messageText,
    messageId,
    propostaId,
    bitrixLeadId,
    emailCadastrado,
    existingDados,
    sendMessage,
    detectionPatterns,
  } = params;

  // Quick detection first
  const techIssue = quickDetectTechnicalIssue(messageText, detectionPatterns);
  
  if (!techIssue.detected || !techIssue.issueType) {
    return { handled: false, status: 'no_tech_issue' };
  }
  
  console.log(`[TECH_ISSUE_FLOW] Detected: ${techIssue.issueType} (confidence: ${techIssue.confidence})`);
  
  const attemptCount = getTechIssueAttemptCount(existingDados, techIssue.issueType);
  
  const resolution = await resolveTechnicalIssue({
    supabase,
    conversaId,
    propostaId,
    bitrixLeadId,
    phone,
    clienteNome,
    emailCadastrado,
    issueType: techIssue.issueType,
    attemptCount,
    dadosColetados: existingDados,
  });
  
  console.log(`[TECH_ISSUE_FLOW] Resolution: ${resolution.action}, attempt ${resolution.attemptCount}, shouldEscalate: ${resolution.shouldEscalate}`);
  
  // Update attempt count in dados_coletados
  const updatedDados = {
    ...existingDados,
    [`tech_issue_attempts_${techIssue.issueType}`]: resolution.attemptCount,
    last_tech_issue: techIssue.issueType,
    last_tech_issue_at: new Date().toISOString(),
  };
  
  // Send resolution message
  await sendMessage(phone, resolution.message);
  
  // Save both messages
  await supabase.from('chatbot_mensagens').insert([
    { conversa_id: conversaId, role: 'user', content: messageText, message_id: messageId || null },
    { conversa_id: conversaId, role: 'assistant', content: resolution.message },
  ]);
  
  // Update conversation state
  const conversaUpdate: Record<string, unknown> = {
    last_message_at: new Date().toISOString(),
    last_sofia_message_at: new Date().toISOString(),
    dados_coletados: updatedDados,
    awaiting_response: true,
    next_nudge_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
  
  // If escalating
  if (resolution.shouldEscalate) {
    conversaUpdate.needs_human_fallback = true;
    conversaUpdate.escalation_reason = `tech_issue_unresolved_${techIssue.issueType}`;
    conversaUpdate.escalated_at = new Date().toISOString();
    
    // Notify attendant
    const { data: plantaoAtendente } = await supabase
      .from('whatsapp_atendentes')
      .select('id, nome, telefone')
      .eq('is_plantao', true)
      .eq('is_active', true)
      .limit(1)
      .single();
    
    if (plantaoAtendente) {
      conversaUpdate.atendente_notificado_id = plantaoAtendente.id;
      conversaUpdate.atendente_notificado_nome = plantaoAtendente.nome;
      conversaUpdate.atendente_notificado_at = new Date().toISOString();
      
      // Send notification to attendant
      const notificationMsg = `🔧 *PROBLEMA TÉCNICO - PRECISA DE AJUDA*\n\n` +
        `👤 Cliente: ${clienteNome || phone}\n` +
        `📱 Telefone: ${phone}\n` +
        `❌ Problema: ${techIssue.issueType.replace(/_/g, ' ')}\n` +
        `🔄 Tentativas: ${resolution.attemptCount}\n\n` +
        `_Sofia não conseguiu resolver automaticamente._\n\n` +
        `Para assumir, envie *#ASSUMIR* na conversa do cliente.`;
      
      await sendMessage(plantaoAtendente.telefone, notificationMsg);
      
      console.log(`[TECH_ISSUE_FLOW] Notified attendant ${plantaoAtendente.nome} about escalation`);
    }
  }
  
  await supabase
    .from('chatbot_conversas')
    .update(conversaUpdate)
    .eq('id', conversaId);
  
  console.log(`[TECH_ISSUE_FLOW] Successfully handled ${techIssue.issueType}`);
  
  return {
    handled: true,
    status: 'tech_issue_handled',
    conversaId,
    issueType: techIssue.issueType,
    action: resolution.action,
    attemptCount: resolution.attemptCount,
    escalated: resolution.shouldEscalate,
    novoLink: resolution.novoLink,
  };
}
