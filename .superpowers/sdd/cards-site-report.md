# Cards finais — página pública da vaga (coesasolar-site)

**Branch:** feat/carreiras-cards-finais (a partir de origin/main)
**Commit:** 233fe5a

## Entrega
1. `src/lib/carreiras/supabase.ts` — `ConfigRhPublica` + `getConfigRhPublica()` lendo view `rh_config_publico`, fail-graceful (null sem env/erro), mesmo padrão de `getVagaBySlug`.
2. `src/lib/carreiras/form-utils.ts` — `montarLinkWhatsapp()`, normaliza dígitos e evita duplicar prefixo 55.
3. `src/app/carreiras/[slug]/page.tsx` — `getConfigRhPublica()` em paralelo (`Promise.all`) com `getVagaBySlug`; card "Envie seu currículo para" (e-mail + WhatsApp opcional) e bloco de mensagem final, entre "Remuneração e benefícios" e o formulário de candidatura. Omitidos silenciosamente se `config` for null. Usa tokens reais do `tailwind.config.ts` (`coesa-green`, `coesa-gray-light`) — não usei `coesa-cream` por não existir nesse arquivo. `coesa-gray-light` é um token válido, mas não estava em uso em nenhum outro ponto do código antes desta mudança.
4. Testes de regressão: `carreiras.regression.test.ts` (fail-graceful de `getConfigRhPublica`) e `form-utils.regression.test.ts` (3 casos de `montarLinkWhatsapp`).

## Testes
`npm test`: 35 arquivos, 377 testes, todos verdes (inclui fix de `montarLinkWhatsapp`: bug real de DDD 55 corrigido).

## Build
`npm run build`: sucesso. `/carreiras/[slug]` segue SSG (`generateStaticParams` vazio + revalidate 600); fetch condicional em Server Component não quebrou build estático/ISR.

## Concerns
- Fix de review (real, não cosmético): `montarLinkWhatsapp` checava só `startsWith('55')`, sem checar comprimento — um celular com DDD 55 (Santa Maria-RS, 11 dígitos, ex. "55991234567") "começava com 55" e o código do país nunca era anteposto, gerando link `wa.me/55991234567` (interpretado como país 55 + número de 9 dígitos sem DDD — quebrado). Corrigido para `digitos.startsWith('55') && digitos.length >= 12`. Teste de regressão adicionado cobrindo esse caso.
- Push NÃO foi feito (conforme instrução).
