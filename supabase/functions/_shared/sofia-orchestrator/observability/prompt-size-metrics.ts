/**
 * Prompt Size Metrics
 * 
 * Tracks and reports system prompt size for AGENTS.md compliance monitoring
 */

import { LOG_PREFIX, STATUS_SYMBOLS } from './constants.ts';

// =============================================================================
// TYPES
// =============================================================================

export interface PromptSizeMetrics {
  totalChars: number;
  totalTokensEstimate: number;
  sections: PromptSectionSize[];
  compressionRatio: number;
  meetsTarget: boolean;
  targetChars: number;
  timestamp: Date;
}

export interface PromptSectionSize {
  name: string;
  chars: number;
  percentage: number;
}

export interface PromptSizeThresholds {
  targetChars: number;
  warningChars: number;
  criticalChars: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const DEFAULT_THRESHOLDS: PromptSizeThresholds = {
  targetChars: 8000,    // AGENTS.md target: ≤8KB
  warningChars: 10000,  // 25% over target
  criticalChars: 12000, // 50% over target
};

// Approximate chars per token (GPT-style tokenization)
const CHARS_PER_TOKEN = 4;

// =============================================================================
// METRICS COLLECTOR
// =============================================================================

export class PromptSizeCollector {
  private sections: Map<string, number> = new Map();
  private thresholds: PromptSizeThresholds;
  private baselineChars: number = 0;

  constructor(thresholds: PromptSizeThresholds = DEFAULT_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  /**
   * Records the size of a prompt section
   */
  recordSection(name: string, content: string): void {
    const chars = content.length;
    this.sections.set(name, chars);
  }

  /**
   * Sets baseline size (for compression ratio calculation)
   */
  setBaseline(chars: number): void {
    this.baselineChars = chars;
  }

  /**
   * Measures a full prompt string
   */
  measurePrompt(prompt: string, sectionName: string = 'full_prompt'): number {
    const chars = prompt.length;
    this.sections.set(sectionName, chars);
    return chars;
  }

  /**
   * Calculates total size and generates metrics
   */
  getMetrics(): PromptSizeMetrics {
    const totalChars = Array.from(this.sections.values()).reduce((sum, c) => sum + c, 0);
    const totalTokensEstimate = Math.ceil(totalChars / CHARS_PER_TOKEN);
    
    const sections: PromptSectionSize[] = Array.from(this.sections.entries())
      .map(([name, chars]) => ({
        name,
        chars,
        percentage: totalChars > 0 ? Math.round((chars / totalChars) * 100) : 0,
      }))
      .sort((a, b) => b.chars - a.chars);

    const compressionRatio = this.baselineChars > 0 
      ? Math.round((1 - totalChars / this.baselineChars) * 100) 
      : 0;

    return {
      totalChars,
      totalTokensEstimate,
      sections,
      compressionRatio,
      meetsTarget: totalChars <= this.thresholds.targetChars,
      targetChars: this.thresholds.targetChars,
      timestamp: new Date(),
    };
  }

  /**
   * Logs metrics summary to console
   */
  logMetrics(agentId: string): void {
    const metrics = this.getMetrics();
    const status = metrics.meetsTarget ? STATUS_SYMBOLS.completed : STATUS_SYMBOLS.warning;
    
    console.log(
      `${LOG_PREFIX.METRICS} ${status} prompt_size agent=${agentId} ` +
      `chars=${metrics.totalChars}/${metrics.targetChars} ` +
      `tokens≈${metrics.totalTokensEstimate} ` +
      `compression=${metrics.compressionRatio}%`
    );

    // Log warning if over threshold
    if (metrics.totalChars >= this.thresholds.criticalChars) {
      console.error(
        `${LOG_PREFIX.PERF} ❌ CRITICAL: Prompt size ${metrics.totalChars} exceeds ${this.thresholds.criticalChars} chars`
      );
    } else if (metrics.totalChars >= this.thresholds.warningChars) {
      console.warn(
        `${LOG_PREFIX.PERF} ⚠️ WARNING: Prompt size ${metrics.totalChars} exceeds ${this.thresholds.warningChars} chars`
      );
    }
  }

  /**
   * Generates compact report for logging
   */
  getCompactReport(): string {
    const metrics = this.getMetrics();
    const topSections = metrics.sections.slice(0, 3)
      .map(s => `${s.name}:${s.chars}`)
      .join('|');
    
    return `total=${metrics.totalChars}|target=${metrics.targetChars}|` +
           `tokens≈${metrics.totalTokensEstimate}|${topSections}`;
  }

  /**
   * Resets the collector for a new measurement
   */
  reset(): void {
    this.sections.clear();
    this.baselineChars = 0;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Quick measurement of prompt size
 */
export function measurePromptSize(prompt: string): {
  chars: number;
  tokensEstimate: number;
  meetsTarget: boolean;
} {
  const chars = prompt.length;
  return {
    chars,
    tokensEstimate: Math.ceil(chars / CHARS_PER_TOKEN),
    meetsTarget: chars <= DEFAULT_THRESHOLDS.targetChars,
  };
}

/**
 * Creates a size collector instance
 */
export function createPromptSizeCollector(
  thresholds?: Partial<PromptSizeThresholds>
): PromptSizeCollector {
  return new PromptSizeCollector({
    ...DEFAULT_THRESHOLDS,
    ...thresholds,
  });
}

/**
 * Logs prompt size as a one-liner for quick debugging
 */
export function logPromptSize(
  prompt: string,
  context: { agentId: string; phase?: string }
): void {
  const { chars, tokensEstimate, meetsTarget } = measurePromptSize(prompt);
  const status = meetsTarget ? '✓' : '⚠️';
  
  console.log(
    `${LOG_PREFIX.METRICS} ${status} prompt_size ` +
    `agent=${context.agentId} ` +
    `phase=${context.phase || 'build'} ` +
    `chars=${chars} tokens≈${tokensEstimate}`
  );
}

/**
 * Formats section breakdown for persistence
 */
export function formatSectionsForStorage(
  sections: PromptSectionSize[]
): Record<string, number> {
  return sections.reduce((acc, s) => {
    acc[s.name] = s.chars;
    return acc;
  }, {} as Record<string, number>);
}
