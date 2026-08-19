-- Add learning_type to rag_documents for intelligent success/failure separation
ALTER TABLE public.rag_documents 
ADD COLUMN IF NOT EXISTS learning_type text DEFAULT 'neutral' CHECK (learning_type IN ('success', 'failure', 'neutral'));

-- Add learning_type to rag_chunks for chunk-level classification
ALTER TABLE public.rag_chunks
ADD COLUMN IF NOT EXISTS learning_type text DEFAULT 'neutral' CHECK (learning_type IN ('success', 'failure', 'neutral'));

-- Add is_exemplar flag for high-quality examples
ALTER TABLE public.rag_chunks
ADD COLUMN IF NOT EXISTS is_exemplar boolean DEFAULT false;

-- Add exemplar_reason for why this chunk is an exemplar
ALTER TABLE public.rag_chunks
ADD COLUMN IF NOT EXISTS exemplar_reason text;

-- Create index for efficient queries by learning type
CREATE INDEX IF NOT EXISTS idx_rag_documents_learning_type ON public.rag_documents(learning_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_rag_chunks_learning_type ON public.rag_chunks(learning_type);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_exemplar ON public.rag_chunks(is_exemplar) WHERE is_exemplar = true;

-- Add configuration for folder structure
INSERT INTO public.configuracoes_sistema (chave, valor, descricao)
VALUES 
  ('learning_folders_config', '{"success_folder":"Scripts/Sucesso","failure_folder":"Scripts/Fracasso","auto_detect_from_content":true}', 'Configuração das pastas de aprendizado positivo/negativo'),
  ('learning_exemplar_min_score', '85', 'Score mínimo para um chunk ser considerado exemplar (0-100)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;

-- Add comment for documentation
COMMENT ON COLUMN public.rag_documents.learning_type IS 'success = exemplo positivo a imitar, failure = exemplo negativo a evitar, neutral = apenas conhecimento';
COMMENT ON COLUMN public.rag_chunks.is_exemplar IS 'true se este chunk é um exemplo de alta qualidade para treinamento';

-- Update existing scripts to failure by default (they came from failed conversations)
UPDATE public.rag_documents 
SET learning_type = 'failure'
WHERE category = 'scripts' 
  AND source_path LIKE '%Scripts%'
  AND learning_type = 'neutral';