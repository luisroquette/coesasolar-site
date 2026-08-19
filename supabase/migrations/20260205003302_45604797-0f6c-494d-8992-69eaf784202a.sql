-- Phase 4: Update ENERGISA genérica to require clarification
UPDATE distribuidoras_config 
SET 
  requires_clarification = true,
  clarification_message = 'Qual Energisa especificamente? Você é de Minas Gerais (MG), Acre, Mato Grosso, ou outro estado?'
WHERE nome_normalizado = 'ENERGISA' AND nome = 'Energisa';

-- Also ensure NEOENERGIA and CPFL generics require clarification if they exist
UPDATE distribuidoras_config 
SET 
  requires_clarification = true,
  clarification_message = 'Qual Neoenergia especificamente? Você é de qual estado?'
WHERE nome_normalizado = 'NEOENERGIA' AND nome = 'Neoenergia';

UPDATE distribuidoras_config 
SET 
  requires_clarification = true,
  clarification_message = 'Qual CPFL especificamente? CPFL Paulista, Piratininga, ou outra?'
WHERE nome_normalizado = 'CPFL' AND nome = 'CPFL';