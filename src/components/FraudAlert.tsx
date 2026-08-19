import { ShieldX, AlertTriangle, Phone, RefreshCw, FileWarning, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { motion } from 'framer-motion';
import { mascaraCpfSeguro, mascaraCnpjSeguro } from '@/hooks/useTitularidadeValidation';
import { cn } from '@/lib/utils';

interface FraudAlertProps {
  cpfIdentificacao: string | null;
  cpfCnpjConta: string | null;
  onRetry: () => void;
  onContactSupport: () => void;
  className?: string;
}

export function FraudAlert({
  cpfIdentificacao,
  cpfCnpjConta,
  onRetry,
  onContactSupport,
  className
}: FraudAlertProps) {
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
                Documentos com Titularidade Divergente
              </CardTitle>
              <CardDescription className="text-red-600 dark:text-red-400">
                Não foi possível prosseguir com a solicitação
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
              O <strong>CPF do documento de identificação</strong> não corresponde ao <strong>CPF do titular da conta de luz</strong>. 
              Para sua segurança, não é possível prosseguir com documentos de titulares diferentes.
            </AlertDescription>
          </Alert>

          {/* CPFs divergentes (mascarados) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-2 text-sm font-medium text-red-700 dark:text-red-300">
                <FileWarning className="h-4 w-4" />
                CPF do RG/CNH
              </div>
              <p className="text-lg font-mono text-red-900 dark:text-red-100">
                {mascaraCpfSeguro(cpfIdentificacao)}
              </p>
            </div>
            
            <div className="p-4 rounded-lg bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-2 text-sm font-medium text-red-700 dark:text-red-300">
                <FileWarning className="h-4 w-4" />
                CPF da Conta
              </div>
              <p className="text-lg font-mono text-red-900 dark:text-red-100">
                {mascaraCpfSeguro(cpfCnpjConta)}
              </p>
            </div>
          </div>

          {/* Instruções */}
          <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-red-200 dark:border-red-800">
            <h4 className="font-semibold text-red-900 dark:text-red-100 mb-3">O que você pode fazer:</h4>
            <ul className="space-y-2 text-sm text-red-800 dark:text-red-200">
              <li className="flex items-start gap-2">
                <span className="bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                <span>Verifique se enviou o <strong>documento de identificação correto</strong> (deve ser do titular da conta de luz)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                <span>Verifique se a <strong>conta de luz</strong> está em seu nome</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                <span>Se você é representante legal de outra pessoa, entre em contato com nosso atendimento</span>
              </li>
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

interface PJWarningAlertProps {
  cpfIdentificacao: string | null;
  cnpjConta: string | null;
  className?: string;
}

export function PJWarningAlert({
  cpfIdentificacao,
  cnpjConta,
  className
}: PJWarningAlertProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={className}
    >
      <Alert className="bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700">
        <Building2 className="h-5 w-5 text-amber-600" />
        <AlertTitle className="text-amber-800 dark:text-amber-200">
          Conta de Pessoa Jurídica Detectada
        </AlertTitle>
        <AlertDescription className="text-amber-700 dark:text-amber-300">
          <p className="mb-2">
            A conta de luz está em nome de uma <strong>Pessoa Jurídica (CNPJ)</strong>. 
            Você pode continuar com a solicitação, mas a validação do representante legal será realizada posteriormente pela nossa equipe.
          </p>
          <div className="flex flex-wrap gap-4 mt-3 text-sm">
            <div>
              <span className="font-medium">CPF do Representante:</span>{' '}
              <span className="font-mono">{mascaraCpfSeguro(cpfIdentificacao)}</span>
            </div>
            <div>
              <span className="font-medium">CNPJ da Conta:</span>{' '}
              <span className="font-mono">{mascaraCnpjSeguro(cnpjConta)}</span>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    </motion.div>
  );
}
