/**
 * AGENT ADAPTER RESOLVER
 * Resolves agentId to appropriate adapter instance.
 * @module _shared/sofia-orchestrator/adapters/index
 */

import type { AgentAdapter, AdapterRegistry } from './types.ts';
import { SofiaAdapter } from './sofia-adapter.ts';
import { MariaAdapter } from './maria-adapter.ts';
import { JuliaAdapter } from './julia-adapter.ts';
import { IagoAdapter } from './iago-adapter.ts';
import { JaimeAdapter } from './jaime-adapter.ts';

export * from './types.ts';
export * from './base-adapter.ts';
export { SofiaAdapter } from './sofia-adapter.ts';
export { MariaAdapter } from './maria-adapter.ts';
export { JuliaAdapter } from './julia-adapter.ts';
export { IagoAdapter } from './iago-adapter.ts';
export { JaimeAdapter } from './jaime-adapter.ts';

const ADAPTER_MAP: AdapterRegistry = {
  'sofia': () => new SofiaAdapter(),
  'maria': () => new MariaAdapter(),
  'julia': () => new JuliaAdapter(),
  'iago': () => new IagoAdapter(),
  'jaime': () => new JaimeAdapter(),
};

/**
 * Resolve agent ID to adapter instance
 * Falls back to SofiaAdapter for unknown agents
 */
export function resolveAgentAdapter(agentId: string): AgentAdapter {
  const normalizedId = agentId.toLowerCase();
  const factory = ADAPTER_MAP[normalizedId];
  
  if (factory) {
    console.log(`[ADAPTER] Resolved adapter for agent: ${agentId}`);
    return factory();
  }
  
  console.log(`[ADAPTER] Unknown agent ${agentId}, using SofiaAdapter as fallback`);
  return new SofiaAdapter();
}

/**
 * Get all registered agent IDs
 */
export function getRegisteredAgentIds(): string[] {
  return Object.keys(ADAPTER_MAP);
}

/**
 * Check if an adapter exists for given agent ID
 */
export function hasAdapter(agentId: string): boolean {
  return agentId.toLowerCase() in ADAPTER_MAP;
}
