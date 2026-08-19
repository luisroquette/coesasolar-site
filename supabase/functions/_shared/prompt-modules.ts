/**
 * Shared module for loading and rendering prompt modules from the database.
 * Used by all Edge Functions that need dynamic prompt generation.
 */

export interface PromptModule {
  id: string;
  module_key: string;
  module_name: string;
  category: string;
  description: string | null;
  template: string;
  variables: string[];
  is_system: boolean;
  is_active: boolean;
  priority: number;
}

export interface AgentPromptModule {
  id: string;
  agent_id: string;
  module_id: string;
  is_enabled: boolean;
  custom_variables: Record<string, any>;
  priority_override: number | null;
  module: PromptModule;
}

interface ModuleCache {
  data: AgentPromptModule[];
  timestamp: number;
}

const moduleCache = new Map<string, ModuleCache>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load all enabled prompt modules for an agent
 */
export async function loadAgentPromptModules(
  supabaseClient: any,
  agentId: string
): Promise<AgentPromptModule[]> {
  const cacheKey = `modules_${agentId}`;
  const cached = moduleCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[prompt-modules] Cache hit for agent ${agentId}`);
    return cached.data;
  }

  try {
    // First, get the agent's UUID from agent_id string
    const { data: agent, error: agentError } = await supabaseClient
      .from('ai_agents')
      .select('id')
      .eq('agent_id', agentId)
      .single();

    if (agentError || !agent) {
      console.error(`[prompt-modules] Agent not found: ${agentId}`);
      return [];
    }

    // Load configured modules for this agent
    const { data: agentModules, error } = await supabaseClient
      .from('agent_prompt_modules')
      .select(`
        id,
        agent_id,
        module_id,
        is_enabled,
        custom_variables,
        priority_override,
        module:prompt_modules(*)
      `)
      .eq('agent_id', agent.id)
      .eq('is_enabled', true);

    if (error) {
      console.error(`[prompt-modules] Error loading modules:`, error);
      return [];
    }

    const modules = (agentModules || []).filter((am: any) => am.module && am.module.is_active);
    
    // Sort by priority
    modules.sort((a: AgentPromptModule, b: AgentPromptModule) => {
      const priorityA = a.priority_override ?? a.module.priority;
      const priorityB = b.priority_override ?? b.module.priority;
      return priorityA - priorityB;
    });

    moduleCache.set(cacheKey, { data: modules, timestamp: Date.now() });
    console.log(`[prompt-modules] Loaded ${modules.length} modules for agent ${agentId}`);
    
    return modules;
  } catch (error) {
    console.error(`[prompt-modules] Exception loading modules:`, error);
    return [];
  }
}

/**
 * Render a module template with variables
 */
export function renderTemplate(template: string, variables: Record<string, any>): string {
  let rendered = template;

  // Simple variable replacement: {{variable}}
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    rendered = rendered.replace(regex, String(value ?? ''));
  }

  // Handle {{#if condition}}...{{/if}}
  rendered = rendered.replace(/{{#if\s+(\w+)}}([\s\S]*?){{\/if}}/g, (_, varName, content) => {
    const value = variables[varName];
    if (value && (Array.isArray(value) ? value.length > 0 : true)) {
      return content;
    }
    return '';
  });

  // Handle {{#each array}}...{{/each}}
  rendered = rendered.replace(/{{#each\s+(\w+)}}([\s\S]*?){{\/each}}/g, (_, varName, content) => {
    const arr = variables[varName];
    if (!Array.isArray(arr) || arr.length === 0) return '';
    
    return arr.map((item, index) => {
      let itemContent = content;
      
      if (typeof item === 'object' && item !== null) {
        // Replace {{this.property}} with item.property
        for (const [prop, val] of Object.entries(item)) {
          itemContent = itemContent.replace(new RegExp(`{{this\\.${prop}}}`, 'g'), String(val ?? ''));
        }
      } else {
        // Replace {{this}} with the item itself
        itemContent = itemContent.replace(/{{this}}/g, String(item));
      }
      
      // Replace {{@index}}
      itemContent = itemContent.replace(/{{@index}}/g, String(index));
      
      return itemContent;
    }).join('');
  });

  // Clean up any remaining unset variables
  rendered = rendered.replace(/{{[^}]+}}/g, '');

  return rendered.trim();
}

/**
 * Build the complete prompt from all enabled modules
 */
export function buildModularPrompt(
  modules: AgentPromptModule[],
  globalVariables: Record<string, any> = {}
): string {
  const sections: string[] = [];

  for (const agentModule of modules) {
    const module = agentModule.module;
    if (!module || !module.is_active) continue;

    // Merge global variables with module-specific custom variables
    const variables = {
      ...globalVariables,
      ...agentModule.custom_variables
    };

    const rendered = renderTemplate(module.template, variables);
    
    if (rendered.trim()) {
      sections.push(rendered);
    }
  }

  return sections.join('\n\n');
}

/**
 * Load modules and build prompt in one call
 */
export async function buildAgentPromptFromModules(
  supabaseClient: any,
  agentId: string,
  globalVariables: Record<string, any> = {}
): Promise<string> {
  const modules = await loadAgentPromptModules(supabaseClient, agentId);
  return buildModularPrompt(modules, globalVariables);
}

/**
 * Get modules by category
 */
export function getModulesByCategory(modules: AgentPromptModule[]): Record<string, AgentPromptModule[]> {
  return modules.reduce((acc, module) => {
    const category = module.module?.category || 'custom';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(module);
    return acc;
  }, {} as Record<string, AgentPromptModule[]>);
}

/**
 * Clear the module cache (useful after updates)
 */
export function clearModuleCache(agentId?: string): void {
  if (agentId) {
    moduleCache.delete(`modules_${agentId}`);
  } else {
    moduleCache.clear();
  }
}

// ═══════════════════════════════════════════════════════════════
// MODULAR PROMPT ORCHESTRATOR
// Loads modules + builds prompt in one call
// ═══════════════════════════════════════════════════════════════

export interface ModularPromptContext {
  supabase: any;
  agentId: string;
  variables: {
    clienteNome: string;
    descontoPercentual: number;
    distribuidora: string;
    valorFatura: string;
    consumo: string;
    email: string;
    funnelStage: string;
    agentName: string;
  };
}

export interface ModularPromptResult {
  promptSection: string;
  modulesLoaded: number;
  success: boolean;
}

/**
 * Orchestrates loading and building modular prompts in one call
 */
export async function orchestrateModularPrompts(
  ctx: ModularPromptContext
): Promise<ModularPromptResult> {
  const { supabase, agentId, variables } = ctx;
  
  try {
    const promptModules = await loadAgentPromptModules(supabase, agentId);
    
    if (promptModules.length === 0) {
      return {
        promptSection: '',
        modulesLoaded: 0,
        success: true,
      };
    }
    
    const promptSection = buildModularPrompt(promptModules, variables);
    console.log(`[prompt-modules] 🧩 Built modular prompt with ${promptModules.length} modules for agent: ${agentId}`);
    
    return {
      promptSection,
      modulesLoaded: promptModules.length,
      success: true,
    };
  } catch (error) {
    console.warn('[prompt-modules] Failed to load/build modular prompts:', error);
    return {
      promptSection: '',
      modulesLoaded: 0,
      success: false,
    };
  }
}
