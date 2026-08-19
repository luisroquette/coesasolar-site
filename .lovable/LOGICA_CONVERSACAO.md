# 🧠 LÓGICA DE CONVERSAÇÃO - SOFIA BOT V2

> **Documentação Completa do Pipeline de Decisão**  
> Última atualização: 2026-02-02

---

## 📊 VISÃO GERAL DA ARQUITETURA

A Sofia decide o que responder através de um **Pipeline de 7 Camadas** com múltiplos pontos de interceptação:

```
┌─────────────────────────────────────────────────────────────────┐
│                      MENSAGEM RECEBIDA                          │
│                    (Z-API Webhook → sofia-webhook)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 0: MESSAGE BUFFER (5s debounce)                          │
│  • Agrupa mensagens fragmentadas do usuário                     │
│  • Evita múltiplas respostas para interações fatiadas           │
│  • Arquivo: message-deduplication.ts                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: PRE-LLM HARD STOPS (BLOQUEIO DETERMINÍSTICO)         │
│  • Mínimo R$300 → Descarta lead automaticamente                 │
│  • Desqualificação recente (30 dias) → Silencia                 │
│  • Comando de operador → Executa sem IA                         │
│  • Arquivo: pre-llm-hard-stops.ts                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: FAST-PATHS (RESPOSTAS INSTANTÂNEAS)                   │
│  • Custo/Taxas → "Não tem custo de adesão! Zero."               │
│  • Proposta já enviada → Resposta contextual                    │
│  • Billing Education → Templates específicos                    │
│  • Arquivo: fast-path-handlers.ts                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: INTAKE (NORMALIZAÇÃO DE ENTRADA)                      │
│  • Transcrição de áudio (Gemini)                                │
│  • Análise de imagem/PDF (Gemini)                               │
│  • Extração de entidades (CPF, CNPJ, email, valor)              │
│  • Classificação de intenção (18 categorias)                    │
│  • Detecção de sentimento                                       │
│  • Arquivo: pipeline/intake.ts                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 4: DETERMINISTIC ROUTER (BYPASS DA LLM)                  │
│  • Se fsm_expected_field coincide com entidade extraída         │
│  • Usa templates da tabela deterministic_response_templates     │
│  • Máx 3 tentativas antes de escalar                            │
│  • Arquivo: pipeline/deterministic-router.ts                    │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
      [HANDLED = true]                [HANDLED = false]
              │                               │
              ▼                               ▼
    RESPOSTA DETERMINÍSTICA    ┌──────────────────────────────────┐
    (Sem LLM, sem custo)       │  LAYER 5: CONTEXT (MEMÓRIA)      │
              │                │  • Working Memory (fatos da sessão)│
              │                │  • Rule Memory (diretrizes)       │
              │                │  • RAG Search (knowledge base)    │
              │                │  • Histórico sanitizado           │
              │                │  • Arquivo: pipeline/context.ts   │
              │                └──────────────────────────────────┘
              │                               │
              │                               ▼
              │                ┌──────────────────────────────────┐
              │                │  LAYER 6: REASONING (LLM + Tools)│
              │                │  • Gemini 2.5 Flash (primário)   │
              │                │  • Tool Calling estruturado       │
              │                │  • Behavioral Profile injection   │
              │                │  • Arquivo: pipeline/reasoning.ts │
              │                └──────────────────────────────────┘
              │                               │
              │                               ▼
              │                ┌──────────────────────────────────┐
              │                │  LAYER 7: GUARDRAILS (PÓS-LLM)   │
              │                │  • Bloqueia pedidos de documento  │
              │                │  • Previne promessas sem dados    │
              │                │  • Detecta placeholders [LINK]    │
              │                │  • Corrige alucinações            │
              │                │  • Arquivo: llm-guardrails.ts     │
              │                └──────────────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ENVIO VIA Z-API                                                │
│  • Delay humanizado (1-3s)                                      │
│  • TTS opcional (ElevenLabs → OpenAI fallback)                  │
│  • Retry exponencial (3 tentativas)                             │
│  • Arquivo: zapi-client.ts                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔴 LAYER 1: PRE-LLM HARD STOPS

Bloqueios determinísticos que NUNCA passam pela LLM:

### Arquivo: `pre-llm-hard-stops.ts`

```typescript
// 5 HARD STOPS IMPLEMENTADOS:

// 1. MÍNIMO R$ 300 (linha de corte absoluta)
if (valorFatura < 300) {
  return {
    blocked: true,
    blockType: 'minimum_bill_threshold',
    responseMessage: `Sua conta de R$ ${valorFatura} está abaixo do limite mínimo...`,
    shouldDiscard: true,
    discardReason: `Baixo Consumo (R$ ${valorFatura})`
  };
}

// 2. DESQUALIFICAÇÃO RECENTE (30 dias)
if (recentDiscarded) {
  return {
    blocked: true,
    blockType: 'recent_disqualification',
    responseMessage: null, // SILENCIA - não responde
  };
}

// 3. BYPASS DE TRIAGEM (dados comerciais existentes)
if (hasDistribuidora && hasValue) {
  return {
    skipTriage: true,
    triageBypassReason: 'has_commercial_data'
  };
}

// 4. BLOQUEIO DE DOCUMENTO VIA WHATSAPP
// Intercepta respostas da LLM que pedem docs
if (detectDocumentRequestInMessage(llmResponse)) {
  return buildDocumentBlockMessage(proposalUrl);
}

// 5. EMAIL OBRIGATÓRIO ANTES DE PROPOSTA
if (!hasEmail && wantsProposal) {
  return {
    requireEmail: true,
    requestMessage: 'Preciso do seu e-mail para enviar a proposta!'
  };
}
```

---

## ⚡ LAYER 2: FAST-PATHS

Respostas instantâneas SEM acionar LLM:

### Arquivo: `fast-path-handlers.ts`

```typescript
// PATTERNS DE DETECÇÃO (exemplos)
const COST_QUESTION_PATTERNS = [
  /tem\s+algum\s+custo\??/i,
  /tem\s+taxa\??/i,
  /quanto\s+custa\??/i,
  /custo\s+de\s+ades[aã]o\??/i,
];

// HANDLERS IMPLEMENTADOS:

// 1. CUSTO/TAXA → Resposta zero-cost
if (detectCostQuestion(message)) {
  return "Não tem custo de adesão! Zero. 💚\nVocê só paga o valor da energia com desconto...";
}

// 2. BILLING EDUCATION (CIP, disponibilidade, taxas de iluminação)
if (detectBillingEducationQuestion(message)) {
  return generateBillingEducationResponse(category, clienteNome);
}

// 3. ECONOMIA SIMULATION REQUEST
if (isSimulationRequest(message)) {
  const inputs = extractSimulationInputs(message, existingDados);
  return simularEconomia(inputs);
}

// 4. PROPOSTA JÁ ENVIADA (anti-race condition)
// Usa lock atômico no banco (claim_email_processing_if_no_proposal)
const { should_process, proposal_already_sent } = await claimProcessing();
if (proposal_already_sent) {
  return `Sua proposta já está pronta! 🎉 Acesse: ${proposalUrl}`;
}

// 5. CRM STAGE FAST-PATH
if (bitrixStage === 'UC_9SLRPP') { // Proposta Inicial
  return handleCRMStageFastPath(ctx);
}
```

---

## 🧩 LAYER 3: INTAKE (Normalização)

Processa todos os tipos de entrada em formato estruturado:

### Arquivo: `pipeline/intake.ts`

```typescript
interface IntentPayload {
  // Identificadores
  conversaId: string;
  messageId: string;
  phone: string;
  
  // Conteúdo
  rawContent: string;              // Mensagem original
  transcribedContent?: string;     // Áudio transcrito
  extractedText?: string;          // Texto de imagem/PDF
  
  // Classificação
  mediaType: 'text' | 'audio' | 'image' | 'document';
  intent: IntentType;              // 18 categorias
  intentConfidence: number;        // 0-1
  
  // Entidades extraídas
  entities: ExtractedEntity[];     // CPF, CNPJ, email, valor, etc.
  
  // Análise
  sentiment: number;               // -1 a +1
  urgency: 'low' | 'medium' | 'high' | 'critical';
  
  // Flags
  isOperatorCommand: boolean;
  commandType?: OperatorCommandType;
}

// 18 CATEGORIAS DE INTENÇÃO:
type IntentType = 
  | 'greeting'           // Saudação
  | 'identification'     // Fornece dados pessoais
  | 'bill_info'          // Informação de fatura
  | 'distributor_info'   // Informação de distribuidora
  | 'confirmation'       // Confirma dados/interesse
  | 'clarification'      // Pede esclarecimento
  | 'objection'          // Objeção comercial
  | 'technical_question' // Dúvida técnica
  | 'billing_question'   // Dúvida sobre cobrança
  | 'document_send'      // Envio de documento
  | 'proposal_request'   // Solicita proposta
  | 'contract_request'   // Solicita contrato
  | 'complaint'          // Reclamação
  | 'competitor_mention' // Menciona concorrente
  | 'negotiation'        // Negociação de desconto
  | 'farewell'           // Despedida
  | 'escalation'         // Pede atendente humano
  | 'unknown';           // Não identificado

// EXTRAÇÃO DE ENTIDADES:
const entities = await extractEntitiesFromMessage(message, mediaType);
// Resultado:
[
  { type: 'email', value: 'joao@email.com', confidence: 0.95, normalized: 'joao@email.com' },
  { type: 'cpf', value: '123.456.789-00', confidence: 0.90, normalized: '12345678900' },
  { type: 'value', value: 'R$ 450', confidence: 0.85, normalized: 450 },
  { type: 'distributor', value: 'CEMIG', confidence: 0.80, normalized: 'CEMIG - MG' }
]
```

---

## 🚦 LAYER 4: DETERMINISTIC ROUTER

Bypass da LLM para coleta de dados estruturada:

### Arquivo: `pipeline/deterministic-router.ts`

```typescript
// REGRA DE OURO: Se FSM espera um campo e entidade foi extraída → Resposta determinística

async function tryDeterministicResponse(
  intake: IntentPayload,
  fsmState: FSMState,
  agentId: string
): Promise<DeterministicResult> {
  
  // RULE 1: Intenções que SEMPRE vão para LLM
  const llmRequiredIntents = [
    'clarification', 'objection', 'technical_question',
    'competitor_mention', 'complaint', 'negotiation'
  ];
  if (llmRequiredIntents.includes(intake.intent)) {
    return createPassToLLM(`intent_requires_llm: ${intake.intent}`);
  }
  
  // RULE 2: Se não estamos em modo de coleta, vai para LLM
  if (!fsmState.expectedField) {
    return createPassToLLM('no_expected_field');
  }
  
  // RULE 3: Mapear entidade extraída para campo esperado
  const fieldMapping = {
    'nome': ['name', 'person_name'],
    'email': ['email'],
    'valor': ['value', 'bill_value'],
    'distribuidora': ['distributor'],
    'cpf': ['cpf'],
    'cnpj': ['cnpj']
  };
  
  const matchedEntity = intake.entities.find(e => 
    fieldMapping[fsmState.expectedField].includes(e.type) && 
    e.confidence >= 0.6
  );
  
  // RULE 4: Validar entidade e buscar template
  let validationResult: 'success' | 'fail' | 'invalid_format';
  
  if (matchedEntity) {
    validationResult = validateEntity(fsmState.expectedField, matchedEntity);
  } else {
    validationResult = 'missing';
  }
  
  // RULE 5: Buscar template do banco
  const { data: templates } = await supabase
    .from('deterministic_response_templates')
    .select('*')
    .eq('agent_id', agentId)
    .eq('current_state', fsmState.currentState)
    .eq('expected_field', fsmState.expectedField)
    .eq('validation_result', validationResult)
    .eq('is_active', true)
    .limit(1);
  
  if (!templates?.length) {
    return createPassToLLM('no_template_found');
  }
  
  // RULE 6: Verificar max tentativas (escalona após 3 falhas)
  const MAX_ATTEMPTS = 3;
  if (fsmState.fieldAttempts >= MAX_ATTEMPTS) {
    return {
      handled: true,
      shouldEscalate: true,
      responseText: 'Vou chamar um atendente para te ajudar!'
    };
  }
  
  // RULE 7: Interpolar template e retornar
  const response = interpolateTemplate(templates[0].response_template, extractedValue);
  
  return {
    handled: true,
    skipLLM: true,
    responseText: response,
    newExpectedField: templates[0].next_expected_field,
    dataToSave: { [fsmState.expectedField]: extractedValue }
  };
}
```

---

## 🧠 LAYER 5: CONTEXT (Memória)

Carrega contexto completo antes da LLM:

### Arquivo: `pipeline/context.ts`

```typescript
interface FullContext {
  // Intake (do layer anterior)
  intake: IntentPayload;
  
  // Perfil do cliente
  clientProfile: {
    phone: string;
    name: string | null;
    email: string | null;
    distribuidora: string | null;
    valorFatura: number | null;
    consumoKwh: number | null;
    objectionHistory: string[];
  };
  
  // Memória de trabalho (fatos da sessão)
  workingMemory: WorkingMemoryEntry[];
  
  // Regras ativas (diretrizes obrigatórias)
  activeRules: RuleEntry[];
  
  // Contexto RAG (knowledge base)
  ragContext: RAGChunk[];
  
  // Estado do funil
  funnelState: {
    stage: FunnelStage;
    mode: SofiaMode;
    hasProposal: boolean;
    isQualified: boolean;
    documentsPending: string[];
  };
  
  // Histórico de mensagens (sanitizado)
  conversationHistory: Message[];
  
  // Metadata
  metadata: {
    isDelayedResponse?: boolean;
    hoursDelayed?: number;
  };
}

// WORKING MEMORY (fatos temporários)
// Tabela: working_memory
[
  { key: 'distribuidora_confirmada', value: 'CEMIG', confidence: 0.9, expiresAt: '2h' },
  { key: 'valor_mencionado', value: 450, confidence: 0.8, expiresAt: '2h' },
  { key: 'interesse_economia', value: true, confidence: 0.7, expiresAt: '4h' }
]

// RULE MEMORY (diretrizes persistentes)
// Tabela: rule_memory
[
  { ruleType: 'commercial', name: 'MIN_VALUE', description: 'Mínimo R$300' },
  { ruleType: 'behavior', name: 'NO_DOCS_WHATSAPP', description: 'Nunca pedir docs via WhatsApp' },
  { ruleType: 'learned', name: 'CORRECAO_123', description: 'Aprendizado de operador' }
]

// RAG CONTEXT (busca semântica)
// Threshold: 45% similaridade
[
  { category: 'FAQ', content: 'Como funciona o desconto...', similarity: 0.72 },
  { category: 'Vendas', content: 'Planos disponíveis: Flex 15%, Premium 25%...', similarity: 0.68 }
]
```

---

## 🤖 LAYER 6: REASONING (LLM + Tools)

Decisão via LLM com Tool Calling estruturado:

### Arquivo: `pipeline/reasoning.ts`

```typescript
// CONFIGURAÇÃO DO LLM
const LLM_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

// TOOL CALLING - A LLM DEVE usar ferramentas
const AVAILABLE_TOOLS = [
  {
    name: 'send_message',
    description: 'Envia mensagem para o cliente',
    parameters: {
      text: { type: 'string', required: true },
      tone: { type: 'string', enum: ['professional', 'empathetic', 'enthusiastic'] }
    }
  },
  {
    name: 'save_fact',
    description: 'Salva informação na memória de trabalho',
    parameters: {
      key: { type: 'string', required: true },
      value: { type: 'any', required: true },
      confidence: { type: 'number' }
    }
  },
  {
    name: 'escalate',
    description: 'Transfere para atendente humano',
    parameters: {
      reason: { type: 'string', required: true }
    }
  },
  {
    name: 'request_clarification',
    description: 'Pede esclarecimento ao cliente',
    parameters: {
      question: { type: 'string', required: true }
    }
  },
  {
    name: 'mark_disqualified',
    description: 'Marca lead como desqualificado',
    parameters: {
      reason: { type: 'string', required: true }
    }
  },
  {
    name: 'calculate_economy',
    description: 'Calcula economia para o cliente',
    parameters: {
      valorFatura: { type: 'number' },
      consumoKwh: { type: 'number' }
    }
  }
];

// SYSTEM PROMPT ESTRUTURADO
const systemPrompt = `
# IDENTIDADE
Você é sofIA, assistente de vendas da COESA Energia.

# CONTEXTO DO CLIENTE
- Nome: ${clientProfile.name || 'Não informado'}
- Distribuidora: ${clientProfile.distribuidora || 'Não identificada'}
- Valor Fatura: ${clientProfile.valorFatura ? 'R$ ' + clientProfile.valorFatura : 'Não informado'}
- Estágio: ${funnelState.stage}
- Tem Proposta: ${funnelState.hasProposal}

# PERFIL COMPORTAMENTAL
${behavioralProfileBlock}  // Adapta tom baseado no perfil

# REGRAS ATIVAS (OBRIGATÓRIO)
${activeRules.map(r => '- ' + r.name + ': ' + r.description).join('\n')}

# CONHECIMENTO (RAG)
${ragContext.map(r => '[' + r.category + '] ' + r.content).join('\n')}

# INSTRUÇÕES
1. SEMPRE use send_message para responder
2. Use save_fact para guardar informações importantes
3. Se cliente fornecer dados, salve imediatamente
4. NUNCA invente dados
5. Máximo 3 parágrafos por resposta
`;

// CHAMADA À LLM
const llmResponse = await fetch(LLM_ENDPOINT, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: DEFAULT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: currentMessage }
    ],
    tools: AVAILABLE_TOOLS,
    tool_choice: 'auto',
    temperature: 0.7,
    max_tokens: 2000
  })
});

// PROCESSAMENTO DA RESPOSTA
interface ReasoningResult {
  decision: 'respond' | 'escalate' | 'clarify' | 'disqualify' | 'collect' | 'calculate';
  decisionConfidence: number;
  responseText?: string;
  responseTone: 'professional' | 'empathetic' | 'enthusiastic' | 'calm' | 'urgent';
  toolCalls: ToolCall[];
  newFacts: NewFact[];
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
}
```

---

## 🛡️ LAYER 7: GUARDRAILS (Pós-LLM)

Correções aplicadas APÓS a LLM gerar resposta:

### Arquivo: `llm-guardrails.ts`

```typescript
// GUARDS IMPLEMENTADOS:

// 1. DOCUMENT REQUEST GUARD
// Bloqueia QUALQUER pedido de documento via WhatsApp
if (detectDocumentRequest(llmResponse)) {
  if (proposalUrl) {
    return `Para sua segurança, os documentos devem ser enviados através do link: ${proposalUrl}`;
  } else {
    return 'Aguarde sua proposta para enviar documentos de forma segura!';
  }
}

// 2. FALSE DELIVERY CLAIM GUARD
// Detecta alegações de envio sem URL real
const falseDeliveryPatterns = [
  /j[aá]\s+enviei\s+(o\s+)?link/i,
  /link\s+j[aá]\s+foi\s+enviado/i,
  /proposta\s+j[aá]\s+(est[aá]\s+)?no\s+seu\s+e-?mail/i,
];
if (falseDeliveryPatterns.some(p => p.test(llmResponse)) && !proposalUrl) {
  return 'Ainda estou preparando sua proposta personalizada! Em breve você receberá no e-mail.';
}

// 3. PLACEHOLDER GUARD
// Captura [LINK], {url}, etc.
if (/\[LINK\]|\{url\}|\[URL\]/.test(llmResponse)) {
  if (proposalUrl) {
    return llmResponse.replace(/\[LINK\]|\{url\}|\[URL\]/gi, proposalUrl);
  } else {
    return llmResponse.replace(/\[LINK\]|\{url\}|\[URL\]/gi, 'em breve');
  }
}

// 4. PROPOSAL PROMISE GUARD
// Bloqueia promessas de proposta sem dados mínimos
if (detectProposalPromise(llmResponse) && !hasMinimumData(mergedData)) {
  const missing = identifyMissingData(mergedData);
  return missing.question; // Pergunta pelo dado faltante
}

// 5. HALLUCINATED HUMAN HANDOFF GUARD
// Previne alegações falsas de transferência
if (/j[aá]\s+chamei\s+(o\s+)?atendente/i.test(llmResponse) && !needsHumanEscalation) {
  return llmResponse.replace(/j[aá]\s+chamei.{0,40}atendente/i, 'estou aqui para te ajudar');
}

// 6. ANTI-HALLUCINATION FOOTER GUARD
// Remove disclaimers fictícios gerados pela LLM
const hallucinationPatterns = [
  /Link\s+fictício\s+para\s+demonstração/i,
  /COESA\s+S\.A\./i,
  /═{3,}/,  // Linhas decorativas
];
for (const pattern of hallucinationPatterns) {
  llmResponse = llmResponse.replace(pattern, '');
}
```

---

## 🔄 FLUXO COMPLETO DE UMA MENSAGEM

### Exemplo: Cliente envia "meu email é joao@email.com"

```
1. Z-API WEBHOOK
   • Recebe: { phone: "5511999999999", text: { message: "meu email é joao@email.com" } }
   • Normaliza telefone: 55 + 11 + 9 + 99999999 = 5511999999999
   • Encaminha para sofia-webhook

2. MESSAGE BUFFER
   • Verifica se há mensagens recentes do mesmo número
   • Se última mensagem < 5s atrás, aguarda mais
   • Se silêncio > 5s, processa batch

3. PRE-LLM HARD STOPS
   • checkMinimumBillThreshold: OK (sem valor de fatura nesta msg)
   • checkRecentDisqualification: OK (não descartado)
   • checkTriageBypass: OK (prossegue)

4. FAST-PATHS
   • detectCostQuestion: false
   • detectBillingEducation: false
   • handleProposalAlreadySent: false
   → Nenhum fast-path acionado

5. INTAKE
   • rawContent: "meu email é joao@email.com"
   • mediaType: 'text'
   • intent: 'identification' (0.92 confiança)
   • entities: [{ type: 'email', value: 'joao@email.com', confidence: 0.95 }]
   • sentiment: 0.1 (neutro)

6. DETERMINISTIC ROUTER
   • FSM State: { expectedField: 'email', currentState: 'aguardando_email' }
   • Entidade 'email' encontrada com confiança 0.95 ✓
   • Validação: regex email passa ✓
   • Busca template: "Perfeito, {first_name}! Anotei seu e-mail: {email}. Agora..."
   → HANDLED = true, skipLLM = true
   
7. RESPOSTA ENVIADA
   • "Perfeito, João! Anotei seu e-mail: joao@email.com. Agora me conta..."
   • Dados salvos: { email: 'joao@email.com' }
   • FSM atualizado: { expectedField: 'valor', currentState: 'aguardando_valor' }

8. SYNC COM CRM
   • Bitrix24 atualizado com email
   • Lead movido para próximo estágio se necessário
```

---

## 📊 MÉTRICAS DE DECISÃO

| Camada | Latência Típica | % Respostas | Custo |
|--------|-----------------|-------------|-------|
| Hard Stops | 50-100ms | 5% | R$ 0 |
| Fast-Paths | 100-200ms | 15% | R$ 0 |
| Deterministic Router | 200-400ms | 40% | R$ 0 |
| LLM + Guardrails | 1-3s | 40% | ~R$ 0.01 |

**Objetivo:** Maximizar respostas determinísticas (custo zero, alta precisão) e reservar LLM para casos complexos.

---

**Última atualização:** 2026-02-02  
**Arquivos principais:** 7 módulos | ~15.000 linhas de código
