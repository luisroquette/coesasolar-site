import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  getStrictCorsHeaders, 
  handleCorsPrelight 
} from '../_shared/security-helpers.ts';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const ZAPI_INSTANCE_ID = Deno.env.get('ZAPI_INSTANCE_ID');
const ZAPI_TOKEN = Deno.env.get('ZAPI_TOKEN');
const ZAPI_SECURITY_TOKEN = Deno.env.get('ZAPI_SECURITY_TOKEN');

interface AddContactRequest {
  phone: string;
  firstName: string;
  lastName?: string;
}

interface Contact {
  phone: string;
  firstName: string;
  lastName?: string;
}

/**
 * Adiciona um ou mais contatos na lista de contatos do WhatsApp
 * Endpoint Z-API: POST /contacts/add
 * 
 * Requisitos:
 * - WhatsApp da instância precisa ter recebido a atualização
 * - Permissão de adicionar contatos habilitada nas configurações de privacidade
 */
async function addContacts(contacts: Contact[]): Promise<{ success: boolean; errors: string[] }> {
  const url = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/contacts/add`;
  
  console.log(`[z-api-add-contact] Adicionando ${contacts.length} contato(s)...`);
  console.log(`[z-api-add-contact] Contatos:`, JSON.stringify(contacts));
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': ZAPI_SECURITY_TOKEN || '',
      },
      body: JSON.stringify(contacts),
    });
    
    const responseText = await response.text();
    console.log(`[z-api-add-contact] Response status: ${response.status}`);
    console.log(`[z-api-add-contact] Response body: ${responseText}`);
    
    if (!response.ok) {
      console.error(`[z-api-add-contact] Erro HTTP ${response.status}: ${responseText}`);
      return { 
        success: false, 
        errors: [`HTTP ${response.status}: ${responseText}`] 
      };
    }
    
    try {
      const result = JSON.parse(responseText);
      return {
        success: result.success ?? true,
        errors: result.errors ?? [],
      };
    } catch {
      // Se não for JSON válido mas status é OK, considera sucesso
      return { success: true, errors: [] };
    }
  } catch (error) {
    console.error(`[z-api-add-contact] Erro ao adicionar contatos:`, error);
    return { 
      success: false, 
      errors: [error instanceof Error ? error.message : 'Erro desconhecido'] 
    };
  }
}

/**
 * Divide o nome completo em firstName e lastName
 */
function splitName(fullName: string): { firstName: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/);
  
  if (parts.length === 1) {
    return { firstName: parts[0] };
  }
  
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  
  return { firstName, lastName };
}

/**
 * Formata o número para o padrão esperado pela Z-API (apenas dígitos com DDI)
 */
function formatPhoneNumber(phone: string): string {
  // Remove tudo que não é dígito
  let digits = phone.replace(/\D/g, '');
  
  // Se não começar com 55, adiciona
  if (!digits.startsWith('55') && digits.length <= 11) {
    digits = '55' + digits;
  }
  
  return digits;
}

// Zod schema for contact validation
const ContactSchema = z.object({
  phone: z.string().min(8).max(20),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
});

const AddContactsSchema = z.union([
  ContactSchema,
  z.array(ContactSchema).min(1).max(100),
]);

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  const preflightResponse = handleCorsPrelight(req);
  if (preflightResponse) return preflightResponse;

  try {
    const rawBody = await req.json();
    
    // Validate with Zod
    const parseResult = AddContactsSchema.safeParse(rawBody);
    if (!parseResult.success) {
      console.error('[z-api-add-contact] Validation error:', parseResult.error.message);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Validation error: ${parseResult.error.errors.map(e => e.message).join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const body = parseResult.data;
    
    // Suporta tanto um contato quanto um array de contatos
    const contactsInput = Array.isArray(body) ? body : [body];
    
    // Valida e formata os contatos
    const contacts: Contact[] = contactsInput.map(c => {
      
      const formattedPhone = formatPhoneNumber(c.phone);
      
      // Se não tiver lastName explícito e o firstName parecer nome completo, divide
      let firstName = c.firstName;
      let lastName = c.lastName;
      
      if (!lastName && firstName.includes(' ')) {
        const split = splitName(firstName);
        firstName = split.firstName;
        lastName = split.lastName;
      }
      
      return {
        phone: formattedPhone,
        firstName,
        ...(lastName && { lastName }),
      };
    });
    
    console.log(`[z-api-add-contact] Contatos formatados:`, JSON.stringify(contacts));
    
    const result = await addContacts(contacts);
    
    return new Response(
      JSON.stringify({
        success: result.success,
        message: result.success 
          ? `${contacts.length} contato(s) adicionado(s) com sucesso` 
          : 'Falha ao adicionar contatos',
        errors: result.errors,
        contacts: contacts,
      }),
      { 
        status: result.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[z-api-add-contact] Erro:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
