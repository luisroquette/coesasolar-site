import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const LOVABLE_API_KEY = Deno.env.get('COESASOLAR_OPENROUTER_API_KEY') ?? Deno.env.get('OPENROUTER_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const systemPrompt = `Você é um especialista em extração de dados de documentos brasileiros.
Analise as imagens fornecidas e extraia as informações solicitadas com máxima precisão.

DOCUMENTO 1 - Documento de Identificação (RG, CNH ou Procuração):
CAMPOS OBRIGATÓRIOS:
- Nome completo do titular
- CPF (11 dígitos, apenas números)
- Data de nascimento (formato DD/MM/AAAA)

CAMPOS ADICIONAIS (extrair se disponíveis):
- Número do RG (apenas números e letras do documento)
- Órgão emissor do RG (ex: SSP-MG, DETRAN-SP, PC-RJ)
- Data de emissão do documento (formato DD/MM/AAAA)
- Número da CNH (se for CNH, 11 dígitos)
- Categoria da CNH (A, B, AB, C, D, E, ACC)
- Validade da CNH (formato DD/MM/AAAA)
- Nome da mãe (filiação)
- Nome do pai (filiação, se disponível)
- Naturalidade (cidade/UF de nascimento)
- Nacionalidade (Brasileiro, Estrangeiro, etc)

DOCUMENTO 2 - Conta de Luz (fatura de energia elétrica):
CAMPOS OBRIGATÓRIOS:
- Número da UC (Unidade Consumidora) - geralmente 10 a 12 dígitos
- Nome do titular da conta
- CPF ou CNPJ do titular (apenas números)
- Tipo de instalação (Monofásico, Bifásico ou Trifásico)
- Classe de consumo (Residencial, Comercial, Industrial, Rural)

=== EXTRAÇÃO DE ENDEREÇO (MUITO IMPORTANTE - SEPARAR COMPONENTES) ===
O endereço na fatura deve ser SEPARADO em componentes individuais:

1. LOGRADOURO: Apenas o nome da rua/avenida SEM o número
   - Exemplo: "RUA IPE BRANCO", "AV BRASIL", "ALAMEDA DAS FLORES"
   
2. NÚMERO DO ENDEREÇO: Apenas o número do imóvel
   - Exemplo: "87", "1500", "S/N"
   
3. COMPLEMENTO: Apartamento, bloco, sala, etc
   - Exemplo: "AP 1501", "BLOCO A", "SALA 302", "CASA 2"
   - Se não houver, retornar null
   
4. BAIRRO: Nome do bairro/setor
   - Exemplo: "VALE DO SERENO", "CENTRO", "SAVASSI"
   
5. CIDADE: Nome da cidade
   - Exemplo: "NOVA LIMA", "BELO HORIZONTE"
   
6. UF: Sigla do estado (2 letras)
   - Exemplo: "MG", "SP", "RJ"
   
7. CEP: 8 dígitos apenas
   - Exemplo: "34006087"

8. ENDERECO_COMPLETO: Concatenar todos os componentes
   - Formato: "LOGRADOURO, NÚMERO, COMPLEMENTO - BAIRRO, CIDADE/UF, CEP"
   - Exemplo: "RUA IPE BRANCO, 87, AP 1501 - VALE DO SERENO, NOVA LIMA/MG, 34006-087"

CAMPOS ADICIONAIS (extrair se disponíveis):
- Telefone de contato do titular (com DDD, apenas números)
- Email do titular (se presente na fatura)
- Número do cliente na concessionária (diferente da UC)
- Data de vencimento da fatura (formato DD/MM/AAAA)
- Valor total da fatura em reais (número decimal)

IMPORTANTE - CONCESSIONÁRIA:
- Identifique a concessionária de energia pelo LOGO ou NOME na fatura
- Exemplos comuns: CEMIG, CPFL, ENEL, LIGHT, CELESC, COPEL, COELBA, ELEKTRO, EDP, ENERGISA, CELPE, COSERN, EQUATORIAL, NEOENERGIA
- Retorne apenas a SIGLA principal (ex: "CEMIG", não "CEMIG Distribuição S.A.")
- Se o logo ou nome não for identificável, retorne null

=== TARIFA DE ENERGIA (IMPORTANTE) ===
Localizar na seção "Itens da Fatura" ou "Valores Faturados":
- Buscar a linha "Energia Elétrica" ou "Consumo"
- Extrair o PREÇO UNITÁRIO (R$/kWh) - geralmente um valor como 1.16025107 ou 0.87654321
- Este é o valor na coluna "Preço Unit." ou "Tarifa"
- Retornar como número decimal (ex: 1.16025107)

=== CAMPOS ESPECIAIS DA FATURA (MUITO IMPORTANTES) ===

1. TIPO DE CLIENTE (PF ou PJ):
   - Verificar no CABEÇALHO da fatura se aparece "CPF" ou "CNPJ"
   - Se aparecer "CPF" ou CPF de 11 dígitos → tipo_pessoa = "PF"
   - Se aparecer "CNPJ" ou CNPJ de 14 dígitos → tipo_pessoa = "PJ"

2. CIP - CONTRIBUIÇÃO DE ILUMINAÇÃO PÚBLICA:
   - Localizar nos "Valores Faturados" a linha "Contrib Ilum Publica Municipal" ou "CIP" ou "COSIP"
   - Extrair o VALOR em reais (ex: 44,79 → retornar 44.79)
   - É um valor pequeno comparado ao total da fatura (geralmente R$ 20 a R$ 80)
   - Retornar null se não encontrar

3. CLIENTE RECEBE ENERGIA DE OUTRA FONTE (GD - Geração Distribuída):
   - Verificar se existe a linha "Energia SCEE s/ ICMS" ou "Energia Injetada" ou "Energia Compensada" nos itens da fatura
   - SCEE = Sistema de Compensação de Energia Elétrica
   - Se existir E a quantidade for > 0 → recebe_energia_externa = true
   - Se não existir OU quantidade = 0 → recebe_energia_externa = false
   - Também extrair a quantidade em kWh se disponível

4. CLIENTE TEM SALDO DE GERAÇÃO ACUMULADO:
   - Localizar nas "Informações Gerais" ou "Resumo" o texto "SALDO ATUAL DE GERAÇÃO" ou "Saldo a expirar"
   - Extrair o valor numérico em kWh (ex: "SALDO ATUAL DE GERAÇÃO: 125,50 kWh" → 125.50)
   - tem_saldo_geracao = true se saldo > 0
   - tem_saldo_geracao = false se saldo = 0 ou não encontrado/não aplicável

CRÍTICO - HISTÓRICO DE CONSUMO (MUITO IMPORTANTE):
1. Localize a tabela/seção "Histórico de Consumo" ou "Histórico de Consumo dos Últimos 12 Meses" na conta de luz
2. Esta tabela geralmente mostra colunas como: MÊS/ANO, Consumo kWh, Média kWh/Dia, Dias
3. NÃO use o campo "Itens da Fatura" ou "Consumo" do mês atual - isso é apenas 1 mês
4. Extraia TODOS os meses disponíveis na tabela de histórico (geralmente 12 ou 13 meses)
5. Para cada mês, extraia: mes_ano (ex: "JAN/24" ou "01/2024") e consumo_kwh (número inteiro)
6. O primeiro item do array deve ser o mês MAIS ANTIGO, o último item o mês MAIS RECENTE

CÁLCULO OBRIGATÓRIO DAS MÉDIAS (VOCÊ DEVE CALCULAR):
Após extrair o histórico_consumo, CALCULE:

- consumo_ultimo_mes: O valor de consumo_kwh do MÊS MAIS RECENTE (último item do array)
- consumo_media_anual: Some TODOS os valores de consumo_kwh do histórico e divida pelo número de meses
  Exemplo: se tem 12 meses com total de 4800 kWh → média = 4800 / 12 = 400 kWh/mês
- consumo_media_trimestral: Some os 3 ÚLTIMOS valores de consumo_kwh e divida por 3
  Exemplo: se últimos 3 meses são 350, 380, 420 → média = (350+380+420) / 3 = 383 kWh/mês

Se não conseguir extrair o histórico completo, retorne null para as médias.

=== VALIDAÇÃO ANTI-FRAUDE DE TITULARIDADE (CRÍTICO) ===

VOCÊ DEVE FAZER A VALIDAÇÃO CRUZADA DOS DOCUMENTOS:

1. EXTRAIA o CPF do documento de identificação (RG/CNH) - campo "cpf"
2. EXTRAIA o CPF ou CNPJ do titular da conta de luz - campo "cpf_cnpj_titular"
3. COMPARE os dois documentos para verificar se pertencem à mesma pessoa

REGRAS DE VALIDAÇÃO:

SE a conta de luz tiver CNPJ (14 dígitos):
   -> validacao_titular.documentos_mesmo_titular = true (será validado posteriormente)
   -> validacao_titular.tipo_divergencia = "cnpj_pj"
   -> validacao_titular.confianca_validacao = 50

SE a conta de luz tiver CPF (11 dígitos):
   -> Compare com o CPF do documento de identificação
   -> Se CPF do RG/CNH = CPF da conta:
      - validacao_titular.documentos_mesmo_titular = true
      - validacao_titular.tipo_divergencia = null
      - validacao_titular.confianca_validacao = 100
   -> Se CPF do RG/CNH ≠ CPF da conta (FRAUDE):
      - validacao_titular.documentos_mesmo_titular = false
      - validacao_titular.tipo_divergencia = "cpf_diferente"
      - validacao_titular.confianca_validacao = 100

SE não conseguir ler os CPFs claramente:
   -> validacao_titular.documentos_mesmo_titular = null
   -> validacao_titular.tipo_divergencia = "dados_incompletos"
   -> validacao_titular.confianca_validacao = 0

INSTRUÇÕES GERAIS:
1. Se um campo estiver ilegível ou não encontrado, retorne null para ele
2. Para CPF, retorne apenas 11 dígitos. Para CNPJ, retorne apenas 14 dígitos
3. O CEP deve ter exatamente 8 dígitos
4. Se a imagem estiver muito borrada, cortada ou ilegível, indique isso claramente
5. Compare os dados entre os dois documentos para maior precisão (ex: nome e CPF devem coincidir)
6. O tipo_pessoa deve ser 'PF' se tiver CPF (11 dígitos) ou 'PJ' se tiver CNPJ (14 dígitos)
7. Para telefone, inclua DDD (ex: 31999998888)
8. Para valores monetários, use ponto como separador decimal (ex: 350.75)
9. SEPARE o endereço em componentes: logradouro, numero_endereco, complemento, bairro
10. A VALIDAÇÃO DE TITULARIDADE É OBRIGATÓRIA - sempre preencha o campo validacao_titular

Seja preciso e retorne apenas dados que você conseguir ler com confiança.`;

const extractionTool = {
  type: "function",
  function: {
    name: "extrair_dados_documentos",
    description: "Extrai dados estruturados dos documentos de identificação e conta de luz",
    parameters: {
      type: "object",
      properties: {
        sucesso: {
          type: "boolean",
          description: "Se a extração foi bem sucedida (pelo menos alguns campos foram lidos)"
        },
        confianca: {
          type: "number",
          description: "Nível de confiança geral da extração de 0 a 100"
        },
        dados: {
          type: "object",
          properties: {
            // Dados principais do RG/CNH
            nome_completo: { type: ["string", "null"], description: "Nome completo do titular" },
            cpf: { type: ["string", "null"], description: "CPF com 11 dígitos apenas" },
            data_nascimento: { type: ["string", "null"], description: "Data de nascimento DD/MM/AAAA" },
            
            // Dados adicionais do RG
            rg_numero: { type: ["string", "null"], description: "Número do RG (apenas números e letras)" },
            rg_orgao_emissor: { type: ["string", "null"], description: "Órgão emissor do RG (ex: SSP-MG, DETRAN-SP)" },
            rg_data_emissao: { type: ["string", "null"], description: "Data de emissão do RG DD/MM/AAAA" },
            
            // Dados adicionais da CNH
            cnh_numero: { type: ["string", "null"], description: "Número da CNH (11 dígitos)" },
            cnh_categoria: { type: ["string", "null"], description: "Categoria da CNH (A, B, AB, C, D, E, ACC)" },
            cnh_validade: { type: ["string", "null"], description: "Validade da CNH DD/MM/AAAA" },
            
            // Filiação e naturalidade
            nome_mae: { type: ["string", "null"], description: "Nome completo da mãe" },
            nome_pai: { type: ["string", "null"], description: "Nome completo do pai" },
            naturalidade: { type: ["string", "null"], description: "Cidade/UF de nascimento (ex: Belo Horizonte-MG)" },
            nacionalidade: { type: ["string", "null"], description: "Nacionalidade (ex: Brasileiro)" },
            
            // Dados da conta de luz
            numero_uc: { type: ["string", "null"], description: "Número da Unidade Consumidora" },
            cpf_cnpj_titular: { type: ["string", "null"], description: "CPF ou CNPJ do titular da conta" },
            
            // Endereço separado em componentes
            logradouro: { type: ["string", "null"], description: "Apenas rua/avenida SEM número (ex: RUA IPE BRANCO)" },
            numero_endereco: { type: ["string", "null"], description: "Número do imóvel (ex: 87, 1500, S/N)" },
            complemento: { type: ["string", "null"], description: "Apartamento, bloco, sala (ex: AP 1501, BLOCO A)" },
            bairro: { type: ["string", "null"], description: "Nome do bairro (ex: VALE DO SERENO)" },
            endereco: { type: ["string", "null"], description: "Endereço completo concatenado para exibição" },
            cep: { type: ["string", "null"], description: "CEP com 8 dígitos" },
            cidade: { type: ["string", "null"], description: "Nome da cidade" },
            uf: { type: ["string", "null"], description: "Sigla do estado (2 letras)" },
            
            // Tarifa de energia
            tarifa_energia: { type: ["number", "null"], description: "Preço unitário da energia em R$/kWh (ex: 1.16025107)" },
            
            tipo_instalacao: { 
              type: ["string", "null"], 
              enum: ["Monofásico", "Bifásico", "Trifásico", null],
              description: "Tipo de ligação elétrica" 
            },
            classe_consumo: { 
              type: ["string", "null"], 
              enum: ["Residencial", "Comercial", "Industrial", "Rural", null],
              description: "Classe de consumo" 
            },
            tipo_pessoa: { 
              type: ["string", "null"], 
              enum: ["PF", "PJ", null],
              description: "Pessoa Física ou Jurídica" 
            },
            concessionaria: {
              type: ["string", "null"],
              description: "Sigla da concessionária de energia identificada pelo logo ou nome na fatura"
            },
            
            // Dados adicionais da fatura
            telefone_contato: { type: ["string", "null"], description: "Telefone do titular com DDD (apenas números, ex: 31999998888)" },
            email_contato: { type: ["string", "null"], description: "Email do titular se presente na fatura" },
            numero_cliente: { type: ["string", "null"], description: "Número do cliente na concessionária" },
            data_vencimento: { type: ["string", "null"], description: "Data de vencimento da fatura DD/MM/AAAA" },
            valor_fatura: { type: ["number", "null"], description: "Valor total da fatura em reais" },
            
            // CIP - Contribuição de Iluminação Pública
            cip_valor: { 
              type: ["number", "null"], 
              description: "Valor da Contrib Ilum Publica Municipal (CIP/COSIP) em reais (ex: 44.79)" 
            },
            
            // Cliente recebe energia externa (GD - Geração Distribuída)
            recebe_energia_externa: { 
              type: ["boolean", "null"], 
              description: "TRUE se existe 'Energia SCEE s/ ICMS' ou 'Energia Injetada' com quantidade > 0 na fatura" 
            },
            energia_scee_kwh: { 
              type: ["number", "null"], 
              description: "Quantidade em kWh da linha 'Energia SCEE s/ ICMS' ou energia injetada/compensada" 
            },
            
            // Saldo de geração acumulado
            tem_saldo_geracao: { 
              type: ["boolean", "null"], 
              description: "TRUE se SALDO ATUAL DE GERAÇÃO > 0 (cliente tem créditos de GD)" 
            },
            saldo_geracao_kwh: { 
              type: ["number", "null"], 
              description: "Valor do SALDO ATUAL DE GERAÇÃO em kWh" 
            },
            
            // Histórico de consumo
            historico_consumo: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  mes_ano: { type: "string", description: "Mês/Ano no formato encontrado na tabela (ex: JAN/24, 01/2024)" },
                  consumo_kwh: { type: "number", description: "Consumo em kWh do mês" }
                },
                required: ["mes_ano", "consumo_kwh"]
              },
              description: "Histórico de consumo dos últimos meses extraído da tabela 'Histórico de Consumo'"
            },
            consumo_media_anual: { 
              type: ["number", "null"], 
              description: "Média mensal calculada de todos os meses disponíveis no histórico" 
            },
            consumo_media_trimestral: { 
              type: ["number", "null"], 
              description: "Média dos últimos 3 meses do histórico" 
            },
            consumo_ultimo_mes: { 
              type: ["number", "null"], 
              description: "Consumo do mês mais recente no histórico" 
            },
            
            // Validação anti-fraude de titularidade
            validacao_titular: {
              type: "object",
              properties: {
                documentos_mesmo_titular: { 
                  type: ["boolean", "null"], 
                  description: "TRUE se CPF do RG/CNH = CPF da conta de luz, FALSE se diferentes, NULL se não verificável" 
                },
                cpf_identificacao: { 
                  type: ["string", "null"], 
                  description: "CPF extraído do documento de identificação (11 dígitos)" 
                },
                cpf_cnpj_conta: { 
                  type: ["string", "null"], 
                  description: "CPF ou CNPJ extraído da conta de luz" 
                },
                tipo_divergencia: { 
                  type: ["string", "null"], 
                  enum: ["cpf_diferente", "cnpj_pj", "dados_incompletos", null],
                  description: "Tipo de divergência: cpf_diferente (fraude), cnpj_pj (empresa), dados_incompletos (não legível)" 
                },
                confianca_validacao: { 
                  type: ["number", "null"], 
                  description: "Nível de confiança da validação de 0 a 100" 
                }
              },
              required: ["documentos_mesmo_titular", "tipo_divergencia", "confianca_validacao"],
              description: "Resultado da validação cruzada de titularidade entre os documentos"
            }
          },
          required: ["nome_completo", "cpf", "numero_uc", "cpf_cnpj_titular", "endereco", "cep", "cidade", "uf", "validacao_titular"]
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

// Helper: detect MIME type from file extension
function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'png': return 'image/png';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    default: return 'application/octet-stream';
  }
}

// Helper: create a signed URL for a file in Storage (valid for 5 minutes)
async function getSignedUrl(supabase: ReturnType<typeof createClient>, storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('documentos-clientes')
    .createSignedUrl(storagePath, 300); // 5 min expiry

  if (error || !data?.signedUrl) {
    throw new Error(`Erro ao gerar URL do arquivo: ${error?.message || 'arquivo não encontrado'}`);
  }

  return data.signedUrl;
}

// Helper: download file from Storage and convert to base64 data URI (for PDFs only)
async function downloadFileAsBase64(supabase: ReturnType<typeof createClient>, storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('documentos-clientes')
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Erro ao baixar arquivo do storage: ${error?.message || 'arquivo não encontrado'}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const b64 = base64Encode(bytes);
  const mime = getMimeType(storagePath);
  return `data:${mime};base64,${b64}`;
}

// Helper: get file content for AI - signed URL for images, base64 for PDFs
async function getFileContent(supabase: ReturnType<typeof createClient>, storagePath: string): Promise<{ dataUri?: string; signedUrl?: string; mime: string }> {
  const mime = getMimeType(storagePath);
  
  if (mime === 'application/pdf') {
    // PDFs need base64 data URI for the AI Gateway file type
    const dataUri = await downloadFileAsBase64(supabase, storagePath);
    return { dataUri, mime };
  } else {
    // Images can use signed URLs directly
    const signedUrl = await getSignedUrl(supabase, storagePath);
    return { signedUrl, mime };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Document extraction request received');

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const body = await req.json();
    const { documentoIdentificacaoPath, contaLuzPath } = body;

    // Validate required fields
    if (!documentoIdentificacaoPath || typeof documentoIdentificacaoPath !== 'string') {
      return new Response(
        JSON.stringify({ sucesso: false, erro: 'documentoIdentificacaoPath é obrigatório', dados: {}, avisos: [], confianca: 0 }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!contaLuzPath || typeof contaLuzPath !== 'string') {
      return new Response(
        JSON.stringify({ sucesso: false, erro: 'contaLuzPath é obrigatório', dados: {}, avisos: [], confianca: 0 }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role to access private bucket
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`Processing files: ${documentoIdentificacaoPath}, ${contaLuzPath}`);

    // Process files SEQUENTIALLY to reduce peak memory usage (especially for PDFs)
    console.log(`Loading doc 1: ${documentoIdentificacaoPath}`);
    const docContent = await getFileContent(supabase, documentoIdentificacaoPath);
    console.log(`Doc 1 ready (${docContent.mime})`);
    
    console.log(`Loading doc 2: ${contaLuzPath}`);
    const contaContent = await getFileContent(supabase, contaLuzPath);
    console.log(`Doc 2 ready (${contaContent.mime})`);

    console.log(`Both files ready, sending to AI...`);

    const messageContent: any[] = [
      { 
        type: "text", 
        text: "Analise os dois documentos abaixo e extraia todos os dados solicitados.\n\nDocumento 1: Documento de Identificação (RG/CNH)\nDocumento 2: Conta de Luz\n\nExtraia os dados usando a função fornecida." 
      }
    ];

    // Add doc 1
    if (docContent.dataUri) {
      messageContent.push({
        type: "file",
        file: { filename: "identificacao.pdf", file_data: docContent.dataUri }
      });
    } else {
      messageContent.push({
        type: "image_url",
        image_url: { url: docContent.signedUrl! }
      });
    }

    // Add doc 2
    if (contaContent.dataUri) {
      messageContent.push({
        type: "file",
        file: { filename: "conta_luz.pdf", file_data: contaContent.dataUri }
      });
    } else {
      messageContent.push({
        type: "image_url",
        image_url: { url: contaContent.signedUrl! }
      });
    }

    // Add 55s timeout to prevent silent hangs
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      signal: controller.signal,
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: messageContent }
        ],
        tools: [extractionTool],
        tool_choice: { type: "function", function: { name: "extrair_dados_documentos" } }
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ sucesso: false, erro: "Muitas requisições. Aguarde um momento e tente novamente.", dados: {}, avisos: [], confianca: 0 }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ sucesso: false, erro: "Créditos insuficientes. Por favor, preencha os dados manualmente.", dados: {}, avisos: [], confianca: 0 }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI Response received");

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall || toolCall.function.name !== "extrair_dados_documentos") {
      console.error("No tool call found in response");
      return new Response(
        JSON.stringify({ sucesso: false, erro: "Não foi possível processar os documentos. Tente novamente ou preencha manualmente.", dados: {}, avisos: [], confianca: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    console.log("Extraction completed successfully");

    return new Response(
      JSON.stringify(extractedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error in extrair-dados-documentos:", error);
    return new Response(
      JSON.stringify({ 
        sucesso: false, 
        erro: error instanceof Error ? error.message : "Erro desconhecido ao processar documentos",
        dados: {},
        avisos: [],
        confianca: 0
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
