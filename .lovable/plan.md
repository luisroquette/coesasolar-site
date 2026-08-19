

# Plano: Remover envio de link de proposta inicial via WhatsApp do Lovable

## Situação atual

O sistema tem **3 pontos** que ainda enviam links de proposta via WhatsApp (Z-API):

1. **`bitrix24-link-webhook/index.ts`** — Webhook que o Bitrix24 chama quando o campo de link é atualizado. Envia mensagem com o link via Z-API (tanto inicial quanto definitiva). **Este é o principal emissor.**

2. **`proposal-resend.ts` + `sofia-webhook/index.ts`** — Quando o cliente pede "cadê meu link?", a Sofia monta uma mensagem com o link e envia via `sendWhatsAppMessage` (linha 1147 do sofia-webhook).

3. **`proposal-link-sender.ts`** — Já desabilitado (só atualiza estado, não envia WhatsApp). ✅ Nada a fazer.

## Alterações

### 1. `bitrix24-link-webhook/index.ts` — Desabilitar envio WhatsApp
Este webhook é código Lovable que o Bitrix24 chama. Como vocês já pegam o link do campo do Bitrix e enviam por fora, este webhook inteiro de envio via Z-API é redundante.
- Remover o bloco de envio via Z-API (linhas ~579-650+)
- Manter o webhook funcional (ele faz logging e deduplicação), mas ao invés de enviar, apenas logar que o envio foi pulado
- Setar `whatsappSent: false` no log

### 2. `sofia-webhook/index.ts` — Remover reenvio automático de link (linhas ~1118-1169)
Quando o cliente pede "cadê meu link?", a Sofia busca a proposta e envia o link via WhatsApp. Remover esse envio direto.
- Em vez de enviar a mensagem com o link, deixar o fluxo continuar normalmente para que a Sofia responda via LLM (que pode orientar o cliente a verificar o WhatsApp ou o email)
- Alternativamente, manter a detecção mas não chamar `sendWhatsAppMessage` — apenas incluir o link no contexto para a Sofia mencionar na resposta

### 3. `proposal-resend.ts` — Simplificar (opcional)
Como não vai mais ser usado para envio direto, pode ser simplificado. Mas como é importado apenas pelo sofia-webhook, a alteração no item 2 já resolve.

## O que NÃO será alterado
- O salvamento do link no campo do Bitrix24 (isso continua funcionando normalmente)
- A geração da proposta e da URL
- A atualização de estados na conversa (`event_proposal_sent`, `proposta_link_sent_at`)
- Mapeamentos de estágio e leitura de dados do Bitrix

## Resumo
Após essas mudanças, o Lovable vai apenas **salvar o link no card do Bitrix24** e vocês cuidam do envio via automação do Bitrix. Nenhuma mensagem WhatsApp será enviada pelo código Lovable.

