 # Memory: ai-behavior/rag-force-legal-keywords-v1
 Updated: 2026-02-05
 
 ## Correção: RAG Forçado para Tópicos Jurídicos/Contratuais
 
 ### Problema
 A Sofia estava IGNORANDO o RAG em tópicos jurídicos críticos (multa rescisória, fidelidade, cancelamento) devido ao sistema de "smart filter" que pulava RAG quando não encontrava padrões de detecção específicos. Resultado: alucinações graves como "3 mensalidades" em vez da multa proporcional prevista em contrato.
 
 ### Solução Implementada
 
 **1. Legal Policy Regex (PRIORIDADE MÁXIMA)**
 Movida para o TOPO da função `shouldTriggerRAG()` em `rag-search-client.ts`:
 ```typescript
 const legalPolicyRegex = /(multa|rescis\w*|cancel\w*|fidelid\w*|contrat\w*|ades[aã]o|termos\s*(de\s*)?(ades[aã]o)?|cl[aá]usul\w*|car[eê]ncia|penalidad\w*|quebra\s*de\s*contrato|desfideliza\w*)/i;
 ```
 
 **2. Rule Memory Fix**
 Corrigido mapeamento de coluna `conditions` para `condition` (singular) e removida referência a coluna inexistente `valid_until`.
 
 **3. Audit Logging**
 Adicionados logs `[RAG-AUDIT]` para monitorar todas as decisões de trigger/skip do RAG.
 
 ### Arquivos Modificados
 - `supabase/functions/_shared/rag-search-client.ts` - Regex de legal/policy no TOPO
 - `supabase/functions/_shared/rule-memory-injector.ts` - Fix de schema
 
 ### Verificação
 Query "qual é a multa rescisória se eu cancelar antes da fidelidade?" agora retorna KB_06 com a informação correta: "A multa é proporcional ao saldo remanescente."