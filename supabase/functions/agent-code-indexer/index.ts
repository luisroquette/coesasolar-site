import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getStrictCorsHeaders,
  handleCorsPrelight,
} from '../_shared/security-helpers.ts';

/**
 * agent-code-indexer: Indexes agent source code into RAG for self-awareness
 * 
 * Layer 1 of Self-Improving Agent architecture.
 * Reads key agent source files, chunks by function/module, generates embeddings,
 * and saves to rag_documents/rag_chunks with category 'codigo_agente'.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = (Deno.env.get('COESASOLAR_OPENROUTER_API_KEY') ?? Deno.env.get('OPENROUTER_API_KEY'))!;

// ═══════════════════════════════════════════════════════════════
// FILES TO INDEX (curated list — business logic only)
// ═══════════════════════════════════════════════════════════════

interface SourceFileConfig {
  path: string;
  subcategory: string;
  purpose: string;
}

const SOURCE_FILES: SourceFileConfig[] = [
  { path: 'sofia-webhook/index.ts', subcategory: 'pipeline', purpose: 'Main webhook handler and orchestration flow' },
  { path: '_shared/sofia-orchestrator/adapters/sofia-adapter.ts', subcategory: 'adapter', purpose: 'Agent configuration, RAG mapping, field definitions, fast-paths' },
  { path: '_shared/sofia-orchestrator/adapters/base-adapter.ts', subcategory: 'adapter', purpose: 'Base adapter interface and shared logic' },
  { path: '_shared/sofia-orchestrator/adapters/types.ts', subcategory: 'adapter', purpose: 'Type definitions for agent system' },
  { path: '_shared/system-prompt-builder.ts', subcategory: 'prompt_builder', purpose: 'System prompt construction and context injection' },
  { path: '_shared/llm-guardrails.ts', subcategory: 'guardrails', purpose: 'LLM output validation and safety guards' },
  { path: '_shared/anti-spam-guards.ts', subcategory: 'guardrails', purpose: 'Anti-spam and LGPD compliance guards' },
  { path: '_shared/pre-llm-hard-stops.ts', subcategory: 'guardrails', purpose: 'Pre-LLM deterministic checks and hard stops' },
  { path: '_shared/SOFIA.md', subcategory: 'constitution', purpose: 'Agent constitution — identity, rules, FSM, clausulas petreas' },
];

// ═══════════════════════════════════════════════════════════════
// CHUNKING LOGIC
// ═══════════════════════════════════════════════════════════════

interface CodeChunk {
  content: string;
  metadata: {
    file: string;
    subcategory: string;
    purpose: string;
    chunk_type: string;     // 'function', 'class', 'config', 'section', 'full_file'
    function_name?: string;
    line_start?: number;
    line_end?: number;
  };
}

/**
 * Split source code into meaningful chunks by exported functions/classes/configs.
 * Falls back to sliding window for files without clear boundaries.
 */
function chunkSourceCode(content: string, fileConfig: SourceFileConfig): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = content.split('\n');

  // For .md files, chunk by ## sections
  if (fileConfig.path.endsWith('.md')) {
    return chunkMarkdown(content, fileConfig);
  }

  // Try to extract exported functions/classes/consts
  const functionBoundaries = findFunctionBoundaries(lines);

  if (functionBoundaries.length > 0) {
    for (const boundary of functionBoundaries) {
      const chunkContent = lines.slice(boundary.start, boundary.end + 1).join('\n');
      if (chunkContent.trim().length < 50) continue;

      chunks.push({
        content: `// File: ${fileConfig.path}\n// Purpose: ${fileConfig.purpose}\n\n${chunkContent}`,
        metadata: {
          file: fileConfig.path,
          subcategory: fileConfig.subcategory,
          purpose: fileConfig.purpose,
          chunk_type: boundary.type,
          function_name: boundary.name,
          line_start: boundary.start + 1,
          line_end: boundary.end + 1,
        },
      });
    }
  }

  // If we got very few chunks, also add the full file as context
  if (chunks.length <= 1 && content.length < 8000) {
    chunks.push({
      content: `// File: ${fileConfig.path}\n// Purpose: ${fileConfig.purpose}\n// Type: Full file\n\n${content}`,
      metadata: {
        file: fileConfig.path,
        subcategory: fileConfig.subcategory,
        purpose: fileConfig.purpose,
        chunk_type: 'full_file',
      },
    });
  } else if (chunks.length <= 1) {
    // Large file with no clear boundaries → sliding window
    return chunkByWindow(content, fileConfig, 3000, 500);
  }

  return chunks;
}

function chunkMarkdown(content: string, fileConfig: SourceFileConfig): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const sections = content.split(/(?=^## )/m);

  for (const section of sections) {
    if (section.trim().length < 30) continue;
    const titleMatch = section.match(/^##\s+(.+)/);
    const title = titleMatch ? titleMatch[1].trim() : 'Introduction';

    chunks.push({
      content: `# Source: ${fileConfig.path}\n# Section: ${title}\n\n${section.trim()}`,
      metadata: {
        file: fileConfig.path,
        subcategory: fileConfig.subcategory,
        purpose: fileConfig.purpose,
        chunk_type: 'section',
        function_name: title,
      },
    });
  }

  return chunks;
}

function chunkByWindow(content: string, fileConfig: SourceFileConfig, windowSize: number, overlap: number): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  let pos = 0;
  let index = 0;

  while (pos < content.length) {
    const end = Math.min(pos + windowSize, content.length);
    const chunkContent = content.slice(pos, end);

    chunks.push({
      content: `// File: ${fileConfig.path}\n// Chunk: ${index + 1}\n\n${chunkContent}`,
      metadata: {
        file: fileConfig.path,
        subcategory: fileConfig.subcategory,
        purpose: fileConfig.purpose,
        chunk_type: 'window',
      },
    });

    pos += windowSize - overlap;
    index++;
  }

  return chunks;
}

interface FunctionBoundary {
  name: string;
  type: string;
  start: number;
  end: number;
}

function findFunctionBoundaries(lines: string[]): FunctionBoundary[] {
  const boundaries: FunctionBoundary[] = [];
  const patterns = [
    { regex: /^export\s+(async\s+)?function\s+(\w+)/, type: 'function' },
    { regex: /^export\s+class\s+(\w+)/, type: 'class' },
    { regex: /^export\s+const\s+(\w+)\s*[:=]/, type: 'config' },
    { regex: /^(async\s+)?function\s+(\w+)/, type: 'function' },
    { regex: /^const\s+(\w+)\s*[:=]\s*(async\s+)?\(/, type: 'function' },
  ];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let matched = false;

    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (match) {
        const name = match[2] || match[1];
        const start = i;
        const end = findBlockEnd(lines, i);
        
        if (end > start) {
          boundaries.push({ name, type: pattern.type, start, end });
          i = end + 1;
          matched = true;
          break;
        }
      }
    }

    if (!matched) i++;
  }

  return boundaries;
}

function findBlockEnd(lines: string[], start: number): number {
  let braceCount = 0;
  let foundOpen = false;

  for (let i = start; i < lines.length; i++) {
    for (const char of lines[i]) {
      if (char === '{') { braceCount++; foundOpen = true; }
      if (char === '}') braceCount--;
    }
    if (foundOpen && braceCount === 0) return i;
  }

  // For const arrays/objects, look for closing bracket/semicolon
  for (let i = start; i < Math.min(start + 100, lines.length); i++) {
    if (lines[i].match(/^];?\s*$/) || lines[i].match(/^};\s*$/)) return i;
  }

  return Math.min(start + 50, lines.length - 1);
}

// ═══════════════════════════════════════════════════════════════
// EMBEDDING GENERATION (via Lovable AI)
// ═══════════════════════════════════════════════════════════════

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: text.slice(0, 8000),
      model: 'openai/text-embedding-3-small',
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding generation failed: ${response.status}`);
  }

  const result = await response.json();
  return result.data[0].embedding;
}

// ═══════════════════════════════════════════════════════════════
// FILE READING (from Storage bucket 'agent-sources')
// ═══════════════════════════════════════════════════════════════

async function readSourceFile(supabase: any, filePath: string): Promise<string | null> {
  // Primary: read from local filesystem (deployed edge functions)
  try {
    const url = new URL(`../${filePath}`, import.meta.url);
    const content = await Deno.readTextFile(url);
    console.log(`[code-indexer] ✓ Read from filesystem: ${filePath}`);
    return content;
  } catch (fsErr) {
    console.warn(`[code-indexer] Filesystem read failed for ${filePath}:`, fsErr);
  }

  // Fallback: read from Storage bucket
  try {
    const { data, error } = await supabase
      .storage
      .from('agent-sources')
      .download(filePath);

    if (!error && data) {
      console.log(`[code-indexer] ✓ Read from storage fallback: ${filePath}`);
      return await data.text();
    }
    console.warn(`[code-indexer] Storage fallback failed for ${filePath}:`, error?.message);
  } catch (storageErr) {
    console.warn(`[code-indexer] Storage error for ${filePath}:`, storageErr);
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// MAIN INDEXING LOGIC
// ═══════════════════════════════════════════════════════════════

interface IndexResult {
  files_processed: number;
  files_skipped: number;
  chunks_created: number;
  errors: string[];
  duration_ms: number;
}

async function indexAgentCode(supabase: any, forceReindex: boolean = false): Promise<IndexResult> {
  const startTime = Date.now();
  const result: IndexResult = {
    files_processed: 0,
    files_skipped: 0,
    chunks_created: 0,
    errors: [],
    duration_ms: 0,
  };

  for (const fileConfig of SOURCE_FILES) {
    try {
      console.log(`[code-indexer] Processing: ${fileConfig.path}`);

      // Read file content
      const content = await readSourceFile(supabase, fileConfig.path);
      if (!content) {
        result.files_skipped++;
        result.errors.push(`File not found in storage: ${fileConfig.path}`);
        continue;
      }

      // Generate content hash for dedup
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(content));
      const contentHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Check if already indexed with same hash
      if (!forceReindex) {
        const { data: existing } = await supabase
          .from('rag_documents')
          .select('id, content_hash')
          .eq('source_type', 'agent_code')
          .eq('source_path', fileConfig.path)
          .maybeSingle();

        if (existing?.content_hash === contentHash) {
          console.log(`[code-indexer] Skipping (unchanged): ${fileConfig.path}`);
          result.files_skipped++;
          continue;
        }

        // If exists but changed, delete old chunks
        if (existing) {
          await supabase.from('rag_chunks').delete().eq('document_id', existing.id);
          await supabase.from('rag_documents').delete().eq('id', existing.id);
        }
      } else {
        // Force reindex: delete existing
        const { data: existing } = await supabase
          .from('rag_documents')
          .select('id')
          .eq('source_type', 'agent_code')
          .eq('source_path', fileConfig.path)
          .maybeSingle();

        if (existing) {
          await supabase.from('rag_chunks').delete().eq('document_id', existing.id);
          await supabase.from('rag_documents').delete().eq('id', existing.id);
        }
      }

      // Chunk the source code
      const chunks = chunkSourceCode(content, fileConfig);
      if (chunks.length === 0) {
        result.files_skipped++;
        continue;
      }

      // Create document record
      const { data: doc, error: docError } = await supabase
        .from('rag_documents')
        .insert({
          file_name: fileConfig.path.split('/').pop(),
          file_type: fileConfig.path.endsWith('.md') ? 'markdown' : 'typescript',
          category: 'codigo_agente',
          subcategory: fileConfig.subcategory,
          source_type: 'agent_code',
          source_path: fileConfig.path,
          content_raw: content,
          content_hash: contentHash,
          chunk_count: chunks.length,
          total_tokens: Math.ceil(content.length / 4),
          processing_status: 'processing',
          is_active: true,
          metadata: {
            purpose: fileConfig.purpose,
            indexed_at: new Date().toISOString(),
          },
        })
        .select('id')
        .single();

      if (docError) {
        result.errors.push(`Failed to create doc for ${fileConfig.path}: ${docError.message}`);
        continue;
      }

      // Generate embeddings and insert chunks
      let chunksInserted = 0;
      for (let i = 0; i < chunks.length; i++) {
        try {
          const embedding = await generateEmbedding(chunks[i].content);

          const { error: chunkError } = await supabase
            .from('rag_chunks')
            .insert({
              document_id: doc.id,
              chunk_index: i,
              content: chunks[i].content,
              embedding: `[${embedding.join(',')}]`,
              token_count: Math.ceil(chunks[i].content.length / 4),
              char_count: chunks[i].content.length,
              metadata: chunks[i].metadata,
            });

          if (!chunkError) chunksInserted++;
          else result.errors.push(`Chunk ${i} of ${fileConfig.path}: ${chunkError.message}`);
        } catch (embErr) {
          result.errors.push(`Embedding for chunk ${i} of ${fileConfig.path}: ${embErr}`);
        }
      }

      // Update document status
      await supabase
        .from('rag_documents')
        .update({
          processing_status: 'completed',
          chunk_count: chunksInserted,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', doc.id);

      result.files_processed++;
      result.chunks_created += chunksInserted;
      console.log(`[code-indexer] ✓ ${fileConfig.path}: ${chunksInserted} chunks`);

    } catch (fileErr) {
      result.errors.push(`Error processing ${fileConfig.path}: ${fileErr}`);
    }
  }

  result.duration_ms = Date.now() - startTime;
  return result;
}

// ═══════════════════════════════════════════════════════════════
// HTTP HANDLER
// ═══════════════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPrelight(req, { mode: 'strict' });
  }

  const corsHeaders = getStrictCorsHeaders(req);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'index';
    const forceReindex = body.force === true;

    switch (action) {
      case 'index': {
        const result = await indexAgentCode(supabase, forceReindex);
        console.log('[code-indexer] Indexing complete:', result);

        return new Response(
          JSON.stringify({ success: true, ...result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'status': {
        const { data: docs } = await supabase
          .from('rag_documents')
          .select('file_name, source_path, processing_status, chunk_count, content_hash, last_synced_at')
          .eq('source_type', 'agent_code')
          .eq('category', 'codigo_agente')
          .order('source_path');

        return new Response(
          JSON.stringify({ success: true, indexed_files: docs || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[code-indexer] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
