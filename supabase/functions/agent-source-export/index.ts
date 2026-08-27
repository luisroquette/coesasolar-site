import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getStrictCorsHeaders, handleCorsPrelight } from '../_shared/security-helpers.ts';
// Mapeamento de agentes para suas Edge Functions
const AGENT_WEBHOOK_MAP: Record<string, string> = {
  'sofia': 'sofia-webhook',
  'maria': 'maria-webhook',
  'julia': 'julia-webhook',
};

serve(async (req) => {
  const corsHeaders = getStrictCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verificar se é admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleData?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Acesso restrito a administradores' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { agent_id } = await req.json();

    if (!agent_id) {
      return new Response(JSON.stringify({ error: 'agent_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Buscar dados do agente
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('agent_id', agent_id)
      .single();

    if (agentError || !agent) {
      return new Response(JSON.stringify({ error: 'Agente não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Obter nome da Edge Function
    const webhookName = AGENT_WEBHOOK_MAP[agent_id] || `${agent_id}-webhook`;
    
    // Tentar buscar código fonte do Storage
    let sourceCode = '';
    const sourceFilePath = `${webhookName}/index.ts`;
    
    const { data: fileData, error: fileError } = await supabase
      .storage
      .from('agent-sources')
      .download(sourceFilePath);
    
    if (fileData && !fileError) {
      sourceCode = await fileData.text();
      console.log(`Source code loaded from storage: ${sourceFilePath} (${sourceCode.length} chars)`);
    } else {
      console.log(`Source file not found in storage: ${sourceFilePath}`, fileError?.message);
      sourceCode = generatePlaceholderSource(agent, webhookName);
    }

    // Gerar documentação README
    const readme = generateReadme(agent);

    // Gerar prompts extraídos
    const systemPrompt = generateSystemPromptDoc(agent);

    // Gerar configuração de capabilities
    const capabilities = generateCapabilitiesConfig(agent);

    return new Response(JSON.stringify({
      success: true,
      agent_id: agent.agent_id,
      agent_name: agent.name,
      version: agent.version,
      source_from_storage: !fileError,
      files: {
        'README.md': readme,
        'source/webhook.ts': sourceCode,
        'prompts/system-prompt.md': systemPrompt,
        'config/capabilities.json': capabilities,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error exporting agent source:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function generatePlaceholderSource(agent: any, webhookName: string): string {
  return `// ${agent.name} - ${agent.role}
// =====================================================
// CÓDIGO FONTE NÃO ENCONTRADO NO STORAGE
// =====================================================
//
// O código fonte completo da Edge Function "${webhookName}" 
// não está disponível no bucket "agent-sources".
//
// Para incluir o código no download:
// 
// 1. Acesse a página do AI Gym
// 2. Clique no botão "Upload Código Fonte"
// 3. Selecione o arquivo supabase/functions/${webhookName}/index.ts
//
// Ou faça upload manualmente via Storage:
// - Bucket: agent-sources
// - Caminho: ${webhookName}/index.ts
//
// =====================================================
// CONFIGURAÇÕES DO AGENTE (brain.json)
// =====================================================
//
// As configurações do agente estão no arquivo brain.json
// incluído neste pacote ZIP.
//
// Agent ID: ${agent.agent_id}
// Role: ${agent.role}
// Version: ${agent.version}
//
`;
}

function generateReadme(agent: any): string {
  const envVars = [
    'COESA_PROPOSTAS_OPENROUTER_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ZAPI_INSTANCE_ID',
    'ZAPI_TOKEN',
  ];

  const channels = agent.channels?.join(', ') || 'Não definido';
  
  return `# ${agent.name} - ${agent.description || 'Agente COESA'}

## Visão Geral

- **ID**: ${agent.agent_id}
- **Versão**: ${agent.version}
- **Role**: ${agent.role}
- **Status**: ${agent.status}
- **Canais**: ${channels}
- **Última atualização**: ${new Date(agent.updated_at).toLocaleString('pt-BR')}

## Descrição

${agent.description || 'Sem descrição disponível.'}

## Persona

**Tom de voz**: ${agent.persona?.tone?.default || 'Não definido'}
**Tons permitidos**: ${agent.persona?.tone?.allowed?.join(', ') || 'Não definido'}

**Estilo**: ${agent.persona?.style || 'Não definido'}

**Personalidade**: ${agent.persona?.personality || 'Não definido'}

## Guardrails

### O que NUNCA fazer
${(agent.guardrails?.never_do || []).map((item: string) => `- ${item}`).join('\n') || '- Não definido'}

### Gatilhos de Escalação
${(agent.guardrails?.handoff_triggers || []).map((item: string) => `- ${item}`).join('\n') || '- Não definido'}

## Ferramentas Disponíveis

${(agent.tools_config || []).map((tool: any) => `### ${tool.name}
- **Usado para**: ${tool.required_for?.join(', ') || 'N/A'}
`).join('\n') || 'Nenhuma ferramenta configurada.'}

## Base de Conhecimento

${(agent.kb_sources || []).map((source: string) => `- ${source}`).join('\n') || 'Nenhuma fonte configurada.'}

## Intents/Fluxos

${(agent.intents || []).map((intent: any) => `### ${intent.id}
Passos: ${intent.steps?.join(' → ') || 'N/A'}
`).join('\n') || 'Nenhum fluxo configurado.'}

## Como Usar

1. Deploy a Edge Function em \`source/webhook.ts\`
2. Configure as variáveis de ambiente:
${envVars.map(v => `   - ${v}`).join('\n')}
3. Configure o webhook do provedor WhatsApp
4. Importe o brain.json no AI Gym para editar configurações

## Variáveis de Ambiente Necessárias

| Variável | Descrição |
|----------|-----------|
${envVars.map(v => `| ${v} | Configuração necessária |`).join('\n')}

## Testes

${agent.tests?.length ? `${agent.tests.length} casos de teste configurados.` : 'Nenhum teste configurado.'}

---

*Exportado do AI Gym COESA em ${new Date().toLocaleString('pt-BR')}*
`;
}

function generateSystemPromptDoc(agent: any): string {
  return `# System Prompt - ${agent.name}

## Identidade

**Nome**: ${agent.name}
**Role**: ${agent.role}
**Emoji**: ${agent.avatar_emoji}

## Personalidade

${agent.persona?.personality || 'Não definido'}

## Estilo de Comunicação

${agent.persona?.style || 'Não definido'}

## Tom de Voz

- **Padrão**: ${agent.persona?.tone?.default || 'Não definido'}
- **Permitidos**: ${agent.persona?.tone?.allowed?.join(', ') || 'Não definido'}

## Regras Fundamentais (Guardrails)

### NUNCA FAZER
${(agent.guardrails?.never_do || []).map((item: string, i: number) => `${i + 1}. ${item}`).join('\n') || '- Não definido'}

### QUANDO ESCALAR PARA HUMANO
${(agent.guardrails?.handoff_triggers || []).map((item: string, i: number) => `${i + 1}. ${item}`).join('\n') || '- Não definido'}

## Intents Suportados

${(agent.intents || []).map((intent: any) => `### ${intent.id}
**Passos do fluxo**:
${intent.steps?.map((step: string, i: number) => `${i + 1}. ${step}`).join('\n') || '- N/A'}
`).join('\n') || 'Nenhum intent configurado.'}

## Ferramentas Disponíveis

${(agent.tools_config || []).map((tool: any) => `- **${tool.name}**: ${tool.required_for?.join(', ') || 'uso geral'}`).join('\n') || 'Nenhuma ferramenta.'}

## Fontes de Conhecimento

${(agent.kb_sources || []).map((source: string) => `- ${source}`).join('\n') || 'Nenhuma fonte.'}

---

## Template de System Prompt

\`\`\`
Você é ${agent.name}, ${agent.description || 'um assistente virtual'}.

PERSONALIDADE:
${agent.persona?.personality || 'Seja útil e profissional.'}

ESTILO DE COMUNICAÇÃO:
${agent.persona?.style || 'Claro e objetivo.'}

TOM DE VOZ:
Use um tom ${agent.persona?.tone?.default || 'profissional'}.

REGRAS ABSOLUTAS:
${(agent.guardrails?.never_do || ['Não inventar informações']).map((item: string) => `- NUNCA ${item}`).join('\n')}

QUANDO ESCALAR:
${(agent.guardrails?.handoff_triggers || ['Quando solicitado pelo cliente']).map((item: string) => `- ${item}`).join('\n')}
\`\`\`

---

*Gerado automaticamente pelo AI Gym COESA*
`;
}

function generateCapabilitiesConfig(agent: any): string {
  const config = {
    agent_id: agent.agent_id,
    name: agent.name,
    version: agent.version,
    role: agent.role,
    channels: agent.channels || [],
    capabilities: {
      can_send_audio: agent.role === 'sales',
      can_send_documents: true,
      can_schedule_followups: true,
      can_escalate: true,
      can_access_crm: true,
    },
    tools: (agent.tools_config || []).map((t: any) => ({
      name: t.name,
      enabled: true,
      required_for: t.required_for || [],
    })),
    kb_sources: agent.kb_sources || [],
    limits: {
      max_message_length: 4096,
      max_messages_per_hour: 60,
      quiet_hours: {
        enabled: true,
        start: '20:00',
        end: '07:00',
        timezone: 'America/Sao_Paulo',
      },
    },
  };

  return JSON.stringify(config, null, 2);
}
