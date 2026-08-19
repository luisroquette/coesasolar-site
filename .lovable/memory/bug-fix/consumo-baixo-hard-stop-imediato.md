# Memory: bug-fix/consumo-baixo-hard-stop-imediato
Updated: now

## Problema Identificado
A Sofia **não desqualificava leads com valor de fatura abaixo do mínimo (R$ 250)** no momento em que o valor era informado. Em vez disso, continuava coletando e-mail e distribuidora, desperdiçando tempo e processamento.

**Exemplo:** Cliente informa "200 reais", Sofia calcula e verifica que está abaixo do mínimo configurado de R$ 250.

## Causa Raiz
O `handleDisqualificationFlow` em `_shared/disqualification-flow.ts` verificava apenas:
1. Grupo A (alta tensão)
2. Tarifa Social

A verificação de **consumo baixo** (`isConsumoBaixo`) existia em `disqualification-rules.ts`, mas **nunca era chamada** no fluxo de desqualificação.

## Correção Implementada
Adicionada a função `handleConsumoBaixoDisqualification` no `disqualification-flow.ts`:

1. **Prioridade 1:** Verificação de consumo baixo agora é a PRIMEIRA checagem (antes de Grupo A e Tarifa Social)
2. **Disparo imediato:** Assim que `valorFatura` ou `consumo` são extraídos e estão abaixo do mínimo, o lead é descartado
3. **Mensagem personalizada:** Informa o valor informado e o mínimo necessário
4. **Atualização Bitrix:** Move lead para JUNK com comentário detalhado
5. **Encerramento total:** Define `sofia_mode='descartado'`, cancela automações

## Configuração
Valores mínimos configurados em `configuracoes_sistema`:
- `consumo_minimo_reais`: R$ 250 (atual)
- `consumo_minimo_kwh`: 200 kWh

## Fluxo Atualizado
```
Cliente: "Minha conta é de 200 reais"
↓
Data Extraction: valorFatura = 200
↓
Validation Phase → handleDisqualificationFlow
↓
handleConsumoBaixoDisqualification: 200 < 250 ✓
↓
DISPENSA IMEDIATA: Mensagem + JUNK + Encerra conversa
```

## Economia de Processamento
- **Antes:** LLM chamado 2-3x mais para coletar e-mail/distribuidora desnecessariamente
- **Agora:** Desqualificação determinística na primeira mensagem com valor
