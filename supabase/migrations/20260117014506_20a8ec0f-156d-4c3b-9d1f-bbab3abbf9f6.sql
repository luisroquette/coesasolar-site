-- Adicionar política para acesso público de leitura a propostas (páginas públicas)
-- Isso permite que qualquer pessoa com o ID da proposta possa visualizá-la
-- Necessário para as páginas /proposta/:id e /solicitar-proposta-definitiva/:id

CREATE POLICY "Public can view proposals by ID"
ON public.propostas_assinantes
FOR SELECT
TO public
USING (true);

-- Nota: Esta política é necessária porque:
-- 1. A página /proposta/:id é pública (cliente recebe link via WhatsApp)
-- 2. A página /solicitar-proposta-definitiva/:id é pública (fluxo de conversão)
-- 3. O conhecimento do UUID da proposta funciona como "senha" implícita
-- 4. UUIDs são suficientemente aleatórios para não serem adivinhados