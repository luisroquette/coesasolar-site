-- Fix foreign key on solicitacoes_proposta_definitiva to cascade on delete
ALTER TABLE public.solicitacoes_proposta_definitiva 
DROP CONSTRAINT IF EXISTS solicitacoes_proposta_definitiva_proposta_inicial_id_fkey;

ALTER TABLE public.solicitacoes_proposta_definitiva
ADD CONSTRAINT solicitacoes_proposta_definitiva_proposta_inicial_id_fkey
FOREIGN KEY (proposta_inicial_id) 
REFERENCES propostas_assinantes(id) 
ON DELETE CASCADE;

-- Fix foreign key on fraude_alertas to cascade on delete
ALTER TABLE public.fraude_alertas 
DROP CONSTRAINT IF EXISTS fraude_alertas_proposta_id_fkey;

ALTER TABLE public.fraude_alertas
ADD CONSTRAINT fraude_alertas_proposta_id_fkey
FOREIGN KEY (proposta_id) 
REFERENCES propostas_assinantes(id) 
ON DELETE CASCADE;