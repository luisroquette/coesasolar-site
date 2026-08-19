import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStrictCorsHeaders, handleCorsPrelight, errorResponse } from '../_shared/security-helpers.ts';
import { validateBitrix24UpdateLead } from '../_shared/zod-schemas.ts';

interface DataDivergence {
  campo: string;
  campoLabel: string;
  valorOriginal: string | number | null;
  valorExtraido: string | number | null;
  tipo: 'texto' | 'numero' | 'documento';
}

interface DadosEmpresaPJ {
  razao_social: string;
  cnpj: string;
  nire?: string;
  inscricao_estadual?: string;
  natureza_juridica?: string;
  objeto_social?: string;
  data_constituicao?: string;
  sede_logradouro?: string;
  sede_numero?: string;
  sede_complemento?: string;
  sede_bairro?: string;
  sede_cidade?: string;
  sede_uf?: string;
  sede_cep?: string;
  admin_nome_completo: string;
  admin_cpf: string;
  admin_rg?: string;
  admin_rg_orgao?: string;
  admin_data_nascimento?: string;
  admin_estado_civil?: string;
  admin_profissao?: string;
  admin_nacionalidade?: string;
  admin_endereco?: string;
  admin_cidade?: string;
  admin_uf?: string;
  admin_cep?: string;
  quadro_societario?: Array<{
    nome_completo: string;
    cpf_cnpj?: string;
    participacao_percentual?: number;
    tipo_socio?: string;
    e_administrador?: boolean;
  }>;
  poderes_plenos?: boolean;
  requer_assinatura_conjunta?: boolean;
}

interface UpdateLeadRequest {
  propostaInicialId: string;
  dados: {
    cpf_cnpj: string;
    endereco: string;
    cep: string;
    cidade: string;
    uf: string;
    numero_instalacao: string;
    numero_ucs: number;
    tipo_instalacao: string;
    consumo_medio_real?: number;
    tipo_pessoa: 'PF' | 'PJ';
    desconto_percentual?: number;
    fidelidade_anos?: number;
    documento_identificacao_url: string;
    conta_luz_url: string;
    contrato_social_url?: string;
    // Campos para retificação
    nome_retificado?: string;
    concessionaria?: string;
    divergencias?: DataDivergence[] | null;
    // Novos campos extraídos dos documentos
    data_nascimento?: string;
    rg_numero?: string;
    rg_orgao_emissor?: string;
    rg_data_emissao?: string;
    cnh_numero?: string;
    cnh_categoria?: string;
    cnh_validade?: string;
    nome_mae?: string;
    nome_pai?: string;
    naturalidade?: string;
    nacionalidade?: string;
    telefone_contato?: string;
    email_contato?: string;
    numero_cliente?: string;
    data_vencimento?: string;
    valor_fatura?: number;
    classe_consumo?: string;
    // Campos especiais CEMIG
    cip_valor?: number;
    recebe_energia_externa?: boolean;
    energia_scee_kwh?: number;
    tem_saldo_geracao?: boolean;
    saldo_geracao_kwh?: number;
    // Novos campos de endereço separados
    logradouro?: string;
    numero_endereco?: string;
    complemento?: string;
    bairro?: string;
    // Tarifa
    tarifa_energia?: number;
    // Dados da Empresa PJ (quando tipo_pessoa === 'PJ')
    dados_empresa_pj?: DadosEmpresaPJ;
  };
}

// Map installation type to Bitrix24 list IDs (enum values from Bitrix24)
const TIPO_INSTALACAO_MAP: Record<string, string> = {
  'Monofásico': '659',
  'Bifásico': '661',
  'Trifásico': '663',
};

// Map concessionária name to Bitrix24 list IDs (enum values)
const CONCESSIONARIA_MAP: Record<string, string> = {
  'CEMIG': '679', 'CEMIG - MG': '679',
  'Energisa MG': '859',
  'CPFL Paulista': '677', 'CPFL Paulista - SP': '677',
  'CPFL Piratininga': '863', 'CPFL Piratininga - SP': '863',
  'CPFL Santa Cruz': '865', 'CPFL Santa Cruz - SP': '865',
  'EDP São Paulo': '867', 'EDP São Paulo - SP': '867', 'EDP SP': '867',
  'Enel SP': '869', 'Enel SP - SP': '869',
  'Energisa Sul-Sudeste': '871', 'Energisa Sul-Sudeste - MG/ES/RJ/SP': '871',
  'Light': '873', 'Light - RJ': '873',
  'RGE': '875', 'RGE (CPFL)': '875', 'RGE (CPFL) - RS': '875',
  'Neoenergia Coelba': '675', 'Neoenergia Coelba - BA': '675', 'COELBA': '675',
  'Neoenergia Pernambuco': '877', 'Neoenergia Pernambuco - PE': '877',
  'Neoenergia Cosern': '879', 'Neoenergia Cosern - RN': '879',
  'Enel CE': '681', 'Enel CE - CE': '681',
  'Enel RJ': '881', 'Enel RJ - RJ': '881',
  'Equatorial Alagoas': '883', 'Equatorial Alagoas - AL': '883',
  'Equatorial Piauí': '885', 'Equatorial Piauí - PI': '885',
  'Equatorial Maranhão': '887', 'Equatorial Maranhão - MA': '887',
  'Energisa Acre': '889', 'Energisa Acre - AC': '889',
  'Energisa Rondônia': '891', 'Energisa Rondônia - RO': '891',
  'Energisa Tocantins': '893', 'Energisa Tocantins - TO': '893',
  'Equatorial Pará': '895', 'Equatorial Pará - PA': '895',
  'Neoenergia Brasília': '897', 'Neoenergia Brasília - DF': '897',
  'Neoenergia Elektro': '899', 'Neoenergia Elektro - SP/MS': '899',
  'Energisa Mato Grosso': '901', 'Energisa Mato Grosso - MT': '901',
  'Energisa MS': '903', 'Energisa MS - MS': '903',
  'Energisa Sergipe': '905', 'Energisa Sergipe - SE': '905',
  'Energisa Paraíba': '907', 'Energisa Paraíba - PB': '907',
};

// Map concessionária name to CNPJ
const CONCESSIONARIA_CNPJ_MAP: Record<string, string> = {
  'CEMIG': '06.981.180/0001-16',
  'CEMIG - MG': '06.981.180/0001-16',
  'Energisa MG': '00.648.336/0001-92',
};

// Helper: find concessionária ID by fuzzy matching
function findConcessionariaId(nome: string): string | null {
  if (!nome) return null;
  const normalized = nome.trim();
  if (CONCESSIONARIA_MAP[normalized]) return CONCESSIONARIA_MAP[normalized];
  const lowerNome = normalized.toLowerCase();
  for (const [key, id] of Object.entries(CONCESSIONARIA_MAP)) {
    if (key.toLowerCase() === lowerNome) return id;
  }
  for (const [key, id] of Object.entries(CONCESSIONARIA_MAP)) {
    if (lowerNome.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerNome)) return id;
  }
  return null;
}

// Helper: find concessionária CNPJ by fuzzy matching
function findConcessionariaCnpj(nome: string): string | null {
  if (!nome) return null;
  const normalized = nome.trim();
  if (CONCESSIONARIA_CNPJ_MAP[normalized]) return CONCESSIONARIA_CNPJ_MAP[normalized];
  const lowerNome = normalized.toLowerCase();
  for (const [key, cnpj] of Object.entries(CONCESSIONARIA_CNPJ_MAP)) {
    if (key.toLowerCase() === lowerNome) return cnpj;
  }
  for (const [key, cnpj] of Object.entries(CONCESSIONARIA_CNPJ_MAP)) {
    if (lowerNome.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerNome)) return cnpj;
  }
  return null;
}

Deno.serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION: Validate request payload
    // ═══════════════════════════════════════════════════════════════
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400, req);
    }
    
    const validation = validateBitrix24UpdateLead(rawBody);
    if (!validation.success) {
      const errorMsg = validation.errors?.map(e => `${e.field}: ${e.message}`).join(', ');
      console.warn('[bitrix24-update-lead] Validation failed:', errorMsg);
      return errorResponse(`Validation failed: ${errorMsg}`, 400, req);
    }
    
    // Type assertion to use our more complete interface
    const { propostaInicialId, dados } = validation.data! as UpdateLeadRequest;
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log(`[bitrix24-update-lead] Processing proposal: ${propostaInicialId}`);
    console.log(`[bitrix24-update-lead] Data received:`, JSON.stringify(dados, null, 2));

    // Log divergences if any
    if (dados.divergencias && dados.divergencias.length > 0) {
      console.log(`[bitrix24-update-lead] 🔄 DIVERGÊNCIAS DETECTADAS: ${dados.divergencias.length} campos`);
      dados.divergencias.forEach(d => {
        console.log(`  - ${d.campoLabel}: "${d.valorOriginal}" → "${d.valorExtraido}"`);
      });
    }

    // 1. Fetch the initial proposal to get bitrix24_lead_id
    const { data: proposta, error: propostaError } = await supabase
      .from('propostas_assinantes')
      .select('bitrix24_lead_id, cliente_nome, desconto_percentual, fidelidade_anos')
      .eq('id', propostaInicialId)
      .single();

    if (propostaError || !proposta) {
      console.error(`[bitrix24-update-lead] Proposal not found:`, propostaError);
      return new Response(
        JSON.stringify({ error: 'Proposta não encontrada', details: propostaError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!proposta.bitrix24_lead_id) {
      console.warn(`[bitrix24-update-lead] Proposal ${propostaInicialId} has no Bitrix24 lead ID`);
      return new Response(
        JSON.stringify({ 
          error: 'Lead não vinculado ao Bitrix24',
          message: 'Esta proposta não está sincronizada com o Bitrix24. Os dados foram salvos localmente.'
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[bitrix24-update-lead] Found Bitrix24 lead ID: ${proposta.bitrix24_lead_id}`);

    // 2. Fetch Bitrix24 configurations (including cache bust for URL versioning)
    const configKeys = [
      'bitrix24_webhook_url',
      'bitrix24_target_status_id',
      'public_app_url',
      'public_cache_bust',
    ];

    // Buscar TODOS os campos customizados do Bitrix24 (prefixo bitrix24_custom_field_)
    const { data: customFieldConfigs, error: customConfigError } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .like('chave', 'bitrix24_custom_field_%');

    // Buscar campos de CONTATO do Bitrix24 (prefixo bitrix24_contact_field_)
    const { data: contactFieldConfigs, error: contactConfigError } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .like('chave', 'bitrix24_contact_field_%');

    const { data: configs, error: configError } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', configKeys);


    if (configError || customConfigError || contactConfigError) {
      console.error(`[bitrix24-update-lead] Error fetching configs:`, configError || customConfigError || contactConfigError);
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar configurações', details: (configError || customConfigError || contactConfigError)?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const configMap: Record<string, string> = {};
    configs?.forEach(c => { configMap[c.chave] = c.valor; });
    
    // Criar mapa de campos customizados de LEAD: nome_campo -> ID_Bitrix
    const customFieldMap: Record<string, string> = {};
    customFieldConfigs?.forEach(c => {
      const fieldName = c.chave.replace('bitrix24_custom_field_', '');
      customFieldMap[fieldName] = c.valor;
    });
    
    // Criar mapa de campos customizados de CONTATO: nome_campo -> ID_Bitrix
    const contactFieldMap: Record<string, string> = {};
    contactFieldConfigs?.forEach(c => {
      const fieldName = c.chave.replace('bitrix24_contact_field_', '');
      contactFieldMap[fieldName] = c.valor;
    });
    
    console.log(`[bitrix24-update-lead] Custom field mappings loaded - Lead: ${Object.keys(customFieldMap).length}, Contact: ${Object.keys(contactFieldMap).length}`);

    const bitrix24Url = configMap['bitrix24_webhook_url'];
    const targetStatusId = configMap['bitrix24_target_status_id'];
    const publicAppUrl = configMap['public_app_url'] || '';
    const publicCacheBust = configMap['public_cache_bust'] || '';

    if (!bitrix24Url) {
      console.error(`[bitrix24-update-lead] Missing bitrix24_webhook_url configuration`);
      return new Response(
        JSON.stringify({ error: 'Webhook do Bitrix24 não configurado' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!targetStatusId) {
      console.error(`[bitrix24-update-lead] Missing bitrix24_target_status_id configuration`);
      return new Response(
        JSON.stringify({ error: 'Etapa de Proposta Definitiva não configurada no Bitrix24' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[bitrix24-update-lead] Target status ID: ${targetStatusId}`);

    // 3. Build update fields
    const updateFields: Record<string, string> = {};

    // STATUS_ID - Move to definitive proposal stage
    updateFields['STATUS_ID'] = targetStatusId;

    // RETIFICAÇÃO: Se houver nome retificado, atualizar TITLE e NAME/LAST_NAME
    if (dados.nome_retificado) {
      console.log(`[bitrix24-update-lead] 📝 Retificando nome: "${proposta.cliente_nome}" → "${dados.nome_retificado}"`);
      updateFields['TITLE'] = dados.nome_retificado;
      
      // Separar primeiro nome e sobrenome
      updateFields['NAME'] = dados.nome_retificado.trim();
    }

    // ========== MAPEAMENTO DINÂMICO VIA customFieldMap ==========
    // Usar campos customizados configurados na tabela configuracoes_sistema
    
    // CPF/CNPJ
    if (dados.cpf_cnpj && customFieldMap['cpf_cnpj']) {
      updateFields[customFieldMap['cpf_cnpj']] = dados.cpf_cnpj;
    }
    
    // Endereço completo
    if (dados.endereco && customFieldMap['endereco_completo']) {
      updateFields[customFieldMap['endereco_completo']] = dados.endereco;
    }
    
    // Logradouro (rua sem número)
    if (dados.logradouro && customFieldMap['endereco']) {
      updateFields[customFieldMap['endereco']] = dados.logradouro;
    }
    
    // Número do endereço
    if (dados.numero_endereco && customFieldMap['numero']) {
      updateFields[customFieldMap['numero']] = dados.numero_endereco;
    }
    
    // Complemento
    if (dados.complemento && customFieldMap['complemento']) {
      updateFields[customFieldMap['complemento']] = dados.complemento;
    }
    
    // Bairro
    if (dados.bairro && customFieldMap['bairro']) {
      updateFields[customFieldMap['bairro']] = dados.bairro;
    }
    
    // CEP
    if (dados.cep && customFieldMap['cep']) {
      updateFields[customFieldMap['cep']] = dados.cep;
    }
    
    // Cidade
    if (dados.cidade && customFieldMap['cidade']) {
      updateFields[customFieldMap['cidade']] = dados.cidade;
    }
    
    // UF (Estado)
    if (dados.uf && customFieldMap['estado']) {
      updateFields[customFieldMap['estado']] = dados.uf;
    }
    
    // Número UC
    if (dados.numero_instalacao && customFieldMap['numero_uc']) {
      updateFields[customFieldMap['numero_uc']] = dados.numero_instalacao;
    }

    // Tipo de Instalação
    if (dados.tipo_instalacao && TIPO_INSTALACAO_MAP[dados.tipo_instalacao]) {
      const tipoInstalacaoField = customFieldMap['tipo_instalacao'] || 'UF_CRM_LEAD_1759426797107';
      updateFields[tipoInstalacaoField] = TIPO_INSTALACAO_MAP[dados.tipo_instalacao];
    }

    // Tipo de Cliente (PF/PJ) - UF_CRM_1758906686
    if (dados.tipo_pessoa) {
      const tipoClienteMap: Record<string, string> = { 'PF': '635', 'PJ': '637' };
      updateFields['UF_CRM_1758906686'] = tipoClienteMap[dados.tipo_pessoa] || '635';
      console.log(`[bitrix24-update-lead] 👤 Tipo de Cliente: ${dados.tipo_pessoa} → ${tipoClienteMap[dados.tipo_pessoa]}`);
    }

    // Tipo de Fidelidade - UF_CRM_1758906628 (sempre "Com fidelidade" = 631)
    updateFields['UF_CRM_1758906628'] = '631';
    console.log(`[bitrix24-update-lead] 📋 Tipo de Fidelidade: Com fidelidade (631)`);

    // Fidelidade Desejada - UF_CRM_1759191446747
    // Map by desconto_percentual (primary) since it uniquely identifies the plan
    if (dados.desconto_percentual) {
      const fidelidadeByDesconto: Record<number, string> = {
        15: '643',   // 12 meses - 15% de desconto
        20: '645',   // 24 meses - 20% de desconto
        25: '647',   // 36 meses - 25% de desconto
        30: '649',   // 36 meses - 30% de desconto (Unlock)
      };
      const fidelidadeId = fidelidadeByDesconto[dados.desconto_percentual];
      if (fidelidadeId) {
        updateFields['UF_CRM_1759191446747'] = fidelidadeId;
        console.log(`[bitrix24-update-lead] ⏱️ Fidelidade Desejada: ${dados.desconto_percentual}% → ${fidelidadeId}`);
      } else {
        console.warn(`[bitrix24-update-lead] ⚠️ No mapping for desconto ${dados.desconto_percentual}%`);
      }
    }

    // Desconto percentual numérico - UF_CRM_1755881813 (type: double)
    if (dados.desconto_percentual) {
      updateFields['UF_CRM_1755881813'] = String(dados.desconto_percentual);
      console.log(`[bitrix24-update-lead] 💰 Desconto %: ${dados.desconto_percentual}`);
    }

    // Prazo em meses - UF_CRM_1759186547 (type: double)
    if (dados.desconto_percentual) {
      const descontoToMeses: Record<number, number> = {
        15: 12, 20: 24, 25: 36, 30: 48,
      };
      const meses = descontoToMeses[dados.desconto_percentual];
      if (meses) {
        updateFields['UF_CRM_1759186547'] = String(meses);
        console.log(`[bitrix24-update-lead] 📅 Prazo meses: ${meses}`);
      }
    }

    // Data de emissão do contrato - UF_CRM_1759186309 (type: date)
    {
      const now = new Date();
      const dataEmissao = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      updateFields['UF_CRM_1759186309'] = dataEmissao;
      console.log(`[bitrix24-update-lead] 📅 Data emissão: ${dataEmissao}`);
    }

    // Concessionária - UF_CRM_1759750064 (type: enumeration - LISTA)
    if (dados.concessionaria) {
      const concessionariaId = findConcessionariaId(dados.concessionaria);
      if (concessionariaId) {
        updateFields['UF_CRM_1759750064'] = concessionariaId;
        console.log(`[bitrix24-update-lead] ⚡ Concessionária: "${dados.concessionaria}" → ID ${concessionariaId}`);
      } else {
        // Fallback: usar "OUTROS - ANOTAÇÃO" (831) e registrar o nome
        updateFields['UF_CRM_1759750064'] = '831';
        console.warn(`[bitrix24-update-lead] ⚠️ Concessionária não mapeada: "${dados.concessionaria}" → OUTROS (831)`);
      }
    }
    
    // Tarifa de Energia
    if (dados.tarifa_energia && customFieldMap['tarifa_energia']) {
      updateFields[customFieldMap['tarifa_energia']] = String(dados.tarifa_energia);
      console.log(`[bitrix24-update-lead] ⚡ Tarifa: R$ ${dados.tarifa_energia}/kWh`);
    }

    // Consumo médio real
    if (dados.consumo_medio_real) {
      updateFields['UF_CRM_1755881740'] = String(dados.consumo_medio_real);
    }

    // ========== NOVOS CAMPOS EXTRAÍDOS DOS DOCUMENTOS ==========
    
    // Data de nascimento (campo nativo do Bitrix24)
    if (dados.data_nascimento) {
      // Converter DD/MM/AAAA para YYYY-MM-DD (formato ISO)
      const partes = dados.data_nascimento.split('/');
      if (partes.length === 3) {
        const [dia, mes, ano] = partes;
        updateFields['BIRTHDATE'] = `${ano}-${mes}-${dia}`;
        console.log(`[bitrix24-update-lead] 📅 Data de nascimento: ${dados.data_nascimento} → ${updateFields['BIRTHDATE']}`);
      }
    }

    // Telefone de contato (campo nativo do Bitrix24 - array de telefones)
    // NOTA: Para atualizar telefone no Bitrix24, usamos campos customizados
    if (dados.telefone_contato) {
      // Campo customizado para telefone extraído - ajustar ID conforme configuração
      updateFields['UF_CRM_1759187200'] = dados.telefone_contato;
      console.log(`[bitrix24-update-lead] 📱 Telefone extraído: ${dados.telefone_contato}`);
    }

    // Email de contato
    if (dados.email_contato) {
      updateFields['UF_CRM_1759187300'] = dados.email_contato;
      console.log(`[bitrix24-update-lead] 📧 Email extraído: ${dados.email_contato}`);
    }

    // RG - Número (enviar para ambos os campos: o legado e o correto do template)
    if (dados.rg_numero) {
      updateFields['UF_CRM_1759185542'] = dados.rg_numero;
      updateFields['UF_CRM_1757526016904'] = dados.rg_numero; // Campo correto usado no template do contrato
      console.log(`[bitrix24-update-lead] 🪪 RG: ${dados.rg_numero} → UF_CRM_1759185542 + UF_CRM_1757526016904`);
    }

    // RG - Órgão Emissor
    if (dados.rg_orgao_emissor) {
      updateFields['UF_CRM_1759185830'] = dados.rg_orgao_emissor;
      console.log(`[bitrix24-update-lead] 🏛️ Órgão Emissor: ${dados.rg_orgao_emissor}`);
    }

    // RG - Data de Emissão
    if (dados.rg_data_emissao) {
      const partes = dados.rg_data_emissao.split('/');
      if (partes.length === 3) {
        const [dia, mes, ano] = partes;
        updateFields['UF_CRM_1759185900'] = `${ano}-${mes}-${dia}`;
      }
    }

    // CNH - Número
    if (dados.cnh_numero) {
      updateFields['UF_CRM_1759186000'] = dados.cnh_numero;
      console.log(`[bitrix24-update-lead] 🚗 CNH: ${dados.cnh_numero}`);
    }

    // CNH - Categoria
    if (dados.cnh_categoria) {
      updateFields['UF_CRM_1759186100'] = dados.cnh_categoria;
    }

    // CNH - Validade
    if (dados.cnh_validade) {
      const partes = dados.cnh_validade.split('/');
      if (partes.length === 3) {
        const [dia, mes, ano] = partes;
        updateFields['UF_CRM_1759186200'] = `${ano}-${mes}-${dia}`;
      }
    }

    // CNPJ da Concessionária - UF_CRM_1759186960 (usado no template do contrato)
    if (dados.concessionaria) {
      const cnpjConcessionaria = findConcessionariaCnpj(dados.concessionaria);
      if (cnpjConcessionaria) {
        updateFields['UF_CRM_1759186960'] = cnpjConcessionaria;
        console.log(`[bitrix24-update-lead] 🏢 CNPJ Concessionária: "${dados.concessionaria}" → ${cnpjConcessionaria}`);
      } else {
        console.warn(`[bitrix24-update-lead] ⚠️ CNPJ não encontrado para concessionária: "${dados.concessionaria}"`);
      }
    }

    // Nome do Pai
    if (dados.nome_pai) {
      updateFields['UF_CRM_1759186970'] = dados.nome_pai;
    }

    // Naturalidade
    if (dados.naturalidade) {
      updateFields['UF_CRM_1759186980'] = dados.naturalidade;
    }

    // Nacionalidade
    if (dados.nacionalidade) {
      updateFields['UF_CRM_1759186990'] = dados.nacionalidade;
    }

    // Número do Cliente na Concessionária
    if (dados.numero_cliente) {
      updateFields['UF_CRM_1759187400'] = dados.numero_cliente;
    }

    // Valor da Fatura (campo de valor monetário no Bitrix24)
    if (dados.valor_fatura) {
      updateFields['UF_CRM_1755817510'] = `${dados.valor_fatura}|BRL`;
      console.log(`[bitrix24-update-lead] 💰 Valor Fatura: R$ ${dados.valor_fatura}`);
    }

    // Classe de Consumo
    if (dados.classe_consumo) {
      updateFields['UF_CRM_1759187500'] = dados.classe_consumo;
    }

    // ========== CAMPOS ESPECIAIS CEMIG (IDs configuráveis) ==========
    
    // CIP - Contribuição de Iluminação Pública
    if (dados.cip_valor !== undefined && dados.cip_valor !== null && configMap['bitrix24_field_cip']) {
      updateFields[configMap['bitrix24_field_cip']] = `${dados.cip_valor}|BRL`;
      console.log(`[bitrix24-update-lead] 💡 CIP: R$ ${dados.cip_valor} → ${configMap['bitrix24_field_cip']}`);
    }

    // Cliente recebe energia de outra fonte (GD)
    if (dados.recebe_energia_externa !== undefined && dados.recebe_energia_externa !== null && configMap['bitrix24_field_recebe_energia_externa']) {
      // Campo tipo lista no Bitrix24 - usar valores correspondentes (SIM/NAO)
      updateFields[configMap['bitrix24_field_recebe_energia_externa']] = dados.recebe_energia_externa ? 'SIM' : 'NAO';
      console.log(`[bitrix24-update-lead] ⚡ Recebe energia externa (GD): ${dados.recebe_energia_externa ? 'SIM' : 'NÃO'} → ${configMap['bitrix24_field_recebe_energia_externa']}`);
    }

    // Quantidade de energia SCEE em kWh
    if (dados.energia_scee_kwh && configMap['bitrix24_field_energia_scee_kwh']) {
      updateFields[configMap['bitrix24_field_energia_scee_kwh']] = String(dados.energia_scee_kwh);
      console.log(`[bitrix24-update-lead] ⚡ Energia SCEE: ${dados.energia_scee_kwh} kWh → ${configMap['bitrix24_field_energia_scee_kwh']}`);
    }

    // Cliente tem saldo de geração acumulado
    if (dados.tem_saldo_geracao !== undefined && dados.tem_saldo_geracao !== null && configMap['bitrix24_field_tem_saldo_geracao']) {
      updateFields[configMap['bitrix24_field_tem_saldo_geracao']] = dados.tem_saldo_geracao ? 'SIM' : 'NAO';
      console.log(`[bitrix24-update-lead] 🔋 Tem saldo geração: ${dados.tem_saldo_geracao ? 'SIM' : 'NÃO'} → ${configMap['bitrix24_field_tem_saldo_geracao']}`);
    }

    // Saldo de geração em kWh
    if (dados.saldo_geracao_kwh && configMap['bitrix24_field_saldo_geracao_kwh']) {
      updateFields[configMap['bitrix24_field_saldo_geracao_kwh']] = String(dados.saldo_geracao_kwh);
      console.log(`[bitrix24-update-lead] 🔋 Saldo geração: ${dados.saldo_geracao_kwh} kWh → ${configMap['bitrix24_field_saldo_geracao_kwh']}`);
    }

    // ========== CAMPOS DE PESSOA JURÍDICA (PJ) ==========
    if (dados.tipo_pessoa === 'PJ' && dados.dados_empresa_pj) {
      const pj = dados.dados_empresa_pj;
      console.log(`[bitrix24-update-lead] 🏢 Processando dados de Pessoa Jurídica...`);
      
      // Razão Social
      if (pj.razao_social && customFieldMap['razao_social']) {
        updateFields[customFieldMap['razao_social']] = pj.razao_social;
        console.log(`[bitrix24-update-lead] 🏢 Razão Social: ${pj.razao_social}`);
      }
      
      // CNPJ da empresa
      if (pj.cnpj && customFieldMap['cnpj_empresa']) {
        updateFields[customFieldMap['cnpj_empresa']] = pj.cnpj;
        console.log(`[bitrix24-update-lead] 🏢 CNPJ Empresa: ${pj.cnpj}`);
      }
      
      // NIRE
      if (pj.nire && customFieldMap['nire']) {
        updateFields[customFieldMap['nire']] = pj.nire;
      }
      
      // Inscrição Estadual
      if (pj.inscricao_estadual && customFieldMap['inscricao_estadual']) {
        updateFields[customFieldMap['inscricao_estadual']] = pj.inscricao_estadual;
      }
      
      // Natureza Jurídica
      if (pj.natureza_juridica && customFieldMap['natureza_juridica']) {
        updateFields[customFieldMap['natureza_juridica']] = pj.natureza_juridica;
      }
      
      // Objeto Social
      if (pj.objeto_social && customFieldMap['objeto_social']) {
        updateFields[customFieldMap['objeto_social']] = pj.objeto_social;
      }
      
      // Data de Constituição
      if (pj.data_constituicao && customFieldMap['data_constituicao']) {
        const partes = pj.data_constituicao.split('/');
        if (partes.length === 3) {
          const [dia, mes, ano] = partes;
          updateFields[customFieldMap['data_constituicao']] = `${ano}-${mes}-${dia}`;
        }
      }
      
      // Endereço da Sede
      if (pj.sede_logradouro && customFieldMap['sede_logradouro']) {
        updateFields[customFieldMap['sede_logradouro']] = pj.sede_logradouro;
      }
      if (pj.sede_numero && customFieldMap['sede_numero']) {
        updateFields[customFieldMap['sede_numero']] = pj.sede_numero;
      }
      if (pj.sede_complemento && customFieldMap['sede_complemento']) {
        updateFields[customFieldMap['sede_complemento']] = pj.sede_complemento;
      }
      if (pj.sede_bairro && customFieldMap['sede_bairro']) {
        updateFields[customFieldMap['sede_bairro']] = pj.sede_bairro;
      }
      if (pj.sede_cidade && customFieldMap['sede_cidade']) {
        updateFields[customFieldMap['sede_cidade']] = pj.sede_cidade;
      }
      if (pj.sede_uf && customFieldMap['sede_uf']) {
        updateFields[customFieldMap['sede_uf']] = pj.sede_uf;
      }
      if (pj.sede_cep && customFieldMap['sede_cep']) {
        updateFields[customFieldMap['sede_cep']] = pj.sede_cep;
      }
      
      // ========== DADOS DO SÓCIO ADMINISTRADOR ==========
      
      // Nome do Administrador
      if (pj.admin_nome_completo && customFieldMap['admin_nome']) {
        updateFields[customFieldMap['admin_nome']] = pj.admin_nome_completo;
        console.log(`[bitrix24-update-lead] 👤 Administrador: ${pj.admin_nome_completo}`);
      }
      
      // CPF do Administrador
      if (pj.admin_cpf && customFieldMap['admin_cpf']) {
        updateFields[customFieldMap['admin_cpf']] = pj.admin_cpf;
        console.log(`[bitrix24-update-lead] 👤 CPF Admin: ${pj.admin_cpf}`);
      }
      
      // RG do Administrador
      if (pj.admin_rg && customFieldMap['admin_rg']) {
        const rgCompleto = pj.admin_rg_orgao 
          ? `${pj.admin_rg} - ${pj.admin_rg_orgao}` 
          : pj.admin_rg;
        updateFields[customFieldMap['admin_rg']] = rgCompleto;
      }
      
      // Data de Nascimento do Administrador
      if (pj.admin_data_nascimento && customFieldMap['admin_data_nascimento']) {
        const partes = pj.admin_data_nascimento.split('/');
        if (partes.length === 3) {
          const [dia, mes, ano] = partes;
          updateFields[customFieldMap['admin_data_nascimento']] = `${ano}-${mes}-${dia}`;
        }
      }
      
      // Estado Civil do Administrador
      if (pj.admin_estado_civil && customFieldMap['admin_estado_civil']) {
        updateFields[customFieldMap['admin_estado_civil']] = pj.admin_estado_civil;
      }
      
      // Profissão do Administrador
      if (pj.admin_profissao && customFieldMap['admin_profissao']) {
        updateFields[customFieldMap['admin_profissao']] = pj.admin_profissao;
      }
      
      // Nacionalidade do Administrador
      if (pj.admin_nacionalidade && customFieldMap['admin_nacionalidade']) {
        updateFields[customFieldMap['admin_nacionalidade']] = pj.admin_nacionalidade;
      }
      
      // Endereço Residencial do Administrador
      if (pj.admin_endereco && customFieldMap['admin_endereco']) {
        updateFields[customFieldMap['admin_endereco']] = pj.admin_endereco;
      }
      if (pj.admin_cidade && customFieldMap['admin_cidade']) {
        updateFields[customFieldMap['admin_cidade']] = pj.admin_cidade;
      }
      if (pj.admin_uf && customFieldMap['admin_uf']) {
        updateFields[customFieldMap['admin_uf']] = pj.admin_uf;
      }
      if (pj.admin_cep && customFieldMap['admin_cep']) {
        updateFields[customFieldMap['admin_cep']] = pj.admin_cep;
      }
      
      // Quadro Societário (JSON)
      if (pj.quadro_societario && pj.quadro_societario.length > 0 && customFieldMap['quadro_societario']) {
        const quadroText = pj.quadro_societario
          .map(s => `${s.nome_completo}${s.participacao_percentual ? ` (${s.participacao_percentual}%)` : ''}${s.e_administrador ? ' [ADM]' : ''}`)
          .join('; ');
        updateFields[customFieldMap['quadro_societario']] = quadroText;
        console.log(`[bitrix24-update-lead] 👥 Quadro Societário: ${pj.quadro_societario.length} sócios`);
      }
    }

    console.log(`[bitrix24-update-lead] Fields to update:`, JSON.stringify(updateFields, null, 2));

    // 4. Update lead in Bitrix24
    const updateBody = new URLSearchParams();
    updateBody.append('id', proposta.bitrix24_lead_id);
    
    Object.entries(updateFields).forEach(([key, value]) => {
      updateBody.append(`fields[${key}]`, value);
    });

    console.log(`[bitrix24-update-lead] Calling Bitrix24 crm.lead.update...`);
    
    const updateResponse = await fetch(`${bitrix24Url}/crm.lead.update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: updateBody
    });

    const updateResult = await updateResponse.json();
    console.log(`[bitrix24-update-lead] Update response:`, JSON.stringify(updateResult));

    if (!updateResult.result) {
      console.error(`[bitrix24-update-lead] Failed to update lead:`, updateResult);
      
      // Log the error
      await supabase.from('bitrix24_sync_logs').insert({
        bitrix24_lead_id: proposta.bitrix24_lead_id,
        proposta_id: propostaInicialId,
        action: 'cliente_formulario_definitiva',
        status: 'error',
        error_message: JSON.stringify(updateResult.error || updateResult),
        request_data: { dados, updateFields }
      });

      return new Response(
        JSON.stringify({ 
          error: 'Erro ao atualizar lead no Bitrix24', 
          details: updateResult.error,
          savedLocally: true
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4.5. Upload document files to Bitrix24 lead (conta de luz, documento identidade, contrato social PJ)
    const fileUploadResults: Record<string, boolean> = {};
    const storageBucketName = 'documentos-clientes';

    const isHttpFileUrl = (value: string): boolean => {
      try {
        const parsedUrl = new URL(value);
        return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
      } catch {
        return false;
      }
    };

    const getFilenameFromPath = (value: string, fallback: string): string => {
      const cleanValue = decodeURIComponent(value.split('?')[0]);
      const filename = cleanValue.split('/').filter(Boolean).pop();
      return filename || fallback;
    };

    const extractStoragePathFromReference = (fileRef: string): string | null => {
      const normalizedRef = fileRef.trim();
      if (!normalizedRef) return null;

      // Already a storage path (ex: solicitacoes/...)
      if (!isHttpFileUrl(normalizedRef)) {
        return normalizedRef.replace(/^\/+/, '');
      }

      // URL format (public/signed/object): extract path after bucket name
      try {
        const parsedUrl = new URL(normalizedRef);
        const bucketToken = `/${storageBucketName}/`;
        const bucketIndex = parsedUrl.pathname.indexOf(bucketToken);
        if (bucketIndex < 0) return null;

        const storagePath = parsedUrl.pathname.slice(bucketIndex + bucketToken.length);
        return decodeURIComponent(storagePath);
      } catch {
        return null;
      }
    };

    const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
      const uint8Array = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      return btoa(binary);
    };

    const loadDocumentForUpload = async (
      fileRef: string,
      label: string,
    ): Promise<{ filename: string; base64Content: string; source: 'http' | 'storage' }> => {
      const normalizedRef = fileRef.trim();
      const fallbackName = `${label.replace(/\s+/g, '_')}.pdf`;

      // 1) Try direct HTTP fetch when a full URL is provided
      if (isHttpFileUrl(normalizedRef)) {
        try {
          const fileResponse = await fetch(normalizedRef);
          if (fileResponse.ok) {
            const fileBuffer = await fileResponse.arrayBuffer();
            const filename = getFilenameFromPath(new URL(normalizedRef).pathname, fallbackName);
            return {
              filename,
              base64Content: arrayBufferToBase64(fileBuffer),
              source: 'http',
            };
          }

          console.warn(`[bitrix24-update-lead] HTTP download failed for ${label}: ${fileResponse.status}. Trying storage fallback...`);
        } catch (httpError) {
          console.warn(`[bitrix24-update-lead] HTTP download error for ${label}. Trying storage fallback...`, httpError);
        }
      }

      // 2) Fallback: load from storage bucket using service-role client
      const storagePath = extractStoragePathFromReference(normalizedRef);
      if (!storagePath) {
        throw new Error(`Invalid file reference for ${label}: ${normalizedRef}`);
      }

      const { data: storageFile, error: storageError } = await supabase.storage
        .from(storageBucketName)
        .download(storagePath);

      if (storageError || !storageFile) {
        throw new Error(`Storage download failed for ${label}: ${storageError?.message || 'Unknown error'}`);
      }

      const fileBuffer = await storageFile.arrayBuffer();
      const filename = getFilenameFromPath(storagePath, fallbackName);

      return {
        filename,
        base64Content: arrayBufferToBase64(fileBuffer),
        source: 'storage',
      };
    };

    const fileFieldMap: Array<{ url: string | null | undefined; fieldId: string; label: string }> = [
      { url: dados.conta_luz_url, fieldId: 'UF_CRM_1753275522', label: 'Conta de Luz' },
      { url: dados.documento_identificacao_url, fieldId: 'UF_CRM_1753275571', label: 'Documento Identidade' },
    ];

    // Add contrato social field for PJ
    if (dados.tipo_pessoa === 'PJ' && dados.contrato_social_url) {
      fileFieldMap.push({ url: dados.contrato_social_url, fieldId: 'UF_CRM_1753275548', label: 'Contrato Social' });
    }

    for (const fileInfo of fileFieldMap) {
      const fileReference = fileInfo.url?.trim();
      if (!fileReference) continue;

      try {
        console.log(`[bitrix24-update-lead] 📎 Uploading ${fileInfo.label} to Bitrix24 field ${fileInfo.fieldId}...`);

        const preparedFile = await loadDocumentForUpload(fileReference, fileInfo.label);
        console.log(`[bitrix24-update-lead] 📥 ${fileInfo.label} loaded from ${preparedFile.source}`);

        // Upload to Bitrix24 using crm.lead.update with fileData format
        const fileUploadPayload = {
          id: proposta.bitrix24_lead_id,
          fields: {
            [fileInfo.fieldId]: {
              fileData: [preparedFile.filename, preparedFile.base64Content],
            },
          },
        };

        const fileUploadResponse = await fetch(`${bitrix24Url}/crm.lead.update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fileUploadPayload),
        });

        const fileUploadResult = await fileUploadResponse.json();

        if (fileUploadResult.result) {
          console.log(`[bitrix24-update-lead] ✅ ${fileInfo.label} uploaded successfully`);
          fileUploadResults[fileInfo.label] = true;
        } else {
          console.error(`[bitrix24-update-lead] ❌ Failed to upload ${fileInfo.label}:`, fileUploadResult.error, fileUploadResult.error_description);
          fileUploadResults[fileInfo.label] = false;
        }
      } catch (fileError) {
        console.error(`[bitrix24-update-lead] ❌ Error uploading ${fileInfo.label}:`, fileError);
        fileUploadResults[fileInfo.label] = false;
      }
    }

    console.log(`[bitrix24-update-lead] 📎 File upload results:`, JSON.stringify(fileUploadResults));

    // 5. Atualizar a proposta localmente para tipo DEFINITIVA com dados retificados
    const nomeExibir = dados.nome_retificado || proposta.cliente_nome;
    
    const propostaUpdate: Record<string, unknown> = {
      tipo_proposta: 'definitiva',
      dados_inferidos: false,
      cliente_cpf_cnpj: dados.cpf_cnpj,
      cliente_endereco: dados.endereco,
      cliente_cep: dados.cep,
      cliente_cidade: dados.cidade,
      cliente_uf: dados.uf,
      numero_instalacao: dados.numero_instalacao,
      tipo_instalacao: dados.tipo_instalacao,
      numero_ucs: dados.numero_ucs,
      updated_at: new Date().toISOString(),
    };

    // Adicionar campos opcionais se presentes
    if (dados.nome_retificado) {
      propostaUpdate.cliente_nome = dados.nome_retificado;
    }
    if (dados.consumo_medio_real) {
      propostaUpdate.consumo_medio = dados.consumo_medio_real;
    }
    if (dados.concessionaria) {
      propostaUpdate.concessionaria = dados.concessionaria;
    }

    console.log(`[bitrix24-update-lead] Updating proposal locally:`, JSON.stringify(propostaUpdate, null, 2));

    const { error: updatePropostaError } = await supabase
      .from('propostas_assinantes')
      .update(propostaUpdate)
      .eq('id', propostaInicialId);

    if (updatePropostaError) {
      console.error(`[bitrix24-update-lead] Error updating proposal:`, updatePropostaError);
    } else {
      console.log(`[bitrix24-update-lead] ✅ Proposal updated to tipo_proposta: 'definitiva'`);
    }

    // 6. Buscar e atualizar CONTATO vinculado ao lead
    let contactId: string | null = null;
    let contactUpdateSuccess = false;
    
    try {
      console.log(`[bitrix24-update-lead] 👤 Buscando contato vinculado ao lead ${proposta.bitrix24_lead_id}...`);
      
      const leadGetResponse = await fetch(`${bitrix24Url}/crm.lead.get?id=${proposta.bitrix24_lead_id}`);
      const leadData = await leadGetResponse.json();
      
      contactId = leadData.result?.CONTACT_ID || null;
      
      if (contactId) {
        console.log(`[bitrix24-update-lead] 👤 Contato vinculado encontrado: ${contactId}`);
        
        // Montar campos de atualização do contato
        const contactUpdateFields: Record<string, string> = {};
        
        // Campos nativos do contato (NAME, LAST_NAME, BIRTHDATE)
        if (dados.nome_retificado) {
          contactUpdateFields['NAME'] = dados.nome_retificado.trim();
        }
        
        if (dados.data_nascimento) {
          const partes = dados.data_nascimento.split('/');
          if (partes.length === 3) {
            const [dia, mes, ano] = partes;
            contactUpdateFields['BIRTHDATE'] = `${ano}-${mes}-${dia}`;
          }
        }
        
        // Campos customizados do contato usando contactFieldMap
        if (dados.cpf_cnpj && contactFieldMap['cpf_cnpj']) {
          contactUpdateFields[contactFieldMap['cpf_cnpj']] = dados.cpf_cnpj;
        }
        
        if (dados.logradouro && contactFieldMap['logradouro']) {
          contactUpdateFields[contactFieldMap['logradouro']] = dados.logradouro;
        }
        
        if (dados.numero_endereco && contactFieldMap['numero']) {
          contactUpdateFields[contactFieldMap['numero']] = dados.numero_endereco;
        }
        
        if (dados.complemento && contactFieldMap['complemento']) {
          contactUpdateFields[contactFieldMap['complemento']] = dados.complemento;
        }
        
        if (dados.bairro && contactFieldMap['bairro']) {
          contactUpdateFields[contactFieldMap['bairro']] = dados.bairro;
        }
        
        if (dados.cep && contactFieldMap['cep']) {
          contactUpdateFields[contactFieldMap['cep']] = dados.cep;
        }
        
        if (dados.cidade && contactFieldMap['cidade']) {
          contactUpdateFields[contactFieldMap['cidade']] = dados.cidade;
        }
        
        // Estado (mapeado como 'estado' ou 'uf')
        if (dados.uf) {
          if (contactFieldMap['estado']) {
            contactUpdateFields[contactFieldMap['estado']] = dados.uf;
          }
          if (contactFieldMap['uf']) {
            contactUpdateFields[contactFieldMap['uf']] = dados.uf;
          }
        }
        
        // Endereço completo
        if (dados.endereco && contactFieldMap['endereco_completo']) {
          contactUpdateFields[contactFieldMap['endereco_completo']] = dados.endereco;
        }
        
        // RG
        if (dados.rg_numero && contactFieldMap['rg']) {
          const rgCompleto = dados.rg_orgao_emissor 
            ? `${dados.rg_numero} - ${dados.rg_orgao_emissor}` 
            : dados.rg_numero;
          contactUpdateFields[contactFieldMap['rg']] = rgCompleto;
        }
        
        console.log(`[bitrix24-update-lead] 👤 Campos do contato a atualizar:`, JSON.stringify(contactUpdateFields, null, 2));
        
        // Chamar crm.contact.update
        const contactUpdateBody = new URLSearchParams();
        contactUpdateBody.append('id', contactId);
        
        Object.entries(contactUpdateFields).forEach(([key, value]) => {
          contactUpdateBody.append(`fields[${key}]`, value);
        });
        
        const contactResponse = await fetch(`${bitrix24Url}/crm.contact.update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: contactUpdateBody
        });
        
        const contactResult = await contactResponse.json();
        console.log(`[bitrix24-update-lead] 👤 Contact update result:`, JSON.stringify(contactResult));
        
        if (contactResult.result) {
          contactUpdateSuccess = true;
          console.log(`[bitrix24-update-lead] ✅ Contato ${contactId} atualizado com sucesso`);
        } else {
          console.error(`[bitrix24-update-lead] ❌ Falha ao atualizar contato:`, contactResult);
        }
      } else {
        console.log(`[bitrix24-update-lead] ℹ️ Lead não possui contato vinculado (CONTACT_ID vazio)`);
      }
    } catch (contactError) {
      console.error(`[bitrix24-update-lead] ❌ Erro ao processar contato:`, contactError);
      // Não bloquear o fluxo se falhar a atualização do contato
    }

    // 7. Gerar URL pública e atualizar link no Bitrix24 (com cache busting)
    let publicUrl = '';
    
    if (publicAppUrl) {
      // Proposta definitiva usa rota /proposta-definitiva
      const routePath = 'proposta-definitiva';
      const vParam = publicCacheBust ? `&v=${publicCacheBust}` : '';
      publicUrl = `${publicAppUrl}/${routePath}/${propostaInicialId}?download=true${vParam}`;
      console.log(`[bitrix24-update-lead] Updating link in Bitrix24: ${publicUrl}`);
      
      const linkFieldCode = 'UF_CRM_1767885928302';
      const linkBody = new URLSearchParams();
      linkBody.append('id', proposta.bitrix24_lead_id);
      linkBody.append(`fields[${linkFieldCode}]`, publicUrl);
      
      const linkResponse = await fetch(`${bitrix24Url}/crm.lead.update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: linkBody
      });
      
      const linkResult = await linkResponse.json();
      console.log(`[bitrix24-update-lead] Link update response:`, JSON.stringify(linkResult));
      
      if (linkResult.result) {
        console.log(`[bitrix24-update-lead] ✅ Link da proposta definitiva atualizado no Bitrix24`);
      } else {
        console.error(`[bitrix24-update-lead] ❌ Falha ao atualizar link:`, linkResult);
      }
    } else {
      console.warn(`[bitrix24-update-lead] public_app_url não configurada, link não será atualizado`);
    }

    // 8. Add comment to lead timeline - INCLUDING RECTIFICATION INFO, CONTACT UPDATE AND NEW LINK
    let rectificationSection = '';
    if (dados.divergencias && dados.divergencias.length > 0) {
      rectificationSection = `\n\n🔄 **RETIFICAÇÃO AUTOMÁTICA**
Os seguintes dados foram corrigidos baseados nos documentos oficiais:
${dados.divergencias.map(d => `• ${d.campoLabel}: "${d.valorOriginal || '(vazio)'}" → "${d.valorExtraido}"`).join('\n')}`;
    }

    // Seção de contato atualizado
    let contactSection = '';
    if (contactId) {
      if (contactUpdateSuccess) {
        contactSection = `\n\n👤 **CONTATO ATUALIZADO**
Os dados verificados foram sincronizados com o cadastro de contato vinculado (ID: ${contactId}).`;
      } else {
        contactSection = `\n\n⚠️ **CONTATO**
Contato vinculado (ID: ${contactId}) não pôde ser atualizado automaticamente.`;
      }
    }

    const linkSection = publicUrl ? `\n\n🔗 **Link da Proposta Definitiva:**\n${publicUrl}` : '';

    // Build additional data section with all extracted fields
    let dadosAdicionais = '';
    const camposAdicionais = [];
    
    if (dados.data_nascimento) camposAdicionais.push(`• Data de Nascimento: ${dados.data_nascimento}`);
    if (dados.rg_numero) camposAdicionais.push(`• RG: ${dados.rg_numero}${dados.rg_orgao_emissor ? ` (${dados.rg_orgao_emissor})` : ''}`);
    if (dados.cnh_numero) camposAdicionais.push(`• CNH: ${dados.cnh_numero}${dados.cnh_categoria ? ` (Cat. ${dados.cnh_categoria})` : ''}`);
    if (dados.nome_mae) camposAdicionais.push(`• Nome da Mãe: ${dados.nome_mae}`);
    if (dados.nome_pai) camposAdicionais.push(`• Nome do Pai: ${dados.nome_pai}`);
    if (dados.naturalidade) camposAdicionais.push(`• Naturalidade: ${dados.naturalidade}`);
    if (dados.telefone_contato) camposAdicionais.push(`• Telefone: ${dados.telefone_contato}`);
    if (dados.email_contato) camposAdicionais.push(`• Email: ${dados.email_contato}`);
    if (dados.numero_cliente) camposAdicionais.push(`• Nº Cliente: ${dados.numero_cliente}`);
    if (dados.valor_fatura) camposAdicionais.push(`• Valor Fatura: R$ ${dados.valor_fatura.toFixed(2)}`);
    if (dados.classe_consumo) camposAdicionais.push(`• Classe: ${dados.classe_consumo}`);
    
    // Campos especiais CEMIG
    const camposEnergeticos = [];
    if (dados.cip_valor !== undefined && dados.cip_valor !== null) {
      camposEnergeticos.push(`• CIP: R$ ${dados.cip_valor.toFixed(2)}`);
    }
    if (dados.recebe_energia_externa !== undefined && dados.recebe_energia_externa !== null) {
      camposEnergeticos.push(`• Recebe energia de outra fonte: ${dados.recebe_energia_externa ? 'SIM' : 'NÃO'}${dados.energia_scee_kwh ? ` (${dados.energia_scee_kwh} kWh via SCEE)` : ''}`);
    }
    if (dados.tem_saldo_geracao !== undefined && dados.tem_saldo_geracao !== null) {
      camposEnergeticos.push(`• Saldo de geração acumulado: ${dados.tem_saldo_geracao ? 'SIM' : 'NÃO'}${dados.saldo_geracao_kwh ? ` (${dados.saldo_geracao_kwh} kWh)` : ''}`);
    }
    
    if (camposAdicionais.length > 0) {
      dadosAdicionais = `\n\n👤 **Dados Adicionais (extraídos por IA):**\n${camposAdicionais.join('\n')}`;
    }
    
    let infoEnergetica = '';
    if (camposEnergeticos.length > 0) {
      infoEnergetica = `\n\n⚡ **Informações Energéticas:**\n${camposEnergeticos.join('\n')}`;
    }

    // Seção de dados PJ (Pessoa Jurídica)
    let dadosPJSection = '';
    if (dados.tipo_pessoa === 'PJ' && dados.dados_empresa_pj) {
      const pj = dados.dados_empresa_pj;
      const cnpjFormatado = pj.cnpj?.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
      
      dadosPJSection = `\n\n🏢 **DADOS DA EMPRESA (PJ):**
• Razão Social: ${pj.razao_social}
• CNPJ: ${cnpjFormatado || pj.cnpj}
${pj.nire ? `• NIRE: ${pj.nire}` : ''}
${pj.natureza_juridica ? `• Natureza: ${pj.natureza_juridica}` : ''}
${pj.sede_cidade && pj.sede_uf ? `• Sede: ${pj.sede_cidade}/${pj.sede_uf}` : ''}

👤 **REPRESENTANTE LEGAL (Sócio Administrador):**
• Nome: ${pj.admin_nome_completo}
• CPF: ${pj.admin_cpf}
${pj.admin_rg ? `• RG: ${pj.admin_rg}${pj.admin_rg_orgao ? ` (${pj.admin_rg_orgao})` : ''}` : ''}
${pj.admin_estado_civil ? `• Estado Civil: ${pj.admin_estado_civil}` : ''}
${pj.admin_profissao ? `• Profissão: ${pj.admin_profissao}` : ''}
${pj.admin_nacionalidade ? `• Nacionalidade: ${pj.admin_nacionalidade}` : ''}
${pj.poderes_plenos !== undefined ? `• Poderes Plenos: ${pj.poderes_plenos ? 'SIM' : 'NÃO'}` : ''}`;

      if (pj.quadro_societario && pj.quadro_societario.length > 0) {
        dadosPJSection += `\n\n👥 **QUADRO SOCIETÁRIO:**\n${pj.quadro_societario.map(s => 
          `• ${s.nome_completo}${s.participacao_percentual ? ` (${s.participacao_percentual}%)` : ''}${s.e_administrador ? ' [ADMINISTRADOR]' : ''}`
        ).join('\n')}`;
      }
    }

    const commentText = `📋 **Cliente preencheu formulário de Proposta Definitiva**

📍 **Dados Principais (extraídos por IA):**
• Nome: ${nomeExibir}
• CPF/CNPJ: ${dados.cpf_cnpj}
• Tipo: ${dados.tipo_pessoa === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}
• Endereço: ${dados.endereco}
• CEP: ${dados.cep}
• Cidade/UF: ${dados.cidade}/${dados.uf}

⚡ **Dados da UC:**
• Número: ${dados.numero_instalacao}
• Tipo: ${dados.tipo_instalacao}
• Qtd. UCs: ${dados.numero_ucs}
${dados.consumo_medio_real ? `• Consumo Real: ${dados.consumo_medio_real} kWh/mês` : ''}
${dados.concessionaria ? `• Concessionária: ${dados.concessionaria}` : ''}
${dadosPJSection}${dadosAdicionais}${infoEnergetica}

📎 **Documentos anexados ao lead:**
• Identificação: ${fileUploadResults['Documento Identidade'] ? '✅ Anexado ao Bitrix24' : dados.documento_identificacao_url ? '⚠️ Enviado (falha ao anexar)' : '❌ Não enviado'}
• Conta de Luz: ${fileUploadResults['Conta de Luz'] ? '✅ Anexado ao Bitrix24' : dados.conta_luz_url ? '⚠️ Enviado (falha ao anexar)' : '❌ Não enviado'}
${dados.tipo_pessoa === 'PJ' ? `• Contrato Social: ${fileUploadResults['Contrato Social'] ? '✅ Anexado ao Bitrix24' : dados.contrato_social_url ? '⚠️ Enviado (falha ao anexar)' : '❌ Não enviado'}` : ''}
${rectificationSection}${contactSection}${linkSection}

✅ **Proposta Definitiva gerada com sucesso!**`;

    console.log(`[bitrix24-update-lead] Adding timeline comment...`);

    const commentBody = new URLSearchParams();
    commentBody.append('fields[ENTITY_ID]', proposta.bitrix24_lead_id);
    commentBody.append('fields[ENTITY_TYPE]', 'lead');
    commentBody.append('fields[COMMENT]', commentText);

    const commentResponse = await fetch(`${bitrix24Url}/crm.timeline.comment.add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: commentBody
    });

    const commentResult = await commentResponse.json();
    console.log(`[bitrix24-update-lead] Comment response:`, JSON.stringify(commentResult));

    // 9. Log success
    await supabase.from('bitrix24_sync_logs').insert({
      bitrix24_lead_id: proposta.bitrix24_lead_id,
      proposta_id: propostaInicialId,
      action: 'cliente_formulario_definitiva',
      status: 'success',
      request_data: { 
        dados, 
        updateFields,
        divergenciasRetificadas: dados.divergencias?.length || 0,
        publicUrl,
        contactId,
        contactUpdateSuccess,
        fileUploadResults
      },
      response_data: { updateResult, commentResult }
    });

    console.log(`[bitrix24-update-lead] ✅ Successfully updated lead and proposal to definitive`);
    if (dados.divergencias && dados.divergencias.length > 0) {
      console.log(`[bitrix24-update-lead] 📝 ${dados.divergencias.length} campos retificados automaticamente`);
    }
    if (contactUpdateSuccess) {
      console.log(`[bitrix24-update-lead] 👤 Contato ${contactId} sincronizado com dados extraídos`);
    }

    // 10. Mark definitive proposal as ready
    const { error: readyError } = await supabase
      .from('propostas_assinantes')
      .update({ definitive_ready_at: new Date().toISOString() })
      .eq('id', propostaInicialId);
    
    if (readyError) {
      console.warn(`[bitrix24-update-lead] Failed to set definitive_ready_at:`, readyError);
    }

    // 11. WhatsApp notification removed — Bitrix24 automations handle this
    const whatsappSent = false;

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Lead e contato atualizados com proposta definitiva!',
        leadId: proposta.bitrix24_lead_id,
        contactId,
        contactUpdated: contactUpdateSuccess,
        camposRetificados: dados.divergencias?.length || 0,
        publicUrl,
        whatsappSent
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error(`[bitrix24-update-lead] Unexpected error:`, error);
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno', 
        details: error instanceof Error ? error.message : 'Unknown error',
        savedLocally: true
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
