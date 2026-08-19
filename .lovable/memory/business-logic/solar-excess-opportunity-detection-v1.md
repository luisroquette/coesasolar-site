# Memory: business-logic/solar-excess-opportunity-detection-v1
Updated: 2026-02-05

O sistema agora detecta e protege leads com **geração própria (placas solares) + excedente de consumo**:

1. **Função `detectSolarExcessOpportunity()`** em `disqualification-rules.ts`:
   - Verifica se mensagem menciona placas solares
   - Checa indicadores de excedente (padrões da categoria `solar_excess_opportunity` no DB)
   - Verifica valor da conta >= R$ 250
   - Retorna `{ hasSolar, hasExcess, estimatedValue, excessIndicator }`

2. **Handler `handleGeracaoPropriaWithExcess()`** em `disqualification-flow.ts`:
   - Se `hasExcess = true`: NÃO desqualifica, marca `hasGeracaoPropria: true, hasExcessoConsumo: true`
   - Se valor não informado: Marca `awaiting_solar_bill_value: true`, deixa LLM perguntar
   - Se valor baixo < mínimo: Desqualifica educadamente com mensagem condicional

3. **Rule Memory**: Regra `Atendimento Excedente Solar` (priority 95, hard_constraint) orienta LLM a explicar que a COESA atende o excedente.

4. **Fluxo atualizado**: Solar é verificado ANTES de consumo baixo para evitar desqualificação errônea.
