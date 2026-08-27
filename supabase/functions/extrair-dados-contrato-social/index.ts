import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getStrictCorsHeaders, handleCorsPrelight, errorResponse } from '../_shared/security-helpers.ts';
import { validateExtrairDadosContratoSocial } from '../_shared/zod-schemas.ts';

const LOVABLE_API_KEY = Deno.env.get('COESASOLAR_OPENROUTER_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Input validation constants
const MAX_PAYLOAD_SIZE_MB = 20;
const VALID_DATA_URI_REGEX = /^data:(application\/pdf|image\/(jpeg|jpg|png));base64,/;

// Validate base64 document input
function validateBase64Document(data: unknown, maxMB: number = MAX_PAYLOAD_SIZE_MB): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'string') {
    return { valid: false, error: 'Documento inválido' };
  }
  
  // Check data URI format
  if (!VALID_DATA_URI_REGEX.test(data)) {
    return { valid: false, error: 'Formato inválido. Apenas PDF, JPEG ou PNG são aceitos' };
  }
  
  // Extract and validate base64 content
  const base64Content = data.split(',')[1];
  if (!base64Content || !/^[A-Za-z0-9+/=]+$/.test(base64Content)) {
    return { valid: false, error: 'Codificação base64 inválida' };
  }
  
  // Calculate size (base64 is ~1.37x original)
  const sizeInMB = (base64Content.length * 0.75) / (1024 * 1024);
  if (sizeInMB > maxMB) {
    return { valid: false, error: `Documento excede ${maxMB}MB` };
  }
  
  return { valid: true };
}

const systemPrompt = `Você é um especialista em extração de dados de documentos societários brasileiros.
Analise o documento fornecido (Contrato Social, Alteração Contratual ou Ata de Assembleia) e extraia as informações com máxima precisão.

=== DADOS DA EMPRESA ===
1. RAZÃO SOCIAL: Nome completo da empresa conforme registrado
2. CNPJ: 14 dígitos, apenas números
3. NIRE: Número de Identificação do Registro de Empresas (se disponível)
4. NATUREZA JURÍDICA: LTDA, S.A., EIRELI, SLU, Consórcio, etc.
5. OBJETO SOCIAL: Descrição resumida das atividades da empresa
6. DATA DE CONSTITUIÇÃO: Data de criação da empresa (formato DD/MM/AAAA)
7. INSCRIÇÃO ESTADUAL: Número da inscrição estadual (se disponível)

=== SEDE DA EMPRESA (endereço do escritório/sede) ===
- LOGRADOURO: Apenas rua/avenida SEM número
- NÚMERO: Número do imóvel
- COMPLEMENTO: Sala, andar, bloco (se houver)
- BAIRRO: Nome do bairro
- CIDADE: Nome da cidade
- UF: Sigla do estado (2 letras)
- CEP: 8 dígitos apenas

=== QUADRO SOCIETÁRIO (IMPORTANTE) ===
Liste TODOS os sócios/acionistas/quotistas da empresa:
Para cada sócio, extraia:
- nome_completo: Nome completo do sócio
- cpf_cnpj: CPF (11 dígitos) ou CNPJ (14 dígitos) do sócio
- participacao_percentual: Percentual de participação (ex: 50, 33.33)
- tipo_socio: "pessoa_fisica" ou "pessoa_juridica"
- e_administrador: true/false - se este sócio é administrador

=== SÓCIO ADMINISTRADOR (CRÍTICO - QUEM ASSINA PELA EMPRESA) ===
Identifique o SÓCIO ADMINISTRADOR ou REPRESENTANTE LEGAL da empresa.
Geralmente descrito como:
- "administrador"
- "sócio-gerente"
- "sócio administrador"
- "diretor"
- "representante legal"
- "com poderes de administração"

ATENÇÃO: O administrador pode ser apenas UM dos sócios, não necessariamente todos.
Procure por frases como:
- "A administração da sociedade será exercida por..."
- "Fica nomeado administrador..."
- "Terá poderes de administração..."
- "Representará a sociedade..."

Para o SÓCIO ADMINISTRADOR, extraia TODOS os dados pessoais disponíveis:
- admin_nome_completo: Nome completo
- admin_cpf: CPF (11 dígitos)
- admin_rg: Número do RG
- admin_rg_orgao: Órgão emissor do RG (ex: SSP-MG, PC-SP)
- admin_data_nascimento: Data de nascimento (DD/MM/AAAA)
- admin_estado_civil: Solteiro, Casado, Divorciado, Viúvo, União Estável
- admin_profissao: Profissão/ocupação
- admin_nacionalidade: Nacionalidade (ex: Brasileiro)
- admin_endereco: Endereço residencial completo
- admin_cidade: Cidade de residência
- admin_uf: UF de residência
- admin_cep: CEP de residência (8 dígitos)

=== PODERES DO ADMINISTRADOR ===
Verifique se o administrador tem:
- poderes_plenos: true se pode assinar contratos sozinho
- requer_assinatura_conjunta: true se precisa de outro sócio para assinar
- restricoes_poderes: descrição de quaisquer limitações

INSTRUÇÕES GERAIS:
1. Se um campo estiver ilegível ou não encontrado, retorne null
2. CPF deve ter 11 dígitos, CNPJ deve ter 14 dígitos (apenas números)
3. O CEP deve ter 8 dígitos
4. Percentuais devem ser números (ex: 50, 33.33, não "50%")
5. Datas no formato DD/MM/AAAA
6. Se houver múltiplos administradores, extraia apenas o PRINCIPAL (geralmente o primeiro listado)
7. Se o documento for uma Alteração Contratual, use os dados ATUALIZADOS (não os originais)

Seja preciso e retorne apenas dados que você conseguir ler com confiança.`;

const extractionTool = {
  type: "function",
  function: {
    name: "extrair_dados_contrato_social",
    description: "Extrai dados estruturados de contratos sociais e alterações contratuais",
    parameters: {
      type: "object",
      properties: {
        sucesso: {
          type: "boolean",
          description: "Se a extração foi bem sucedida"
        },
        confianca: {
          type: "number",
          description: "Nível de confiança geral da extração de 0 a 100"
        },
        dados: {
          type: "object",
          properties: {
            // Dados da Empresa
            razao_social: { type: ["string", "null"], description: "Razão social completa da empresa" },
            cnpj: { type: ["string", "null"], description: "CNPJ com 14 dígitos apenas" },
            nire: { type: ["string", "null"], description: "NIRE - Número de Identificação do Registro de Empresas" },
            inscricao_estadual: { type: ["string", "null"], description: "Inscrição Estadual" },
            natureza_juridica: { type: ["string", "null"], description: "Tipo da empresa (LTDA, S.A., etc)" },
            objeto_social: { type: ["string", "null"], description: "Descrição resumida das atividades" },
            data_constituicao: { type: ["string", "null"], description: "Data de constituição DD/MM/AAAA" },
            
            // Sede da Empresa
            sede_logradouro: { type: ["string", "null"], description: "Rua/Avenida da sede SEM número" },
            sede_numero: { type: ["string", "null"], description: "Número do imóvel da sede" },
            sede_complemento: { type: ["string", "null"], description: "Complemento (sala, andar, bloco)" },
            sede_bairro: { type: ["string", "null"], description: "Bairro da sede" },
            sede_cidade: { type: ["string", "null"], description: "Cidade da sede" },
            sede_uf: { type: ["string", "null"], description: "UF da sede (2 letras)" },
            sede_cep: { type: ["string", "null"], description: "CEP da sede (8 dígitos)" },
            
            // Quadro Societário
            quadro_societario: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nome_completo: { type: "string", description: "Nome completo do sócio" },
                  cpf_cnpj: { type: ["string", "null"], description: "CPF ou CNPJ do sócio" },
                  participacao_percentual: { type: ["number", "null"], description: "Percentual de participação" },
                  tipo_socio: { 
                    type: ["string", "null"], 
                    enum: ["pessoa_fisica", "pessoa_juridica", null],
                    description: "Tipo do sócio" 
                  },
                  e_administrador: { type: ["boolean", "null"], description: "Se é administrador" }
                },
                required: ["nome_completo"]
              },
              description: "Lista de todos os sócios da empresa"
            },
            
            // Sócio Administrador (dados completos)
            admin_nome_completo: { type: ["string", "null"], description: "Nome completo do administrador" },
            admin_cpf: { type: ["string", "null"], description: "CPF do administrador (11 dígitos)" },
            admin_rg: { type: ["string", "null"], description: "RG do administrador" },
            admin_rg_orgao: { type: ["string", "null"], description: "Órgão emissor do RG (ex: SSP-MG)" },
            admin_data_nascimento: { type: ["string", "null"], description: "Data de nascimento DD/MM/AAAA" },
            admin_estado_civil: { 
              type: ["string", "null"], 
              enum: ["Solteiro", "Casado", "Divorciado", "Viúvo", "União Estável", "Separado", null],
              description: "Estado civil do administrador" 
            },
            admin_profissao: { type: ["string", "null"], description: "Profissão do administrador" },
            admin_nacionalidade: { type: ["string", "null"], description: "Nacionalidade do administrador" },
            admin_endereco: { type: ["string", "null"], description: "Endereço residencial completo" },
            admin_cidade: { type: ["string", "null"], description: "Cidade de residência" },
            admin_uf: { type: ["string", "null"], description: "UF de residência" },
            admin_cep: { type: ["string", "null"], description: "CEP de residência (8 dígitos)" },
            
            // Poderes do administrador
            poderes_plenos: { 
              type: ["boolean", "null"], 
              description: "Se o administrador pode assinar contratos sozinho" 
            },
            requer_assinatura_conjunta: { 
              type: ["boolean", "null"], 
              description: "Se precisa de outro sócio para assinar" 
            },
            restricoes_poderes: { 
              type: ["string", "null"], 
              description: "Descrição de limitações de poderes, se houver" 
            }
          },
          required: ["razao_social", "cnpj", "admin_nome_completo", "admin_cpf", "quadro_societario"]
        },
        avisos: {
          type: "array",
          items: { type: "string" },
          description: "Lista de campos que não puderam ser lidos ou avisos sobre qualidade"
        },
        erro: {
          type: ["string", "null"],
          description: "Mensagem de erro se a extração falhou completamente"
        }
      },
      required: ["sucesso", "confianca", "dados", "avisos"]
    }
  }
};

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    // ═══════════════════════════════════════════════════════════════
    // AUTHENTICATION: Validate JWT token
    // ═══════════════════════════════════════════════════════════════
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ 
          sucesso: false, 
          confianca: 0,
          dados: {},
          avisos: [],
          erro: "Autenticação necessária"
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error('Auth error:', claimsError);
      return new Response(
        JSON.stringify({ 
          sucesso: false, 
          confianca: 0,
          dados: {},
          avisos: [],
          erro: "Token inválido ou expirado"
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log(`Authenticated user: ${userId}`);

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION: Validate request payload with Zod schema
    // ═══════════════════════════════════════════════════════════════
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400, req);
    }
    
    const validation = validateExtrairDadosContratoSocial(rawBody);
    if (!validation.success) {
      const errorMsg = validation.errors?.map(e => `${e.field}: ${e.message}`).join(', ');
      console.warn('[extrair-dados-contrato-social] Validation failed:', errorMsg);
      return new Response(
        JSON.stringify({ 
          sucesso: false, 
          confianca: 0,
          dados: {},
          avisos: [],
          erro: errorMsg
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { contratoSocialBase64 } = validation.data!;

    // Additional document format validation (already partially done in Zod)
    const docValidation = validateBase64Document(contratoSocialBase64);
    if (!docValidation.valid) {
      return new Response(
        JSON.stringify({ 
          sucesso: false, 
          confianca: 0,
          dados: {},
          avisos: [],
          erro: docValidation.error
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing social contract document...');

    // Determine media type from base64
    const getMediaType = (base64: string): string => {
      if (base64.startsWith('data:application/pdf')) return 'application/pdf';
      if (base64.startsWith('data:image/png')) return 'image/png';
      if (base64.startsWith('data:image/jpeg') || base64.startsWith('data:image/jpg')) return 'image/jpeg';
      return 'image/jpeg'; // default
    };

    // Extract pure base64 content
    const extractBase64Content = (base64: string): string => {
      const matches = base64.match(/^data:[^;]+;base64,(.+)$/);
      return matches ? matches[1] : base64;
    };

    const mediaType = getMediaType(contratoSocialBase64);
    const base64Content = extractBase64Content(contratoSocialBase64);

    // Build content array for the API
    const content: any[] = [];

    if (mediaType === 'application/pdf') {
      content.push({
        type: "file",
        file: {
          filename: "contrato_social.pdf",
          file_data: `data:application/pdf;base64,${base64Content}`
        }
      });
    } else {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${mediaType};base64,${base64Content}`
        }
      });
    }

    content.push({
      type: "text",
      text: "Analise este documento societário (Contrato Social, Alteração Contratual ou Ata de Assembleia) e extraia todos os dados estruturados conforme solicitado. Identifique especialmente o SÓCIO ADMINISTRADOR que representa a empresa."
    });

    console.log('Calling Lovable AI API for contract extraction...');

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content }
        ],
        tools: [extractionTool],
        tool_choice: { type: "function", function: { name: "extrair_dados_contrato_social" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI API error:', response.status, errorText);
      throw new Error(`API error: ${response.status}`);
    }

    const result = await response.json();
    console.log('Lovable AI response received');

    // Extract the tool call result
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall || toolCall.function.name !== 'extrair_dados_contrato_social') {
      console.error('Unexpected response format:', JSON.stringify(result));
      throw new Error('Formato de resposta inesperado da API');
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    
    console.log('Extraction completed:', {
      sucesso: extractedData.sucesso,
      confianca: extractedData.confianca,
      razao_social: extractedData.dados?.razao_social,
      admin_nome: extractedData.dados?.admin_nome_completo,
      total_socios: extractedData.dados?.quadro_societario?.length || 0
    });

    return new Response(JSON.stringify(extractedData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in extrair-dados-contrato-social:', error);
    return new Response(JSON.stringify({
      sucesso: false,
      confianca: 0,
      dados: {},
      avisos: [],
      erro: error instanceof Error ? error.message : 'Erro ao processar contrato social'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
