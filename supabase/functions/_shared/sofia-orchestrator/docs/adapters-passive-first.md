# Adapters: Passive-First Integration

## Visão Geral

Os adapters de agente foram estendidos com suporte completo à arquitetura **Passive-First (AGENTS.md-Style)**, permitindo que cada agente (Sofia, Maria, Julia, Iago, Jaime) tenha sua própria configuração de contexto passivo.

## Interface Passive Context

Cada adapter agora implementa 5 novos métodos:

```typescript
interface AgentAdapter {
  // ... métodos existentes ...
  
  // PASSIVE-FIRST CONTEXT
  getPassiveContextConfig(): PassiveContextConfig;
  getRAGCategoriesForStage(stage: FunnelStage): RAGCategory[];
  isPassiveFirstEnabled(): boolean;
  getConstitutionPath(): string;
  getProtectedSections(): string[];
}
```

## PassiveContextConfig

Estrutura completa de configuração:

```typescript
interface PassiveContextConfig {
  // Mapeamento estágio → categorias RAG
  stageToRAGMapping: StageToRAGMapping;
  
  // Configuração de Rule Memory
  ruleMemory: {
    enabled: boolean;
    maxRulesPerStage: number;
    priorityOrder: ('guardrail' | 'policy' | 'suggestion' | 'learning')[];
    minPriority: number;
    cacheTTLSeconds: number;
  };
  
  // Configuração de Passive RAG
  passiveRAG: {
    enabled: boolean;
    maxChunksPerCategory: number;
    minSimilarity: number;
    compressionEnabled: boolean;
    compressionTargetChars: number;
  };
  
  // Configuração de Compressão
  compression: {
    enabled: boolean;
    targetChars: number;
    protectedSections: string[];
    aggressiveness: 'low' | 'medium' | 'high';
  };
  
  // Constituição do Agente
  constitution: {
    constitutionPath: string;
    alwaysIncludeSections: string[];
    conditionalSections: Record<FunnelStage, string[]>;
  };
  
  enableRetrievalLedReasoning: boolean;
  enablePassiveFirst: boolean;
}
```

## Sofia Adapter: Exemplo de Configuração

```typescript
const SOFIA_PASSIVE_CONTEXT_CONFIG: PassiveContextConfig = {
  stageToRAGMapping: {
    'triagem': ['faq_geral', 'processo', 'energia_solar'],
    'qualificacao': ['energia_solar', 'faq_geral', 'financeiro'],
    'coleta_dados': ['processo', 'financeiro', 'energia_solar'],
    'proposta_inicial_criada': ['financeiro', 'objecoes', 'energia_solar'],
    'proposta_inicial_enviada': ['objecoes', 'contrato', 'financeiro'],
    'docs_plataforma': ['processo', 'documentos', 'contrato'],
    'proposta_definitiva': ['contrato', 'financeiro', 'objecoes'],
    'assinatura': ['contrato', 'objecoes', 'processo'],
    'fechado': ['pos_venda', 'processo'],
  },
  ruleMemory: {
    enabled: true,
    maxRulesPerStage: 6,
    priorityOrder: ['guardrail', 'policy', 'suggestion', 'learning'],
    minPriority: 40,
    cacheTTLSeconds: 300,
  },
  passiveRAG: {
    enabled: true,
    maxChunksPerCategory: 4,
    minSimilarity: 0.35,
    compressionEnabled: true,
    compressionTargetChars: 2500,
  },
  compression: {
    enabled: true,
    targetChars: 6500,
    protectedSections: [
      'CLÁUSULAS PÉTREAS',
      'RETRIEVAL-LED',
      'REGRAS ABSOLUTAS',
      'LINHA DE CORTE',
      'FUNIL DE VENDAS',
    ],
    aggressiveness: 'medium',
  },
  constitution: {
    constitutionPath: '_shared/SOFIA.md',
    alwaysIncludeSections: ['identity', 'petreas', 'anti_hallucination', 'fsm'],
    conditionalSections: {
      'triagem': ['greeting'],
      'qualificacao': ['energy_benefits'],
      'coleta_dados': ['fsm', 'data_collection'],
      'proposta_inicial_criada': ['proposal', 'reasoning'],
      'proposta_inicial_enviada': ['objection_handling'],
      'docs_plataforma': ['document_instructions'],
      'assinatura': ['closing', 'reasoning'],
    },
  },
  enableRetrievalLedReasoning: true,
  enablePassiveFirst: true,
};
```

## Funnel Stages

| Stage | Sofia Categories | Descrição |
|-------|-----------------|-----------|
| `triagem` | faq_geral, processo, energia_solar | Primeiro contato |
| `qualificacao` | energia_solar, faq_geral, financeiro | Verificação de fit |
| `coleta_dados` | processo, financeiro, energia_solar | Coleta FSM |
| `proposta_inicial_criada` | financeiro, objecoes, energia_solar | Simulação gerada |
| `proposta_inicial_enviada` | objecoes, contrato, financeiro | Link enviado |
| `docs_plataforma` | processo, documentos, contrato | Aguardando docs |
| `proposta_definitiva` | contrato, financeiro, objecoes | Proposta final |
| `assinatura` | contrato, objecoes, processo | Contrato enviado |
| `fechado` | pos_venda, processo | Contrato assinado |

## RAG Categories

| Categoria | Descrição |
|-----------|-----------|
| `faq_geral` | Perguntas frequentes gerais |
| `processo` | Fluxo e etapas do processo |
| `energia_solar` | Conceitos de energia solar |
| `financeiro` | Valores, economia, pagamentos |
| `objecoes` | Contra-argumentos |
| `contrato` | Termos contratuais |
| `documentos` | Requisitos de documentação |
| `pos_venda` | Suporte pós-contrato |
| `cobranca` | Cobrança (julIA) |
| `suporte_tecnico` | Suporte técnico (jaimE) |
| `instalacao` | Instalação de equipamentos |

## Uso no Pipeline

```typescript
import { resolveAgentAdapter } from '../adapters/index.ts';

// Resolve adapter para o agente
const adapter = resolveAgentAdapter(agentId);

// Verifica se Passive-First está ativo
if (adapter.isPassiveFirstEnabled()) {
  // Obtém configuração completa
  const config = adapter.getPassiveContextConfig();
  
  // Obtém categorias RAG para o estágio atual
  const categories = adapter.getRAGCategoriesForStage(funnelStage);
  
  // Obtém seções protegidas
  const protectedSections = adapter.getProtectedSections();
  
  // Carrega constituição do agente
  const constitutionPath = adapter.getConstitutionPath();
}
```

## Extensão para Outros Agentes

Cada agente pode definir sua própria configuração:

```typescript
// maria-adapter.ts (SAC)
const MARIA_PASSIVE_CONTEXT_CONFIG: PassiveContextConfig = {
  stageToRAGMapping: {
    'triagem': ['faq_geral', 'pos_venda'],
    'atendimento': ['suporte_tecnico', 'processo'],
    // ...
  },
  constitution: {
    constitutionPath: '_shared/MARIA.md',
    // ...
  },
  // ...
};
```

## Histórico de Mudanças

| Data | Versão | Descrição |
|------|--------|-----------|
| 2026-02-03 | 1.0 | Integração Passive-First nos Adapters |

---

**Autor:** Sofia Team  
**Última atualização:** 2026-02-03
