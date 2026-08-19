-- Insert assisted_mode patterns for questions Sofia CAN answer even when escalated
-- These were previously hardcoded in ASSISTED_MODE_PATTERNS array

INSERT INTO sofia_detection_patterns (category, pattern, pattern_type, priority, is_active, description) VALUES
-- Company credibility questions
('assisted_mode', 'cnpj', 'keyword', 100, true, 'Company CNPJ questions'),
('assisted_mode', 'empresa.*(nova|antiga|tempo|existe|fundad)', 'regex', 100, true, 'Company age/foundation questions'),
('assisted_mode', 'quanto tempo', 'keyword', 100, true, 'How long questions'),
('assisted_mode', 'anos de mercado', 'keyword', 100, true, 'Years in market questions'),
('assisted_mode', 'confiável', 'keyword', 100, true, 'Trustworthy questions'),
('assisted_mode', 'golpe', 'keyword', 100, true, 'Scam concerns'),
('assisted_mode', 'fraude', 'keyword', 100, true, 'Fraud concerns'),
('assisted_mode', 'legítim', 'keyword', 100, true, 'Legitimacy questions'),
-- Reclame Aqui / reputation
('assisted_mode', 'reclame\\s*aqui', 'regex', 100, true, 'Reclame Aqui questions'),
('assisted_mode', 'reclama[çc][õo]es', 'regex', 100, true, 'Complaints questions'),
('assisted_mode', 'reputa[çc][ãa]o', 'regex', 100, true, 'Reputation questions'),
('assisted_mode', 'avalia[çc][ãa]o', 'regex', 100, true, 'Review questions'),
('assisted_mode', 'nota da empresa', 'keyword', 100, true, 'Company rating questions'),
-- PDF / format questions  
('assisted_mode', 'pdf', 'keyword', 100, true, 'PDF format questions'),
('assisted_mode', 'enviar por (pdf|email|documento)', 'regex', 100, true, 'Send via format questions'),
('assisted_mode', 'mandar (pdf|documento)', 'regex', 100, true, 'Send document questions'),
('assisted_mode', 'formato', 'keyword', 100, true, 'Format questions'),
-- How it works
('assisted_mode', 'como funciona', 'keyword', 100, true, 'How it works questions'),
('assisted_mode', 'funciona como', 'keyword', 100, true, 'Works how questions'),
('assisted_mode', 'explica', 'keyword', 100, true, 'Explain requests'),
-- Price / value questions
('assisted_mode', 'valor|pre[cç]o|quanto custa', 'regex', 100, true, 'Price/value questions'),
('assisted_mode', 'economia', 'keyword', 100, true, 'Savings questions'),
('assisted_mode', 'desconto', 'keyword', 100, true, 'Discount questions'),
-- Contract questions
('assisted_mode', 'contrato|multa|cancel|fidelidade', 'regex', 100, true, 'Contract/cancellation questions'),
('assisted_mode', 'posso cancelar', 'keyword', 100, true, 'Can cancel questions'),
('assisted_mode', 'tem multa', 'keyword', 100, true, 'Has penalty questions'),
-- General clarifications
('assisted_mode', 'd[uú]vida', 'regex', 100, true, 'Doubt expressions'),
('assisted_mode', 'n[ãa]o entendi', 'regex', 100, true, 'Did not understand'),
('assisted_mode', 'pode explicar', 'keyword', 100, true, 'Can you explain')
ON CONFLICT DO NOTHING;