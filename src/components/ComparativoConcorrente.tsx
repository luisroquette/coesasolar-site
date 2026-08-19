import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, ArrowRight, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/calculations';
import { ClienteGDOutput } from '@/lib/calculations-cliente-gd';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ComparativoConcorrenteProps {
  nomeConcorrente: string;
  descontoConcorrente: number;
  descontoCoesa: number;
  resultado: ClienteGDOutput;
}

export function ComparativoConcorrente({
  nomeConcorrente,
  descontoConcorrente,
  descontoCoesa,
  resultado,
}: ComparativoConcorrenteProps) {
  const diferencaPositiva = resultado.diferencaMensal > 0;
  
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-muted/50 to-muted/30 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-primary" />
          Comparativo: {nomeConcorrente || 'Concorrente'} vs COESA
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 gap-4 items-center">
          {/* Card Concorrente */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-muted/30 rounded-xl p-4 border border-border/50"
          >
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">
                {nomeConcorrente || 'Concorrente Atual'}
              </p>
              <div className="flex items-center justify-center gap-2 mb-3">
                <Badge variant="outline" className="text-lg font-bold">
                  {descontoConcorrente}%
                </Badge>
                <span className="text-sm text-muted-foreground">desconto</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(resultado.valorConcorrente)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">por mês</p>
            </div>
          </motion.div>

          {/* Seta de transição com diferença */}
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
          >
            <div className={cn(
              "flex flex-col items-center justify-center w-20 h-20 rounded-full shadow-lg",
              diferencaPositiva ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"
            )}>
              <ArrowRight className="h-5 w-5 mb-1" />
              <span className="text-xs font-bold">
                +{resultado.diferencaPercentual}%
              </span>
            </div>
          </motion.div>

          {/* Card COESA */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="bg-primary/10 rounded-xl p-4 border-2 border-primary/30 relative"
          >
            <div className="absolute -top-3 right-4">
              <Badge className="bg-primary text-primary-foreground">
                Recomendado
              </Badge>
            </div>
            <div className="text-center">
              <p className="text-sm text-primary font-medium mb-1">COESA</p>
              <div className="flex items-center justify-center gap-2 mb-3">
                <Badge className="text-lg font-bold bg-primary text-primary-foreground">
                  {descontoCoesa}%
                </Badge>
                <span className="text-sm text-muted-foreground">desconto</span>
              </div>
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(resultado.valorCoesa)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">por mês</p>
            </div>
          </motion.div>
        </div>

        {/* Economia Adicional */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={cn(
            "mt-6 p-4 rounded-xl text-center",
            diferencaPositiva 
              ? "bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30" 
              : "bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30"
          )}
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            {diferencaPositiva ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive" />
            )}
            <span className="font-medium">
              {diferencaPositiva ? 'Economia Adicional Mensal' : 'Sem Vantagem Financeira'}
            </span>
          </div>
          
          <p className={cn(
            "text-3xl font-bold",
            diferencaPositiva ? "text-green-600 dark:text-green-400" : "text-destructive"
          )}>
            {diferencaPositiva ? '+' : ''}{formatCurrency(resultado.diferencaMensal)}
          </p>
          
          <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
            <div className="bg-background/50 rounded-lg p-3">
              <p className="text-muted-foreground">Economia Anual</p>
              <p className="text-lg font-semibold text-foreground">
                {formatCurrency(resultado.economiaAdicionalAnual)}
              </p>
            </div>
            <div className="bg-background/50 rounded-lg p-3">
              <p className="text-muted-foreground">Economia Total</p>
              <p className="text-lg font-semibold text-foreground">
                {formatCurrency(resultado.economiaAdicionalAcumulada)}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Alertas */}
        {resultado.alertas.length > 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-4 space-y-2"
          >
            {resultado.alertas.map((alerta, index) => (
              <div 
                key={index}
                className={cn(
                  "flex items-start gap-2 p-3 rounded-lg text-sm",
                  alerta.startsWith('✅') && "bg-green-500/10 text-green-700 dark:text-green-300",
                  alerta.startsWith('⚠️') && "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
                  alerta.startsWith('💡') && "bg-blue-500/10 text-blue-700 dark:text-blue-300",
                  alerta.startsWith('❌') && "bg-red-500/10 text-red-700 dark:text-red-300"
                )}
              >
                <span>{alerta}</span>
              </div>
            ))}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
