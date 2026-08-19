import React, { useState, useCallback, useRef } from 'react';
import { Upload, X, FileText, Image, Loader2, CheckCircle2, Camera, Smartphone, Sparkles, AlertCircle, RefreshCw, AlertTriangle, Sun, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { trackDocumentSubmissionFromPage } from '@/lib/docs-tracking-utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { motion, AnimatePresence } from 'framer-motion';
import { validateImageQuality, isImageFile, ImageQualityResult, ImageQualityIssue } from '@/lib/image-quality-validator';
import { compressImageFile } from '@/lib/image-compressor';
import { useTitularidadeValidation, TitularidadeResult } from '@/hooks/useTitularidadeValidation';
import { FraudAlert, PJWarningAlert } from '@/components/FraudAlert';
import { useUIConfig } from '@/hooks/useUIConfig';

interface HistoricoConsumoItem {
  mes_ano: string;
  consumo_kwh: number;
}

interface ValidacaoTitular {
  documentos_mesmo_titular: boolean | null;
  cpf_identificacao: string | null;
  cpf_cnpj_conta: string | null;
  tipo_divergencia: 'cpf_diferente' | 'cnpj_pj' | 'dados_incompletos' | null;
  confianca_validacao: number | null;
}

interface ExtractedData {
  // Dados principais do RG/CNH
  nome_completo: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  
  // Dados adicionais do RG
  rg_numero: string | null;
  rg_orgao_emissor: string | null;
  rg_data_emissao: string | null;
  
  // Dados adicionais da CNH
  cnh_numero: string | null;
  cnh_categoria: string | null;
  cnh_validade: string | null;
  
  // Filiação e naturalidade
  nome_mae: string | null;
  nome_pai: string | null;
  naturalidade: string | null;
  nacionalidade: string | null;
  
  // Dados da conta de luz
  numero_uc: string | null;
  cpf_cnpj_titular: string | null;
  endereco: string | null;
  cep: string | null;
  cidade: string | null;
  uf: string | null;
  tipo_instalacao: string | null;
  classe_consumo: string | null;
  tipo_pessoa: 'PF' | 'PJ' | null;
  concessionaria: string | null;
  
  // Dados adicionais da fatura
  telefone_contato: string | null;
  email_contato: string | null;
  numero_cliente: string | null;
  data_vencimento: string | null;
  valor_fatura: number | null;
  
  // Campos especiais CEMIG
  cip_valor: number | null;
  recebe_energia_externa: boolean | null;
  energia_scee_kwh: number | null;
  tem_saldo_geracao: boolean | null;
  saldo_geracao_kwh: number | null;
  
  // Histórico de consumo
  historico_consumo?: HistoricoConsumoItem[];
  consumo_media_anual: number | null;
  consumo_media_trimestral: number | null;
  consumo_ultimo_mes: number | null;
  // Retrocompatibilidade
  consumo_kwh?: number | null;
  
  // Validação anti-fraude
  validacao_titular?: ValidacaoTitular;
}

interface ExtractionResult {
  sucesso: boolean;
  confianca: number;
  dados: ExtractedData;
  avisos: string[];
  erro: string | null;
}

interface DocumentUploadWithAIProps {
  propostaId: string;
  onExtractionComplete: (data: ExtractedData, documentUrls: { identificacao: string; contaLuz: string }) => void;
  onManualMode: () => void;
  onFraudDetected?: (data: { cpfIdentificacao: string | null; cpfCnpjConta: string | null; dadosExtraidos: ExtractedData }) => void;
}

interface UploadedDocument {
  name: string;
  url: string;
  storagePath: string;
  qualityResult?: ImageQualityResult;
}

export function DocumentUploadWithAI({ propostaId, onExtractionComplete, onManualMode, onFraudDetected }: DocumentUploadWithAIProps) {
  const isMobile = useIsMobile();
  const { uploadMaxSizeDefaultMb, uploadAllowedTypes } = useUIConfig();
  const [docIdentificacao, setDocIdentificacao] = useState<UploadedDocument | null>(null);
  const [docContaLuz, setDocContaLuz] = useState<UploadedDocument | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState<string>('');
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  
  // Anti-fraud state
  const [fraudDetected, setFraudDetected] = useState(false);
  const [isPJCase, setIsPJCase] = useState(false);
  const [validationData, setValidationData] = useState<{ cpfIdentificacao: string | null; cpfCnpjConta: string | null } | null>(null);
  
  const identificacaoInputRef = useRef<HTMLInputElement>(null);
  const contaLuzInputRef = useRef<HTMLInputElement>(null);
  const cameraIdentificacaoRef = useRef<HTMLInputElement>(null);
  const cameraContaLuzRef = useRef<HTMLInputElement>(null);


  const uploadToStorage = async (file: File, path: string): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${path}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('documentos-clientes')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (error) throw error;
    return data.path;
  };

  const handleFileUpload = async (
    file: File, 
    type: 'identificacao' | 'contaLuz'
  ) => {
    try {
      // Validate file size - from config
      const maxSize = uploadMaxSizeDefaultMb * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error(`Arquivo muito grande. Máximo ${uploadMaxSizeDefaultMb}MB.`);
        return;
      }

      if (!uploadAllowedTypes.includes(file.type)) {
        toast.error('Tipo de arquivo não permitido. Use PDF, JPG ou PNG.');
        return;
      }

      // Validate image quality before upload (only for images)
      let qualityResult: ImageQualityResult | undefined;
      
      if (isImageFile(file)) {
        toast.loading('Verificando qualidade da imagem...', { id: `quality-${type}` });
        
        qualityResult = await validateImageQuality(file, type);
        
        toast.dismiss(`quality-${type}`);
        
        // If quality is too low, warn but still allow upload
        if (!qualityResult.isValid) {
          const errorIssues = qualityResult.issues.filter(i => i.severity === 'error');
          if (errorIssues.length > 0) {
            toast.error(
              `Problemas na imagem: ${errorIssues.map(i => i.message).join(' ')}`,
              { duration: 6000 }
            );
          }
        } else if (qualityResult.issues.length > 0) {
          toast.warning(
            `Atenção: ${qualityResult.issues[0].message}`,
            { duration: 4000 }
          );
        }
      }

      // Compress image before upload (PDFs skip compression)
      let fileToUpload = file;
      if (isImageFile(file)) {
        toast.loading('Comprimindo imagem...', { id: `compress-${type}` });
        fileToUpload = await compressImageFile(file);
        toast.dismiss(`compress-${type}`);
      }

      toast.loading('Enviando arquivo...', { id: `upload-${type}` });

      // Upload to storage
      const uploadPath = type === 'identificacao' 
        ? `solicitacoes/${propostaId}/identificacao`
        : `solicitacoes/${propostaId}/conta-luz`;
      
      const storagePath = await uploadToStorage(fileToUpload, uploadPath);

      const doc: UploadedDocument = {
        name: file.name,
        url: storagePath,
        storagePath: storagePath,
        qualityResult
      };

      if (type === 'identificacao') {
        setDocIdentificacao(doc);
      } else {
        setDocContaLuz(doc);
      }

      toast.success('Arquivo enviado!', { id: `upload-${type}` });
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao enviar arquivo. Tente novamente.', { id: `upload-${type}` });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'identificacao' | 'contaLuz') => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file, type);
    }
  };

  const removeDocument = (type: 'identificacao' | 'contaLuz') => {
    if (type === 'identificacao') {
      setDocIdentificacao(null);
    } else {
      setDocContaLuz(null);
    }
    setExtractionResult(null);
  };

  const resetForNewDocuments = () => {
    setDocIdentificacao(null);
    setDocContaLuz(null);
    setExtractionResult(null);
    setFraudDetected(false);
    setIsPJCase(false);
    setValidationData(null);
  };

  const handleContactSupport = async () => {
    // Buscar WhatsApp dinâmico do banco
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'whatsapp_numero')
      .single();
    
    const whatsappNumber = configData?.valor || '5531936180487';
    const message = encodeURIComponent('Olá! Preciso de ajuda com a validação dos meus documentos para a proposta de energia solar.');
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank');
  };

  const extractDataWithAI = async () => {
    if (!docIdentificacao || !docContaLuz) return;

    setIsExtracting(true);
    setExtractionResult(null);
    setFraudDetected(false);
    setIsPJCase(false);

    const statusMessages = [
      'Analisando documento de identificação...',
      'Lendo conta de luz...',
      'Extraindo informações...',
      'Validando titularidade...'
    ];

    let statusIndex = 0;
    const statusInterval = setInterval(() => {
      statusIndex = (statusIndex + 1) % statusMessages.length;
      setExtractionStatus(statusMessages[statusIndex]);
    }, 2000);

    setExtractionStatus(statusMessages[0]);

    const invokeExtraction = async (attempt: number) => {
      console.log(`[Extração] Tentativa ${attempt}/2`);
      const { data, error } = await supabase.functions.invoke('extrair-dados-documentos', {
        body: {
          documentoIdentificacaoPath: docIdentificacao.storagePath,
          contaLuzPath: docContaLuz.storagePath
        }
      });

      if (error) {
        const errorMsg = error.message || '';
        // Detect "Failed to send a request" - retry once
        if (attempt === 1 && (errorMsg.includes('Failed to send a request') || errorMsg.includes('FunctionsFetchError'))) {
          console.warn('[Extração] Erro de conexão, tentando novamente em 3s...');
          setExtractionStatus('Reconectando... Tentando novamente...');
          await new Promise(r => setTimeout(r, 3000));
          return invokeExtraction(2);
        }
        throw new Error(errorMsg || 'Erro ao processar documentos');
      }
      return data;
    };

    try {
      const data = await invokeExtraction(1);

      clearInterval(statusInterval);

      const result = data as ExtractionResult;
      setExtractionResult(result);

      // Check for fraud (titularity validation)
      const validacao = result.dados?.validacao_titular;
      
      if (validacao) {
        setValidationData({
          cpfIdentificacao: validacao.cpf_identificacao || result.dados?.cpf,
          cpfCnpjConta: validacao.cpf_cnpj_conta || result.dados?.cpf_cnpj_titular
        });

        // FRAUD DETECTED: Different CPFs
        if (validacao.documentos_mesmo_titular === false && validacao.tipo_divergencia === 'cpf_diferente') {
          setFraudDetected(true);
          toast.error('Os documentos apresentam titulares diferentes. Verifique os documentos enviados.');
          
          // Log fraud attempt
          if (onFraudDetected) {
            onFraudDetected({
              cpfIdentificacao: validacao.cpf_identificacao,
              cpfCnpjConta: validacao.cpf_cnpj_conta,
              dadosExtraidos: result.dados
            });
          }
          
          // Save fraud alert to database
          await supabase.from('fraude_alertas').insert({
            proposta_id: propostaId,
            cpf_identificacao: validacao.cpf_identificacao,
            cpf_cnpj_conta: validacao.cpf_cnpj_conta,
            tipo_alerta: 'cpf_diferente',
            dados_extraidos: result.dados as any,
            user_agent: navigator.userAgent
          });
          
          return; // Don't proceed with extraction
        }

        // PJ case: Allow with warning
        if (validacao.tipo_divergencia === 'cnpj_pj') {
          setIsPJCase(true);
          toast.warning('Conta de Pessoa Jurídica detectada. A validação será feita posteriormente.');
        }
      }

      if (result.sucesso && result.confianca >= 50) {
        toast.success(`Dados extraídos com ${result.confianca}% de confiança!`);
        
        // Track document submission from page
        trackDocumentSubmissionFromPage(propostaId, [
          { type: 'identificacao', fileName: docIdentificacao.name },
          { type: 'conta_luz', fileName: docContaLuz.name }
        ]);
        
        onExtractionComplete(result.dados, {
          identificacao: docIdentificacao.url,
          contaLuz: docContaLuz.url
        });
      } else if (result.sucesso && result.confianca < 50) {
        toast.warning('Alguns dados foram extraídos, mas com baixa confiança. Verifique os campos.');
        
        // Track document submission from page (even with low confidence)
        trackDocumentSubmissionFromPage(propostaId, [
          { type: 'identificacao', fileName: docIdentificacao.name },
          { type: 'conta_luz', fileName: docContaLuz.name }
        ]);
        
        onExtractionComplete(result.dados, {
          identificacao: docIdentificacao.url,
          contaLuz: docContaLuz.url
        });
      } else {
        toast.error(result.erro || 'Não foi possível extrair os dados. Preencha manualmente.');
      }
    } catch (error) {
      clearInterval(statusInterval);
      console.error('Extraction error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Erro ao processar documentos';
      const isConnectionError = errorMsg.includes('Failed to send a request') || errorMsg.includes('FunctionsFetchError');
      
      setExtractionResult({
        sucesso: false,
        confianca: 0,
        dados: {} as ExtractedData,
        avisos: [],
        erro: isConnectionError 
          ? 'Falha na conexão com o servidor. Tente enviar fotos/imagens em vez de PDFs digitais, ou tente novamente.' 
          : errorMsg
      });
      toast.error(
        isConnectionError 
          ? 'Falha na conexão. Tente enviar imagens menores (fotos em vez de PDFs).' 
          : 'Erro ao processar documentos. Tente novamente ou preencha manualmente.'
      );
    } finally {
      setIsExtracting(false);
      setExtractionStatus('');
    }
  };

  const bothDocumentsUploaded = docIdentificacao && docContaLuz;

  const QualityAlert = ({ issues, score }: { issues: ImageQualityIssue[]; score: number }) => {
    if (issues.length === 0) return null;
    
    const hasErrors = issues.some(i => i.severity === 'error');
    
    const getIcon = (type: ImageQualityIssue['type']) => {
      switch (type) {
        case 'dark': return <Sun className="h-3.5 w-3.5" />;
        case 'bright': return <Sun className="h-3.5 w-3.5" />;
        case 'blurry': return <Eye className="h-3.5 w-3.5" />;
        case 'small':
        case 'cropped': return <AlertTriangle className="h-3.5 w-3.5" />;
        default: return <AlertCircle className="h-3.5 w-3.5" />;
      }
    };
    
    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className={cn(
          "rounded-lg p-3 space-y-2 text-sm",
          hasErrors 
            ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" 
            : "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
        )}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className={cn(
            "h-4 w-4",
            hasErrors ? "text-red-600" : "text-amber-600"
          )} />
          <span className={cn(
            "font-medium",
            hasErrors ? "text-red-800 dark:text-red-200" : "text-amber-800 dark:text-amber-200"
          )}>
            {hasErrors ? 'Problemas na imagem' : 'Atenção'} (Qualidade: {score}%)
          </span>
        </div>
        <ul className="space-y-1 ml-6">
          {issues.map((issue, idx) => (
            <li 
              key={idx} 
              className={cn(
                "flex items-start gap-2 text-xs",
                issue.severity === 'error' 
                  ? "text-red-700 dark:text-red-300" 
                  : "text-amber-700 dark:text-amber-300"
              )}
            >
              {getIcon(issue.type)}
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
        {hasErrors && (
          <p className="text-xs text-red-600 dark:text-red-400 ml-6">
            Recomendamos tirar uma nova foto com melhor qualidade.
          </p>
        )}
      </motion.div>
    );
  };

  const DocumentUploadCard = ({ 
    type, 
    title, 
    description, 
    document, 
    inputRef, 
    cameraRef 
  }: { 
    type: 'identificacao' | 'contaLuz';
    title: string;
    description: string;
    document: UploadedDocument | null;
    inputRef: React.RefObject<HTMLInputElement>;
    cameraRef: React.RefObject<HTMLInputElement>;
  }) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-foreground">{title}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {document && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeDocument(type)}
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {document ? (
        <div className="space-y-2">
          <div className={cn(
            "flex items-center gap-3 p-3 rounded-lg border",
            document.qualityResult && !document.qualityResult.isValid
              ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
              : "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
          )}>
            {document.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
              <Image className="h-6 w-6 text-blue-500" />
            ) : (
              <FileText className="h-6 w-6 text-red-500" />
            )}
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-medium truncate",
                document.qualityResult && !document.qualityResult.isValid
                  ? "text-amber-800 dark:text-amber-200"
                  : "text-green-800 dark:text-green-200"
              )}>
                {document.name}
              </p>
              <p className={cn(
                "text-xs flex items-center gap-1",
                document.qualityResult && !document.qualityResult.isValid
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-green-600 dark:text-green-400"
              )}>
                <CheckCircle2 className="h-3 w-3" />
                Enviado
                {document.qualityResult && (
                  <span className="ml-1">
                    • Qualidade: {document.qualityResult.score}%
                  </span>
                )}
              </p>
            </div>
          </div>
          
          {/* Quality issues alert */}
          <AnimatePresence>
            {document.qualityResult && document.qualityResult.issues.length > 0 && (
              <QualityAlert 
                issues={document.qualityResult.issues} 
                score={document.qualityResult.score}
              />
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="space-y-2">
          {/* File input area */}
          <div 
            onClick={() => inputRef.current?.click()}
            className="relative border-2 border-dashed rounded-lg p-4 transition-all duration-200 cursor-pointer hover:border-primary hover:bg-primary/5 border-muted-foreground/25"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => handleInputChange(e, type)}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2 text-center">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Clique para selecionar
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, JPG ou PNG • Máx 10MB
                </p>
              </div>
            </div>
          </div>

          {/* Camera option for mobile */}
          {isMobile ? (
            <div>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handleInputChange(e, type)}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => cameraRef.current?.click()}
                className="w-full"
              >
                <Camera className="h-4 w-4 mr-2" />
                Tirar Foto
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
              <Smartphone className="h-4 w-4" />
              <span>Para tirar uma foto, acesse pelo celular</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-emerald-600" />
          Upload de Documentos com IA
        </CardTitle>
        <CardDescription>
          Envie seus documentos e nossa IA irá preencher o formulário automaticamente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 text-sm">
          <div className={cn(
            "flex items-center gap-1 px-3 py-1 rounded-full",
            docIdentificacao ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
          )}>
            <span className="font-semibold">1.</span> Documento de ID
            {docIdentificacao && <CheckCircle2 className="h-4 w-4" />}
          </div>
          <div className="w-4 h-0.5 bg-muted-foreground/30" />
          <div className={cn(
            "flex items-center gap-1 px-3 py-1 rounded-full",
            docContaLuz ? "bg-green-100 text-green-800" : !docIdentificacao ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-800"
          )}>
            <span className="font-semibold">2.</span> Conta de Luz
            {docContaLuz && <CheckCircle2 className="h-4 w-4" />}
          </div>
          <div className="w-4 h-0.5 bg-muted-foreground/30" />
          <div className={cn(
            "flex items-center gap-1 px-3 py-1 rounded-full",
            extractionResult?.sucesso ? "bg-green-100 text-green-800" : !bothDocumentsUploaded ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-800"
          )}>
            <span className="font-semibold">3.</span> Extrair
            {extractionResult?.sucesso && <CheckCircle2 className="h-4 w-4" />}
          </div>
        </div>

        {/* Document uploads */}
        <div className="grid gap-6 md:grid-cols-2">
          <DocumentUploadCard
            type="identificacao"
            title="Documento de Identificação"
            description="RG, CNH ou Procuração"
            document={docIdentificacao}
            inputRef={identificacaoInputRef}
            cameraRef={cameraIdentificacaoRef}
          />
          <DocumentUploadCard
            type="contaLuz"
            title="Última Conta de Luz"
            description="Fatura de energia mais recente"
            document={docContaLuz}
            inputRef={contaLuzInputRef}
            cameraRef={cameraContaLuzRef}
          />
        </div>

        {/* Fraud Alert */}
        <AnimatePresence>
          {fraudDetected && validationData && (
            <FraudAlert
              cpfIdentificacao={validationData.cpfIdentificacao}
              cpfCnpjConta={validationData.cpfCnpjConta}
              onRetry={resetForNewDocuments}
              onContactSupport={handleContactSupport}
            />
          )}
        </AnimatePresence>

        {/* PJ Warning */}
        <AnimatePresence>
          {isPJCase && validationData && !fraudDetected && (
            <PJWarningAlert
              cpfIdentificacao={validationData.cpfIdentificacao}
              cnpjConta={validationData.cpfCnpjConta}
            />
          )}
        </AnimatePresence>

        {/* AI Extraction */}
        <AnimatePresence mode="wait">
          {bothDocumentsUploaded && !extractionResult && !fraudDetected && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Button
                type="button"
                onClick={extractDataWithAI}
                disabled={isExtracting}
                className="w-full h-12 text-lg bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    {extractionStatus}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" />
                    Extrair Dados com IA
                  </>
                )}
              </Button>
            </motion.div>
          )}

          {extractionResult && !extractionResult.sucesso && !fraudDetected && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {extractionResult.erro || 'Não foi possível extrair os dados dos documentos.'}
                </AlertDescription>
              </Alert>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={extractDataWithAI}
                  className="flex-1"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Tentar Novamente
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onManualMode}
                  className="flex-1"
                >
                  Preencher Manualmente
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Extraction warnings */}
        {extractionResult?.avisos && extractionResult.avisos.length > 0 && (
          <Alert className="bg-amber-50 border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <strong>Atenção:</strong> {extractionResult.avisos.join('. ')}
            </AlertDescription>
          </Alert>
        )}

        {/* Skip AI option */}
        {!extractionResult && (
          <div className="text-center pt-2 border-t">
            <button
              type="button"
              onClick={onManualMode}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              Prefiro preencher os dados manualmente
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
