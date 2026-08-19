/**
 * Edge Function: agents-md-comparison-tests
 * 
 * Executa testes comparativos entre abordagem AGENTS.md e Skills (legado)
 * Mede conformidade de respostas com padrões definidos
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { measureAgentsMdCompliance, getComplianceSummary } from '../_shared/agents-md-metrics.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Cenários de teste baseados no documento AGENTS.md
 */
interface TestScenario {
  id: string;
  name: string;
  input: string;
  expectedPattern: {
    maxWords?: number;
    mustContain?: string[];
    mustNotContain?: string[];
    hasBullets?: boolean;
    emojiRange?: [number, number];
    hasCalculation?: boolean;
    calculationMustBeExact?: boolean;
    validatesEmotion?: boolean;
    hasAnalogy?: boolean;
    maxTechnicalTerms?: number;
  };
  skillsBaseline: {
    avgWords: number;
    description: string;
  };
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    id: 'primeiro_contato',
    name: 'Primeiro Contato Básico',
    input: 'Oi',
    expectedPattern: {
      maxWords: 45,
      mustContain: ['Sofia', 'COESA'],
      mustNotContain: ['Prezado', 'Informo', 'por gentileza'],
      hasBullets: false,
      emojiRange: [0, 2],
    },
    skillsBaseline: {
      avgWords: 68,
      description: 'Skills usa listas longas e bullet points no primeiro contato',
    },
  },
  {
    id: 'conta_baixa',
    name: 'Conta Abaixo do Mínimo (R$30)',
    input: 'Minha conta vem uns 30 reais',
    expectedPattern: {
      mustContain: ['50'],
      mustNotContain: ['Informo', 'requisito mínimo', 'não atende'],
      validatesEmotion: false, // Desqualificação educada, não validação
    },
    skillsBaseline: {
      avgWords: 45,
      description: 'Skills é seco e corporativo na desqualificação',
    },
  },
  {
    id: 'conta_qualificada',
    name: 'Conta Qualificada (R$380)',
    input: 'Minha conta é 380 reais',
    expectedPattern: {
      hasCalculation: true,
      calculationMustBeExact: true,
      mustNotContain: ['consultar proposta', 'estimativa', 'aproximadamente'],
      emojiRange: [1, 3],
    },
    skillsBaseline: {
      avgWords: 85,
      description: 'Skills lista planos sem calcular economia específica',
    },
  },
  {
    id: 'desconfianca',
    name: 'Cliente Desconfiado',
    input: 'Isso não é golpe não?',
    expectedPattern: {
      mustContain: ['CEMIG', 'ANEEL'],
      mustNotContain: ['modelo de negócio', 'regulamentado pela'],
      validatesEmotion: true,
    },
    skillsBaseline: {
      avgWords: 62,
      description: 'Skills é defensivo e técnico demais',
    },
  },
  {
    id: 'como_funciona',
    name: 'Como Funciona',
    input: 'Como funciona exatamente esse negócio?',
    expectedPattern: {
      hasAnalogy: true,
      mustNotContain: ['482/2012', 'geração distribuída', 'compensação energética'],
      maxTechnicalTerms: 0,
    },
    skillsBaseline: {
      avgWords: 95,
      description: 'Skills usa jargão técnico e listas numeradas',
    },
  },
];

/**
 * Valida resposta contra padrão esperado
 */
function validateResponse(
  response: string,
  pattern: TestScenario['expectedPattern']
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  const metrics = measureAgentsMdCompliance(response);
  const lowerResponse = response.toLowerCase();
  
  // Validar maxWords
  if (pattern.maxWords && metrics.wordCount > pattern.maxWords) {
    failures.push(`Excede ${pattern.maxWords} palavras (tem ${metrics.wordCount})`);
  }
  
  // Validar mustContain
  if (pattern.mustContain) {
    for (const term of pattern.mustContain) {
      if (!lowerResponse.includes(term.toLowerCase())) {
        failures.push(`Falta termo obrigatório: "${term}"`);
      }
    }
  }
  
  // Validar mustNotContain
  if (pattern.mustNotContain) {
    for (const term of pattern.mustNotContain) {
      if (lowerResponse.includes(term.toLowerCase())) {
        failures.push(`Contém termo proibido: "${term}"`);
      }
    }
  }
  
  // Validar hasBullets
  if (pattern.hasBullets === false && metrics.bulletPointCount > 0) {
    failures.push(`Tem bullet points (${metrics.bulletPointCount})`);
  }
  
  // Validar emojiRange
  if (pattern.emojiRange) {
    const [min, max] = pattern.emojiRange;
    if (metrics.emojiCount < min) {
      failures.push(`Poucos emojis (${metrics.emojiCount} < ${min})`);
    }
    if (metrics.emojiCount > max) {
      failures.push(`Muitos emojis (${metrics.emojiCount} > ${max})`);
    }
  }
  
  // Validar hasCalculation
  if (pattern.hasCalculation && !metrics.hasExactCalculation) {
    failures.push('Falta cálculo exato de economia');
  }
  
  // Validar validatesEmotion
  if (pattern.validatesEmotion && !metrics.validatesEmotion) {
    failures.push('Não valida emoção do cliente');
  }
  
  // Validar hasAnalogy
  if (pattern.hasAnalogy && !metrics.hasAnalogy) {
    failures.push('Falta analogia para explicar');
  }
  
  // Validar maxTechnicalTerms
  if (pattern.maxTechnicalTerms !== undefined && metrics.jargonTerms.length > pattern.maxTechnicalTerms) {
    failures.push(`Jargão técnico: ${metrics.jargonTerms.join(', ')}`);
  }
  
  return {
    passed: failures.length === 0,
    failures,
  };
}

/**
 * Simula resposta da Sofia para um input
 * Busca de few_shot_examples ou response_evaluations
 */
async function getSimulatedResponse(
  supabaseClient: any,
  input: string,
  scenarioId: string
): Promise<string> {
  // Buscar few-shot examples relacionados ao cenário (usando context)
  const { data: examples } = await supabaseClient
    .from('few_shot_examples')
    .select('input, expected_output')
    .eq('context', scenarioId)
    .eq('is_active', true)
    .limit(1);
  
  if (examples && examples.length > 0) {
    return (examples[0] as any).expected_output as string;
  }
  
  // Fallback: buscar resposta mais recente com input similar
  const { data: recentResponses } = await supabaseClient
    .from('response_evaluations')
    .select('sofia_response')
    .ilike('client_message', `%${input.substring(0, 20)}%`)
    .order('created_at', { ascending: false })
    .limit(1);
  
  if (recentResponses && recentResponses.length > 0) {
    return (recentResponses[0] as any).sofia_response as string;
  }
  
  // Fallback final: retornar placeholder
  return `[Simulação para: "${input}"] - Nenhuma resposta encontrada no banco`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const body = await req.json().catch(() => ({}));
    const { run_full_suite = false, scenario_id } = body;
    
    const scenariosToRun = scenario_id
      ? TEST_SCENARIOS.filter(s => s.id === scenario_id)
      : run_full_suite
      ? TEST_SCENARIOS
      : TEST_SCENARIOS.slice(0, 1); // Default: só primeiro cenário
    
    const results = [];
    
    for (const scenario of scenariosToRun) {
      console.log(`[TEST] Executando cenário: ${scenario.name}`);
      
      // Obter resposta simulada
      const actualResponse = await getSimulatedResponse(supabase, scenario.input, scenario.id);
      
      // Medir métricas
      const metrics = measureAgentsMdCompliance(actualResponse);
      
      // Validar contra padrão esperado
      const validation = validateResponse(actualResponse, scenario.expectedPattern);
      
      // Calcular melhoria vs Skills baseline
      const improvementPercentage = scenario.skillsBaseline.avgWords > 0
        ? ((scenario.skillsBaseline.avgWords - metrics.wordCount) / scenario.skillsBaseline.avgWords) * 100
        : 0;
      
      // Persistir resultado
      const { data: insertedTest, error: insertError } = await supabase
        .from('agents_md_comparison_tests')
        .insert({
          test_scenario: scenario.id,
          input_message: scenario.input,
          actual_response: actualResponse,
          word_count: metrics.wordCount,
          has_bullet_points: metrics.bulletPointCount > 0,
          has_calculation: metrics.hasExactCalculation,
          emoji_count: metrics.emojiCount,
          tone_score: metrics.complianceScore,
          skills_baseline_word_count: scenario.skillsBaseline.avgWords,
          improvement_percentage: improvementPercentage,
          passed: validation.passed,
          failure_reason: validation.failures.length > 0 ? validation.failures.join('; ') : null,
        })
        .select()
        .single();
      
      if (insertError) {
        console.error(`[TEST] Erro ao persistir: ${insertError.message}`);
      }
      
      results.push({
        scenario: scenario.id,
        name: scenario.name,
        passed: validation.passed,
        failures: validation.failures,
        metrics: {
          wordCount: metrics.wordCount,
          skillsBaseline: scenario.skillsBaseline.avgWords,
          improvement: `${improvementPercentage.toFixed(1)}%`,
          complianceScore: metrics.complianceScore,
          summary: getComplianceSummary(metrics),
        },
        response: actualResponse.substring(0, 200) + (actualResponse.length > 200 ? '...' : ''),
      });
    }
    
    // Calcular estatísticas agregadas
    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    const avgCompliance = results.reduce((sum, r) => sum + r.metrics.complianceScore, 0) / totalCount;
    const avgImprovement = results.reduce((sum, r) => {
      const imp = parseFloat(r.metrics.improvement);
      return sum + (isNaN(imp) ? 0 : imp);
    }, 0) / totalCount;
    
    return new Response(
      JSON.stringify({
        status: 'success',
        summary: {
          total: totalCount,
          passed: passedCount,
          failed: totalCount - passedCount,
          passRate: `${((passedCount / totalCount) * 100).toFixed(1)}%`,
          avgComplianceScore: avgCompliance.toFixed(1),
          avgImprovementVsSkills: `${avgImprovement.toFixed(1)}%`,
        },
        results,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TEST] Erro:', errorMessage);
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
