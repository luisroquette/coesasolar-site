-- Adicionar novas chaves de configuração para eliminar hardcodes

-- Dados jurídicos da empresa
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('empresa_cnpj', '60.937.217/0001-54', 'CNPJ principal da empresa'),
('empresa_cnpj_consorcio', '49.497.098/0001-23', 'CNPJ do consórcio (se aplicável)'),
('empresa_razao_social', 'COESA ENERGIA LTDA', 'Razão social completa'),
('empresa_site', 'www.coesaenergia.com.br', 'Site institucional'),
('email_financeiro', 'financeiro@coesaenergia.com.br', 'Email do financeiro')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, descricao = EXCLUDED.descricao;

-- Redes sociais
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('rede_social_instagram', 'https://instagram.com/coesaenergia', 'Perfil Instagram'),
('rede_social_linkedin', 'https://linkedin.com/company/coesa-energia', 'Perfil LinkedIn'),
('rede_social_facebook', 'https://facebook.com/coesaenergia', 'Perfil Facebook')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, descricao = EXCLUDED.descricao;

-- Bitrix24
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('bitrix24_base_url', 'https://coesaenergia.bitrix24.com.br', 'URL base do Bitrix24')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, descricao = EXCLUDED.descricao;

-- Parâmetros técnicos
INSERT INTO configuracoes_sistema (chave, valor, descricao) VALUES
('pis_cofins_aliquota', '0.0365', 'Alíquota PIS/COFINS padrão'),
('disponibilidade_monofasico', '30', 'Disponibilidade mínima Monofásico (kWh)'),
('disponibilidade_bifasico', '50', 'Disponibilidade mínima Bifásico (kWh)'),
('disponibilidade_trifasico', '100', 'Disponibilidade mínima Trifásico (kWh)')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, descricao = EXCLUDED.descricao;