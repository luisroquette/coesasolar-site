# Memory: business-logic/proposal-generation-rescue-e-endpoint-manual
Updated: now

## Fase 5 & 6 "Caso Edson" - Geração e Entrega Determinística de Proposta

### Flags de Controle (persistidas em `dados_coletados`)
- `proposal_generation_started_at`: Timestamp de quando a geração de proposta foi iniciada
- `proposal_rescue_attempts`: Contador de tentativas de resgate (máx 3)

### Lógica de Rescue Automático (Fase 5)
Implementada em `data-collection-phase.ts`:
1. Quando mínimos são completados, `proposal_generation_started_at` é marcado
2. Se após 120 segundos ainda não houver `proposta_id`:
   - Executa nova chamada a `syncToBitrix(forcarMovimentacao=true)` (idempotente)
   - Incrementa `proposal_rescue_attempts`
   - Cria `admin_notification` com tipo `proposal_rescue`
3. Máximo de 3 tentativas de resgate

### Sequência Garantida
1. **Dados mínimos completos** → syncToBitrix imediato
2. **Link da Proposta**: Entregue via `bitrix24-link-webhook`

### Endpoint Manual de Resgate (Fase 6)
`supabase/functions/stuck-lead-rescue/index.ts`

**Uso:**
```bash
POST /stuck-lead-rescue
Body: { "phone": "5531999999999" }  # ou { "conversaId": "uuid" }
Body: { "phone": "...", "dryRun": true }  # para simular sem executar
```

**Ações:**
1. Lê conversa + dados_coletados
2. Se mínimos completos e stage != PROPOSTA_INICIAL → força stage
3. Se mínimos completos e sem proposta_id → força geração via syncToBitrix
4. Define `pending_task='proposta_inicial'` como backup
5. Cria `admin_notification` com resultado

**Resposta:**
```json
{
  "success": true,
  "conversaId": "uuid",
  "actions": ["CHECK: Minimum data is COMPLETE", "FIX_STAGE: null → UC_9SLRPP", ...],
  "errors": [],
  "data": { "nome": "...", "email": "...", "distribuidora": "...", ... }
}
```

### Observabilidade
- `[STUCK_LEAD_RESCUE]` logs rastreiam todas as operações de resgate manual
- `[PROPOSAL_RESCUE]` logs rastreiam tentativas de resgate automático
- `admin_notifications` com tipos: `proposal_rescue`, `rescue_incomplete_data`, `lead_rescue`
- Flags persistidas no JSONB para auditoria completa
