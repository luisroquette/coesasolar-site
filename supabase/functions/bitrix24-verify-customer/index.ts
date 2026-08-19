import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';

/**
 * BITRIX24 VERIFY CUSTOMER
 * 
 * Busca cliente no CRM Bitrix24 por CPF/CNPJ, telefone ou e-mail
 * e retorna os dados cadastrados para validação/retificação.
 * 
 * ATUALIZADO: Suporte para busca em Deals (pipeline Negócios) além de Leads/Contatos
 * 
 * Usado pelos agentes de SAC (marIA) para identificar clientes
 * e detectar divergências nos dados.
 */

interface VerifyRequest {
  cpf_cnpj?: string;
  email?: string;
  telefone?: string; // Já temos do WhatsApp
  search_in?: 'leads' | 'deals' | 'contacts' | 'all'; // Novo: onde buscar (default: 'all')
}

interface CustomerData {
  found: boolean;
  source: 'lead' | 'contact' | 'deal' | 'both' | 'all' | null;
  lead_id?: string;
  contact_id?: string;
  deal_id?: string;
  deal_stage?: string;
  deal_title?: string;
  data: {
    nome?: string;
    email?: string;
    telefone?: string;
    cpf_cnpj?: string;
    endereco?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
  };
  divergences: Array<{
    field: string;
    field_label: string;
    crm_value: string;
    informed_value: string;
  }>;
}

// Normaliza CPF/CNPJ removendo formatação
function normalizeCpfCnpj(value: string): string {
  return value.replace(/\D/g, '');
}

// Normaliza telefone
function normalizePhone(value: string): string {
  return value.replace(/\D/g, '').replace(/^0+/, '');
}

// Normaliza email
function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

Deno.serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: VerifyRequest = await req.json();
    console.log('[bitrix24-verify-customer] Request:', JSON.stringify(body, null, 2));

    // Validar que pelo menos um identificador foi fornecido
    if (!body.cpf_cnpj && !body.email && !body.telefone) {
      return new Response(
        JSON.stringify({ error: 'Pelo menos um identificador é obrigatório (cpf_cnpj, email ou telefone)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determinar onde buscar (default: all)
    const searchIn = body.search_in || 'all';
    const shouldSearchLeads = searchIn === 'leads' || searchIn === 'all';
    const shouldSearchDeals = searchIn === 'deals' || searchIn === 'all';
    const shouldSearchContacts = searchIn === 'contacts' || searchIn === 'all';

    console.log(`[bitrix24-verify-customer] Search scope: ${searchIn} (leads: ${shouldSearchLeads}, deals: ${shouldSearchDeals}, contacts: ${shouldSearchContacts})`);

    // Buscar configuração do Bitrix24
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'bitrix24_webhook_url',
        'bitrix24_enabled',
        'bitrix24_custom_field_cpf_cnpj',
        'bitrix24_contact_field_cpf_cnpj',
        'bitrix24_deal_field_cpf_cnpj', // Campo CPF/CNPJ nos Deals
        'bitrix24_deal_category_id', // Pipeline/Category ID para Deals de clientes
      ]);

    const config: Record<string, string> = {};
    configData?.forEach((c) => {
      config[c.chave] = c.valor;
    });

    const bitrix24Url = config.bitrix24_webhook_url;
    const bitrix24Enabled = config.bitrix24_enabled === 'true';
    const leadCpfCnpjFieldId = config.bitrix24_custom_field_cpf_cnpj || 'UF_CRM_1755711898';
    const contactCpfCnpjFieldId = config.bitrix24_contact_field_cpf_cnpj || 'UF_CRM_1751997517';
    const dealCpfCnpjFieldId = config.bitrix24_deal_field_cpf_cnpj || leadCpfCnpjFieldId; // Fallback to lead field
    const dealCategoryId = config.bitrix24_deal_category_id; // Optional: filter by pipeline

    if (!bitrix24Url || !bitrix24Enabled) {
      return new Response(
        JSON.stringify({ error: 'Integração Bitrix24 não configurada ou desabilitada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result: CustomerData = {
      found: false,
      source: null,
      data: {},
      divergences: [],
    };

    // Normalizar dados informados
    const normalizedCpfCnpj = body.cpf_cnpj ? normalizeCpfCnpj(body.cpf_cnpj) : null;
    const normalizedEmail = body.email ? normalizeEmail(body.email) : null;
    const normalizedPhone = body.telefone ? normalizePhone(body.telefone) : null;

    // =====================================================
    // 1. BUSCAR NO LEAD POR CPF/CNPJ ou TELEFONE
    // =====================================================
    let leadData: any = null;

    if (shouldSearchLeads) {
      // Buscar por CPF/CNPJ primeiro (mais preciso)
      if (normalizedCpfCnpj) {
        console.log(`[bitrix24-verify-customer] Buscando lead por CPF/CNPJ: ${normalizedCpfCnpj}`);
        
        const leadByCpfResponse = await fetch(
          `${bitrix24Url}/crm.lead.list?` + new URLSearchParams({
            [`filter[${leadCpfCnpjFieldId}]`]: normalizedCpfCnpj,
            'select[]': 'ID',
          })
        );
        const leadByCpfResult = await leadByCpfResponse.json();
        
        if (leadByCpfResult.result && leadByCpfResult.result.length > 0) {
          const leadId = leadByCpfResult.result[0].ID;
          console.log(`[bitrix24-verify-customer] Lead encontrado por CPF/CNPJ: ${leadId}`);
          
          // Buscar dados completos do lead
          const leadDetailsResponse = await fetch(`${bitrix24Url}/crm.lead.get?ID=${leadId}`);
          const leadDetailsResult = await leadDetailsResponse.json();
          leadData = leadDetailsResult.result;
        }
      }

      // Se não encontrou por CPF/CNPJ, tentar por telefone
      if (!leadData && normalizedPhone) {
        console.log(`[bitrix24-verify-customer] Buscando lead por telefone: ${normalizedPhone}`);
        
        // Bitrix24 phone search format
        const phoneVariations = [
          normalizedPhone,
          `+55${normalizedPhone}`,
          `55${normalizedPhone}`,
        ];
        
        for (const phoneVar of phoneVariations) {
          const leadByPhoneResponse = await fetch(
            `${bitrix24Url}/crm.lead.list?` + new URLSearchParams({
              'filter[PHONE]': phoneVar,
              'select[]': 'ID',
            })
          );
          const leadByPhoneResult = await leadByPhoneResponse.json();
          
          if (leadByPhoneResult.result && leadByPhoneResult.result.length > 0) {
            const leadId = leadByPhoneResult.result[0].ID;
            console.log(`[bitrix24-verify-customer] Lead encontrado por telefone: ${leadId}`);
            
            const leadDetailsResponse = await fetch(`${bitrix24Url}/crm.lead.get?ID=${leadId}`);
            const leadDetailsResult = await leadDetailsResponse.json();
            leadData = leadDetailsResult.result;
            break;
          }
        }
      }
    }

    // =====================================================
    // 2. BUSCAR NO CONTATO POR CPF/CNPJ ou TELEFONE
    // =====================================================
    let contactData: any = null;

    if (shouldSearchContacts) {
      if (normalizedCpfCnpj) {
        console.log(`[bitrix24-verify-customer] Buscando contato por CPF/CNPJ: ${normalizedCpfCnpj}`);
        
        const contactByCpfResponse = await fetch(
          `${bitrix24Url}/crm.contact.list?` + new URLSearchParams({
            [`filter[${contactCpfCnpjFieldId}]`]: normalizedCpfCnpj,
            'select[]': 'ID',
          })
        );
        const contactByCpfResult = await contactByCpfResponse.json();
        
        if (contactByCpfResult.result && contactByCpfResult.result.length > 0) {
          const contactId = contactByCpfResult.result[0].ID;
          console.log(`[bitrix24-verify-customer] Contato encontrado por CPF/CNPJ: ${contactId}`);
          
          const contactDetailsResponse = await fetch(`${bitrix24Url}/crm.contact.get?ID=${contactId}`);
          const contactDetailsResult = await contactDetailsResponse.json();
          contactData = contactDetailsResult.result;
        }
      }

      if (!contactData && normalizedPhone) {
        console.log(`[bitrix24-verify-customer] Buscando contato por telefone: ${normalizedPhone}`);
        
        const phoneVariations = [
          normalizedPhone,
          `+55${normalizedPhone}`,
          `55${normalizedPhone}`,
        ];
        
        for (const phoneVar of phoneVariations) {
          const contactByPhoneResponse = await fetch(
            `${bitrix24Url}/crm.contact.list?` + new URLSearchParams({
              'filter[PHONE]': phoneVar,
              'select[]': 'ID',
            })
          );
          const contactByPhoneResult = await contactByPhoneResponse.json();
          
          if (contactByPhoneResult.result && contactByPhoneResult.result.length > 0) {
            const contactId = contactByPhoneResult.result[0].ID;
            console.log(`[bitrix24-verify-customer] Contato encontrado por telefone: ${contactId}`);
            
            const contactDetailsResponse = await fetch(`${bitrix24Url}/crm.contact.get?ID=${contactId}`);
            const contactDetailsResult = await contactDetailsResponse.json();
            contactData = contactDetailsResult.result;
            break;
          }
        }
      }
    }

    // =====================================================
    // 3. BUSCAR NO DEAL (NEGÓCIOS) - OTIMIZADO
    // Prioridade: CPF/CNPJ direto > CONTACT_ID
    // =====================================================
    let dealData: any = null;

    if (shouldSearchDeals) {
      // PRIMEIRO: Tentar buscar deal por CPF/CNPJ diretamente (mais preciso)
      if (!dealData && normalizedCpfCnpj && dealCpfCnpjFieldId) {
        console.log(`[bitrix24-verify-customer] Buscando deal por CPF/CNPJ: ${normalizedCpfCnpj}`);
        
        const dealFilters: Record<string, string> = {
          [`filter[${dealCpfCnpjFieldId}]`]: normalizedCpfCnpj,
          'filter[CLOSED]': 'N',
          'order[DATE_CREATE]': 'DESC',
        };
        
        if (dealCategoryId) {
          dealFilters['filter[CATEGORY_ID]'] = dealCategoryId;
        }
        
        const dealByCpfResponse = await fetch(
          `${bitrix24Url}/crm.deal.list?` + new URLSearchParams(dealFilters)
        );
        const dealByCpfResult = await dealByCpfResponse.json();
        
        if (dealByCpfResult.result && dealByCpfResult.result.length > 0) {
          const dealId = dealByCpfResult.result[0].ID;
          console.log(`[bitrix24-verify-customer] ✅ Deal encontrado por CPF/CNPJ: ${dealId}`);
          
          const dealDetailsResponse = await fetch(`${bitrix24Url}/crm.deal.get?ID=${dealId}`);
          const dealDetailsResult = await dealDetailsResponse.json();
          dealData = dealDetailsResult.result;
          
          // Também buscar dados do contato vinculado ao deal (se existir)
          if (dealData.CONTACT_ID && !contactData) {
            console.log(`[bitrix24-verify-customer] Buscando contato vinculado ao deal: ${dealData.CONTACT_ID}`);
            const contactDetailsResponse = await fetch(`${bitrix24Url}/crm.contact.get?ID=${dealData.CONTACT_ID}`);
            const contactDetailsResult = await contactDetailsResponse.json();
            if (contactDetailsResult.result) {
              contactData = contactDetailsResult.result;
            }
          }
        }
      }
      
      // SEGUNDO: Se não encontrou por CPF/CNPJ, buscar pelo CONTACT_ID
      if (!dealData) {
        let contactIdForDeal: string | null = null;

        // Se já temos o contato, usar o ID dele
        if (contactData) {
          contactIdForDeal = contactData.ID;
        } else if (normalizedPhone) {
          // Buscar contato pelo telefone para encontrar deals vinculados
          console.log(`[bitrix24-verify-customer] Buscando contato para deals por telefone: ${normalizedPhone}`);
          
          const phoneVariations = [
            normalizedPhone,
            `+55${normalizedPhone}`,
            `55${normalizedPhone}`,
          ];
          
          for (const phoneVar of phoneVariations) {
            const contactForDealResponse = await fetch(
              `${bitrix24Url}/crm.contact.list?` + new URLSearchParams({
                'filter[PHONE]': phoneVar,
                'select[]': 'ID',
              })
            );
            const contactForDealResult = await contactForDealResponse.json();
            
            if (contactForDealResult.result && contactForDealResult.result.length > 0) {
              contactIdForDeal = contactForDealResult.result[0].ID;
              console.log(`[bitrix24-verify-customer] Contato para deal encontrado: ${contactIdForDeal}`);
              
              // Também carregar dados do contato se não tínhamos
              if (!contactData) {
                const contactDetailsResponse = await fetch(`${bitrix24Url}/crm.contact.get?ID=${contactIdForDeal}`);
                const contactDetailsResult = await contactDetailsResponse.json();
                contactData = contactDetailsResult.result;
              }
              break;
            }
          }
        }

        // Buscar deals pelo CONTACT_ID
        if (contactIdForDeal) {
          console.log(`[bitrix24-verify-customer] Buscando deals para CONTACT_ID: ${contactIdForDeal}`);
          
          const dealFilters: Record<string, string> = {
            'filter[CONTACT_ID]': contactIdForDeal,
            'filter[CLOSED]': 'N', // Apenas deals abertos
            'order[DATE_CREATE]': 'DESC', // Mais recente primeiro
          };
          
          // Se temos um category_id configurado, filtrar por ele
          if (dealCategoryId) {
            dealFilters['filter[CATEGORY_ID]'] = dealCategoryId;
          }
          
          const dealsByContactResponse = await fetch(
            `${bitrix24Url}/crm.deal.list?` + new URLSearchParams(dealFilters)
          );
          const dealsByContactResult = await dealsByContactResponse.json();
          
          if (dealsByContactResult.result && dealsByContactResult.result.length > 0) {
            const dealId = dealsByContactResult.result[0].ID;
            console.log(`[bitrix24-verify-customer] Deal encontrado por CONTACT_ID: ${dealId}`);
            
            // Buscar dados completos do deal
            const dealDetailsResponse = await fetch(`${bitrix24Url}/crm.deal.get?ID=${dealId}`);
            const dealDetailsResult = await dealDetailsResponse.json();
            dealData = dealDetailsResult.result;
          }
        }
      }
    }

    // =====================================================
    // 4. CONSOLIDAR DADOS E DETECTAR DIVERGÊNCIAS
    // =====================================================
    
    if (leadData || contactData || dealData) {
      result.found = true;
      
      // Determinar source
      const sources: string[] = [];
      if (leadData) sources.push('lead');
      if (contactData) sources.push('contact');
      if (dealData) sources.push('deal');
      
      if (sources.length === 3) {
        result.source = 'all';
      } else if (sources.length === 2) {
        result.source = 'both';
      } else {
        result.source = sources[0] as 'lead' | 'contact' | 'deal';
      }
      
      if (leadData) result.lead_id = leadData.ID;
      if (contactData) result.contact_id = contactData.ID;
      if (dealData) {
        result.deal_id = dealData.ID;
        result.deal_stage = dealData.STAGE_ID;
        result.deal_title = dealData.TITLE;
      }
      
      // Extrair dados (prioridade: contato > deal > lead)
      const source = contactData || dealData || leadData;
      
      // Nome
      if (contactData) {
        result.data.nome = [contactData.NAME, contactData.LAST_NAME].filter(Boolean).join(' ').trim() || undefined;
      } else if (leadData) {
        result.data.nome = leadData.NAME || leadData.TITLE || undefined;
      } else if (dealData) {
        result.data.nome = dealData.TITLE || undefined;
      }
      
      // Email
      const emails = source?.EMAIL;
      if (Array.isArray(emails) && emails.length > 0) {
        result.data.email = emails[0].VALUE;
      }
      
      // Telefone
      const phones = source?.PHONE;
      if (Array.isArray(phones) && phones.length > 0) {
        result.data.telefone = phones[0].VALUE;
      }
      
      // CPF/CNPJ - verificar em cada entidade
      if (contactData && contactData[contactCpfCnpjFieldId]) {
        result.data.cpf_cnpj = contactData[contactCpfCnpjFieldId];
      } else if (dealData && dealData[dealCpfCnpjFieldId]) {
        result.data.cpf_cnpj = dealData[dealCpfCnpjFieldId];
      } else if (leadData && leadData[leadCpfCnpjFieldId]) {
        result.data.cpf_cnpj = leadData[leadCpfCnpjFieldId];
      }
      
      // Endereço (do contato tem mais campos)
      if (contactData) {
        result.data.endereco = contactData.ADDRESS || undefined;
        result.data.cidade = contactData.ADDRESS_CITY || undefined;
        result.data.uf = contactData.ADDRESS_PROVINCE || undefined;
        result.data.cep = contactData.ADDRESS_POSTAL_CODE || undefined;
      } else if (leadData) {
        result.data.endereco = leadData.ADDRESS || undefined;
        result.data.cidade = leadData.ADDRESS_CITY || undefined;
        result.data.uf = leadData.ADDRESS_PROVINCE || undefined;
        result.data.cep = leadData.ADDRESS_POSTAL_CODE || undefined;
      }
      
      // =====================================================
      // DETECTAR DIVERGÊNCIAS
      // =====================================================
      
      // Comparar e-mail
      if (normalizedEmail && result.data.email) {
        const crmEmail = normalizeEmail(result.data.email);
        if (crmEmail !== normalizedEmail) {
          result.divergences.push({
            field: 'email',
            field_label: 'E-mail',
            crm_value: result.data.email,
            informed_value: body.email!,
          });
        }
      }
      
      // Comparar CPF/CNPJ
      if (normalizedCpfCnpj && result.data.cpf_cnpj) {
        const crmCpfCnpj = normalizeCpfCnpj(result.data.cpf_cnpj);
        if (crmCpfCnpj !== normalizedCpfCnpj) {
          result.divergences.push({
            field: 'cpf_cnpj',
            field_label: 'CPF/CNPJ',
            crm_value: result.data.cpf_cnpj,
            informed_value: body.cpf_cnpj!,
          });
        }
      }
    }

    console.log('[bitrix24-verify-customer] Result:', JSON.stringify(result, null, 2));

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[bitrix24-verify-customer] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
