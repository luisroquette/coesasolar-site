/**
 * Maria SAC Flow Module
 * Centralized identification and data verification flow for marIA (SAC agent)
 * 
 * Handles:
 * - Client identification via CPF/CNPJ
 * - Second factor verification (email)
 * - Data divergence detection and resolution
 * - CRM data rectification (Bitrix24)
 * - Automatic escalation to human attendants
 * - Redirect to commercial (sofIA)
 * 
 * Extracted from sofia-webhook/index.ts for reuse across Edge Functions
 */

import type { FullAgentConfig } from './ai-gym-config.ts';
import { 
  isValidCPF, 
  isValidCNPJ, 
  removeNonNumeric, 
  formatCPF, 
  formatCNPJ,
  extractEmail,
} from './validation-utils.ts';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type MariaIdentificationState = 
  | null 
  | 'awaiting_cpf_cnpj' 
  | 'awaiting_email_verification' 
  | 'awaiting_divergence_confirmation' 
  | 'identification_complete'
  | 'redirected_to_commercial';

export interface MariaTriageConfig {
  enabled: boolean;
  require_cpf_cnpj?: boolean;
  require_email_verification?: boolean;
  escalation_keywords?: string[];
  escalation_message?: string;
  identification?: {
    ask_email?: boolean;
    email_verification_message?: string;
    email_not_match_message?: string;
  };
}

export interface DivergenceEntry {
  field: string;
  field_label: string;
  crm_value: string;
  informed_value: string;
}

export interface CRMClientData {
  nome?: string;
  email?: string;
  telefone?: string;
  cpf_cnpj?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
}

export interface MariaIdentificationParams {
  supabase: any;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  phone: string;
  messageText: string;
  messageId: string | null;
  clienteNome: string | null;
  conversa: any | null;
  agentConfig: FullAgentConfig | null;
  agentId: string;
  triageConfig: MariaTriageConfig;
  sendMessage: (phone: string, message: string) => Promise<void>;
  getCoesaContact?: (supabase: any, identifier: string) => Promise<{ telefone: string } | null>;
  formatWhatsAppLink?: (phone: string) => string;
}

export interface MariaIdentificationResult {
  handled: boolean;
  status: string;
  conversaId?: string;
  data?: {
    clientFound?: boolean;
    divergences?: DivergenceEntry[];
    escalated?: boolean;
    redirected?: boolean;
    emailVerified?: boolean;
    dataUpdated?: boolean;
    firstMessage?: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS - Default escalation keywords
// ═══════════════════════════════════════════════════════════════

const DEFAULT_ESCALATION_KEYWORDS = [
  'falar com humano', 'atendente', 'atendimento humano',
  'estorno', 'devolução', 'devolver', 'reembolso',
  'processar', 'advogado', 'procon', 'justiça', 'processo',
  'reclamação', 'ouvidoria', 'reclameaqui',
  'desistir', 'cancelar contrato', 'cancelamento',
  'corte indevido', 'cortaram minha luz', 'cortou minha luz',
  'paguei em duplicidade', 'pagamento duplicado', 'cobrado duas vezes',
  'ameaça', 'fraude', 'golpe',
];

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Extract CPF or CNPJ from message text
 */
export function extractCpfCnpjFromMessage(text: string): { 
  value: string | null; 
  type: 'cpf' | 'cnpj' | null;
  isValid: boolean;
} {
  const digits = removeNonNumeric(text);
  
  if (digits.length === 11) {
    return { 
      value: digits, 
      type: 'cpf', 
      isValid: isValidCPF(digits) 
    };
  }
  
  if (digits.length === 14) {
    return { 
      value: digits, 
      type: 'cnpj', 
      isValid: isValidCNPJ(digits) 
    };
  }
  
  return { value: null, type: null, isValid: false };
}

/**
 * Format CPF/CNPJ for display
 */
export function formatCpfCnpjForDisplay(value: string): string {
  const digits = removeNonNumeric(value);
  
  if (digits.length === 11) {
    return formatCPF(digits);
  }
  
  if (digits.length === 14) {
    return formatCNPJ(digits);
  }
  
  return value;
}

/**
 * Detect if message contains escalation keywords
 */
export function detectEscalationKeywords(
  message: string, 
  customKeywords?: string[]
): boolean {
  const keywords = customKeywords?.length ? customKeywords : DEFAULT_ESCALATION_KEYWORDS;
  const lowerMessage = message.toLowerCase();
  return keywords.some(kw => lowerMessage.includes(kw.toLowerCase()));
}

/**
 * Detect if user wants to go to commercial/sales
 */
export function detectNewSaleIntent(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('comercial') || 
    lowerMessage.includes('quero ser cliente') ||
    lowerMessage.includes('nova proposta') ||
    lowerMessage.includes('quero contratar')
  );
}

/**
 * Build divergence list message
 */
export function buildDivergenceMessage(
  divergences: DivergenceEntry[], 
  clientName: string,
  isEmailStep: boolean = false
): string {
  const divergenceList = divergences.map((d) => 
    `• *${d.field_label}*: você informou "${d.informed_value}", mas no cadastro consta "${d.crm_value}"`
  ).join('\n');
  
  if (isEmailStep) {
    return `Hmm, *${clientName}*, o e-mail que você informou é diferente do que consta no cadastro. 🤔\n\nIdentifiquei as seguintes diferenças:\n\n${divergenceList}\n\nPara sua segurança, deseja atualizar o cadastro com as informações que você me passou? Responda *SIM* ou *NÃO*.`;
  }
  
  return `Encontrei você, *${clientName}*! 😊\n\nPorém identifiquei algumas diferenças nos seus dados:\n\n${divergenceList}\n\nDeseja atualizar o cadastro com as informações que você me passou? Responda *SIM* para atualizar ou *NÃO* para manter como está.`;
}

/**
 * Log data rectification for auditing
 */
export async function logDataRectification(
  supabase: any,
  params: {
    conversaId: string;
    entityType: 'lead' | 'contact' | 'deal';
    entityId: string;
    agentId: string;
    divergences: DivergenceEntry[];
    confirmed: boolean;
    bitrixUpdateSuccess?: boolean;
    errorMessage?: string;
  }
): Promise<void> {
  const { conversaId, entityType, entityId, agentId, divergences, confirmed, bitrixUpdateSuccess, errorMessage } = params;
  
  for (const divergence of divergences) {
    try {
      await supabase.from('crm_data_updates_log').insert({
        conversa_id: conversaId,
        entity_type: entityType,
        entity_id: entityId,
        agent_id: agentId,
        field_name: divergence.field,
        old_value: divergence.crm_value,
        new_value: divergence.informed_value,
        confirmed_by_client: confirmed,
        bitrix_update_success: bitrixUpdateSuccess ?? null,
        error_message: errorMessage ?? null,
      });
    } catch (err) {
      console.error(`[MARIA/SAC] Error logging rectification:`, err);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// STATE HANDLERS
// ═══════════════════════════════════════════════════════════════

/**
 * Handle escalation to human attendant
 */
async function handleEscalation(
  params: MariaIdentificationParams,
  dadosColetados: any
): Promise<MariaIdentificationResult> {
  const { supabase, supabaseUrl, supabaseServiceKey, phone, messageText, messageId, conversa, sendMessage, triageConfig } = params;
  
  console.log(`[MARIA/ESCALATION] ⚠️ Keyword de escalação detectada: "${messageText.substring(0, 80)}..."`);
  
  const escalationMessage = triageConfig?.escalation_message || 
    `Entendo sua urgência e quero garantir que você seja atendido da melhor forma. 🤝\n\nVou transferir você para nossa equipe especializada que tem autonomia para resolver seu caso.\n\nAguarde um momento, em breve um de nossos atendentes vai entrar em contato.`;
  
  // Update conversation to mark escalation
  const updatedDados = {
    ...dadosColetados,
    escalation_detected: true,
    escalation_reason: messageText.substring(0, 200),
    escalation_at: new Date().toISOString(),
  };
  
  await supabase
    .from('chatbot_conversas')
    .update({ 
      dados_coletados: updatedDados,
      sofia_mode: 'paused_for_human',
      escalation_reason: `Cliente solicitou escalação: "${messageText.substring(0, 100)}"`,
      escalated_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      last_sofia_message_at: new Date().toISOString(),
    })
    .eq('id', conversa.id);
  
  await sendMessage(phone, escalationMessage);
  
  // Save messages
  await supabase.from('chatbot_mensagens').insert([
    { conversa_id: conversa.id, role: 'user', content: messageText, message_id: messageId || null },
    { conversa_id: conversa.id, role: 'assistant', content: escalationMessage },
  ]);
  
  // Try to notify admin via email
  try {
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('email, nome')
      .eq('is_active', true)
      .limit(3);
    
    if (adminProfiles && adminProfiles.length > 0) {
      for (const admin of adminProfiles) {
        if (admin.email) {
          await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              notification_id: crypto.randomUUID(),
              admin_user_id: admin.email,
              title: '⚠️ Escalação marIA - Atendimento Urgente',
              message: `Cliente ${dadosColetados.crm_data?.nome || phone} solicitou atendimento humano.\n\nMotivo: "${messageText.substring(0, 150)}"\n\nAcesse o painel para atender.`,
              type: 'escalation',
              entity_type: 'conversa',
              entity_id: conversa.id,
            }),
          });
        }
      }
    }
  } catch (notifyError) {
    console.error(`[MARIA/ESCALATION] Error notifying admins:`, notifyError);
  }
  
  return {
    handled: true,
    status: 'maria_escalated_to_human',
    conversaId: conversa.id,
    data: { escalated: true },
  };
}

/**
 * Handle awaiting_cpf_cnpj state
 */
async function handleAwaitingCpfCnpj(
  params: MariaIdentificationParams,
  dadosColetados: any
): Promise<MariaIdentificationResult> {
  const { 
    supabase, supabaseUrl, supabaseAnonKey, phone, messageText, messageId, 
    conversa, sendMessage, triageConfig, getCoesaContact, formatWhatsAppLink 
  } = params;
  
  // Try to extract CPF/CNPJ from message
  const extracted = extractCpfCnpjFromMessage(messageText);
  
  if (extracted.value && (extracted.type === 'cpf' || extracted.type === 'cnpj')) {
    console.log(`[MARIA/ID] CPF/CNPJ extracted: ${extracted.value} (${extracted.type.toUpperCase()})`);
    
    // Call bitrix24-verify-customer to find client
    try {
      const verifyResponse = await fetch(`${supabaseUrl}/functions/v1/bitrix24-verify-customer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          cpf_cnpj: extracted.value,
          telefone: phone,
          search_in: 'deals', // marIA searches in Deals
        }),
      });
      
      const verifyResult = await verifyResponse.json();
      console.log(`[MARIA/ID] Verify result:`, JSON.stringify(verifyResult, null, 2));
      
      if (verifyResult.found) {
        // Client found in CRM
        const clientName = verifyResult.data?.nome || 'Cliente';
        const divergences = verifyResult.divergences || [];
        const crmEmail = verifyResult.data?.email || '';
        
        // Check if email verification is required
        const requireEmailVerification = triageConfig?.require_email_verification === true || 
                                          triageConfig?.identification?.ask_email === true;
        
        if (requireEmailVerification && crmEmail) {
          // Go to email verification step first
          console.log(`[MARIA/ID] Email verification required. CRM email: ${crmEmail}`);
          
          const updatedDados = {
            ...dadosColetados,
            maria_identification_state: 'awaiting_email_verification',
            identification_completed: false,
            crm_cpf_cnpj: extracted.value,
            crm_data: verifyResult.data,
            crm_deal_id: verifyResult.deal_id,
            crm_contact_id: verifyResult.contact_id,
            crm_lead_id: verifyResult.lead_id,
            crm_divergences: divergences,
            pending_email_verification: true,
          };
          
          await supabase
            .from('chatbot_conversas')
            .update({ 
              dados_coletados: updatedDados,
              cliente_nome: clientName,
              last_message_at: new Date().toISOString(),
              last_sofia_message_at: new Date().toISOString(),
            })
            .eq('id', conversa!.id);
          
          const emailVerificationMsg = triageConfig?.identification?.email_verification_message || 
            `Encontrei você, *${clientName}*! 😊\n\nPara sua segurança, preciso confirmar mais um dado.\n\nPor favor, me informe o *e-mail* cadastrado na sua conta.`;
          
          await sendMessage(phone, emailVerificationMsg);
          
          await supabase.from('chatbot_mensagens').insert([
            { conversa_id: conversa!.id, role: 'user', content: messageText, message_id: messageId || null },
            { conversa_id: conversa!.id, role: 'assistant', content: emailVerificationMsg },
          ]);
          
          return {
            handled: true,
            status: 'maria_awaiting_email_verification',
            conversaId: conversa!.id,
            data: { clientFound: true },
          };
        }
        
        // No email verification required - proceed normally
        const updatedDados = {
          ...dadosColetados,
          maria_identification_state: divergences.length > 0 ? 'awaiting_divergence_confirmation' : 'identification_complete',
          identification_completed: divergences.length === 0,
          crm_cpf_cnpj: extracted.value,
          crm_data: verifyResult.data,
          crm_deal_id: verifyResult.deal_id,
          crm_contact_id: verifyResult.contact_id,
          crm_lead_id: verifyResult.lead_id,
          crm_divergences: divergences,
        };
        
        await supabase
          .from('chatbot_conversas')
          .update({ 
            dados_coletados: updatedDados,
            cliente_nome: clientName,
            last_message_at: new Date().toISOString(),
            last_sofia_message_at: new Date().toISOString(),
          })
          .eq('id', conversa!.id);
        
        let responseMessage: string;
        
        if (divergences.length > 0) {
          responseMessage = buildDivergenceMessage(divergences, clientName);
        } else {
          responseMessage = `Olá, *${clientName}*! 😊\n\nEncontrei seu cadastro e está tudo certo! Como posso te ajudar hoje?`;
        }
        
        await sendMessage(phone, responseMessage);
        
        await supabase.from('chatbot_mensagens').insert([
          { conversa_id: conversa!.id, role: 'user', content: messageText, message_id: messageId || null },
          { conversa_id: conversa!.id, role: 'assistant', content: responseMessage },
        ]);
        
        return {
          handled: true,
          status: divergences.length > 0 ? 'maria_awaiting_divergence_confirmation' : 'maria_identification_complete',
          conversaId: conversa!.id,
          data: { clientFound: true, divergences },
        };
        
      } else {
        // Client NOT found in CRM
        console.log(`[MARIA/ID] Client not found in CRM`);
        
        const notFoundMessage = `Não encontrei seu CPF/CNPJ no nosso sistema de clientes ativos. 🤔\n\nVocê pode verificar se digitou corretamente ou, se ainda não é cliente, posso te transferir para nossa equipe comercial para conhecer nossos planos de desconto na conta de luz!\n\nDigite novamente seu CPF/CNPJ ou responda *COMERCIAL* se quiser conhecer nossos planos.`;
        
        await sendMessage(phone, notFoundMessage);
        
        await supabase.from('chatbot_mensagens').insert([
          { conversa_id: conversa!.id, role: 'user', content: messageText, message_id: messageId || null },
          { conversa_id: conversa!.id, role: 'assistant', content: notFoundMessage },
        ]);
        
        return {
          handled: true,
          status: 'maria_cpf_not_found',
          conversaId: conversa!.id,
          data: { clientFound: false },
        };
      }
      
    } catch (verifyError) {
      console.error(`[MARIA/ID] Error verifying customer:`, verifyError);
      return { handled: false, status: 'error' };
    }
    
  } else if (detectNewSaleIntent(messageText)) {
    // Client wants to go to commercial team
    let redirectMessage: string;
    
    if (getCoesaContact && formatWhatsAppLink) {
      const sofiaContact = await getCoesaContact(supabase, 'comercial');
      if (sofiaContact) {
        const whatsappLink = formatWhatsAppLink(sofiaContact.telefone);
        redirectMessage = `Excelente escolha! 💚\n\nVou te transferir para a *sofIA*, nossa assistente comercial, que vai te apresentar nossos planos de desconto na conta de luz.\n\n📞 Clique aqui para falar com ela:\n${whatsappLink}`;
      } else {
        redirectMessage = `Vou te transferir para nossa equipe comercial. Em instantes você será atendido!`;
      }
    } else {
      redirectMessage = `Vou te transferir para nossa equipe comercial. Em instantes você será atendido!`;
    }
    
    await sendMessage(phone, redirectMessage);
    
    const updatedDados = {
      ...dadosColetados,
      maria_identification_state: 'redirected_to_commercial',
      identification_completed: false,
      redirected_at: new Date().toISOString(),
    };
    
    await supabase
      .from('chatbot_conversas')
      .update({ 
        dados_coletados: updatedDados,
        sofia_mode: 'paused_for_redirect',
        last_message_at: new Date().toISOString(),
        last_sofia_message_at: new Date().toISOString(),
      })
      .eq('id', conversa!.id);
    
    await supabase.from('chatbot_mensagens').insert([
      { conversa_id: conversa!.id, role: 'user', content: messageText, message_id: messageId || null },
      { conversa_id: conversa!.id, role: 'assistant', content: redirectMessage },
    ]);
    
    return {
      handled: true,
      status: 'maria_redirect_to_commercial',
      conversaId: conversa!.id,
      data: { redirected: true },
    };
    
  } else {
    // Invalid CPF/CNPJ - ask again
    const invalidMessage = `Não consegui identificar um CPF ou CNPJ válido. 🤔\n\nPor favor, digite apenas os números do seu *CPF* (11 dígitos) ou *CNPJ* (14 dígitos).`;
    
    await sendMessage(phone, invalidMessage);
    
    await supabase.from('chatbot_mensagens').insert([
      { conversa_id: conversa!.id, role: 'user', content: messageText, message_id: messageId || null },
      { conversa_id: conversa!.id, role: 'assistant', content: invalidMessage },
    ]);
    
    return {
      handled: true,
      status: 'maria_invalid_cpf_cnpj',
      conversaId: conversa!.id,
    };
  }
}

/**
 * Handle awaiting_email_verification state
 */
async function handleAwaitingEmailVerification(
  params: MariaIdentificationParams,
  dadosColetados: any
): Promise<MariaIdentificationResult> {
  const { supabase, phone, messageText, messageId, conversa, sendMessage, triageConfig } = params;
  
  // Extract email from message
  const emailMatch = messageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  
  if (emailMatch && emailMatch.length > 0) {
    const informedEmail = emailMatch[0].toLowerCase().trim();
    const crmEmail = (dadosColetados.crm_data?.email || '').toLowerCase().trim();
    const clientName = dadosColetados.crm_data?.nome || 'Cliente';
    
    console.log(`[MARIA/ID] Email comparison: informed="${informedEmail}" vs crm="${crmEmail}"`);
    
    const emailsMatch = informedEmail === crmEmail;
    
    if (emailsMatch) {
      // Email matches - identity confirmed!
      console.log(`[MARIA/ID] ✅ Email confirmed - identity verified`);
      
      const existingDivergences = dadosColetados.crm_divergences || [];
      
      if (existingDivergences.length > 0) {
        // There are other divergences to handle
        const updatedDados = {
          ...dadosColetados,
          maria_identification_state: 'awaiting_divergence_confirmation',
          pending_email_verification: false,
          email_verified: true,
          email_verified_at: new Date().toISOString(),
        };
        
        await supabase
          .from('chatbot_conversas')
          .update({ 
            dados_coletados: updatedDados,
            cliente_email: informedEmail,
            last_message_at: new Date().toISOString(),
            last_sofia_message_at: new Date().toISOString(),
          })
          .eq('id', conversa!.id);
        
        const divergenceList = existingDivergences.map((d: any) => 
          `• *${d.field_label}*: você informou "${d.informed_value}", mas no cadastro consta "${d.crm_value}"`
        ).join('\n');
        
        const responseMessage = `Perfeito, *${clientName}*! ✅ E-mail confirmado!\n\nPorém identifiquei algumas diferenças em outros dados:\n\n${divergenceList}\n\nDeseja atualizar o cadastro? Responda *SIM* ou *NÃO*.`;
        
        await sendMessage(phone, responseMessage);
        
        await supabase.from('chatbot_mensagens').insert([
          { conversa_id: conversa!.id, role: 'user', content: messageText, message_id: messageId || null },
          { conversa_id: conversa!.id, role: 'assistant', content: responseMessage },
        ]);
        
        return {
          handled: true,
          status: 'maria_email_verified_has_divergences',
          conversaId: conversa!.id,
          data: { emailVerified: true },
        };
        
      } else {
        // No other divergences - identification complete
        const updatedDados = {
          ...dadosColetados,
          maria_identification_state: 'identification_complete',
          identification_completed: true,
          pending_email_verification: false,
          email_verified: true,
          email_verified_at: new Date().toISOString(),
        };
        
        await supabase
          .from('chatbot_conversas')
          .update({ 
            dados_coletados: updatedDados,
            cliente_email: informedEmail,
            last_message_at: new Date().toISOString(),
            last_sofia_message_at: new Date().toISOString(),
          })
          .eq('id', conversa!.id);
        
        const responseMessage = `Perfeito, *${clientName}*! ✅\n\nSua identidade foi confirmada com sucesso.\n\nComo posso te ajudar hoje?`;
        
        await sendMessage(phone, responseMessage);
        
        await supabase.from('chatbot_mensagens').insert([
          { conversa_id: conversa!.id, role: 'user', content: messageText, message_id: messageId || null },
          { conversa_id: conversa!.id, role: 'assistant', content: responseMessage },
        ]);
        
        return {
          handled: true,
          status: 'maria_identification_complete',
          conversaId: conversa!.id,
          data: { emailVerified: true },
        };
      }
      
    } else {
      // Email does NOT match - add to divergences
      console.log(`[MARIA/ID] ⚠️ Email does NOT match CRM`);
      
      const existingDivergences = dadosColetados.crm_divergences || [];
      const emailDivergence: DivergenceEntry = {
        field: 'email',
        field_label: 'E-mail',
        informed_value: informedEmail,
        crm_value: crmEmail || '(não cadastrado)',
      };
      
      const allDivergences = [...existingDivergences, emailDivergence];
      
      const updatedDados = {
        ...dadosColetados,
        maria_identification_state: 'awaiting_divergence_confirmation',
        pending_email_verification: false,
        email_verified: false,
        email_mismatch: true,
        informed_email: informedEmail,
        crm_divergences: allDivergences,
      };
      
      await supabase
        .from('chatbot_conversas')
        .update({ 
          dados_coletados: updatedDados,
          last_message_at: new Date().toISOString(),
          last_sofia_message_at: new Date().toISOString(),
        })
        .eq('id', conversa!.id);
      
      const emailMismatchMsg = triageConfig?.identification?.email_not_match_message || 
        buildDivergenceMessage(allDivergences, dadosColetados.crm_data?.nome || 'Cliente', true);
      
      await sendMessage(phone, emailMismatchMsg);
      
      await supabase.from('chatbot_mensagens').insert([
        { conversa_id: conversa!.id, role: 'user', content: messageText, message_id: messageId || null },
        { conversa_id: conversa!.id, role: 'assistant', content: emailMismatchMsg },
      ]);
      
      return {
        handled: true,
        status: 'maria_email_mismatch',
        conversaId: conversa!.id,
        data: { emailVerified: false, divergences: allDivergences },
      };
    }
    
  } else {
    // No email found in message - ask again
    const clientName = dadosColetados.crm_data?.nome || 'Cliente';
    const askAgainMessage = `Não consegui identificar um e-mail válido na sua mensagem, *${clientName}*. 📧\n\nPor favor, digite seu e-mail cadastrado (ex: seuemail@exemplo.com).`;
    
    await sendMessage(phone, askAgainMessage);
    
    await supabase.from('chatbot_mensagens').insert([
      { conversa_id: conversa!.id, role: 'user', content: messageText, message_id: messageId || null },
      { conversa_id: conversa!.id, role: 'assistant', content: askAgainMessage },
    ]);
    
    return {
      handled: true,
      status: 'maria_awaiting_valid_email',
      conversaId: conversa!.id,
    };
  }
}

/**
 * Handle awaiting_divergence_confirmation state
 */
async function handleAwaitingDivergenceConfirmation(
  params: MariaIdentificationParams,
  dadosColetados: any
): Promise<MariaIdentificationResult> {
  const { supabase, supabaseUrl, supabaseServiceKey, phone, messageText, messageId, conversa, sendMessage, agentId } = params;
  
  const lowerMessage = messageText.toLowerCase().trim();
  const clientName = dadosColetados.crm_data?.nome || 'Cliente';
  const divergences: DivergenceEntry[] = dadosColetados.crm_divergences || [];
  
  // Check if user confirmed update
  const confirmedUpdate = lowerMessage === 'sim' || lowerMessage.includes('sim') || 
                          lowerMessage === 's' || lowerMessage === 'atualizar' ||
                          lowerMessage === 'pode atualizar' || lowerMessage === 'pode sim';
  
  const deniedUpdate = lowerMessage === 'não' || lowerMessage === 'nao' ||
                       lowerMessage === 'n' || lowerMessage === 'manter' ||
                       lowerMessage.includes('manter como está');
  
  if (confirmedUpdate && divergences.length > 0) {
    console.log(`[MARIA/ID] ✅ User confirmed data update`);
    
    // Build updates for Bitrix24
    const updates: Record<string, string> = {};
    for (const div of divergences) {
      if (div.field === 'email') {
        updates.email = div.informed_value;
      } else if (div.field === 'telefone') {
        updates.telefone = div.informed_value;
      } else if (div.field === 'nome') {
        updates.nome = div.informed_value;
      }
      // Add more fields as needed
    }
    
    // Call bitrix24-update-customer
    let updateSuccess = false;
    try {
      const updateResponse = await fetch(`${supabaseUrl}/functions/v1/bitrix24-update-customer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          deal_id: dadosColetados.crm_deal_id,
          contact_id: dadosColetados.crm_contact_id,
          lead_id: dadosColetados.crm_lead_id,
          updates,
          add_timeline_comment: true,
          comment_text: `📝 Dados atualizados via marIA (SAC)\n\nCampos alterados: ${divergences.map(d => d.field_label).join(', ')}\n\nDados retificados após confirmação do cliente.`,
          agent_id: agentId,
        }),
      });
      
      const updateResult = await updateResponse.json();
      updateSuccess = updateResult.success === true;
      console.log(`[MARIA/ID] Bitrix24 update result:`, updateResult);
      
    } catch (updateError) {
      console.error(`[MARIA/ID] Error updating Bitrix24:`, updateError);
    }
    
    // Log rectification
    await logDataRectification(supabase, {
      conversaId: conversa!.id,
      entityType: dadosColetados.crm_deal_id ? 'deal' : (dadosColetados.crm_contact_id ? 'contact' : 'lead'),
      entityId: dadosColetados.crm_deal_id || dadosColetados.crm_contact_id || dadosColetados.crm_lead_id || 'unknown',
      agentId,
      divergences,
      confirmed: true,
      bitrixUpdateSuccess: updateSuccess,
    });
    
    // Update conversation
    const updatedDados = {
      ...dadosColetados,
      maria_identification_state: 'identification_complete',
      identification_completed: true,
      data_updated_at: new Date().toISOString(),
      data_update_confirmed: true,
    };
    
    await supabase
      .from('chatbot_conversas')
      .update({ 
        dados_coletados: updatedDados,
        last_message_at: new Date().toISOString(),
        last_sofia_message_at: new Date().toISOString(),
      })
      .eq('id', conversa!.id);
    
    const successMessage = updateSuccess 
      ? `Pronto, *${clientName}*! ✅ Seus dados foram atualizados com sucesso.\n\nComo posso te ajudar hoje?`
      : `Entendido, *${clientName}*! Vou solicitar a atualização dos seus dados.\n\nComo posso te ajudar hoje?`;
    
    await sendMessage(phone, successMessage);
    
    await supabase.from('chatbot_mensagens').insert([
      { conversa_id: conversa!.id, role: 'user', content: messageText, message_id: messageId || null },
      { conversa_id: conversa!.id, role: 'assistant', content: successMessage },
    ]);
    
    return {
      handled: true,
      status: 'maria_identification_complete',
      conversaId: conversa!.id,
      data: { dataUpdated: updateSuccess },
    };
    
  } else if (deniedUpdate) {
    console.log(`[MARIA/ID] ❌ User denied data update - keeping original`);
    
    // Log rectification as denied
    await logDataRectification(supabase, {
      conversaId: conversa!.id,
      entityType: dadosColetados.crm_deal_id ? 'deal' : (dadosColetados.crm_contact_id ? 'contact' : 'lead'),
      entityId: dadosColetados.crm_deal_id || dadosColetados.crm_contact_id || dadosColetados.crm_lead_id || 'unknown',
      agentId,
      divergences,
      confirmed: false,
    });
    
    // Update conversation
    const updatedDados = {
      ...dadosColetados,
      maria_identification_state: 'identification_complete',
      identification_completed: true,
      data_update_denied: true,
      data_update_denied_at: new Date().toISOString(),
    };
    
    await supabase
      .from('chatbot_conversas')
      .update({ 
        dados_coletados: updatedDados,
        last_message_at: new Date().toISOString(),
        last_sofia_message_at: new Date().toISOString(),
      })
      .eq('id', conversa!.id);
    
    const keepMessage = `Tudo bem, *${clientName}*! Vamos manter os dados como estão no cadastro.\n\nComo posso te ajudar hoje?`;
    
    await sendMessage(phone, keepMessage);
    
    await supabase.from('chatbot_mensagens').insert([
      { conversa_id: conversa!.id, role: 'user', content: messageText, message_id: messageId || null },
      { conversa_id: conversa!.id, role: 'assistant', content: keepMessage },
    ]);
    
    return {
      handled: true,
      status: 'maria_identification_complete',
      conversaId: conversa!.id,
      data: { dataUpdated: false },
    };
    
  } else {
    // Unclear response - ask again
    const clarifyMessage = `Desculpe, não entendi sua resposta. 🤔\n\nPor favor, responda *SIM* para atualizar seus dados ou *NÃO* para manter como está.`;
    
    await sendMessage(phone, clarifyMessage);
    
    await supabase.from('chatbot_mensagens').insert([
      { conversa_id: conversa!.id, role: 'user', content: messageText, message_id: messageId || null },
      { conversa_id: conversa!.id, role: 'assistant', content: clarifyMessage },
    ]);
    
    return {
      handled: true,
      status: 'maria_awaiting_divergence_confirmation',
      conversaId: conversa!.id,
    };
  }
}

/**
 * Handle first contact (no identification state yet)
 */
async function handleFirstContact(
  params: MariaIdentificationParams,
  dadosColetados: any
): Promise<MariaIdentificationResult> {
  const { 
    supabase, supabaseUrl, supabaseAnonKey, phone, messageText, messageId, 
    clienteNome, conversa, sendMessage, agentId, triageConfig 
  } = params;
  
  console.log(`[MARIA/ID] Starting identification flow for new conversation`);
  
  const isNewConversation = !conversa;
  
  // Try to extract CPF/CNPJ from first message
  const extracted = extractCpfCnpjFromMessage(messageText);
  
  if (extracted.value && (extracted.type === 'cpf' || extracted.type === 'cnpj')) {
    // Client sent CPF/CNPJ in first message - process immediately
    console.log(`[MARIA/ID] CPF/CNPJ detected in first message: ${extracted.value}`);
    
    // Create or get conversation first
    let targetConversaId = conversa?.id;
    
    if (isNewConversation) {
      const { data: newConversa } = await supabase
        .from('chatbot_conversas')
        .insert({
          session_id: crypto.randomUUID(),
          cliente_telefone: phone,
          cliente_nome: clienteNome,
          agent_id: agentId,
          lead_source: 'whatsapp_inbound',
          lead_score: 10,
          sofia_mode: 'standard',
          whatsapp_provider: 'zapi',
          total_messages: 1,
          dados_coletados: { 
            maria_identification_state: 'awaiting_cpf_cnpj',
          },
        })
        .select('id')
        .single();
      
      targetConversaId = newConversa?.id;
    }
    
    if (targetConversaId) {
      // Set state and process CPF/CNPJ verification
      await supabase
        .from('chatbot_conversas')
        .update({ 
          dados_coletados: { maria_identification_state: 'awaiting_cpf_cnpj' },
        })
        .eq('id', targetConversaId);
      
      try {
        const verifyResponse = await fetch(`${supabaseUrl}/functions/v1/bitrix24-verify-customer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            cpf_cnpj: extracted.value,
            telefone: phone,
            search_in: 'deals',
          }),
        });
        
        const verifyResult = await verifyResponse.json();
        console.log(`[MARIA/ID] First-message verify result:`, JSON.stringify(verifyResult, null, 2));
        
        if (verifyResult.found) {
          const clientName = verifyResult.data?.nome || 'Cliente';
          const divergences = verifyResult.divergences || [];
          const crmEmail = verifyResult.data?.email || '';
          
          const requireEmailVerification = triageConfig?.require_email_verification === true || 
                                            triageConfig?.identification?.ask_email === true;
          
          if (requireEmailVerification && crmEmail) {
            console.log(`[MARIA/ID] First-message: Email verification required`);
            
            const updatedDados = {
              maria_identification_state: 'awaiting_email_verification',
              identification_completed: false,
              crm_cpf_cnpj: extracted.value,
              crm_data: verifyResult.data,
              crm_deal_id: verifyResult.deal_id,
              crm_contact_id: verifyResult.contact_id,
              crm_lead_id: verifyResult.lead_id,
              crm_divergences: divergences,
              pending_email_verification: true,
            };
            
            await supabase
              .from('chatbot_conversas')
              .update({ 
                dados_coletados: updatedDados,
                cliente_nome: clientName,
                last_message_at: new Date().toISOString(),
                last_sofia_message_at: new Date().toISOString(),
              })
              .eq('id', targetConversaId);
            
            const emailVerificationMsg = triageConfig?.identification?.email_verification_message || 
              `Olá, *${clientName}*! Sou a *marIA*, assistente financeira da COESA. 💚\n\nEncontrei seu cadastro! Para sua segurança, preciso confirmar mais um dado.\n\nPor favor, me informe o *e-mail* cadastrado na sua conta.`;
            
            await sendMessage(phone, emailVerificationMsg);
            
            await supabase.from('chatbot_mensagens').insert([
              { conversa_id: targetConversaId, role: 'user', content: messageText, message_id: messageId || null },
              { conversa_id: targetConversaId, role: 'assistant', content: emailVerificationMsg },
            ]);
            
            return {
              handled: true,
              status: 'maria_awaiting_email_verification',
              conversaId: targetConversaId,
              data: { firstMessage: true, clientFound: true },
            };
          }
          
          // No email verification - proceed normally
          const updatedDados = {
            maria_identification_state: divergences.length > 0 ? 'awaiting_divergence_confirmation' : 'identification_complete',
            identification_completed: divergences.length === 0,
            crm_cpf_cnpj: extracted.value,
            crm_data: verifyResult.data,
            crm_deal_id: verifyResult.deal_id,
            crm_contact_id: verifyResult.contact_id,
            crm_lead_id: verifyResult.lead_id,
            crm_divergences: divergences,
          };
          
          await supabase
            .from('chatbot_conversas')
            .update({ 
              dados_coletados: updatedDados,
              cliente_nome: clientName,
              last_message_at: new Date().toISOString(),
              last_sofia_message_at: new Date().toISOString(),
            })
            .eq('id', targetConversaId);
          
          let responseMessage: string;
          
          if (divergences.length > 0) {
            const divergenceList = divergences.map((d: any) => 
              `• *${d.field_label}*: você informou "${d.informed_value}", mas no cadastro consta "${d.crm_value}"`
            ).join('\n');
            
            responseMessage = `Olá, *${clientName}*! Sou a *marIA*, assistente financeira da COESA. 💚\n\nEncontrei seu cadastro, porém identifiquei algumas diferenças:\n\n${divergenceList}\n\nDeseja atualizar o cadastro? Responda *SIM* ou *NÃO*.`;
          } else {
            responseMessage = `Olá, *${clientName}*! Sou a *marIA*, assistente financeira da COESA. 💚\n\nEncontrei seu cadastro e está tudo certo! Como posso te ajudar hoje?`;
          }
          
          await sendMessage(phone, responseMessage);
          
          await supabase.from('chatbot_mensagens').insert([
            { conversa_id: targetConversaId, role: 'user', content: messageText, message_id: messageId || null },
            { conversa_id: targetConversaId, role: 'assistant', content: responseMessage },
          ]);
          
          return {
            handled: true,
            status: divergences.length > 0 ? 'maria_awaiting_divergence_confirmation' : 'maria_identification_complete',
            conversaId: targetConversaId,
            data: { firstMessage: true },
          };
          
        } else {
          // Not found
          const notFoundMessage = `Olá! Sou a *marIA*, assistente financeira da COESA. 💚\n\nNão encontrei o CPF/CNPJ *${formatCpfCnpjForDisplay(extracted.value)}* no nosso sistema de clientes.\n\nVerifique se digitou corretamente ou responda *COMERCIAL* se quiser conhecer nossos planos.`;
          
          await sendMessage(phone, notFoundMessage);
          
          await supabase.from('chatbot_mensagens').insert([
            { conversa_id: targetConversaId, role: 'user', content: messageText, message_id: messageId || null },
            { conversa_id: targetConversaId, role: 'assistant', content: notFoundMessage },
          ]);
          
          return {
            handled: true,
            status: 'maria_cpf_not_found',
            conversaId: targetConversaId,
            data: { firstMessage: true },
          };
        }
      } catch (err) {
        console.error(`[MARIA/ID] First-message verify error:`, err);
        return { handled: false, status: 'error' };
      }
    }
  }
  
  // No CPF/CNPJ detected - ask for it
  const welcomeMessage = `Olá! Sou a *marIA*, assistente financeira da COESA Energia Inteligente. 💚\n\nPara te atender melhor, preciso confirmar seu cadastro.\n\nPor favor, me informe seu *CPF* ou *CNPJ* (apenas números).`;
  
  if (isNewConversation) {
    const { data: newConversa } = await supabase
      .from('chatbot_conversas')
      .insert({
        session_id: crypto.randomUUID(),
        cliente_telefone: phone,
        cliente_nome: clienteNome,
        agent_id: agentId,
        lead_source: 'whatsapp_inbound',
        lead_score: 10,
        sofia_mode: 'standard',
        whatsapp_provider: 'zapi',
        total_messages: 2,
        dados_coletados: { 
          maria_identification_state: 'awaiting_cpf_cnpj',
        },
      })
      .select('id')
      .single();
    
    if (newConversa) {
      await sendMessage(phone, welcomeMessage);
      
      await supabase.from('chatbot_mensagens').insert([
        { conversa_id: newConversa.id, role: 'user', content: messageText, message_id: messageId || null },
        { conversa_id: newConversa.id, role: 'assistant', content: welcomeMessage },
      ]);
      
      return {
        handled: true,
        status: 'maria_asking_cpf',
        conversaId: newConversa.id,
      };
    }
  } else {
    // Existing conversation without identification state
    const updatedDados = {
      ...dadosColetados,
      maria_identification_state: 'awaiting_cpf_cnpj',
    };
    
    await supabase
      .from('chatbot_conversas')
      .update({ 
        dados_coletados: updatedDados,
        last_message_at: new Date().toISOString(),
        last_sofia_message_at: new Date().toISOString(),
      })
      .eq('id', conversa!.id);
    
    await sendMessage(phone, welcomeMessage);
    
    await supabase.from('chatbot_mensagens').insert([
      { conversa_id: conversa!.id, role: 'user', content: messageText, message_id: messageId || null },
      { conversa_id: conversa!.id, role: 'assistant', content: welcomeMessage },
    ]);
    
    return {
      handled: true,
      status: 'maria_asking_cpf',
      conversaId: conversa!.id,
    };
  }
  
  return { handled: false, status: 'no_conversation' };
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * Main handler for marIA identification flow
 * This is a state machine that manages the client identification process
 */
export async function handleMariaIdentificationFlow(
  params: MariaIdentificationParams
): Promise<MariaIdentificationResult> {
  const { conversa, triageConfig, messageText } = params;
  
  // Get current state from conversation
  const dadosColetados = (conversa?.dados_coletados as any) || {};
  const mariaIdentificationState: MariaIdentificationState = dadosColetados.maria_identification_state || null;
  const identificationCompleted = dadosColetados.identification_completed === true;
  
  // If identification is already completed, don't handle
  if (identificationCompleted) {
    console.log(`[MARIA/SAC] Identification already completed, skipping flow`);
    return { handled: false, status: 'identification_already_complete' };
  }
  
  // Check for CPF/CNPJ requirement
  const requiresCpfCnpj = triageConfig?.require_cpf_cnpj !== false; // default true
  if (!requiresCpfCnpj) {
    console.log(`[MARIA/SAC] CPF/CNPJ not required, skipping identification flow`);
    return { handled: false, status: 'cpf_cnpj_not_required' };
  }
  
  console.log(`[MARIA/SAC] Flow state: ${mariaIdentificationState || 'none'}`);
  
  // ═══════════════════════════════════════════════════════════════
  // ESCALATION CHECK (before all state handling)
  // ═══════════════════════════════════════════════════════════════
  
  if (conversa && detectEscalationKeywords(messageText, triageConfig?.escalation_keywords)) {
    return await handleEscalation(params, dadosColetados);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // STATE MACHINE
  // ═══════════════════════════════════════════════════════════════
  
  switch (mariaIdentificationState) {
    case 'awaiting_cpf_cnpj':
      return await handleAwaitingCpfCnpj(params, dadosColetados);
      
    case 'awaiting_email_verification':
      return await handleAwaitingEmailVerification(params, dadosColetados);
      
    case 'awaiting_divergence_confirmation':
      return await handleAwaitingDivergenceConfirmation(params, dadosColetados);
      
    case 'identification_complete':
      // Already complete, don't handle
      return { handled: false, status: 'identification_complete' };
      
    case 'redirected_to_commercial':
      // Already redirected, don't handle
      return { handled: false, status: 'already_redirected' };
      
    case null:
    default:
      // First contact or no state - start identification
      return await handleFirstContact(params, dadosColetados);
  }
}
