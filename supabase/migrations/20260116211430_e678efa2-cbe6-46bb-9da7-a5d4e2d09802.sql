-- Insert new specialized COESA contacts for expanded triage flow
INSERT INTO public.coesa_contatos (identificador, nome, telefone, descricao, is_active)
VALUES 
  ('comercial_empresas', 'Comercial Empresas', '5531984400889', 'Leads PJ, condomínios, múltiplas UCs', true),
  ('parceiros', 'Relacionamento de Parceiros', '5531984400889', 'Fornecedores, representantes, parcerias B2B', true)
ON CONFLICT (identificador) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  updated_at = now();