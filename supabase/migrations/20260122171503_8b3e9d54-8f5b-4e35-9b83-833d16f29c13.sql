-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: Seed data extraction patterns for sofia-bitrix-lead
-- These patterns are used by extractDataFromText() function
-- pattern_type: 'regex' for regex patterns, 'keyword' for keywords
-- ═══════════════════════════════════════════════════════════════

-- Patterns for extracting bill values (valorFatura)
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active) VALUES
-- Natural language patterns for bill values
('extract_valor', '(?:gasto|pago|conta|fatura|valor)?\\s*(?:em\\s+torno\\s+de|por\\s+volta\\s+de|aproximadamente|aprox\\.?|mais\\s+ou\\s+menos|cerca\\s+de|uns?|tipo|quase|perto\\s+de)?\\s*(?:r\\$\\s*)?(\\d{2,5})(?:[,.](\\d{2}))?\\s*(?:reais?|por\\s+m[êe]s|mensal|mensais|\\/m[êe]s)?', 'regex', 'Natural language bill value', 10, true),
('extract_valor', 'r\\$\\s*(\\d+(?:[.,]\\d{3})*(?:[.,]\\d{2})?)', 'regex', 'R$ prefix pattern', 9, true),
('extract_valor', '(\\d+(?:[.,]\\d{3})*(?:[.,]\\d{2})?)\\s*\\$', 'regex', '$ suffix pattern', 8, true),
('extract_valor', '(\\d+)\\s*mil(?:\\s+(?:e\\s+)?(\\d+))?\\s*(?:reais?)?', 'regex', 'Colloquial (mil reais)', 7, true),
('extract_valor', '(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{2})?)', 'regex', 'Formatted with thousand separator', 6, true),
('extract_valor', '(\\d+),(\\d{2})(?!\\d)', 'regex', 'Decimal comma', 5, true),
('extract_valor', '^(\\d{2,5})(?:\\s*(?:reais?|$))?$', 'regex', 'Pure number', 4, true),
('extract_valor', '(?:conta|fatura|pago|gasto|valor|entre|cerca|mais ou menos|aproximadamente)\\s+(?:é|de|deu|da|dá)?\\s*(?:r\\$\\s*)?(\\d{2,5})(?:[,.](\\d{2}))?', 'regex', 'Value with context', 3, true),
('extract_valor', 'entre\\s+(\\d{2,5})\\s+(?:a|e|até)\\s+(\\d{2,5})', 'regex', 'Range values', 2, true),
('extract_valor', '(\\d{2,5})\\s*(?:reais?|por\\s+m[êe]s|mensais?|\\/m[êe]s)', 'regex', 'Reais/mensal suffix', 1, true);

-- Pattern for "um mil" detection
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active, response_template) VALUES
('extract_valor_mil', 'um mil', 'keyword', 'Keyword: um mil', 1, true, '1000'),
('extract_valor_mil', 'mil reais', 'keyword', 'Keyword: mil reais', 1, true, '1000'),
('extract_valor_mil', '\\b(?:um\\s+)?mil\\s*(?:reais?)?\\b', 'regex', 'Regex: mil pattern', 2, true, '1000');

-- Patterns for extracting CPF
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active) VALUES
('extract_cpf', '\\b(\\d{3}\\.?\\d{3}\\.?\\d{3}[-.\\s]?\\d{2})\\b', 'regex', 'CPF pattern', 1, true);

-- Patterns for extracting CNPJ
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active) VALUES
('extract_cnpj', '\\b(\\d{2}\\.?\\d{3}\\.?\\d{3}\\/?\\d{4}[-.\\s]?\\d{2})\\b', 'regex', 'CNPJ pattern', 1, true);

-- Patterns for extracting CEP
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active) VALUES
('extract_cep', '\\b(\\d{5}[-.]?\\d{3})\\b', 'regex', 'CEP pattern', 1, true);

-- Patterns for extracting email
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active) VALUES
('extract_email', '[\\w.+-]+@[\\w-]+\\.[\\w.-]+', 'regex', 'Email pattern', 1, true);

-- Patterns for extracting consumption (kWh)
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active) VALUES
('extract_consumo', '(\\d+)\\s*kwh', 'regex', 'kWh consumption', 1, true);

-- Patterns for extracting name
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active) VALUES
('extract_nome', '(?:meu nome [eé]|me chamo|sou o|sou a)\\s+([A-ZÀ-Ú][a-zà-ú]+(?:\\s+[A-ZÀ-Ú][a-zà-ú]+)*)', 'regex', 'Name introduction', 1, true);

-- Distribuidoras for detection (hardcoded list moved to DB)
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active) VALUES
('extract_distribuidora', 'cemig', 'keyword', 'CEMIG', 1, true),
('extract_distribuidora', 'cpfl paulista', 'keyword', 'CPFL Paulista', 2, true),
('extract_distribuidora', 'cpfl', 'keyword', 'CPFL', 3, true),
('extract_distribuidora', 'neoenergia coelba', 'keyword', 'Neoenergia Coelba', 4, true),
('extract_distribuidora', 'coelba', 'keyword', 'Coelba', 5, true),
('extract_distribuidora', 'neoenergia', 'keyword', 'Neoenergia', 6, true),
('extract_distribuidora', 'copel', 'keyword', 'Copel', 7, true),
('extract_distribuidora', 'enel', 'keyword', 'Enel', 8, true),
('extract_distribuidora', 'light', 'keyword', 'Light', 9, true),
('extract_distribuidora', 'celesc', 'keyword', 'Celesc', 10, true),
('extract_distribuidora', 'energisa', 'keyword', 'Energisa', 11, true),
('extract_distribuidora', 'equatorial', 'keyword', 'Equatorial', 12, true),
('extract_distribuidora', 'elektro', 'keyword', 'Elektro', 13, true),
('extract_distribuidora', 'edp', 'keyword', 'EDP', 14, true),
('extract_distribuidora', 'rge', 'keyword', 'RGE', 15, true),
('extract_distribuidora', 'ceee', 'keyword', 'CEEE', 16, true),
('extract_distribuidora', 'celg', 'keyword', 'CELG', 17, true),
('extract_distribuidora', 'ceb', 'keyword', 'CEB', 18, true),
('extract_distribuidora', 'ceal', 'keyword', 'CEAL', 19, true),
('extract_distribuidora', 'cepisa', 'keyword', 'CEPISA', 20, true),
('extract_distribuidora', 'cemar', 'keyword', 'CEMAR', 21, true),
('extract_distribuidora', 'ceron', 'keyword', 'CERON', 22, true),
('extract_distribuidora', 'eletroacre', 'keyword', 'Eletroacre', 23, true),
('extract_distribuidora', 'eletronorte', 'keyword', 'Eletronorte', 24, true),
('extract_distribuidora', 'amazonas energia', 'keyword', 'Amazonas Energia', 25, true),
('extract_distribuidora', 'eletropaulo', 'keyword', 'Eletropaulo', 26, true),
('extract_distribuidora', 'celpe', 'keyword', 'Celpe', 27, true),
('extract_distribuidora', 'cosern', 'keyword', 'Cosern', 28, true);

-- Invoice analysis patterns for parseInvoiceAnalysis()
INSERT INTO public.sofia_detection_patterns (category, pattern, pattern_type, description, priority, is_active) VALUES
('extract_invoice_consumo', 'consumo[:\\s]*(\\d+(?:[.,]\\d+)?)\\s*kwh', 'regex', 'Invoice consumption pattern 1', 1, true),
('extract_invoice_consumo', '(\\d+(?:[.,]\\d+)?)\\s*kwh', 'regex', 'Invoice consumption pattern 2', 2, true),
('extract_invoice_consumo', 'consumo médio[:\\s]*(\\d+(?:[.,]\\d+)?)', 'regex', 'Invoice consumption pattern 3', 3, true),
('extract_invoice_consumo', 'último mês[:\\s]*(\\d+(?:[.,]\\d+)?)', 'regex', 'Invoice consumption pattern 4', 4, true),
('extract_invoice_valor', 'valor total[:\\s]*r\\$?\\s*(\\d+(?:[.,]\\d+)?(?:[.,]\\d{2})?)', 'regex', 'Invoice value pattern 1', 1, true),
('extract_invoice_valor', 'r\\$\\s*(\\d+(?:[.,]\\d+)?)', 'regex', 'Invoice value pattern 2', 2, true),
('extract_invoice_valor', 'total a pagar[:\\s]*(\\d+(?:[.,]\\d+)?)', 'regex', 'Invoice value pattern 3', 3, true),
('extract_invoice_instalacao', 'n[úu]mero da instala[çc][ãa]o[:\\s]*(\\d+)', 'regex', 'Installation number pattern 1', 1, true),
('extract_invoice_instalacao', 'instala[çc][ãa]o[:\\s]*n?[°º]?\\s*(\\d+)', 'regex', 'Installation number pattern 2', 2, true),
('extract_invoice_instalacao', 'uc[:\\s]*(\\d+)', 'regex', 'Installation number pattern 3', 3, true),
('extract_invoice_instalacao', 'unidade consumidora[:\\s]*(\\d+)', 'regex', 'Installation number pattern 4', 4, true),
('extract_invoice_cpf', 'cpf[:\\s]*(\\d{3}[.\\s]?\\d{3}[.\\s]?\\d{3}[-.\\s]?\\d{2})', 'regex', 'Invoice CPF pattern', 1, true),
('extract_invoice_cnpj', 'cnpj[:\\s]*(\\d{2}[.\\s]?\\d{3}[.\\s]?\\d{3}[\\/. \\s]?\\d{4}[-.\\s]?\\d{2})', 'regex', 'Invoice CNPJ pattern', 1, true),
('extract_invoice_nome', 'titular[:\\s]*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\\s]+)', 'regex', 'Invoice name pattern 1', 1, true),
('extract_invoice_nome', 'nome[:\\s]*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\\s]+)', 'regex', 'Invoice name pattern 2', 2, true),
('extract_invoice_nome', 'cliente[:\\s]*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\\s]+)', 'regex', 'Invoice name pattern 3', 3, true),
('extract_invoice_endereco', 'endere[çc]o[:\\s]*([A-Za-zÀ-ÿ0-9\\s,.-]+?)(?:cep|cidade|bairro|$)', 'regex', 'Invoice address pattern', 1, true),
('extract_invoice_cep', 'cep[:\\s]*(\\d{5}[-.\\s]?\\d{3})', 'regex', 'Invoice CEP pattern', 1, true);