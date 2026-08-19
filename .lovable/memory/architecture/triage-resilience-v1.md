# Memory: architecture/triage-resilience-v1
Updated: now

Fluxos de triagem ativos possuem **prioridade absoluta** e ignoram travas de CRM ou locks de estágio. O sistema implementa:

## Bypass de Locks (triage-phase.ts)

Quando `dados_coletados.triagem_state` existe, o sistema:
1. **Bypassa `checkTriageLock`** - locks só bloqueiam INÍCIO de triagem
2. **Bypassa `shouldSkipTriageByCRM`** - CRM não interrompe fluxo ativo
3. Loga com `[TRIAGE_PHASE] 🔓 BYPASS LOCKS`

## Fallback Obrigatório (triage-flow.ts)

Se um estado de triagem não for processado:
1. Envia mensagem de fallback ao cliente
2. Escala para atendimento humano (`sofia_mode: 'paused_for_human'`)
3. Registra `triagem_falhou: true` com motivo detalhado
4. Limpa agendamentos (next_followup_at, next_nudge_at, next_rescue_at)

## Regra rule_memory

`TRIAGEM_RESPOSTA_OBRIGATÓRIA` (priority: 100):
- Condição: `triagem_state IN [aguardando_confirmacao_cliente, aguardando_departamento, aguardando_clarificacao]`
- Ação: Responder ou escalar, NUNCA silenciar

## Impacto

- **Zero conversas sem resposta** durante fluxo de triagem
- **Clientes existentes** sempre redirecionados para SAC correto
- **Logs detalhados** para diagnóstico de problemas futuros
