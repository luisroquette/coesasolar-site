-- Insert new default COESA contacts for expanded triage flow
INSERT INTO public.coesa_contatos (identificador, nome, telefone, descricao, is_active)
VALUES 
  ('pos_venda', 'Pós-Venda COESA', '5531984400889', 'Acompanhamento de contratos, homologação e ativação', true),
  ('comercial_duvidas', 'Comercial - Dúvidas', '5531984400889', 'Dúvidas comerciais que não são vendas novas', true)
ON CONFLICT (identificador) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  updated_at = now();