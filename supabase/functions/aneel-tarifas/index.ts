import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStrictCorsHeaders, handleCorsPrelight, errorResponse } from '../_shared/security-helpers.ts';
import { validateAneelTarifas } from '../_shared/zod-schemas.ts';

// ═══════════════════════════════════════════════════════════════
// ZERO HARDCODE - Config loaded from database
// ═══════════════════════════════════════════════════════════════
const FALLBACK_API_URL = 'https://dadosabertos.aneel.gov.br/api/3/action/datastore_search_sql';
const FALLBACK_RESOURCE_ID = 'fcf2906c-7c32-4b9b-a637-054e7a5234f4';
const FALLBACK_TIMEOUT_MS = 90000;
const FALLBACK_MAX_RETRIES = 3;
const FALLBACK_RETRY_DELAY_BASE_MS = 3000;

interface AneelTarifasConfig {
  apiUrl: string;
  resourceId: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayBaseMs: number;
}

let cachedConfig: AneelTarifasConfig | null = null;
let configLoadedAt = 0;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

async function loadConfig(supabase: any): Promise<AneelTarifasConfig> {
  const now = Date.now();
  if (cachedConfig && (now - configLoadedAt) < CONFIG_CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const { data } = await supabase
      .from('configuracoes_sistema')
      .select('chave, valor')
      .in('chave', [
        'aneel_tarifas_api_url',
        'aneel_tarifas_resource_id',
        'aneel_tarifas_timeout_ms',
        'aneel_tarifas_max_retries',
        'aneel_tarifas_retry_delay_base_ms',
      ]);

    const configMap = new Map<string, string>();
    for (const row of data || []) {
      configMap.set(row.chave, row.valor);
    }

    cachedConfig = {
      apiUrl: configMap.get('aneel_tarifas_api_url') || FALLBACK_API_URL,
      resourceId: configMap.get('aneel_tarifas_resource_id') || FALLBACK_RESOURCE_ID,
      timeoutMs: parseInt(configMap.get('aneel_tarifas_timeout_ms') || '', 10) || FALLBACK_TIMEOUT_MS,
      maxRetries: parseInt(configMap.get('aneel_tarifas_max_retries') || '', 10) || FALLBACK_MAX_RETRIES,
      retryDelayBaseMs: parseInt(configMap.get('aneel_tarifas_retry_delay_base_ms') || '', 10) || FALLBACK_RETRY_DELAY_BASE_MS,
    };
    configLoadedAt = now;
    console.log('[aneel-tarifas] Config loaded from DB');
    return cachedConfig;
  } catch (err) {
    console.warn('[aneel-tarifas] Failed to load config, using fallbacks:', err);
    return {
      apiUrl: FALLBACK_API_URL,
      resourceId: FALLBACK_RESOURCE_ID,
      timeoutMs: FALLBACK_TIMEOUT_MS,
      maxRetries: FALLBACK_MAX_RETRIES,
      retryDelayBaseMs: FALLBACK_RETRY_DELAY_BASE_MS,
    };
  }
}

// Mapeamento COMPLETO de siglas ANEEL para UF
const SIGLA_TO_UF: Record<string, string> = {
  // === GRANDES DISTRIBUIDORAS ===
  // Cemig (MG)
  'CEMIG-D': 'MG', 'CEMIG': 'MG', 'CEMIG-GT': 'MG',
  
  // Copel (PR)
  'COPEL-DIS': 'PR', 'COPEL': 'PR', 'COPEL-G': 'PR',
  
  // Celesc (SC)
  'CELESC-DIS': 'SC', 'CELESC': 'SC',
  
  // CPFL (SP)
  'CPFL PAULISTA': 'SP', 'CPFL-PAULISTA': 'SP',
  'CPFL PIRATININGA': 'SP', 'CPFL-PIRATININGA': 'SP',
  'CPFL SANTA CRUZ': 'SP', 'CPFL-SANTA CRUZ': 'SP',
  'CPFL MOCOCA': 'SP', 'CPFL-MOCOCA': 'SP',
  'CPFL JAGUARI': 'SP', 'CPFL LESTE PAULISTA': 'SP', 'CPFL SUL PAULISTA': 'SP',
  
  // Elektro
  'ELEKTRO': 'SP', 'ELEKTRO-MS': 'MS', 'NEOENERGIA ELEKTRO': 'SP',
  
  // Enel
  'ENEL SP': 'SP', 'ENEL-SP': 'SP', 'ELETROPAULO': 'SP',
  'ENEL RJ': 'RJ', 'ENEL-RJ': 'RJ', 'LIGHT': 'RJ',
  'ENEL CE': 'CE', 'ENEL-CE': 'CE', 'COELCE': 'CE',
  'ENEL GO': 'GO', 'ENEL-GO': 'GO', 'CELG-D': 'GO', 'CELG': 'GO',
  
  // EDP
  'EDP SP': 'SP', 'EDP-SP': 'SP', 'BANDEIRANTE': 'SP',
  'EDP ES': 'ES', 'EDP-ES': 'ES', 'ESCELSA': 'ES', 'EDP ESPÍRITO SANTO': 'ES',
  
  // Energisa (vários estados)
  'ENERGISA MT': 'MT', 'ENERGISA-MT': 'MT', 'EMT': 'MT',
  'ENERGISA MS': 'MS', 'ENERGISA-MS': 'MS', 'EMS': 'MS',
  'ENERGISA MG': 'MG', 'ENERGISA-MG': 'MG', 'EMG': 'MG',
  'ENERGISA PB': 'PB', 'ENERGISA-PB': 'PB', 'EPB': 'PB',
  'ENERGISA SE': 'SE', 'ENERGISA-SE': 'SE', 'ESE': 'SE',
  'ENERGISA TO': 'TO', 'ENERGISA-TO': 'TO', 'ETO': 'TO',
  'ENERGISA RO': 'RO', 'ENERGISA-RO': 'RO', 'ERO': 'RO',
  'ENERGISA AC': 'AC', 'ENERGISA-AC': 'AC',
  'ENERGISA SUL-SUDESTE': 'SP', 'ESS': 'SP',
  'ENERGISA BORBOREMA': 'PB', 'EBO': 'PB',
  
  // Equatorial (vários estados)
  'EQUATORIAL AL': 'AL', 'EQUATORIAL-AL': 'AL', 'CEAL': 'AL', 'EAL': 'AL',
  'EQUATORIAL MA': 'MA', 'EQUATORIAL-MA': 'MA', 'CEMAR': 'MA', 'EMA': 'MA',
  'EQUATORIAL PA': 'PA', 'EQUATORIAL-PA': 'PA', 'CELPA': 'PA', 'EPA': 'PA',
  'EQUATORIAL PI': 'PI', 'EQUATORIAL-PI': 'PI', 'CEPISA': 'PI', 'EPI': 'PI',
  'EQUATORIAL AP': 'AP', 'EQUATORIAL-AP': 'AP', 'CEA': 'AP',
  'EQUATORIAL GO': 'GO', 'EQUATORIAL-GO': 'GO', 'EGO': 'GO',
  'EQUATORIAL RS': 'RS', 'EQUATORIAL-RS': 'RS',
  
  // Neoenergia
  'NEOENERGIA COSERN': 'RN', 'COSERN': 'RN',
  'NEOENERGIA COELBA': 'BA', 'COELBA': 'BA',
  'NEOENERGIA CELPE': 'PE', 'CELPE': 'PE',
  'NEOENERGIA PERNAMBUCO': 'PE',
  'NEOENERGIA BRASILIA': 'DF', 'CEB-DIS': 'DF', 'CEB': 'DF',
  
  // RS
  'RGE': 'RS', 'RGE SUL': 'RS', 'RGE-SUL': 'RS',
  'CEEE-D': 'RS', 'CEEE': 'RS', 'AES SUL': 'RS',
  'ELETROCAR': 'RS', 'HIDROPAN': 'RS', 'MUXFELDT': 'RS',
  'UHENPAL': 'RS', 'COOPERLUZ': 'RS', 'CRELUZ-D': 'RS',
  'CERTHIL': 'RS', 'CERTAJA': 'RS', 'CERTEL': 'RS',
  'COOPERNORTE': 'RS', 'CERFOX': 'RS', 'CERMISSOES': 'RS',
  'CELETRO': 'RS', 'DEMEI': 'RS', 'CERCOS': 'RS', 'CEPRAG': 'RS',
  'CERILUZ': 'RS',
  
  // AM/RR/AC/RO
  'AMAZONAS ENERGIA': 'AM', 'AME': 'AM', 'AMAZONAS': 'AM',
  'RORAIMA ENERGIA': 'RR', 'BOA VISTA': 'RR', 'CERR': 'RR',
  'CERON': 'RO', 'ELETROACRE': 'AC',
  
  // TO
  'CELTINS': 'TO',
  
  // MG (pequenas)
  'DME-PC': 'MG', 'DMED': 'MG', 'ENF': 'MG', 'ELFSM': 'MG',
  
  // PR (pequenas)
  'COCEL': 'PR', 'FORCEL': 'PR', 'CFLO': 'PR', 'CASTRO-DIS': 'PR',
  
  // SC (pequenas)
  'CERAL DIS': 'SC', 'CEREJ': 'SC', 'CERGAPA': 'SC',
  'CERBRANORTE': 'SC', 'COOPERA': 'SC', 'COOPERALIANÇA': 'SC',
  'COOPERCOCAL': 'SC', 'COOPERMILA': 'SC',
  'CERGAL': 'SC', 'CERPALO': 'SC', 'CERTREL': 'SC',
  'CERSUL': 'SC', 'CERVAM': 'SC', 'CEJAMA': 'SC',
  'COORSEL': 'SC', 'EFLJC': 'SC', 'EFLUL': 'SC',
  
  // SP (pequenas)
  'CAIUA-D': 'SP', 'CAIUÁ': 'SP', 'EEB': 'SP',
  'EDEVP': 'SP', 'CNEE': 'SP',
  
  // GO/SE
  'CHESP': 'GO', 'SULGIPE': 'SE', 'CERIS': 'GO',
};

// Função para inferir UF a partir do nome/sigla da distribuidora
function inferirUF(sigla: string): string {
  if (!sigla) return '';
  
  const siglaUpper = sigla.toUpperCase().trim();
  
  // 1. Verificar mapeamento direto
  if (SIGLA_TO_UF[siglaUpper]) {
    return SIGLA_TO_UF[siglaUpper];
  }
  
  // 2. Verificar mapeamento parcial (chaves que contém a sigla ou vice-versa)
  for (const [key, uf] of Object.entries(SIGLA_TO_UF)) {
    if (siglaUpper.includes(key) || key.includes(siglaUpper)) {
      return uf;
    }
  }
  
  // 3. Extrair UF do final do nome (ex: "EQUATORIAL MA" -> MA)
  const sufixoMatch = siglaUpper.match(/[\s\-_]([A-Z]{2})$/);
  if (sufixoMatch) {
    const possibleUF = sufixoMatch[1];
    const validUFs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
    if (validUFs.includes(possibleUF)) {
      return possibleUF;
    }
  }
  
  // 4. Procurar UF em qualquer posição após hífen ou espaço
  const partes = siglaUpper.split(/[\s\-_]+/);
  const validUFs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  for (const parte of partes) {
    if (validUFs.includes(parte) && parte.length === 2) {
      return parte;
    }
  }
  
  console.log(`[aneel-tarifas] UF não inferida para: ${sigla}`);
  return '';
}

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    // Initialize Supabase client and load config
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const config = await loadConfig(supabase);

    const url = new URL(req.url);
    
    // Support both GET (querystring) and POST (body)
    let distribuidora = '';
    let subgrupo = 'B1';
    let modalidade = 'Convencional';
    let classe = 'Residencial';
    let subclasse = 'Residencial'; // NOVO: Subclasse padrão
    let baseTarifaria = 'Tarifa de Aplicação';
    let sync = false;
    let apenasVigente = false;
    
    // ═══════════════════════════════════════════════════════════════
    // INPUT VALIDATION
    // ═══════════════════════════════════════════════════════════════
    if (req.method === 'POST') {
      let rawBody: unknown;
      try {
        rawBody = await req.json();
      } catch {
        return errorResponse('Invalid JSON body', 400, req);
      }
      
      const validation = validateAneelTarifas(rawBody);
      if (!validation.success) {
        const errorMsg = validation.errors?.map(e => `${e.field}: ${e.message}`).join(', ');
        console.warn('[aneel-tarifas] Validation failed:', errorMsg);
        return errorResponse(`Validation failed: ${errorMsg}`, 400, req);
      }
      
      const body = validation.data!;
      distribuidora = body.distribuidora || '';
      subgrupo = body.subgrupo || 'B1';
      modalidade = body.modalidade || 'Convencional';
      classe = body.classe || 'Residencial';
      subclasse = body.subclasse || 'Residencial';
      baseTarifaria = body.base_tarifaria || 'Tarifa de Aplicação';
      sync = body.sync === true;
      apenasVigente = body.apenas_vigente === true;
    } else {
      distribuidora = url.searchParams.get('distribuidora') || '';
      subgrupo = url.searchParams.get('subgrupo') || 'B1';
      modalidade = url.searchParams.get('modalidade') || 'Convencional';
      classe = url.searchParams.get('classe') || 'Residencial';
      subclasse = url.searchParams.get('subclasse') || 'Residencial';
      baseTarifaria = url.searchParams.get('base_tarifaria') || 'Tarifa de Aplicação';
      sync = url.searchParams.get('sync') === 'true';
      apenasVigente = url.searchParams.get('apenas_vigente') === 'true';
    }

    console.log(`[aneel-tarifas] Consultando API - subgrupo: ${subgrupo}, modalidade: ${modalidade}, classe: ${classe}, subclasse: ${subclasse}, base: ${baseTarifaria}, sync: ${sync}, apenasVigente: ${apenasVigente}`);

    // Get today's date in YYYY-MM-DD format for SQL literal
    const today = new Date().toISOString().split('T')[0];
    console.log(`[aneel-tarifas] Data de referência: ${today}`);

    // Build SQL query with proper filters including SUBCLASSE and DETALHE (using config.resourceId)
    let sql = `SELECT * FROM "${config.resourceId}" WHERE "DscBaseTarifaria" = '${baseTarifaria}' AND "DscSubGrupo" = '${subgrupo}' AND "DscModalidadeTarifaria" = '${modalidade}' AND "DscClasse" = '${classe}'`;
    
    // CRÍTICO: Filtrar por Subclasse para evitar pegar Baixa Renda ou outras
    // Se subclasse = "Residencial", incluir também "Não se aplica" para compatibilidade
    if (subclasse === 'Residencial') {
      sql += ` AND ("DscSubClasse" = 'Residencial' OR "DscSubClasse" = 'Não se aplica')`;
    } else if (subclasse === 'Baixa Renda') {
      sql += ` AND "DscSubClasse" = 'Baixa Renda'`;
    } else {
      sql += ` AND ("DscSubClasse" = '${subclasse}' OR "DscSubClasse" = 'Não se aplica')`;
    }
    
    // CRÍTICO: Filtrar por Detalhe = "Não se aplica" para excluir SCEE (Geração Distribuída)
    sql += ` AND ("DscDetalhe" = 'Não se aplica' OR "DscDetalhe" IS NULL)`;
    
    if (distribuidora) {
      sql += ` AND "SigAgente" ILIKE '%${distribuidora}%'`;
    }
    
    // Filter only valid tariffs (vigentes) - use literal date
    if (apenasVigente) {
      sql += ` AND "DatInicioVigencia" <= '${today}' AND ("DatFimVigencia" >= '${today}' OR "DatFimVigencia" IS NULL)`;
    }
    
    sql += ` ORDER BY "DatInicioVigencia" DESC LIMIT 5000`;

    const params = new URLSearchParams({ sql });
    const apiUrl = `${config.apiUrl}?${params.toString()}`;
    
    console.log(`[aneel-tarifas] SQL: ${sql}`);

    // Fetch with retry and timeout (using config values)
    let response: Response | null = null;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
        
        console.log(`[aneel-tarifas] Tentativa ${attempt}/${config.maxRetries} - Iniciando fetch...`);
        
        response = await fetch(apiUrl, {
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        console.log(`[aneel-tarifas] Tentativa ${attempt}/${config.maxRetries} - Status: ${response.status}`);
        
        if (response.status >= 502 && response.status <= 504 && attempt < config.maxRetries) {
          console.log(`[aneel-tarifas] Tentativa ${attempt}/${config.maxRetries} - Erro ${response.status}, aguardando retry...`);
          await new Promise(r => setTimeout(r, config.retryDelayBaseMs * attempt));
          continue;
        }
        break;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        const isTimeout = lastError.name === 'AbortError';
        console.log(`[aneel-tarifas] Tentativa ${attempt}/${config.maxRetries} - ${isTimeout ? `Timeout (${config.timeoutMs}ms)` : 'Erro'}: ${lastError.message}`);
        if (attempt < config.maxRetries) await new Promise(r => setTimeout(r, config.retryDelayBaseMs * attempt));
      }
    }
    
    if (!response) {
      throw lastError || new Error(`Falha ao conectar com a API ANEEL após ${config.maxRetries} tentativas`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[aneel-tarifas] Erro API: ${response.status} - ${errorText}`);
      throw new Error(`Erro na API ANEEL: ${response.status}`);
    }

    const data = await response.json();
    const records = data.result?.records || [];
    
    console.log(`[aneel-tarifas] Resposta - success: ${data.success}, records: ${records.length}`);

    if (records.length > 0) {
      console.log(`[aneel-tarifas] Primeiro registro: ${JSON.stringify(records[0])}`);
    }

    // Parse ANEEL numbers (format: "157,17" or ",00")
    // ANEEL values are in R$/MWh, we need R$/kWh (divide by 1000)
    const parseNum = (v: string | null): number => {
      if (!v) return 0;
      let s = String(v).trim();
      if (s.startsWith(',')) s = `0${s}`;
      s = s.replace(/\./g, '').replace(',', '.');
      const n = Number(s);
      // Convert from R$/MWh to R$/kWh
      return Number.isFinite(n) ? n / 1000 : 0;
    };

    // Map records
    const tarifas = records.map((r: any) => {
      const tusd = parseNum(r.VlrTUSD);
      const te = parseNum(r.VlrTE);
      const sigla = r.SigAgente || '';
      // Tentar obter UF da API, ou inferir automaticamente
      const ufFromApi = r.SigUF || '';
      const ufInferida = ufFromApi || inferirUF(sigla);
      
      return {
        sigla_agente: sigla,
        nome_agente: sigla,
        subgrupo: r.DscSubGrupo || '',
        modalidade: r.DscModalidadeTarifaria || '',
        classe: r.DscClasse || '',
        subclasse: r.DscSubClasse || '',
        detalhe: r.DscDetalhe || '',
        base_tarifaria: r.DscBaseTarifaria || '',
        tusd,
        te,
        tarifa_total: tusd + te,
        inicio_vigencia: r.DatInicioVigencia || null,
        fim_vigencia: r.DatFimVigencia || null,
        resolucao: r.DscREH || '',
        uf: ufInferida,
      };
    });

    console.log(`[aneel-tarifas] Tarifas mapeadas: ${tarifas.length}`);

    // SYNC MODE
    if (sync) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Get most recent tariff per distributor
      // Priorizar: maior inicio_vigencia E subclasse "Residencial" sobre "Não se aplica"
      const tarifasPorAgente = new Map<string, any>();
      for (const t of tarifas) {
        if (!t.sigla_agente) continue;
        
        const existing = tarifasPorAgente.get(t.sigla_agente);
        
        if (!existing) {
          tarifasPorAgente.set(t.sigla_agente, t);
          continue;
        }
        
        // Comparar datas de vigência
        const novaData = t.inicio_vigencia || '';
        const existData = existing.inicio_vigencia || '';
        
        if (novaData > existData) {
          // Nova tarifa é mais recente
          tarifasPorAgente.set(t.sigla_agente, t);
        } else if (novaData === existData) {
          // Mesma data: preferir subclasse "Residencial" sobre "Não se aplica"
          if (t.subclasse === 'Residencial' && existing.subclasse !== 'Residencial') {
            tarifasPorAgente.set(t.sigla_agente, t);
          }
        }
      }

      console.log(`[aneel-tarifas] Distribuidoras únicas: ${tarifasPorAgente.size}`);

      // Log detalhes das distribuidoras selecionadas para debug
      for (const [sigla, tarifa] of tarifasPorAgente) {
        console.log(`[aneel-tarifas] ${sigla}: TUSD=${tarifa.tusd.toFixed(4)}, TE=${tarifa.te.toFixed(4)}, Total=${tarifa.tarifa_total.toFixed(4)}, Vigência=${tarifa.inicio_vigencia}, Subclasse=${tarifa.subclasse}, Detalhe=${tarifa.detalhe}`);
      }

      let atualizadas = 0, inseridas = 0, erros = 0;

      for (const [sigla, tarifa] of tarifasPorAgente) {
        const { data: existing } = await supabase
          .from('concessionarias')
          .select('id')
          .eq('sigla_aneel', sigla)
          .maybeSingle();

        const concData = {
          nome: tarifa.nome_agente,
          sigla_aneel: sigla,
          tarifa_media: tarifa.tarifa_total,
          tusd: tarifa.tusd,
          te: tarifa.te,
          subgrupo: tarifa.subgrupo,
          modalidade: tarifa.modalidade,
          uf: tarifa.uf || null,
          vigencia_inicio: tarifa.inicio_vigencia,
          ultima_atualizacao: new Date().toISOString(),
        };

        if (existing) {
          const { error } = await supabase.from('concessionarias').update(concData).eq('id', existing.id);
          if (error) { erros++; console.error(`[aneel-tarifas] Erro update ${sigla}:`, error); }
          else atualizadas++;
        } else {
          const { error } = await supabase.from('concessionarias').insert(concData);
          if (error) { erros++; console.error(`[aneel-tarifas] Erro insert ${sigla}:`, error); }
          else inseridas++;
        }
      }

      console.log(`[aneel-tarifas] Sync: ${atualizadas} atualizadas, ${inseridas} inseridas, ${erros} erros`);

      return new Response(JSON.stringify({
        success: true,
        message: 'Sincronização concluída',
        filtros: { subgrupo, modalidade, classe, subclasse, base_tarifaria: baseTarifaria },
        distribuidoras_unicas: tarifasPorAgente.size,
        atualizadas,
        inseridas,
        erros,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true,
      total: records.length,
      tarifas,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[aneel-tarifas] Erro:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
