import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useConfiguracoes } from '@/hooks/useConfiguracoes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FileText, FileCheck, Image, File, Loader2, CheckCircle2, Clock, ExternalLink } from 'lucide-react';

interface DocumentsData {
  // From chatbot_conversas
  arquivos_anexados: string[];
  docs_received_whatsapp: string[];
  docs_received_page: string[];
  contrato_assinado: boolean;
  contrato_enviado_at: string | null;
  contrato_assinado_at: string | null;
  // From solicitacoes_proposta_definitiva
  documento_identificacao_url: string | null;
  conta_luz_url: string | null;
  contrato_social_url: string | null;
  // From propostas_assinantes
  proposta_status: string | null;
  pdf_url: string | null;
}

interface DocumentsCellProps {
  telefone: string | null;
  bitrixLeadId: string | null;
  propostaId?: string | null;
}

const DOC_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  fatura: { label: 'Fatura', icon: <FileText className="h-3 w-3" /> },
  identidade: { label: 'Identidade', icon: <Image className="h-3 w-3" /> },
  contrato_social: { label: 'Contrato Social', icon: <File className="h-3 w-3" /> },
  comprovante_residencia: { label: 'Comprov. Residência', icon: <File className="h-3 w-3" /> },
};

export function DocumentsCell({ telefone, bitrixLeadId, propostaId }: DocumentsCellProps) {
  const { configs } = useConfiguracoes();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentsData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [foundBitrixLeadId, setFoundBitrixLeadId] = useState<string | null>(bitrixLeadId);

  // Load documents on mount to show badge count
  useEffect(() => {
    if ((telefone || bitrixLeadId || propostaId) && !documents) {
      loadDocuments();
    }
  }, [telefone, bitrixLeadId, propostaId]);

  const loadDocuments = async () => {
    if (!telefone && !bitrixLeadId && !propostaId) return;
    
    setLoading(true);
    try {
      const result: DocumentsData = {
        arquivos_anexados: [],
        docs_received_whatsapp: [],
        docs_received_page: [],
        contrato_assinado: false,
        contrato_enviado_at: null,
        contrato_assinado_at: null,
        documento_identificacao_url: null,
        conta_luz_url: null,
        contrato_social_url: null,
        proposta_status: null,
        pdf_url: null,
      };

      const normalizedPhone = telefone?.replace(/\D/g, '') || '';
      const phoneVariants = normalizedPhone ? [
        normalizedPhone,
        `55${normalizedPhone}`,
        normalizedPhone.startsWith('55') ? normalizedPhone.slice(2) : null,
      ].filter(Boolean) : [];

      // 1. Try chatbot_conversas
      if (bitrixLeadId || phoneVariants.length > 0) {
        let query = supabase
          .from('chatbot_conversas')
          .select('arquivos_anexados, docs_received_whatsapp, docs_received_page, contrato_assinado, contrato_enviado_at, contrato_assinado_at');

        if (bitrixLeadId) {
          query = query.eq('bitrix24_lead_id', bitrixLeadId);
        } else if (phoneVariants.length > 0) {
          query = query.or(phoneVariants.map(p => `cliente_telefone.eq.${p}`).join(','));
        }

        const { data: conversaData } = await query.order('created_at', { ascending: false }).limit(1).single();

        if (conversaData) {
          const toStringArray = (arr: unknown): string[] => {
            if (!Array.isArray(arr)) return [];
            return arr.filter((item): item is string => typeof item === 'string');
          };

          result.arquivos_anexados = toStringArray(conversaData.arquivos_anexados);
          result.docs_received_whatsapp = toStringArray(conversaData.docs_received_whatsapp);
          result.docs_received_page = toStringArray(conversaData.docs_received_page);
          result.contrato_assinado = conversaData.contrato_assinado || false;
          result.contrato_enviado_at = conversaData.contrato_enviado_at;
          result.contrato_assinado_at = conversaData.contrato_assinado_at;
        }
      }

      // 2. Try propostas_assinantes to get proposta_id, status and bitrix_lead_id
      let foundPropostaId = propostaId;
      let resolvedBitrixLeadId = bitrixLeadId;
      
      if (bitrixLeadId || phoneVariants.length > 0) {
        let propostaQuery = supabase
          .from('propostas_assinantes')
          .select('id, status, pdf_url, bitrix24_lead_id');

        if (bitrixLeadId) {
          propostaQuery = propostaQuery.eq('bitrix24_lead_id', bitrixLeadId);
        } else if (phoneVariants.length > 0) {
          propostaQuery = propostaQuery.or(phoneVariants.map(p => `cliente_telefone.ilike.%${p.slice(-9)}%`).join(','));
        }

        const { data: propostaData } = await propostaQuery.order('created_at', { ascending: false }).limit(1).single();

        if (propostaData) {
          result.proposta_status = propostaData.status;
          result.pdf_url = propostaData.pdf_url;
          if (!foundPropostaId) foundPropostaId = propostaData.id;
          if (!resolvedBitrixLeadId && propostaData.bitrix24_lead_id) {
            resolvedBitrixLeadId = propostaData.bitrix24_lead_id;
          }
        }
      }
      
      // Update the resolved bitrix lead id for the "Open in Bitrix" button
      if (resolvedBitrixLeadId) {
        setFoundBitrixLeadId(resolvedBitrixLeadId);
      }

      // 3. Try solicitacoes_proposta_definitiva
      if (foundPropostaId || phoneVariants.length > 0) {
        let solicitacaoQuery = supabase
          .from('solicitacoes_proposta_definitiva')
          .select('documento_identificacao_url, conta_luz_url, contrato_social_url');

        if (foundPropostaId) {
          solicitacaoQuery = solicitacaoQuery.eq('proposta_inicial_id', foundPropostaId);
        } else if (phoneVariants.length > 0) {
          solicitacaoQuery = solicitacaoQuery.or(phoneVariants.map(p => `cliente_telefone.ilike.%${p.slice(-9)}%`).join(','));
        }

        const { data: solicitacaoData } = await solicitacaoQuery.order('created_at', { ascending: false }).limit(1).single();

        if (solicitacaoData) {
          result.documento_identificacao_url = solicitacaoData.documento_identificacao_url;
          result.conta_luz_url = solicitacaoData.conta_luz_url;
          result.contrato_social_url = solicitacaoData.contrato_social_url;
        }
      }

      setDocuments(result);
    } catch (error) {
      console.error('Error loading documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDocumentCount = () => {
    if (!documents) return { count: 0, hasContract: false, isAccepted: false };
    
    let count = 0;
    
    // Count from chatbot
    const allChatDocs = new Set([
      ...documents.arquivos_anexados,
      ...documents.docs_received_whatsapp,
      ...documents.docs_received_page,
    ]);
    count += allChatDocs.size;
    
    // Count from solicitacoes
    if (documents.documento_identificacao_url) count++;
    if (documents.conta_luz_url) count++;
    if (documents.contrato_social_url) count++;
    
    const hasContract = documents.contrato_assinado || documents.proposta_status === 'aceita';
    const isAccepted = documents.proposta_status === 'aceita';
    
    return { count, hasContract, isAccepted };
  };

  const preview = documents ? getDocumentCount() : null;

  const getAllDocuments = () => {
    if (!documents) return [];
    
    const docs: { name: string; label: string; source: string; url?: string }[] = [];
    
    // From chatbot
    const chatDocs = new Set([
      ...documents.arquivos_anexados,
      ...documents.docs_received_whatsapp,
      ...documents.docs_received_page,
    ]);
    
    chatDocs.forEach(doc => {
      const sources: string[] = [];
      if (documents.docs_received_whatsapp.includes(doc)) sources.push('WhatsApp');
      if (documents.docs_received_page.includes(doc)) sources.push('Portal');
      if (sources.length === 0) sources.push('Anexado');
      
      docs.push({
        name: doc,
        label: DOC_LABELS[doc]?.label || doc,
        source: sources.join(', '),
      });
    });
    
    // From solicitacoes (only if not already in chatDocs)
    if (documents.documento_identificacao_url && !chatDocs.has('identidade')) {
      docs.push({
        name: 'identidade',
        label: 'Documento de Identificação',
        source: 'Portal',
        url: documents.documento_identificacao_url,
      });
    }
    
    if (documents.conta_luz_url && !chatDocs.has('fatura')) {
      docs.push({
        name: 'fatura',
        label: 'Conta de Luz',
        source: 'Portal',
        url: documents.conta_luz_url,
      });
    }
    
    if (documents.contrato_social_url && !chatDocs.has('contrato_social')) {
      docs.push({
        name: 'contrato_social',
        label: 'Contrato Social',
        source: 'Portal',
        url: documents.contrato_social_url,
      });
    }
    
    return docs;
  };

  const openStorageUrl = async (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data?.publicUrl) {
      window.open(data.publicUrl, '_blank');
    }
  };

  // If no documents and not loading, show nothing
  if (!loading && (!documents || (preview && preview.count === 0 && !preview.hasContract))) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : preview && preview.count > 0 ? (
            <>
              <FileText className="h-3.5 w-3.5" />
              <Badge variant="secondary" className="h-5 px-1.5 text-xs font-medium">
                {preview.count}
              </Badge>
              {preview.hasContract && (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              )}
            </>
          ) : preview?.hasContract ? (
            <>
              <FileCheck className="h-3.5 w-3.5 text-green-600" />
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            </>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Documentos Anexados
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !documents ? (
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Nenhum documento encontrado</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Documents List */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Documentos Recebidos</h4>
              {getAllDocuments().length > 0 ? (
                <div className="space-y-2">
                  {getAllDocuments().map((doc) => {
                    const docInfo = DOC_LABELS[doc.name] || { label: doc.label, icon: <File className="h-3 w-3" /> };
                    return (
                      <div
                        key={doc.name}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-primary/10 rounded">
                            {docInfo.icon}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{doc.label}</p>
                            <p className="text-xs text-muted-foreground">
                              Via: {doc.source}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => openStorageUrl(doc.url!)}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Badge variant="outline" className="text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
                            Recebido
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic p-3 bg-muted/30 rounded-lg">
                  Nenhum documento recebido ainda
                </p>
              )}
            </div>

            {/* Contract Status */}
            <div className="space-y-2 pt-2 border-t">
              <h4 className="text-sm font-medium text-muted-foreground">Status do Contrato</h4>
              {documents.contrato_assinado || documents.proposta_status === 'aceita' ? (
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-green-100 rounded">
                      <FileCheck className="h-4 w-4 text-green-700" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-green-800">
                        {documents.contrato_assinado ? 'Contrato Assinado' : 'Proposta Aceita'}
                      </p>
                      {documents.contrato_assinado_at && (
                        <p className="text-xs text-green-600">
                          Em: {new Date(documents.contrato_assinado_at).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge className="bg-green-600 hover:bg-green-600">
                    Concluído
                  </Badge>
                </div>
              ) : documents.contrato_enviado_at ? (
                <div className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-yellow-100 rounded">
                      <Clock className="h-4 w-4 text-yellow-700" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-yellow-800">Contrato Enviado</p>
                      <p className="text-xs text-yellow-600">
                        Em: {new Date(documents.contrato_enviado_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-yellow-400 text-yellow-700">
                    Aguardando
                  </Badge>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic p-3 bg-muted/30 rounded-lg">
                  Contrato ainda não enviado
                </p>
              )}
            </div>

            {/* Botão Abrir no Bitrix24 */}
            {foundBitrixLeadId && (
              <div className="pt-3 border-t">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full"
                  onClick={() => window.open(`${configs.bitrix24_base_url}/crm/lead/details/${foundBitrixLeadId}/`, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir Lead no Bitrix24
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
