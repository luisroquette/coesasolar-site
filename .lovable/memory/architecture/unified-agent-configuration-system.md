# Memory: architecture/unified-agent-configuration-system
Updated: 2026-02-03

## Sistema Unificado de Configuração por Agente

Arquitetura que elimina a fragmentação de configurações hardcoded em 7+ locais, centralizando tudo na tabela `agent_configurations`.

### Características

| Aspecto | Implementação |
|---------|---------------|
| **Escopo** | Por agente (`agent_id`) |
| **Validação** | Zod schemas tipados por namespace |
| **Secrets** | Referências a Lovable Secrets (nunca valores diretos) |
| **Cache** | 5 minutos com invalidação por agent_id |
| **Fallbacks** | Defaults tipados por namespace |

### Namespaces Disponíveis

| Namespace | Descrição | Configs |
|-----------|-----------|---------|
| `nudges` | Delays e limites de nudges | 8 |
| `quiet_hours` | Horários de silêncio | 5 |
| `llm` | Modelo, temperatura, limites | 6 |
| `integrations` | ChatApp, Z-API, Bitrix24 | 6 |
| `pipeline` | Flags de features | 8 |
| `followup` | Scores e intervalos | 6 |
| `proposal_defaults` | Valores padrão de proposta | 7 |
| `anti_spam` | Rate limiting e proteção | 5 |

### Como Usar

```typescript
import { 
  getAgentConfigLoader,
  loadAgentConfig,
  isAgentInQuietHours,
  getAgentNudgeDelays
} from '../_shared/agent-config-loader.ts';

// Loader instance
const loader = getAgentConfigLoader(supabase);

// Full config
const config = await loader.loadFullConfig('sofIA');

// Specific namespace
const nudges = await loader.getNudgeConfig('sofIA');
const llm = await loader.getLLMConfig('sofIA');

// Convenience functions
const inQuietHours = await isAgentInQuietHours(supabase, 'sofIA');
const delays = await getAgentNudgeDelays(supabase, 'sofIA');
```

### Schema da Tabela

```sql
agent_configurations (
  id UUID PRIMARY KEY,
  agent_id TEXT NOT NULL,
  config_namespace TEXT NOT NULL,
  config_key TEXT NOT NULL,
  config_value JSONB NOT NULL,
  value_type TEXT NOT NULL,  -- 'string'|'number'|'boolean'|'json'|'array'
  is_secret_reference BOOLEAN,
  secret_key_name TEXT,
  UNIQUE(agent_id, config_namespace, config_key)
)
```

### Secrets

Valores sensíveis (tokens, API keys) ficam em Lovable Secrets. A tabela guarda apenas referências:

```sql
-- Exemplo de secret reference
INSERT INTO agent_configurations 
  (agent_id, config_namespace, config_key, config_value, value_type, is_secret_reference, secret_key_name)
VALUES 
  ('sofIA', 'integrations', 'chatapp_token_secret', '"CHATAPP_ACCESS_TOKEN"', 'string', true, 'CHATAPP_ACCESS_TOKEN');
```

### Migração Concluída

✅ Tabela `agent_configurations` criada  
✅ `agent-config-loader.ts` com validação Zod  
✅ 51 configurações seed para agente sofIA  
✅ Cache com TTL de 5 minutos  
✅ Fallbacks tipados para todos os namespaces
