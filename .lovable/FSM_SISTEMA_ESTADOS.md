# 🔄 SISTEMA DE ESTADOS (FSM) - SOFIA BOT

> **Finite State Machine do Funil de Vendas**  
> Última atualização: 2026-02-02

---

## 📊 DIAGRAMA DE ESTADOS

```
                                    ┌──────────────────┐
                                    │    TRIAGEM       │
                                    │ (é cliente/SAC?) │
                                    └────────┬─────────┘
                                             │
                     ┌───────────────────────┼───────────────────────┐
                     │ SAC Detectado         │ Comercial             │ Baixo Consumo
                     ▼                       ▼                       ▼
           ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
           │  SAC_REDIRECT   │     │  QUALIFICACAO   │     │   DESCARTADO    │
           │  (marIA cuida)  │     │  (valor >= R$300)│    │  (< R$300)      │
           └─────────────────┘     └────────┬────────┘     └─────────────────┘
                                            │
                                            │ ✓ Valor OK
                                            ▼
                                   ┌─────────────────────┐
                                   │    COLETA_DADOS     │
                                   │  fsm_expected_field:│
                                   │  nome→email→valor→  │
                                   │  distribuidora      │
                                   └────────┬────────────┘
                                            │
                                            │ ✓ Todos dados completos
                                            ▼
                                   ┌─────────────────────┐
                                   │  PROPOSTA_INICIAL   │
                                   │  (Gera + Envia link)│
                                   └────────┬────────────┘
                                            │
                                            │ ✓ Link enviado
                                            ▼
                                   ┌─────────────────────┐
                                   │  DOCS_PLATAFORMA    │
                                   │  (Aguarda docs na   │
                                   │   página de proposta)│
                                   └────────┬────────────┘
                                            │
                                            │ ✓ Todos docs recebidos
                                            ▼
                                   ┌─────────────────────┐
                                   │ PROPOSTA_DEFINITIVA │
                                   │  (Gera proposta com │
                                   │   planos Premium)   │
                                   └────────┬────────────┘
                                            │
                                            │ ✓ Contrato pronto
                                            ▼
                                   ┌─────────────────────┐
                                   │    ASSINATURA       │
                                   │  (Aguarda assinatura│
                                   │   digital)          │
                                   └────────┬────────────┘
                                            │
                                            │ ✓ Contrato assinado
                                            ▼
                                   ┌─────────────────────┐
                                   │      FECHADO        │
                                   │  (Cliente ativo!)   │
                                   └─────────────────────┘


ESTADOS TERMINAIS/PARALELOS:
┌─────────────────┐  ┌─────────────────┐
│ PAUSED_FOR_HUMAN│  │   DESCARTADO    │
│ (Operador assume)│  │ (Lead rejeitado)│
└─────────────────┘  └─────────────────┘
```

---

## 🎯 ESTADOS DO FUNIL (FunnelState)

### Arquivo: `guided-script-fsm.ts`

```typescript
export enum FunnelState {
  // Fluxo principal
  TRIAGEM = 'triagem',              // Detectar se é cliente ou prospect
  QUALIFICACAO = 'qualificacao',    // Verificar valor mínimo R$300
  COLETA_DADOS = 'coleta_dados',    // Coletar nome, email, valor, distribuidora
  PROPOSTA_INICIAL = 'proposta_inicial',    // Gerar proposta inicial
  DOCS_PLATAFORMA = 'docs_plataforma',      // Aguardar docs via página
  PROPOSTA_DEFINITIVA = 'proposta_definitiva', // Gerar proposta com planos
  ASSINATURA = 'assinatura',        // Aguardar assinatura digital
  FECHADO = 'fechado',              // Cliente convertido!
  
  // Estados terminais
  DESCARTADO = 'descartado',        // Lead não qualificado
  SAC_REDIRECT = 'sac_redirect',    // Redirecionado para suporte
  PAUSADO = 'paused_for_human',     // Atendente humano assumiu
}
```

---

## ✅ CONDIÇÕES DE TRANSIÇÃO

### Matriz de Transição

| Estado Atual | Próximo Estado | Condições Obrigatórias |
|--------------|----------------|------------------------|
| `TRIAGEM` | `QUALIFICACAO` | `triagem_concluida = true` |
| `QUALIFICACAO` | `COLETA_DADOS` | `valor_minimo_ok = true` (>= R$300) |
| `COLETA_DADOS` | `PROPOSTA_INICIAL` | `has_nome`, `has_email`, `has_distribuidora`, `has_valor` |
| `PROPOSTA_INICIAL` | `DOCS_PLATAFORMA` | `proposta_link_sent = true` |
| `DOCS_PLATAFORMA` | `PROPOSTA_DEFINITIVA` | `all_docs_complete = true` |
| `PROPOSTA_DEFINITIVA` | `ASSINATURA` | `contrato_url_ready = true` |
| `ASSINATURA` | `FECHADO` | `contrato_assinado = true` |

### Interface de Condições

```typescript
interface TransitionConditions {
  triagem_concluida: boolean;        // Passou pela triagem SAC/Comercial
  valor_minimo_ok: boolean;          // Fatura >= R$300
  is_gd1: boolean;                   // É cliente GD1 (bloqueia)
  has_nome: boolean;                 // Nome coletado (min 2 chars)
  has_email: boolean;                // Email válido (contém @)
  has_distribuidora: boolean;        // Distribuidora identificada
  has_valor: boolean;                // Valor ou consumo informado
  proposta_link_sent: boolean;       // Link da proposta enviado
  all_docs_complete: boolean;        // Todos documentos recebidos
  contrato_url_ready: boolean;       // URL do contrato disponível
  contrato_assinado: boolean;        // Assinatura digital concluída
}
```

---

## 📝 SISTEMA DE COLETA DE DADOS (FSM INTERNO)

### O Campo `fsm_expected_field`

Durante o estado `COLETA_DADOS`, existe uma sub-máquina de estados controlada pelo campo `fsm_expected_field` na tabela `chatbot_conversas`:

```
                    INÍCIO
                       │
                       ▼
              ┌────────────────┐
              │ aguardando_nome│ ←── fsm_expected_field = 'nome'
              └───────┬────────┘
                      │ ✓ Nome extraído
                      ▼
              ┌────────────────┐
              │aguardando_email│ ←── fsm_expected_field = 'email'
              └───────┬────────┘
                      │ ✓ Email validado
                      ▼
              ┌────────────────┐
              │aguardando_valor│ ←── fsm_expected_field = 'valor'
              └───────┬────────┘
                      │ ✓ Valor >= R$300
                      ▼
           ┌─────────────────────┐
           │aguardando_distribuid│ ←── fsm_expected_field = 'distribuidora'
           └──────────┬──────────┘
                      │ ✓ Distribuidora atendida
                      ▼
              ┌────────────────┐
              │  dados_completo │ → Avança para PROPOSTA_INICIAL
              └────────────────┘
```

### Deterministic Router (Bypass LLM)

```typescript
// Arquivo: pipeline/deterministic-router.ts

// Mapeia entidades extraídas para campos esperados
const fieldMapping = {
  'nome': ['name', 'person_name'],
  'email': ['email'],
  'valor': ['value', 'bill_value', 'currency'],
  'distribuidora': ['distributor', 'utility_company'],
  'cpf': ['cpf'],
  'cnpj': ['cnpj']
};

// Se o campo esperado coincide com entidade extraída → Template determinístico
if (matchedEntity && matchedEntity.confidence >= 0.6) {
  // Busca template da tabela 'deterministic_response_templates'
  const template = await getTemplate(currentState, expectedField, validationResult);
  
  return {
    handled: true,
    skipLLM: true,           // NÃO chama IA
    responseText: template,  // Resposta do banco
    newExpectedField: 'email' // Próximo campo
  };
}
```

### Tabela: `deterministic_response_templates`

| current_state | expected_field | validation_result | response_template | next_expected_field |
|---------------|----------------|-------------------|-------------------|---------------------|
| `aguardando_nome` | `nome` | `success` | "Prazer, {nome}! Qual seu e-mail?" | `email` |
| `aguardando_nome` | `nome` | `invalid_format` | "Não consegui entender seu nome. Pode repetir?" | `nome` |
| `aguardando_email` | `email` | `success` | "Anotei: {email}. Qual o valor médio da sua conta?" | `valor` |
| `aguardando_email` | `email` | `invalid_format` | "Esse e-mail parece incompleto. Pode confirmar?" | `email` |
| `aguardando_valor` | `valor` | `success` | "R$ {valor}, entendi! Qual sua distribuidora?" | `distribuidora` |
| `aguardando_valor` | `valor` | `fail` | "Valor abaixo de R$300. Infelizmente..." | `null` |

---

## 🚫 DETECÇÃO DE OFF-SCRIPT

### Padrões que Detectam "Pular Etapas"

```typescript
// Arquivo: guided-script-fsm.ts

const OFF_SCRIPT_PATTERNS = {
  [FunnelState.TRIAGEM]: [
    { pattern: /manda\s*(?:a|minha)\s*proposta/i, action: 'request_proposal_in_triage' },
    { pattern: /quero\s*(?:ver|receber)\s*(?:o\s*)?contrato/i, action: 'request_contract_in_triage' },
  ],
  
  [FunnelState.COLETA_DADOS]: [
    { pattern: /manda\s*(?:a|minha)\s*proposta/i, action: 'request_proposal_without_data' },
    { pattern: /pode\s*(?:gerar|fazer)\s*(?:a|minha)?\s*proposta/i, action: 'request_proposal_without_email' },
  ],
  
  [FunnelState.PROPOSTA_INICIAL]: [
    // Tentativa de enviar docs via WhatsApp (BLOQUEADO)
    { pattern: /(?:enviar|mandar|anexar)\s*(?:meus?\s*)?(?:documentos?|rg|cnh)/i, action: 'send_docs_via_whatsapp' },
    { pattern: /(?:aqui|segue)\s*(?:o|meu|minha)\s*(?:rg|cnh|documento)/i, action: 'send_docs_via_whatsapp' },
  ],
  
  [FunnelState.DOCS_PLATAFORMA]: [
    // Pedindo contrato antes dos docs
    { pattern: /quero\s*(?:ver|receber)\s*(?:o\s*)?contrato/i, action: 'request_contract_without_docs' },
    { pattern: /cadê\s*(?:o\s*)?(?:meu\s*)?contrato/i, action: 'request_contract_without_docs' },
  ],
};
```

### Respostas de Redirecionamento

```typescript
// Quando off-script é detectado, redireciona para o passo atual

const CURRENT_STEP_ACTIONS = {
  [FunnelState.TRIAGEM]: 'me conte um pouco sobre você para eu entender como posso ajudar',
  [FunnelState.QUALIFICACAO]: 'me informe o *valor médio* da sua conta de luz',
  [FunnelState.COLETA_DADOS]: 'me informe seu *e-mail* e o *valor médio* da sua conta de luz',
  [FunnelState.PROPOSTA_INICIAL]: 'acesse o link da proposta que enviei',
  [FunnelState.DOCS_PLATAFORMA]: 'envie seus documentos pelo link da proposta',
  [FunnelState.PROPOSTA_DEFINITIVA]: 'aguarde a geração do seu contrato',
  [FunnelState.ASSINATURA]: 'assine o contrato no link que enviei',
};

// Exemplo de resposta:
// "João, ótima pergunta! Vou guardar essa dúvida para responder daqui a pouco. 😊
//  Antes, preciso que você me informe seu *e-mail* e o *valor médio* da sua conta de luz."
```

---

## 🔄 AUTO-TRANSIÇÕES

### Verificação Automática de Avanço

```typescript
// Arquivo: guided-script-fsm.ts

function checkAutoTransition(ctx: FSMContext): AutoTransitionResult {
  const currentConfig = TRANSITION_MATRIX[ctx.currentState];
  
  // Verifica se todas as condições do próximo estado são atendidas
  const missingConditions = currentConfig.requiredConditions.filter(
    cond => !ctx.conditions[cond]
  );
  
  if (missingConditions.length === 0) {
    return {
      shouldTransition: true,
      newState: currentConfig.nextState,
      reason: `All conditions met for ${ctx.currentState} → ${currentConfig.nextState}`
    };
  }
  
  return { shouldTransition: false, newState: ctx.currentState, reason: null };
}
```

---

## 📊 MODOS OPERACIONAIS DA SOFIA

### SofiaMode (Paralelo ao FSM)

```typescript
type SofiaMode = 
  | 'standard'          // Modo consultivo (padrão)
  | 'closer_premium'    // Modo agressivo de fechamento
  | 'contract_closer'   // Foco em assinatura
  | 'paused_for_human'; // Operador assumiu

// A Sofia muda de modo baseado em:
// 1. Lead Score (>= 60 → closer_premium)
// 2. Funnel Stage (fechamento → permite closer)
// 3. Hesitação detectada → força standard
// 4. Comando #ASSUMIR → paused_for_human
```

---

## 🔢 CONTAGEM DE TENTATIVAS

### Sistema de Retry com Escalação

```typescript
// Campo: field_attempts na chatbot_conversas

// Máximo de 3 tentativas por campo antes de escalar
const MAX_FIELD_ATTEMPTS = 3;

if (validationResult !== 'success') {
  newAttempts = fieldAttempts + 1;
}

if (newAttempts >= MAX_FIELD_ATTEMPTS) {
  return {
    handled: true,
    shouldEscalate: true,
    responseText: 'Parece que estamos com dificuldade. Vou chamar um atendente!'
  };
}
```

---

## 📁 ARQUIVOS PRINCIPAIS

| Arquivo | Responsabilidade |
|---------|------------------|
| `guided-script-fsm.ts` | Definição dos estados, transições e detecção off-script |
| `funnel-stage.ts` | Determinação do estágio e modo operacional |
| `deterministic-router.ts` | Bypass da LLM para respostas estruturadas |
| `pipeline/context.ts` | Carrega estado FSM do banco para o pipeline |

---

## 🗃️ TABELAS DO BANCO

| Tabela | Campo | Descrição |
|--------|-------|-----------|
| `chatbot_conversas` | `sofia_mode` | Modo operacional atual |
| `chatbot_conversas` | `fsm_expected_field` | Campo aguardando coleta |
| `chatbot_conversas` | `field_attempts` | Tentativas no campo atual |
| `chatbot_conversas` | `proposta_link_sent_at` | Timestamp do envio do link |
| `chatbot_conversas` | `all_docs_complete_at` | Timestamp de docs completos |
| `deterministic_response_templates` | * | Templates de resposta por estado |
| `bitrix_stages_config` | `stage_id` | Mapeamento de estágios CRM |

---

**SIM, existe um sistema completo de estados implementado!**

O fluxo `TRIAGEM → QUALIFICAÇÃO → COLETA_DADOS (nome→email→valor→distribuidora) → PROPOSTA → DOCS → ASSINATURA → FECHADO` é rigidamente controlado pela FSM com validações em cada transição.
