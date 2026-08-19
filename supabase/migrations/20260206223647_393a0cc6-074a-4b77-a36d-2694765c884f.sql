-- P3: MODEL ROUTER CONFIGURATION
INSERT INTO configuracoes_sistema (chave, valor, descricao, created_at, updated_at) VALUES
('model_router_enabled', 'true', 'P3: Ativa routing por complexidade', NOW(), NOW())
ON CONFLICT (chave) DO UPDATE SET valor = 'true', updated_at = NOW();

INSERT INTO configuracoes_sistema (chave, valor, descricao, created_at, updated_at) VALUES
('model_router_complexity_threshold', '45', 'P3: Score mínimo para modelo complexo (0-100)', NOW(), NOW())
ON CONFLICT (chave) DO UPDATE SET valor = '45', updated_at = NOW();

INSERT INTO configuracoes_sistema (chave, valor, descricao, created_at, updated_at) VALUES
('model_router_simple_model', 'google/gemini-2.5-flash', 'P3: Modelo rápido para ~70% msgs simples', NOW(), NOW())
ON CONFLICT (chave) DO UPDATE SET valor = 'google/gemini-2.5-flash', updated_at = NOW();

INSERT INTO configuracoes_sistema (chave, valor, descricao, created_at, updated_at) VALUES
('model_router_complex_model', 'anthropic/claude-sonnet-4-5', 'P3: Modelo inteligente para ~30% msgs complexas', NOW(), NOW())
ON CONFLICT (chave) DO UPDATE SET valor = 'anthropic/claude-sonnet-4-5', updated_at = NOW();

INSERT INTO configuracoes_sistema (chave, valor, descricao, created_at, updated_at) VALUES
('model_router_fallback_model', 'google/gemini-2.5-flash', 'P3: Fallback se modelo primário falhar', NOW(), NOW())
ON CONFLICT (chave) DO UPDATE SET valor = 'google/gemini-2.5-flash', updated_at = NOW();

INSERT INTO configuracoes_sistema (chave, valor, descricao, created_at, updated_at) VALUES
('model_router_simple_temperature', '0.3', 'P3: Temperatura msgs simples', NOW(), NOW())
ON CONFLICT (chave) DO UPDATE SET valor = '0.3', updated_at = NOW();

INSERT INTO configuracoes_sistema (chave, valor, descricao, created_at, updated_at) VALUES
('model_router_complex_temperature', '0.35', 'P3: Temperatura msgs complexas', NOW(), NOW())
ON CONFLICT (chave) DO UPDATE SET valor = '0.35', updated_at = NOW();

INSERT INTO configuracoes_sistema (chave, valor, descricao, created_at, updated_at) VALUES
('llm_default_models', 'anthropic/claude-sonnet-4-5,google/gemini-2.5-flash', 'P3: Modelos default (Sonnet+Flash)', NOW(), NOW())
ON CONFLICT (chave) DO UPDATE SET valor = 'anthropic/claude-sonnet-4-5,google/gemini-2.5-flash', updated_at = NOW();