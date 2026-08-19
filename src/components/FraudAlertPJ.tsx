import { ShieldX, AlertTriangle, Phone, RefreshCw, FileWarning, Building2, User } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { motion } from 'framer-motion';
import { mascaraCpfPJSeguro, mascaraCnpjPJSeguro, type TipoFraudePJ } from '@/hooks/useTitularidadePJValidation';
import { cn } from '@/lib/utils';

interface FraudAlertPJProps {
  tipoFraude: TipoFraudePJ;
  cnpjContrato: string | null;
  cnpjConta: string | null;
  cpfAdminContrato: string | null;
  cpfDocumento: string | null;
  nomeAdmin: string | null;
  onRetry: () => void;
  onContactSupport: () => void;
  className?: string;
}

export function FraudAlertPJ({
  tipoFraude,
  cnpjContrato,
  cnpjConta,
  cpfAdminContrato,
  cpfDocumento,
  nomeAdmin,
  onRetry,
  onContactSupport,
  className
}: FraudAlertPJProps) {
  if (!tipoFraude) return null;

  const isCnpjFraud = tipoFraude === 'cnpj_divergente';
  const isCpfAdminFraud = tipoFraude === 'admin_cpf_divergente';
  const isDadosIncompletos = tipoFraude === 'dados_incompletos';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      <Card className="border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 shadow-lg">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/50">
              <ShieldX className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <CardTitle className="text-red-800 dark:text-red-200 text-xl">
                {isCnpjFraud && 'CNPJ Divergente Detectado'}
                {isCpfAdminFraud && 'Administrador Não Reconhecido'}
                {isDadosIncompletos && 'Dados Incompletos para Validação'}
              </CardTitle>
              <CardDescription className="text-red-600 dark:text-red-400">
                Não foi possível prosseguir com a solicitação PJ
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-5">
          {/* Explicação do problema */}
          <Alert variant="destructive" className="bg-red-100 dark:bg-red-900/50 border-red-200 dark:border-red-700">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle className="text-red-900 dark:text-red-100">O que aconteceu?</AlertTitle>
            <AlertDescription className="text-red-800 dark:text-red-200">
              {isCnpjFraud && (
                <>
                  O <strong>CNPJ da conta de luz</strong> não corresponde ao <strong>CNPJ do contrato social</strong>. 
                  A conta de energia deve estar em nome da mesma empresa para prosseguir.
                </>
              )}
              {isCpfAdminFraud && (
                <>
                  O <strong>CPF do documento de identificação</strong> não corresponde ao <strong>CPF do sócio administrador</strong> indicado no contrato social. 
                  Apenas o representante legal pode assinar a proposta.
                </>
              )}
              {isDadosIncompletos && (
                <>
                  Não foi possível extrair todos os dados necessários dos documentos para realizar a validação anti-fraude. 
                  Verifique a qualidade dos documentos e tente novamente.
                </>
              )}
            </AlertDescription>
          </Alert>

          {/* Dados divergentes (mascarados) */}
          {isCnpjFraud && (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-red-700 dark:text-red-300">
                  <Building2 className="h-4 w-4" />
                  CNPJ do Contrato Social
                </div>
                <p className="text-lg font-mono text-red-900 dark:text-red-100">
                  {mascaraCnpjPJSeguro(cnpjContrato)}
                </p>
              </div>
              
              <div className="p-4 rounded-lg bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-red-700 dark:text-red-300">
                  <FileWarning className="h-4 w-4" />
                  CNPJ da Conta de Luz
                </div>
                <p className="text-lg font-mono text-red-900 dark:text-red-100">
                  {mascaraCnpjPJSeguro(cnpjConta)}
                </p>
              </div>
            </div>
          )}

          {isCpfAdminFraud && (
            <>
              {nomeAdmin && (
                <div className="p-4 rounded-lg bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium text-red-700 dark:text-red-300">
                    <User className="h-4 w-4" />
                    Sócio Administrador (Contrato Social)
                  </div>
                  <p className="text-lg font-semibold text-red-900 dark:text-red-100">
                    {nomeAdmin}
                  </p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium text-red-700 dark:text-red-300">
                    <User className="h-4 w-4" />
                    CPF Esperado (Admin)
                  </div>
                  <p className="text-lg font-mono text-red-900 dark:text-red-100">
                    {mascaraCpfPJSeguro(cpfAdminContrato)}
                  </p>
                </div>
                
                <div className="p-4 rounded-lg bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium text-red-700 dark:text-red-300">
                    <FileWarning className="h-4 w-4" />
                    CPF do Documento
                  </div>
                  <p className="text-lg font-mono text-red-900 dark:text-red-100">
                    {mascaraCpfPJSeguro(cpfDocumento)}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Instruções */}
          <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-red-200 dark:border-red-800">
            <h4 className="font-semibold text-red-900 dark:text-red-100 mb-3">O que você pode fazer:</h4>
            <ul className="space-y-2 text-sm text-red-800 dark:text-red-200">
              {isCnpjFraud && (
                <>
                  <li className="flex items-start gap-2">
                    <span className="bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                    <span>Verifique se o <strong>contrato social</strong> é da empresa correta</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                    <span>Verifique se a <strong>conta de luz</strong> está no nome da mesma empresa</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                    <span>Se a conta for de uma filial ou outra unidade, entre em contato com nosso atendimento</span>
                  </li>
                </>
              )}
              {isCpfAdminFraud && (
                <>
                  <li className="flex items-start gap-2">
                    <span className="bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                    <span>Envie o <strong>RG ou CNH do sócio administrador</strong> indicado no contrato social</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                    <span>Se o contrato social está desatualizado, envie a <strong>última alteração contratual</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                    <span>Se você é procurador da empresa, entre em contato com nosso atendimento</span>
                  </li>
                </>
              )}
              {isDadosIncompletos && (
                <>
                  <li className="flex items-start gap-2">
                    <span className="bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                    <span>Verifique se os <strong>documentos estão legíveis</strong> e completos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                    <span>Envie <strong>fotos com boa iluminação</strong> ou PDFs originais</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                    <span>Certifique-se de que o CNPJ e CPF do administrador estão <strong>visíveis</strong></span>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* Botões de ação */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              onClick={onRetry}
              variant="outline"
              className="flex-1 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/50"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Enviar Novos Documentos
            </Button>
            <Button
              onClick={onContactSupport}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              <Phone className="h-4 w-4 mr-2" />
              Falar com Atendimento
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
