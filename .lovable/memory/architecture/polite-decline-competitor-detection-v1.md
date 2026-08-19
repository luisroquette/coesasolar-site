# Memory: architecture/polite-decline-competitor-detection-v1
Updated: now

Implementado sistema de detecção de **recusa educada por escolha de alternativa** (concorrente, placas solares, financiamento próprio).

## Problema Resolvido

Quando cliente com proposta ativa envia mensagem como "preferiram ficar com financiamento de placas solares", o sistema agora:
1. Detecta como recusa definitiva (não como triagem)
2. NÃO dispara menu de triagem ("Já é cliente / Quer ser cliente")
3. Marca `recusa_definitiva: true` em dados_coletados
4. Permite LLM responder com empatia via rule_memory

## Componentes

### 1. Padrões de Detecção (DB)
Categoria: `polite_decline_competitor`  
20+ padrões incluindo: "preferiram ficar com", "projeto de placas", "financiamento de placa", etc.

### 2. Função detectPoliteDeclineWithAlternative
Localização: `_shared/detection-patterns.ts`  
Retorna: `{ detected, reason, alternative }`

### 3. Fast-Path no triage-phase.ts
CHECK 6 (antes de CHECK 6b discount_objection)  
Marca dados e retorna `shouldContinue: true` para LLM processar

### 4. Regra rule_memory
Tipo: `hard_constraint`  
Prioridade: 90  
Instrução: Responder com empatia, deixar porta aberta, NÃO insistir

## Fluxo

```
Cliente: "Preferiram ficar com financiamento de placas"
    ↓
detectPoliteDeclineWithAlternative() → detected: true
    ↓
Marca recusa_definitiva: true em dados_coletados
    ↓
shouldContinue: true (NÃO handled)
    ↓
LLM processa com rule_memory injetada
    ↓
Sofia: "Entendo! 😊 Fico feliz que encontraram uma solução..."
```

## Impacto

- Zero triagem falsa para recusas educadas
- Despedidas empáticas preservam relacionamento
- Porta aberta para retorno futuro
