# Memory: monitoring/unanswered-message-detector-v1
Updated: 2026-02-03

Implementado o **Unanswered Message Detector** - scheduler que roda a cada 5 minutos para detectar conversas onde a Sofia recebeu mensagem do cliente mas não respondeu (falha silenciosa). 

## ⚠️ TRIAGEM INTELIGENTE (Proteção contra Spam)

O sistema inclui uma **camada de discernimento** que analisa o contexto da conversa antes de agir:

### 1. Triagem Rápida (Padrões Regex)
Detecta automaticamente quando NÃO deve processar:
- "vou pensar/avaliar/analisar"
- "preciso de tempo"
- "depois eu falo/respondo"
- "não tenho interesse"
- "vou falar com meu marido/esposa"
- "tchau", "até mais"

### 2. Triagem LLM (Casos Ambíguos)
Usa Gemini 2.5 Flash Lite para análise semântica, classificando em:
- `waiting_response`: Cliente espera resposta → **PROCESSAR**
- `thinking_time`: Pediu tempo para pensar → **NÃO PROCESSAR**
- `disinterest`: Demonstrou desinteresse → **NÃO PROCESSAR**
- `external_action`: Precisa consultar alguém → **NÃO PROCESSAR**
- `natural_pause`: Despedida/pausa natural → **NÃO PROCESSAR**
- `technical_failure`: Sofia deveria ter respondido → **PROCESSAR**

## Lógica de Detecção
- Janela de tempo: mensagens entre 15-60 minutos sem resposta
- Ignora conversas em modo manual (`paused_for_human`, `#ASSUMIR`)
- Verifica se `last_message_at > last_sofia_message_at`

## ⚠️ PROTEÇÕES ANTI-SPAM (CRÍTICO)

O sistema implementa **4 camadas de proteção** contra envio de mensagens repetidas:

### 1. Deduplicação por message_id
Cada mensagem processada é registrada com seu `message_id` único na tabela `unanswered_detection_attempts`. O sistema NUNCA processa a mesma mensagem duas vezes.

### 2. Limite de Fallbacks por Dia
Máximo de **1 fallback por conversa por 24 horas**. Mesmo que a triagem permita, não enviará mais mensagens se o limite foi atingido.

### 3. Cooldown de 60 minutos
Após qualquer tentativa (sucesso ou falha), a mesma conversa não será processada novamente por 60 minutos.

### 4. Verificação de Resposta Recente
Se a Sofia já respondeu dentro da janela de cooldown, a conversa é ignorada.

## Estratégias de Recuperação (após triagem positiva)
1. **Reprocessamento**: Chama o `sofia-webhook` com a mensagem original
2. **Fallback (Cláusula Pétrea)**: Envia mensagem de desculpas automática

## Configurações (configuracoes_sistema)
- `unanswered_message_detector_enabled`: Liga/desliga
- `unanswered_enable_intelligent_triage`: Triagem inteligente (default: true)
- `unanswered_detection_window_minutes`: Minutos mínimos (default: 15)
- `unanswered_max_window_minutes`: Janela máxima (default: 60)
- `unanswered_cooldown_minutes`: Cooldown entre tentativas (default: 60)
- `unanswered_enable_reprocessing`: Tenta reprocessar via webhook
- `unanswered_enable_fallback`: Envia fallback se reprocessamento falhar

## Edge Function
`supabase/functions/unanswered-message-detector/index.ts`
