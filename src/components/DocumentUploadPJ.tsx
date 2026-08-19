import React, { useState, useCallback, useRef } from 'react';
import { Upload, X, FileText, Image, Loader2, CheckCircle2, Camera, Sparkles, AlertCircle, RefreshCw, Building2, User, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { motion, AnimatePresence } from 'framer-motion';
import { validateImageQuality, isImageFile, ImageQualityResult } from '@/lib/image-quality-validator';
import { FraudAlertPJ } from '@/components/FraudAlertPJ';
import { type TipoFraudePJ } from '@/hooks/useTitularidadePJValidation';
import { trackDocumentSubmissionFromPage } from '@/lib/docs-tracking-utils';
import { useUIConfig } from '@/hooks/useUIConfig';

interface QuadroSocietarioItem {
  nome_completo: string;
  cpf_cnpj: string | null;
  participacao_percentual: number | null;
  tipo_socio: 'pessoa_fisica' | 'pessoa_juridica' | null;
  e_administrador: boolean | null;
}

interface DadosContratoSocial {
  // Dados da Empresa
  razao_social: string | null;
  cnpj: string | null;
  nire: string | null;
  inscricao_estadual: string | null;
  natureza_juridica: string | null;
  objeto_social: string | null;
  data_constituicao: string | null;
  
  // Sede
  sede_logradouro: string | null;
  sede_numero: string | null;
  sede_complemento: string | null;
  sede_bairro: string | null;
  sede_cidade: string | null;
  sede_uf: string | null;
  sede_cep: string | null;
  
  // Quadro Societario
  quadro_societario: QuadroSocietarioItem[];
  
  // Socio Administrador
  admin_nome_completo: string | null;
  admin_cpf: string | null;
  admin_rg: string | null;
  admin_rg_orgao: string | null;
  admin_data_nascimento: string | null;
  admin_estado_civil: string | null;
  admin_profissao: string | null;
  admin_nacionalidade: string | null;
  admin_endereco: string | null;
  admin_cidade: string | null;
  admin_uf: string | null;
  admin_cep: string | null;
  
  // Poderes
  poderes_plenos: boolean | null;
  requer_assinatura_conjunta: boolean | null;
  restricoes_poderes: string | null;
}

interface HistoricoConsumoItem {
  mes_ano: string;
  consumo_kwh: number;
}

interface DadosContaLuz {
  numero_uc: string | null;
  cpf_cnpj_titular: string | null;
  endereco: string | null;
  cep: string | null;
  cidade: string | null;
  uf: string | null;
  tipo_instalacao: string | null;
  concessionaria: string | null;
  historico_consumo?: HistoricoConsumoItem[];
  consumo_media_anual: number | null;
  consumo_media_trimestral: number | null;
  consumo_ultimo_mes: number | null;
  cip_valor: number | null;
}

interface DadosIdentificacaoAdmin {
  nome_completo: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  rg_numero: string | null;
  rg_orgao_emissor: string | null;
}

interface ExtractionResult<T> {
  sucesso: boolean;
  confianca: number;
  dados: T;
  avisos: string[];
  erro: string | null;
}

interface UploadedDocument {
  name: string;
  url: string;
  base64: string;
  qualityResult?: ImageQualityResult;
}

interface DocumentUploadPJProps {
  propostaId: string;
  onExtractionComplete: (data: {
    empresa: DadosContratoSocial;
    contaLuz: DadosContaLuz;
    adminValidado: boolean;
    documentUrls: {
      contratoSocial: string;
      identificacaoAdmin: string;
      contaLuz: string;
    };
  }) => void;
  onManualMode: () => void;
}

type ExtractionStep = 'upload' | 'extracting_contract' | 'extracting_id' | 'extracting_bill' | 'validating_cnpj' | 'validating' | 'complete';

export function DocumentUploadPJ({ propostaId, onExtractionComplete, onManualMode }: DocumentUploadPJProps) {
  const isMobile = useIsMobile();
  const { uploadMaxSizeContractMb, uploadAllowedTypes } = useUIConfig();
  
  // Document states
  const [docContratoSocial, setDocContratoSocial] = useState<UploadedDocument | null>(null);
  const [docIdentificacaoAdmin, setDocIdentificacaoAdmin] = useState<UploadedDocument | null>(null);
  const [docContaLuz, setDocContaLuz] = useState<UploadedDocument | null>(null);
  
  // Extraction states
  const [currentStep, setCurrentStep] = useState<ExtractionStep>('upload');
  const [extractionStatus, setExtractionStatus] = useState<string>('');
  
  // Extracted data
  const [dadosEmpresa, setDadosEmpresa] = useState<DadosContratoSocial | null>(null);
  const [dadosContaLuz, setDadosContaLuz] = useState<DadosContaLuz | null>(null);
  const [adminValidado, setAdminValidado] = useState(false);
  const [cpfMismatch, setCpfMismatch] = useState(false);
  
  // Fraud detection states (NEW)
  const [tipoFraudePJ, setTipoFraudePJ] = useState<TipoFraudePJ>(null);
  const [cpfDocumentoExtraido, setCpfDocumentoExtraido] = useState<string | null>(null);
  
  // Refs
  const contratoInputRef = useRef<HTMLInputElement>(null);
  const identificacaoInputRef = useRef<HTMLInputElement>(null);
  const contaLuzInputRef = useRef<HTMLInputElement>(null);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
    });
  };

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
    type: 'contratoSocial' | 'identificacaoAdmin' | 'contaLuz'
  ) => {
    try {
      const maxSize = uploadMaxSizeContractMb * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error(`Arquivo muito grande. Máximo ${uploadMaxSizeContractMb}MB.`);
        return;
      }

      if (!uploadAllowedTypes.includes(file.type)) {
        toast.error('Tipo de arquivo não permitido. Use PDF, JPG ou PNG.');
        return;
      }

      let qualityResult: ImageQualityResult | undefined;
      
      if (isImageFile(file)) {
        toast.loading('Verificando qualidade da imagem...', { id: `quality-${type}` });
        qualityResult = await validateImageQuality(file, type === 'identificacaoAdmin' ? 'identificacao' : 'contaLuz');
        toast.dismiss(`quality-${type}`);
      }

      toast.loading('Enviando arquivo...', { id: `upload-${type}` });

      const uploadPath = `solicitacoes/${propostaId}/${type}`;
      const storagePath = await uploadToStorage(file, uploadPath);
      const base64Data = await fileToBase64(file);

      const doc: UploadedDocument = {
        name: file.name,
        url: storagePath,
        base64: base64Data,
        qualityResult
      };

      if (type === 'contratoSocial') {
        setDocContratoSocial(doc);
      } else if (type === 'identificacaoAdmin') {
        setDocIdentificacaoAdmin(doc);
      } else {
        setDocContaLuz(doc);
      }

      toast.success('Arquivo enviado!', { id: `upload-${type}` });
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao enviar arquivo. Tente novamente.', { id: `upload-${type}` });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'contratoSocial' | 'identificacaoAdmin' | 'contaLuz') => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file, type);
    }
  };

  const removeDocument = (type: 'contratoSocial' | 'identificacaoAdmin' | 'contaLuz') => {
    if (type === 'contratoSocial') {
      setDocContratoSocial(null);
      setDadosEmpresa(null);
    } else if (type === 'identificacaoAdmin') {
      setDocIdentificacaoAdmin(null);
      setAdminValidado(false);
      setCpfDocumentoExtraido(null);
    } else {
      setDocContaLuz(null);
      setDadosContaLuz(null);
    }
    setCurrentStep('upload');
    setTipoFraudePJ(null);
    setCpfMismatch(false);
  };

  // Function to register fraud alert in database
  const registrarAlertaFraude = async (
    tipo: TipoFraudePJ,
    dadosExtraidos: Record<string, unknown>
  ) => {
    if (!tipo) return;

    try {
      const insertData = {
        proposta_id: propostaId,
        tipo_alerta: `pj_${tipo}`,
        dados_extraidos: dadosExtraidos as unknown as import('@/integrations/supabase/types').Json,
        cpf_identificacao: cpfDocumentoExtraido,
        cpf_cnpj_conta: dadosContaLuz?.cpf_cnpj_titular || dadosEmpresa?.cnpj
      };
      
      await supabase.from('fraude_alertas').insert(insertData);
      console.log('Fraud alert registered:', tipo);
    } catch (error) {
      console.error('Error registering fraud alert:', error);
    }
  };

  // Reset fraud state and allow retry
  const handleRetryDocuments = () => {
    setDocContratoSocial(null);
    setDocIdentificacaoAdmin(null);
    setDocContaLuz(null);
    setDadosEmpresa(null);
    setDadosContaLuz(null);
    setAdminValidado(false);
    setCpfMismatch(false);
    setTipoFraudePJ(null);
    setCpfDocumentoExtraido(null);
    setCurrentStep('upload');
    setExtractionStatus('');
  };

  const handleContactSupport = async () => {
    // Buscar WhatsApp dinâmico do banco
    const { data: configData } = await supabase
      .from('configuracoes_sistema')
      .select('valor')
      .eq('chave', 'whatsapp_numero')
      .single();
    
    const whatsappNumber = configData?.valor || '5531936180487';
    const message = encodeURIComponent('Olá! Preciso de ajuda com a solicitação de proposta PJ. Estou tendo problemas com a validação dos documentos.');
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank');
  };

  const extractContractData = async (): Promise<DadosContratoSocial | null> => {
    if (!docContratoSocial) return null;

    setCurrentStep('extracting_contract');
    setExtractionStatus('Analisando contrato social...');

    try {
      const { data, error } = await supabase.functions.invoke('extrair-dados-contrato-social', {
        body: { contratoSocialBase64: docContratoSocial.base64 }
      });

      if (error) throw new Error(error.message);

      const result = data as ExtractionResult<DadosContratoSocial>;
      
      if (result.sucesso && result.confianca >= 50) {
        setDadosEmpresa(result.dados);
        toast.success(`Dados da empresa extraidos com ${result.confianca}% de confianca!`);
        return result.dados;
      } else {
        toast.warning('Nao foi possivel extrair todos os dados. Verifique o documento.');
        return null;
      }
    } catch (error) {
      console.error('Contract extraction error:', error);
      toast.error('Erro ao extrair dados do contrato social.');
      return null;
    }
  };

  const validateAdminIdentity = async (empresaData: DadosContratoSocial): Promise<{ valid: boolean; cpfExtraido: string | null }> => {
    if (!docIdentificacaoAdmin) return { valid: false, cpfExtraido: null };

    setCurrentStep('extracting_id');
    setExtractionStatus('Validando identidade do administrador...');

    try {
      // Use the existing extraction function for ID
      const { data, error } = await supabase.functions.invoke('extrair-dados-documentos', {
        body: {
          documentoIdentificacaoBase64: docIdentificacaoAdmin.base64,
          contaLuzBase64: null // We'll extract bill separately
        }
      });

      if (error) throw new Error(error.message);

      const result = data as ExtractionResult<DadosIdentificacaoAdmin>;
      
      if (result.sucesso && result.dados?.cpf) {
        // Compare CPF from ID with CPF from contract
        const cpfFromId = result.dados.cpf.replace(/\D/g, '');
        const cpfFromContract = empresaData.admin_cpf?.replace(/\D/g, '') || '';
        
        setCpfDocumentoExtraido(cpfFromId);

        if (cpfFromId === cpfFromContract) {
          setAdminValidado(true);
          setCpfMismatch(false);
          toast.success('Administrador validado com sucesso!');
          return { valid: true, cpfExtraido: cpfFromId };
        } else {
          setCpfMismatch(true);
          setTipoFraudePJ('admin_cpf_divergente');
          
          // Register fraud alert
          await registrarAlertaFraude('admin_cpf_divergente', {
            cpf_documento: cpfFromId,
            cpf_admin_contrato: cpfFromContract,
            nome_admin_contrato: empresaData.admin_nome_completo,
            razao_social: empresaData.razao_social
          });
          
          toast.error('CPF do documento nao corresponde ao administrador do contrato social!');
          return { valid: false, cpfExtraido: cpfFromId };
        }
      } else {
        setTipoFraudePJ('dados_incompletos');
        toast.warning('Nao foi possivel ler o CPF do documento. Verifique a qualidade.');
        return { valid: false, cpfExtraido: null };
      }
    } catch (error) {
      console.error('ID validation error:', error);
      toast.error('Erro ao validar documento de identificacao.');
      return { valid: false, cpfExtraido: null };
    }
  };

  const extractBillData = async (): Promise<DadosContaLuz | null> => {
    if (!docContaLuz) return null;

    setCurrentStep('extracting_bill');
    setExtractionStatus('Extraindo dados da conta de luz...');

    try {
      const { data, error } = await supabase.functions.invoke('extrair-dados-documentos', {
        body: {
          documentoIdentificacaoBase64: null,
          contaLuzBase64: docContaLuz.base64
        }
      });

      if (error) throw new Error(error.message);

      const result = data as ExtractionResult<DadosContaLuz>;
      
      if (result.sucesso && result.confianca >= 50) {
        setDadosContaLuz(result.dados);
        toast.success(`Dados da conta de luz extraidos!`);
        return result.dados;
      } else {
        toast.warning('Nao foi possivel extrair todos os dados da conta.');
        return null;
      }
    } catch (error) {
      console.error('Bill extraction error:', error);
      toast.error('Erro ao extrair dados da conta de luz.');
      return null;
    }
  };

  // Validate CNPJ match between contract and bill
  const validateCnpjMatch = async (
    empresaData: DadosContratoSocial, 
    contaData: DadosContaLuz
  ): Promise<boolean> => {
    setCurrentStep('validating_cnpj');
    setExtractionStatus('Validando CNPJ da empresa...');

    const cnpjContrato = empresaData.cnpj?.replace(/\D/g, '') || '';
    const cnpjConta = contaData.cpf_cnpj_titular?.replace(/\D/g, '') || '';

    // If bill has CPF (PF) instead of CNPJ, that's a problem for PJ proposal
    if (cnpjConta.length === 11) {
      setTipoFraudePJ('cnpj_divergente');
      await registrarAlertaFraude('cnpj_divergente', {
        cnpj_contrato: cnpjContrato,
        cpf_conta: cnpjConta,
        razao_social: empresaData.razao_social,
        mensagem: 'Conta de luz esta em nome de Pessoa Fisica, nao da empresa'
      });
      toast.error('A conta de luz esta em nome de Pessoa Fisica. Para proposta PJ, a conta deve estar em nome da empresa.');
      return false;
    }

    // Validate CNPJ match
    if (cnpjContrato && cnpjConta && cnpjContrato !== cnpjConta) {
      setTipoFraudePJ('cnpj_divergente');
      await registrarAlertaFraude('cnpj_divergente', {
        cnpj_contrato: cnpjContrato,
        cnpj_conta: cnpjConta,
        razao_social: empresaData.razao_social
      });
      toast.error('O CNPJ da conta de luz nao corresponde ao CNPJ do contrato social!');
      return false;
    }

    // If we couldn't extract CNPJ from bill, log warning but continue
    if (!cnpjConta) {
      console.warn('Could not extract CNPJ from bill, skipping CNPJ validation');
    }

    return true;
  };

  const processAllDocuments = async () => {
    if (!docContratoSocial || !docIdentificacaoAdmin || !docContaLuz) {
      toast.error('Envie todos os documentos necessarios.');
      return;
    }

    // Reset fraud state before processing
    setTipoFraudePJ(null);
    setCpfMismatch(false);

    try {
      // Step 1: Extract contract data
      const empresaData = await extractContractData();
      if (!empresaData) return;

      // Step 2: Validate admin identity (CPF check)
      const { valid: adminValid, cpfExtraido } = await validateAdminIdentity(empresaData);
      if (!adminValid) return; // Fraud detected - stops here

      // Step 3: Extract bill data
      const contaData = await extractBillData();
      if (!contaData) return;

      // Step 4: Validate CNPJ match (NEW)
      const cnpjValid = await validateCnpjMatch(empresaData, contaData);
      if (!cnpjValid) return; // Fraud detected - stops here

      // Step 5: Complete - all validations passed!
      setCurrentStep('complete');
      setExtractionStatus('Extracao concluida!');

      // Track document submission from page
      trackDocumentSubmissionFromPage(propostaId, [
        { type: 'contrato_social', fileName: docContratoSocial.name },
        { type: 'identificacao_admin', fileName: docIdentificacaoAdmin.name },
        { type: 'conta_luz', fileName: docContaLuz.name }
      ]);

      onExtractionComplete({
        empresa: empresaData,
        contaLuz: contaData,
        adminValidado: true,
        documentUrls: {
          contratoSocial: docContratoSocial.url,
          identificacaoAdmin: docIdentificacaoAdmin.url,
          contaLuz: docContaLuz.url
        }
      });

    } catch (error) {
      console.error('Processing error:', error);
      toast.error('Erro ao processar documentos.');
      setCurrentStep('upload');
    }
  };

  const allDocumentsUploaded = docContratoSocial && docIdentificacaoAdmin && docContaLuz;
  const isProcessing = currentStep !== 'upload' && currentStep !== 'complete';
  const hasFraud = tipoFraudePJ !== null;

  const DocumentCard = ({ 
    type, 
    title, 
    description,
    icon: Icon,
    document, 
    inputRef,
    step
  }: { 
    type: 'contratoSocial' | 'identificacaoAdmin' | 'contaLuz';
    title: string;
    description: string;
    icon: React.ElementType;
    document: UploadedDocument | null;
    inputRef: React.RefObject<HTMLInputElement>;
    step: number;
  }) => (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className={cn(
          "flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold",
          document 
            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
            : "bg-muted text-muted-foreground"
        )}>
          {document ? <CheckCircle2 className="w-4 h-4" /> : step}
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <Icon className="w-4 h-4" />
            {title}
          </h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {document && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeDocument(type)}
            className="text-red-500 hover:text-red-700"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {document ? (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
          <FileCheck className="h-5 w-5 text-green-600" />
          <span className="text-sm font-medium text-green-800 dark:text-green-200 truncate">
            {document.name}
          </span>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center p-6 rounded-lg border-2 border-dashed cursor-pointer transition-all",
            "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
          )}
        >
          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground text-center">
            {isMobile ? 'Toque para enviar' : 'Clique para enviar'}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">PDF, JPG ou PNG (máx. 15MB)</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => handleInputChange(e, type)}
        className="hidden"
      />
    </div>
  );

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle className="flex items-center gap-2">
              Proposta Pessoa Jurídica
              <Badge variant="secondary" className="text-xs">PJ</Badge>
            </CardTitle>
            <CardDescription>
              Envie os documentos da empresa para análise automática
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Extracted Company Info Preview */}
        <AnimatePresence>
          {dadosEmpresa && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                <Building2 className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-800 dark:text-blue-200">
                  {dadosEmpresa.razao_social}
                </AlertTitle>
                <AlertDescription className="text-blue-700 dark:text-blue-300">
                  <div className="mt-2 space-y-1 text-sm">
                    <p>CNPJ: {dadosEmpresa.cnpj?.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}</p>
                    {dadosEmpresa.admin_nome_completo && (
                      <p className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        Administrador: {dadosEmpresa.admin_nome_completo}
                        {adminValidado && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PJ Fraud Alert - Shows when fraud is detected */}
        <AnimatePresence>
          {hasFraud && (
            <FraudAlertPJ
              tipoFraude={tipoFraudePJ}
              cnpjContrato={dadosEmpresa?.cnpj || null}
              cnpjConta={dadosContaLuz?.cpf_cnpj_titular || null}
              cpfAdminContrato={dadosEmpresa?.admin_cpf || null}
              cpfDocumento={cpfDocumentoExtraido}
              nomeAdmin={dadosEmpresa?.admin_nome_completo || null}
              onRetry={handleRetryDocuments}
              onContactSupport={handleContactSupport}
            />
          )}
        </AnimatePresence>

        {/* Document Upload Cards */}
        <div className="space-y-4">
          <DocumentCard
            type="contratoSocial"
            title="Contrato Social / Última Alteração"
            description="Documento com dados da empresa e sócios"
            icon={FileText}
            document={docContratoSocial}
            inputRef={contratoInputRef}
            step={1}
          />

          <DocumentCard
            type="identificacaoAdmin"
            title="RG ou CNH do Administrador"
            description="Documento do sócio que representa a empresa"
            icon={User}
            document={docIdentificacaoAdmin}
            inputRef={identificacaoInputRef}
            step={2}
          />

          <DocumentCard
            type="contaLuz"
            title="Conta de Luz"
            description="Fatura de energia recente da empresa"
            icon={Sparkles}
            document={docContaLuz}
            inputRef={contaLuzInputRef}
            step={3}
          />
        </div>

        {/* Processing Status */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center gap-3 p-4 rounded-lg bg-primary/5"
            >
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm font-medium text-primary">{extractionStatus}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Buttons - Hidden when fraud detected */}
        {!hasFraud && (
          <div className="flex flex-col gap-3">
            <Button
              onClick={processAllDocuments}
              disabled={!allDocumentsUploaded || isProcessing}
              className="w-full"
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Extrair Dados com IA
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={onManualMode}
              disabled={isProcessing}
              className="w-full"
            >
              Preencher manualmente
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
