-- =====================================================
-- RAG CENTRALIZADO - FASE 1: INFRAESTRUTURA VETORIAL
-- =====================================================

-- Habilitar extensão pgvector para embeddings
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- =====================================================
-- TABELA: rag_documents - Documentos indexados
-- =====================================================
CREATE TABLE public.rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL DEFAULT 'manual', -- 'onedrive', 'manual', 'url', 'upload'
  source_id TEXT, -- ID externo (ex: OneDrive item ID)
  source_path TEXT, -- Caminho: /Vendas/Scripts/...
  file_name TEXT NOT NULL,
  file_type TEXT, -- pdf, docx, xlsx, txt, md
  category TEXT NOT NULL DEFAULT 'geral', -- 'vendas', 'sac', 'cobranca', 'geral', 'treinamento', 'regulatorio'
  subcategory TEXT, -- Subcategorização opcional
  content_raw TEXT, -- Texto extraído completo
  content_hash TEXT, -- SHA256 para detectar mudanças
  chunk_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  processing_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  processing_error TEXT,
  last_synced_at TIMESTAMPTZ,
  external_modified_at TIMESTAMPTZ, -- Data de modificação na fonte externa
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  is_active BOOLEAN DEFAULT true
);

-- Índices para performance
CREATE INDEX idx_rag_documents_category ON public.rag_documents(category);
CREATE INDEX idx_rag_documents_source_type ON public.rag_documents(source_type);
CREATE INDEX idx_rag_documents_status ON public.rag_documents(processing_status);
CREATE INDEX idx_rag_documents_source_id ON public.rag_documents(source_id);
CREATE INDEX idx_rag_documents_active ON public.rag_documents(is_active) WHERE is_active = true;

-- =====================================================
-- TABELA: rag_chunks - Segmentos vetorizados
-- =====================================================
CREATE TABLE public.rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.rag_documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding extensions.vector(1536), -- Dimensão padrão OpenAI/Gemini
  token_count INTEGER DEFAULT 0,
  char_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}', -- { section, page, headers }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, chunk_index)
);

-- Índice HNSW para busca vetorial rápida (cosine similarity)
CREATE INDEX idx_rag_chunks_embedding ON public.rag_chunks 
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Índice para lookup por documento
CREATE INDEX idx_rag_chunks_document ON public.rag_chunks(document_id);

-- =====================================================
-- TABELA: rag_permissions - Matriz de permissões
-- =====================================================
CREATE TABLE public.rag_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL, -- 'sofia', 'maria', 'julia', 'iago', 'jaime'
  category TEXT NOT NULL, -- 'vendas', 'sac', 'cobranca', 'geral', 'treinamento', 'regulatorio'
  access_level TEXT DEFAULT 'read', -- 'none', 'read', 'write', 'admin'
  priority INTEGER DEFAULT 0, -- Prioridade de busca (maior = mais relevante)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  UNIQUE(agent_id, category)
);

-- Permissões padrão por agente
INSERT INTO public.rag_permissions (agent_id, category, access_level, priority) VALUES
  -- sofIA: Especialista em vendas
  ('sofia', 'vendas', 'read', 100),
  ('sofia', 'treinamento', 'read', 80),
  ('sofia', 'geral', 'read', 50),
  ('sofia', 'regulatorio', 'read', 30),
  
  -- marIA: Especialista em SAC/Atendimento
  ('maria', 'sac', 'read', 100),
  ('maria', 'geral', 'read', 50),
  ('maria', 'regulatorio', 'read', 40),
  
  -- julIA: Especialista em cobrança
  ('julia', 'cobranca', 'read', 100),
  ('julia', 'geral', 'read', 50),
  
  -- Iago: Suporte técnico (todos os acessos)
  ('iago', 'vendas', 'read', 60),
  ('iago', 'sac', 'read', 60),
  ('iago', 'cobranca', 'read', 60),
  ('iago', 'geral', 'read', 80),
  ('iago', 'regulatorio', 'read', 70),
  ('iago', 'treinamento', 'read', 50),
  
  -- Jaime: Agendamentos
  ('jaime', 'geral', 'read', 50);

-- =====================================================
-- TABELA: rag_sync_logs - Logs de sincronização
-- =====================================================
CREATE TABLE public.rag_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL DEFAULT 'manual', -- 'full', 'incremental', 'webhook', 'manual'
  source_type TEXT DEFAULT 'onedrive', -- 'onedrive', 'upload', 'url'
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed', 'cancelled'
  documents_scanned INTEGER DEFAULT 0,
  documents_added INTEGER DEFAULT 0,
  documents_updated INTEGER DEFAULT 0,
  documents_skipped INTEGER DEFAULT 0,
  documents_failed INTEGER DEFAULT 0,
  chunks_created INTEGER DEFAULT 0,
  total_tokens_processed INTEGER DEFAULT 0,
  error_message TEXT,
  error_details JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  triggered_by UUID, -- Usuário que iniciou (null = automático)
  metadata JSONB DEFAULT '{}'
);

-- =====================================================
-- TABELA: rag_search_logs - Analytics de buscas
-- =====================================================
CREATE TABLE public.rag_search_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  query_text TEXT NOT NULL,
  query_embedding extensions.vector(1536),
  results_count INTEGER DEFAULT 0,
  top_similarity FLOAT,
  avg_similarity FLOAT,
  categories_searched TEXT[],
  execution_time_ms INTEGER,
  was_useful BOOLEAN, -- Feedback futuro
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para analytics
CREATE INDEX idx_rag_search_logs_agent ON public.rag_search_logs(agent_id);
CREATE INDEX idx_rag_search_logs_date ON public.rag_search_logs(created_at);

-- =====================================================
-- TABELA: rag_onedrive_config - Configuração OneDrive
-- =====================================================
CREATE TABLE public.rag_onedrive_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT,
  client_id TEXT,
  drive_id TEXT,
  root_folder_path TEXT DEFAULT '/COESA Knowledge Base',
  folder_category_mapping JSONB DEFAULT '{
    "Vendas": "vendas",
    "SAC": "sac",
    "Cobranca": "cobranca",
    "Cobrança": "cobranca",
    "Geral": "geral",
    "Treinamento": "treinamento",
    "Regulatorio": "regulatorio",
    "Regulatório": "regulatorio"
  }',
  sync_enabled BOOLEAN DEFAULT false,
  sync_interval_hours INTEGER DEFAULT 6,
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  is_configured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir configuração padrão
INSERT INTO public.rag_onedrive_config (id) VALUES (gen_random_uuid());

-- =====================================================
-- FUNÇÃO: match_rag_chunks - Busca vetorial com permissões
-- =====================================================
CREATE OR REPLACE FUNCTION public.match_rag_chunks(
  query_embedding extensions.vector(1536),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5,
  filter_categories TEXT[] DEFAULT ARRAY[]::TEXT[],
  filter_agent TEXT DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  document_id UUID,
  chunk_index INTEGER,
  content TEXT,
  file_name TEXT,
  category TEXT,
  subcategory TEXT,
  source_path TEXT,
  similarity FLOAT,
  metadata JSONB
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  allowed_categories TEXT[];
BEGIN
  -- Se filter_agent foi passado, buscar categorias permitidas
  IF filter_agent IS NOT NULL AND array_length(filter_categories, 1) IS NULL THEN
    SELECT array_agg(p.category ORDER BY p.priority DESC)
    INTO allowed_categories
    FROM rag_permissions p
    WHERE p.agent_id = filter_agent AND p.access_level != 'none';
  ELSE
    allowed_categories := filter_categories;
  END IF;

  -- Se nenhuma categoria permitida, retornar vazio
  IF allowed_categories IS NULL OR array_length(allowed_categories, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    c.id,
    c.document_id,
    c.chunk_index,
    c.content,
    d.file_name,
    d.category,
    d.subcategory,
    d.source_path,
    (1 - (c.embedding <=> query_embedding))::FLOAT AS similarity,
    c.metadata
  FROM rag_chunks c
  JOIN rag_documents d ON d.id = c.document_id
  WHERE 
    d.is_active = true
    AND d.processing_status = 'completed'
    AND d.category = ANY(allowed_categories)
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- =====================================================
-- FUNÇÃO: get_rag_stats - Estatísticas do RAG
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_rag_stats()
RETURNS TABLE (
  total_documents INTEGER,
  total_chunks INTEGER,
  total_tokens BIGINT,
  documents_by_category JSONB,
  documents_by_status JSONB,
  avg_chunks_per_doc FLOAT,
  last_sync_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM rag_documents WHERE is_active = true),
    (SELECT COUNT(*)::INTEGER FROM rag_chunks),
    (SELECT COALESCE(SUM(total_tokens), 0) FROM rag_documents WHERE is_active = true),
    (SELECT jsonb_object_agg(category, cnt) FROM (
      SELECT category, COUNT(*)::INTEGER as cnt 
      FROM rag_documents WHERE is_active = true 
      GROUP BY category
    ) sub),
    (SELECT jsonb_object_agg(processing_status, cnt) FROM (
      SELECT processing_status, COUNT(*)::INTEGER as cnt 
      FROM rag_documents 
      GROUP BY processing_status
    ) sub),
    (SELECT AVG(chunk_count)::FLOAT FROM rag_documents WHERE is_active = true AND chunk_count > 0),
    (SELECT MAX(last_sync_at) FROM rag_onedrive_config);
END;
$$;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- rag_documents
ALTER TABLE public.rag_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view RAG documents" ON public.rag_documents
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage RAG documents" ON public.rag_documents
  FOR ALL USING (is_admin(auth.uid()));

-- rag_chunks
ALTER TABLE public.rag_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view RAG chunks" ON public.rag_chunks
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage RAG chunks" ON public.rag_chunks
  FOR ALL USING (is_admin(auth.uid()));

-- rag_permissions
ALTER TABLE public.rag_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view RAG permissions" ON public.rag_permissions
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage RAG permissions" ON public.rag_permissions
  FOR ALL USING (is_admin(auth.uid()));

-- rag_sync_logs
ALTER TABLE public.rag_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view RAG sync logs" ON public.rag_sync_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage RAG sync logs" ON public.rag_sync_logs
  FOR ALL USING (is_admin(auth.uid()));

-- rag_search_logs
ALTER TABLE public.rag_search_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view RAG search logs" ON public.rag_search_logs
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "System can insert RAG search logs" ON public.rag_search_logs
  FOR INSERT WITH CHECK (true);

-- rag_onedrive_config
ALTER TABLE public.rag_onedrive_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage OneDrive config" ON public.rag_onedrive_config
  FOR ALL USING (is_admin(auth.uid()));

-- =====================================================
-- TRIGGERS para updated_at
-- =====================================================
CREATE TRIGGER update_rag_documents_updated_at
  BEFORE UPDATE ON public.rag_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rag_permissions_updated_at
  BEFORE UPDATE ON public.rag_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rag_onedrive_config_updated_at
  BEFORE UPDATE ON public.rag_onedrive_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();