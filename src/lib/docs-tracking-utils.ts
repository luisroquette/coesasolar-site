import { supabase } from '@/integrations/supabase/client';

interface DocReceivedPage {
  type: 'contrato_social' | 'identificacao' | 'conta_luz' | 'identificacao_admin';
  receivedAt: string;
  fileName?: string;
}

/**
 * Get friendly document type name in Portuguese
 */
function getDocTypeName(type: DocReceivedPage['type']): string {
  const names: Record<DocReceivedPage['type'], string> = {
    contrato_social: 'Contrato Social',
    identificacao: 'Documento de Identificação',
    conta_luz: 'Conta de Luz',
    identificacao_admin: 'Documento do Administrador'
  };
  return names[type] || type;
}

/**
 * Build a friendly message listing received documents
 */
function buildDocReceivedMessage(documents: { type: DocReceivedPage['type']; fileName?: string }[], clienteNome?: string): string {
  const docNames = documents.map(d => getDocTypeName(d.type));
  const docList = docNames.length === 1 
    ? docNames[0] 
    : docNames.slice(0, -1).join(', ') + ' e ' + docNames[docNames.length - 1];
  
  const greeting = clienteNome ? `Olá, ${clienteNome.split(' ')[0]}! ` : '';
  
  return `${greeting}Recebi seu${documents.length > 1 ? 's' : ''} documento${documents.length > 1 ? 's' : ''}: *${docList}* ✅

Vou analisar tudo e já te dou um retorno! Qualquer dúvida, estou por aqui. 😊`;
}

/**
 * Send WhatsApp notification to client confirming document receipt
 */
async function notifyClientViaWhatsApp(
  clienteTelefone: string,
  clienteNome: string | null,
  documents: { type: DocReceivedPage['type']; fileName?: string }[],
  conversaId: string
): Promise<void> {
  try {
    const message = buildDocReceivedMessage(documents, clienteNome || undefined);
    
    console.log('[DocsTracking] Sending WhatsApp confirmation to:', clienteTelefone);
    
    const { error } = await supabase.functions.invoke('z-api-send-message', {
      body: {
        phone: clienteTelefone,
        message: message,
        conversaId: conversaId
      }
    });

    if (error) {
      console.error('[DocsTracking] Error sending WhatsApp notification:', error);
    } else {
      console.log('[DocsTracking] WhatsApp confirmation sent successfully');
    }
  } catch (error) {
    console.error('[DocsTracking] Failed to send WhatsApp notification:', error);
  }
}

/**
 * Track document submission from the public proposal page
 * Updates docs_source to 'page' or 'mixed' based on existing data
 * Sends WhatsApp notification to client confirming receipt
 */
export async function trackDocumentSubmissionFromPage(
  propostaId: string,
  documents: {
    type: DocReceivedPage['type'];
    fileName?: string;
  }[]
): Promise<void> {
  try {
    // Find conversation associated with this proposal
    const { data: conversa, error: findError } = await supabase
      .from('chatbot_conversas')
      .select('id, docs_source, docs_received_whatsapp, docs_received_page, first_doc_received_at, cliente_telefone, cliente_nome')
      .eq('proposta_id', propostaId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) {
      console.error('Error finding conversation for proposal:', findError);
      return;
    }

    if (!conversa) {
      console.log('No conversation found for proposal:', propostaId, '- skipping docs tracking');
      return;
    }

    // Build updated docs_received_page array
    // The JSONB field may be null or an array - handle safely
    const rawDocsPage = conversa.docs_received_page;
    const parsedDocsPage: DocReceivedPage[] = [];
    
    if (rawDocsPage && Array.isArray(rawDocsPage)) {
      for (const item of rawDocsPage) {
        if (item && typeof item === 'object' && 'type' in item && 'receivedAt' in item) {
          parsedDocsPage.push(item as unknown as DocReceivedPage);
        }
      }
    }

    const now = new Date().toISOString();
    
    const newDocs: DocReceivedPage[] = documents.map(doc => ({
      type: doc.type,
      receivedAt: now,
      fileName: doc.fileName
    }));

    const updatedDocsPage = [...parsedDocsPage, ...newDocs];

    // Determine docs_source
    const rawDocsWhatsApp = conversa.docs_received_whatsapp;
    const hasWhatsAppDocs = rawDocsWhatsApp && Array.isArray(rawDocsWhatsApp) && rawDocsWhatsApp.length > 0;
    
    let newDocsSource: 'page' | 'whatsapp' | 'mixed' = 'page';
    
    if (hasWhatsAppDocs || conversa.docs_source === 'whatsapp') {
      newDocsSource = 'mixed';
    }

    // Build update data
    const updateData: Record<string, unknown> = {
      docs_received_page: updatedDocsPage,
      docs_source: newDocsSource,
    };

    // Track first document timestamp if not already set
    if (!conversa.first_doc_received_at && parsedDocsPage.length === 0) {
      updateData.first_doc_received_at = now;
    }

    // Update conversation
    const { error: updateError } = await supabase
      .from('chatbot_conversas')
      .update(updateData)
      .eq('id', conversa.id);

    if (updateError) {
      console.error('Error updating conversation docs tracking:', updateError);
      return;
    }

    console.log('Docs tracking updated for proposal:', propostaId, {
      docs_source: newDocsSource,
      docs_received_page: updatedDocsPage.length
    });

    // Send WhatsApp notification if client phone is available
    if (conversa.cliente_telefone) {
      await notifyClientViaWhatsApp(
        conversa.cliente_telefone,
        conversa.cliente_nome,
        documents,
        conversa.id
      );
    } else {
      console.log('[DocsTracking] No client phone available, skipping WhatsApp notification');
    }
  } catch (error) {
    console.error('Error in trackDocumentSubmissionFromPage:', error);
  }
}
