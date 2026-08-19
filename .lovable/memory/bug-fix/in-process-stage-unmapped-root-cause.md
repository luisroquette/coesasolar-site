# Memory: bug-fix/in-process-stage-unmapped-root-cause
Updated: now

## Causa Raiz: Leads em IN_PROCESS Nunca Avançam

### Problema
Leads em estágio `IN_PROCESS` no Bitrix24 nunca eram movidos para `PROPOSTA_INICIAL` mesmo com dados completos porque esse estágio não estava mapeado no sistema.

### Análise do Código
O `determineNextStage()` em `sofia-bitrix-lead/index.ts` calculava `currentIndex` baseado no mapeamento `BITRIX_STAGES`:
- `NEW` → index 0
- `UC_AGUARDANDO_DADOS` → index 1  
- `UC_9SLRPP` (Proposta Inicial) → index 2
- `IN_PROCESS` → **index -1** (não mapeado!)

A lógica de progressão verificava:
```typescript
if (currentStage === 'NEW' || currentIndex === 0) { ... } // IN_PROCESS não entra aqui
if (currentStage === BITRIX_STAGES.AGUARDANDO_DADOS.id || currentIndex === 1) { ... } // IN_PROCESS também não
// → Retorna null, lead nunca avança!
```

### Correção Implementada
1. **Alias de Estágios**: Criada lista `COLLECTION_PHASE_ALIASES` com estágios intermediários do Bitrix (`IN_PROCESS`, `UC_TRIAGEM`, etc.)
2. **Tratamento como AGUARDANDO_DADOS**: Estágios não mapeados são tratados como fase de coleta (index 1)
3. **Condição Expandida**: A verificação para progressão agora inclui `isCollectionPhaseAlias`

### Logs de Diagnóstico
- `[determineNextStage] ⚠️ Unmapped stage "IN_PROCESS" detected - treating as AGUARDANDO_DADOS for progression`
- `[determineNextStage] Lead em IN_PROCESS tem dados completos → PROPOSTA_INICIAL`

### Arquivos Modificados
- `supabase/functions/sofia-bitrix-lead/index.ts` (linhas 680-760)
