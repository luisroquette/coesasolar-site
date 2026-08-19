# Padrão: Ação Fixa + Seleção de Catálogo

> **Status:** ✅ Implementado  
> **Última atualização:** 2026-02-05  
> **Arquivos-chave:** `src/types/catalog.ts`, `src/types/rule-action.ts`

## Resumo

Este padrão define como criar ações de regra que combinam:
1. **Texto fixo** (não editável) para descrever a ação
2. **Select dinâmico** populado por itens de um catálogo configurável

O usuário vê labels amigáveis; o código armazena apenas IDs técnicos.

---

## Arquitetura

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           CAMADA DE DADOS                                │
├─────────────────────────────────────────────────────────────────────────┤
│  ai_agents (JSONB)                    │  bitrix_stages_config (SQL)      │
│  ├── queues: QueueDefinition[]        │  ├── stage_id                    │
│  ├── automations: AutomationDefinition│  ├── nome                        │
│  └── owners: OwnerDefinition[]        │  └── is_active                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            CAMADA DE HOOK                                │
├─────────────────────────────────────────────────────────────────────────┤
│  useCatalogs({ agentId })                                               │
│  ├── catalogs: CatalogMap                                               │
│  ├── updateQueues(), updateAutomations(), updateOwners()                │
│  └── saveCatalogs()                                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌─────────────────────────────────┐  ┌─────────────────────────────────────┐
│     CADASTRO (Configurações)    │  │        SELEÇÃO (Regras/Ações)       │
├─────────────────────────────────┤  ├─────────────────────────────────────┤
│  CatalogManager<T>              │  │  CatalogActionSelector<T>           │
│  ├── BitrixStagesCatalog        │  │  ├── ChangeStageSelector            │
│  ├── QueuesCatalog              │  │  ├── AssignQueueSelector            │
│  ├── AutomationsCatalog         │  │  ├── AssignOwnerSelector            │
│  └── OwnersCatalog              │  │  └── TriggerAutomationSelector      │
└─────────────────────────────────┘  └─────────────────────────────────────┘
```

---

## Componentes Existentes

### Tipos Base (`src/types/catalog.ts`)

| Tipo | Campos Obrigatórios | Campos Extras |
|------|---------------------|---------------|
| `CatalogItem` | `id`, `label` | — |
| `BitrixStageDefinition` | + `target` | `description`, `sortOrder` |
| `QueueDefinition` | — | `department`, `type` |
| `AutomationDefinition` | — | `webhookUrl`, `type`, `bitrixBpId` |
| `OwnerDefinition` | — | `bitrixUserId`, `email`, `department` |

### Metadados de Ação (`src/types/rule-action.ts`)

```typescript
RULE_ACTION_META: {
  changeStage: {
    kind: 'changeStage',
    label: 'Alterar etapa',           // Texto fixo na UI
    icon: 'GitBranch',                // Ícone Lucide
    color: 'bg-blue-500',             // Cor do badge
    requiresCatalog: true,            // Indica uso de catálogo
    catalogType: 'bitrixStages',      // Chave em CatalogMap
    catalogSelectLabel: 'Etapa do CRM' // Label do select
  }
}
```

### Componentes de UI

| Componente | Localização | Função |
|------------|-------------|--------|
| `CatalogManager<T>` | `settings/CatalogManager.tsx` | CRUD genérico |
| `CatalogActionSelector<T>` | `rules/CatalogActionSelector.tsx` | Select genérico |
| `*Catalog` | `settings/catalog/*` | Cadastro específico |
| `*Selector` | `rules/action-selectors/*` | Seleção específica |

---

## Guia: Adicionar Novo Catálogo

### Passo 1: Definir Tipo do Catálogo

**Arquivo:** `src/types/catalog.ts`

```typescript
// 1. Criar interface estendendo CatalogItem
export interface NovoTipoDefinition extends CatalogItem {
  id: string;     // ID técnico (obrigatório)
  label: string;  // Nome amigável (obrigatório)
  campoExtra?: string;  // Campos específicos
}

// 2. Adicionar ao CatalogMap
export interface CatalogMap {
  bitrixStages?: BitrixStageDefinition[];
  queues?: QueueDefinition[];
  automations?: AutomationDefinition[];
  owners?: OwnerDefinition[];
  novoTipo?: NovoTipoDefinition[];  // ← Novo
}
```

### Passo 2: Definir Tipo de Ação

**Arquivo:** `src/types/rule-action.ts`

```typescript
// 1. Adicionar ao RuleActionKind
export type RuleActionKind = 
  | 'changeStage'
  | 'assignQueue'
  | 'assignOwner'
  | 'triggerAutomation'
  | 'novaAcao'  // ← Novo
  // ...

// 2. Criar interface da ação
export interface NovaAcaoAction extends RuleActionBase {
  kind: 'novaAcao';
  value: string;  // ID do item selecionado
}

// 3. Adicionar à união RuleAction
export type RuleAction = 
  | ChangeStageAction
  | NovaAcaoAction  // ← Novo
  // ...

// 4. Adicionar metadados
RULE_ACTION_META.novaAcao = {
  kind: 'novaAcao',
  label: 'Executar Ação X',
  description: 'Descrição da ação',
  icon: 'NomeIcone',
  color: 'bg-indigo-500',
  requiresCatalog: true,
  catalogType: 'novoTipo',
  catalogSelectLabel: 'Selecione X'
};

// 5. Adicionar factory function
case 'novaAcao':
  return { ...base, kind: 'novaAcao', value: '' };
```

### Passo 3: Migração SQL (se necessário)

```sql
-- Adicionar coluna JSONB para novo catálogo
ALTER TABLE ai_agents 
ADD COLUMN IF NOT EXISTS novo_tipo JSONB DEFAULT '[]'::jsonb;
```

### Passo 4: Atualizar Hook useCatalogs

**Arquivo:** `src/hooks/useCatalogs.ts`

```typescript
// 1. Adicionar à interface
interface UseCatalogsReturn {
  // ...
  updateNovoTipo: (items: NovoTipoDefinition[]) => void;
}

// 2. No loadCatalogs
novoTipo: (data?.novo_tipo as NovoTipoDefinition[]) || [],

// 3. No saveCatalogs
if (catalogsToSave.novoTipo !== undefined) {
  updateData.novo_tipo = catalogsToSave.novoTipo;
}

// 4. Criar helper
const updateNovoTipo = useCallback((items: NovoTipoDefinition[]) => {
  setCatalogs(prev => ({ ...prev, novoTipo: items }));
}, []);
```

### Passo 5: Criar Componente de Cadastro

**Arquivo:** `src/components/settings/catalog/NovoTipoCatalog.tsx`

```typescript
import React from 'react';
import { CatalogManager } from '../CatalogManager';
import { IconName } from 'lucide-react';
import type { NovoTipoDefinition } from '@/types/catalog';

interface NovoTipoCatalogProps {
  items: NovoTipoDefinition[];
  onChange: (items: NovoTipoDefinition[]) => void;
}

export function NovoTipoCatalog({ items, onChange }: NovoTipoCatalogProps) {
  const createEmpty = (): NovoTipoDefinition => ({
    id: '',
    label: '',
    campoExtra: '',
  });

  const renderExtraFields = (
    item: NovoTipoDefinition, 
    onItemChange: (field: keyof NovoTipoDefinition, value: any) => void
  ) => (
    <div className="grid grid-cols-2 gap-2">
      <Input
        placeholder="Campo extra"
        value={item.campoExtra || ''}
        onChange={(e) => onItemChange('campoExtra', e.target.value)}
      />
    </div>
  );

  return (
    <CatalogManager<NovoTipoDefinition>
      title="Novo Tipo"
      description="Descrição do catálogo"
      items={items}
      onChange={onChange}
      createEmptyItem={createEmpty}
      renderExtraFields={renderExtraFields}
      icon={<IconName className="h-4 w-4" />}
      idPlaceholder="Ex: ITEM_001"
      labelPlaceholder="Ex: Nome do Item"
      addButtonText="Adicionar item"
    />
  );
}
```

### Passo 6: Criar Componente de Seleção

**Arquivo:** `src/components/rules/action-selectors/NovaAcaoSelector.tsx`

```typescript
import React from 'react';
import { CatalogActionSelector } from '../CatalogActionSelector';
import { RULE_ACTION_META } from '@/types/rule-action';
import type { NovoTipoDefinition } from '@/types/catalog';
import type { NovaAcaoAction } from '@/types/rule-action';

interface NovaAcaoSelectorProps {
  items: NovoTipoDefinition[];
  action: Partial<NovaAcaoAction>;
  onChange: (action: Partial<NovaAcaoAction>) => void;
  disabled?: boolean;
}

export function NovaAcaoSelector({
  items,
  action,
  onChange,
  disabled,
}: NovaAcaoSelectorProps) {
  const handleSelect = (item: NovoTipoDefinition | null) => {
    if (item) {
      onChange({
        ...action,
        kind: 'novaAcao',
        value: item.id,
      });
    } else {
      onChange({
        ...action,
        kind: 'novaAcao',
        value: '',
      });
    }
  };

  return (
    <CatalogActionSelector<NovoTipoDefinition>
      actionMeta={RULE_ACTION_META.novaAcao}
      items={items}
      selectedId={action.value || null}
      onSelect={handleSelect}
      placeholder="Selecione..."
      disabled={disabled}
    />
  );
}
```

### Passo 7: Registrar no RuleActionEditor

**Arquivo:** `src/components/rules/RuleActionEditor.tsx`

```typescript
import { NovaAcaoSelector } from './action-selectors/NovaAcaoSelector';

// No switch de renderActionSelector()
case 'novaAcao':
  return (
    <NovaAcaoSelector
      items={catalogs.novoTipo || []}
      action={action}
      onChange={(updated) => onChange({ ...action, ...updated } as RuleAction)}
      disabled={disabled}
    />
  );
```

### Passo 8: Adicionar Aba no AgentCatalogsEditor

**Arquivo:** `src/components/ai-gym/AgentCatalogsEditor.tsx`

```typescript
import { NovoTipoCatalog } from '@/components/settings/catalog/NovoTipoCatalog';

// Na TabsList
<TabsTrigger value="novoTipo">Novo Tipo</TabsTrigger>

// No TabsContent
<TabsContent value="novoTipo">
  <NovoTipoCatalog
    items={catalogs.novoTipo || []}
    onChange={updateNovoTipo}
  />
</TabsContent>
```

---

## Checklist de Implementação

| # | Ação | Arquivo | Status |
|---|------|---------|--------|
| 1 | Criar tipo do catálogo | `src/types/catalog.ts` | ☐ |
| 2 | Atualizar `CatalogMap` | `src/types/catalog.ts` | ☐ |
| 3 | Criar `RuleActionKind` | `src/types/rule-action.ts` | ☐ |
| 4 | Criar interface da ação | `src/types/rule-action.ts` | ☐ |
| 5 | Adicionar à união `RuleAction` | `src/types/rule-action.ts` | ☐ |
| 6 | Adicionar `RULE_ACTION_META` | `src/types/rule-action.ts` | ☐ |
| 7 | Atualizar `createEmptyAction` | `src/types/rule-action.ts` | ☐ |
| 8 | Migração SQL (se necessário) | Supabase | ☐ |
| 9 | Atualizar `useCatalogs` hook | `src/hooks/useCatalogs.ts` | ☐ |
| 10 | Criar componente de cadastro | `src/components/settings/catalog/` | ☐ |
| 11 | Exportar no barrel | `src/components/settings/catalog/index.ts` | ☐ |
| 12 | Criar componente de seleção | `src/components/rules/action-selectors/` | ☐ |
| 13 | Exportar no barrel | `src/components/rules/action-selectors/index.ts` | ☐ |
| 14 | Registrar no `RuleActionEditor` | `src/components/rules/RuleActionEditor.tsx` | ☐ |
| 15 | Adicionar aba no `AgentCatalogsEditor` | `src/components/ai-gym/AgentCatalogsEditor.tsx` | ☐ |

---

## Princípios do Padrão

1. **Separação de Responsabilidades**
   - Catálogo: define O QUE pode ser selecionado
   - Ação: define COMO a seleção será usada

2. **IDs Técnicos vs Labels Amigáveis**
   - Sempre armazenar `id` técnico
   - Sempre exibir `label` amigável
   - Mapear na hora de renderizar/exibir

3. **Metadados Centralizados**
   - `RULE_ACTION_META` define comportamento visual
   - Facilita adicionar novas ações

4. **Componentes Genéricos**
   - `CatalogManager<T>`: CRUD reutilizável
   - `CatalogActionSelector<T>`: Select reutilizável

---

## Exemplos Implementados

### 1. Alterar Etapa (changeStage)
- **Catálogo:** `bitrixStages` (via `bitrix_stages_config`)
- **Seletor:** `ChangeStageSelector`
- **Campos:** `target` + `value`

### 2. Atribuir Fila (assignQueue)
- **Catálogo:** `queues` (JSONB em `ai_agents`)
- **Seletor:** `AssignQueueSelector`
- **Campo:** `value`

### 3. Atribuir Responsável (assignOwner)
- **Catálogo:** `owners` (JSONB em `ai_agents`)
- **Seletor:** `AssignOwnerSelector`
- **Campos:** `value`, `bitrixUserId`

### 4. Disparar Automação (triggerAutomation)
- **Catálogo:** `automations` (JSONB em `ai_agents`)
- **Seletor:** `TriggerAutomationSelector`
- **Campos:** `value`, `webhookUrl`

---

## Referências

- `src/types/catalog.ts` - Tipos de catálogo
- `src/types/rule-action.ts` - Tipos e metadados de ação
- `src/hooks/useCatalogs.ts` - Hook de gerenciamento
- `src/components/settings/CatalogManager.tsx` - CRUD genérico
- `src/components/rules/CatalogActionSelector.tsx` - Select genérico
- `src/components/rules/RuleActionEditor.tsx` - Router de ações
- `src/components/ai-gym/AgentCatalogsEditor.tsx` - UI de catálogos
