# Memory: bug-fix/promessa-vazia-proposta-bloqueada
Updated: now

## Problema
A Sofia prometia proposta ("vou preparar sua proposta personalizada") mesmo quando os dados mínimos (nome, email, distribuidora, valorFatura) não estavam completos. O cliente ficava esperando eternamente por uma proposta que nunca era gerada.

## Causa Raiz
1. O LLM gerava texto com promessa de proposta sem verificar dados disponíveis
2. A verificação de `hasMinimumDataForProposal` acontecia APÓS o envio da mensagem
3. Quando detectada promessa prematura, apenas uma notificação era criada, mas a mensagem já tinha sido enviada

## Solução Implementada

### 1. Verificação PRÉ-ENVIO (response-phase.ts)
Movida a verificação de promessa prematura para **ANTES** do envio da mensagem (novo Step 0):
```typescript
// STEP 0: PRE-SEND PROPOSAL PROMISE CHECK
const preSendResult = await handleProposalPromiseFlow(...);
if (preSendResult.detected && !preSendResult.hasMinimumData && preSendResult.replacementMessage) {
  cleanMessage = preSendResult.replacementMessage; // Substitui ANTES de enviar
}
```

### 2. Gerador de Mensagem de Substituição (proposal-promise-flow.ts)
Nova função `generateMissingDataMessage()` que gera perguntas específicas:
- Se falta distribuidora + valor → pergunta ambos
- Se falta só distribuidora → pergunta distribuidora
- Se falta só valor → pergunta valor
- Se falta email → pergunta email
- Se falta nome → pergunta nome

### 3. Tipo de Retorno Enriquecido
`ProposalPromiseResult` agora inclui:
- `replacementMessage`: Mensagem substituta para usar no lugar da promessa vazia
- `missingFields`: Lista de campos que faltam para proposta

## Fluxo Corrigido
1. LLM gera resposta (pode conter promessa)
2. **NOVO**: Step 0 verifica se há promessa sem dados
3. Se sim → substitui mensagem por pergunta sobre dados faltantes
4. Mensagem (original ou substituída) é enviada
5. Cliente recebe pergunta sobre dados faltantes, não promessa vazia

## Observabilidade
- `admin_notifications` com type `promise_blocked` quando promessa é substituída
- Logs com `[RESPONSE_PHASE] 🛑 PRE-SEND BLOCK` para rastreamento
