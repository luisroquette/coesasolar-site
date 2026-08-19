import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/calculations';
import { formatPayback, FluxoCaixaMigracao } from '@/lib/calculations-cliente-gd';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  Legend
} from 'recharts';
import { TrendingUp, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FluxoCaixaMultaProps {
  multaRescisoria: number;
  paybackMeses: number | null;
  multaJustificada: boolean;
  fluxoCaixa: FluxoCaixaMigracao[];
  fidelidadeAnos: number;
}

export function FluxoCaixaMulta({
  multaRescisoria,
  paybackMeses,
  multaJustificada,
  fluxoCaixa,
  fidelidadeAnos,
}: FluxoCaixaMultaProps) {
  // Preparar dados para o gráfico
  const chartData = fluxoCaixa.map((item) => ({
    mes: item.mes,
    mesLabel: `M${item.mes}`,
    economiaAcumulada: item.economiaAcumulada,
    saldoDevedor: Math.max(0, item.saldoDevedor),
    lucro: item.saldoDevedor < 0 ? Math.abs(item.saldoDevedor) : 0,
    paybackAtingido: item.paybackAtingido,
  }));

  const fidelidadeMeses = fidelidadeAnos * 12;
  const roiTotal = multaRescisoria > 0 
    ? (((fluxoCaixa[fluxoCaixa.length - 1]?.economiaAcumulada || 0) - multaRescisoria) / multaRescisoria * 100).toFixed(0)
    : 100;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
          <p className="font-medium text-foreground mb-2">Mês {data.mes}</p>
          <div className="space-y-1 text-sm">
            <p className="text-primary">
              Economia Acumulada: {formatCurrency(data.economiaAcumulada)}
            </p>
            {data.saldoDevedor > 0 && (
              <p className="text-destructive">
                Saldo Devedor: {formatCurrency(data.saldoDevedor)}
              </p>
            )}
            {data.lucro > 0 && (
              <p className="text-green-500">
                Lucro Líquido: {formatCurrency(data.lucro)}
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Análise da Multa Rescisória
          </div>
          {multaRescisoria > 0 && (
            <Badge variant={multaJustificada ? "default" : "destructive"}>
              {multaJustificada ? "Viável" : "Risco Alto"}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {multaRescisoria <= 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center justify-center gap-3 p-6 bg-green-500/10 rounded-xl border border-green-500/30"
          >
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div>
              <p className="font-semibold text-green-700 dark:text-green-300">
                Sem Multa Rescisória
              </p>
              <p className="text-sm text-muted-foreground">
                A migração pode ser feita imediatamente sem custos adicionais
              </p>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {/* Cards de métricas */}
            <div className="grid grid-cols-3 gap-4">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-muted/50 rounded-xl p-4 text-center"
              >
                <p className="text-sm text-muted-foreground mb-1">Multa Rescisória</p>
                <p className="text-xl font-bold text-destructive">
                  {formatCurrency(multaRescisoria)}
                </p>
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={cn(
                  "rounded-xl p-4 text-center",
                  multaJustificada ? "bg-green-500/10" : "bg-yellow-500/10"
                )}
              >
                <p className="text-sm text-muted-foreground mb-1 flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" />
                  Payback
                </p>
                <p className={cn(
                  "text-xl font-bold",
                  multaJustificada ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400"
                )}>
                  {formatPayback(paybackMeses)}
                </p>
              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-primary/10 rounded-xl p-4 text-center"
              >
                <p className="text-sm text-muted-foreground mb-1">ROI Total</p>
                <p className="text-xl font-bold text-primary">
                  {roiTotal}%
                </p>
              </motion.div>
            </div>

            {/* Gráfico de fluxo de caixa */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="h-64"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorEconomia" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorLucro" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="mesLabel" 
                    className="text-xs fill-muted-foreground"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis 
                    className="text-xs fill-muted-foreground"
                    tickFormatter={(value) => `R$${(value / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  
                  {/* Linha de referência da multa */}
                  <ReferenceLine 
                    y={multaRescisoria} 
                    stroke="hsl(var(--destructive))" 
                    strokeDasharray="5 5"
                    label={{ 
                      value: "Multa", 
                      position: "right",
                      fill: "hsl(var(--destructive))",
                      fontSize: 10
                    }}
                  />
                  
                  {/* Linha vertical do payback */}
                  {paybackMeses && (
                    <ReferenceLine 
                      x={`M${paybackMeses}`} 
                      stroke="#22c55e" 
                      strokeDasharray="5 5"
                      label={{ 
                        value: "Payback", 
                        position: "top",
                        fill: "#22c55e",
                        fontSize: 10
                      }}
                    />
                  )}
                  
                  <Area 
                    type="monotone" 
                    dataKey="economiaAcumulada" 
                    stroke="hsl(var(--primary))" 
                    fillOpacity={1}
                    fill="url(#colorEconomia)"
                    name="Economia Acumulada"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="lucro" 
                    stroke="#22c55e" 
                    fillOpacity={1}
                    fill="url(#colorLucro)"
                    name="Lucro Líquido"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Alerta se payback excede fidelidade */}
            {paybackMeses && paybackMeses > fidelidadeMeses && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex items-start gap-3 p-4 bg-yellow-500/10 rounded-xl border border-yellow-500/30"
              >
                <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-700 dark:text-yellow-300">
                    Atenção: Payback excede o período de fidelidade
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    O tempo para recuperar a multa ({formatPayback(paybackMeses)}) é maior que o período 
                    de contrato COESA ({fidelidadeAnos} {fidelidadeAnos === 1 ? 'ano' : 'anos'}). 
                    Considere negociar a multa ou aumentar a fidelidade.
                  </p>
                </div>
              </motion.div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
