import { useState, useMemo, useEffect } from 'react';
import { Check, Sparkles, TrendingUp, Clock, Star, Unlock, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatCurrency, calcularPropostaAssinante, AssinanteInput } from '@/lib/calculations';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlanosComerciais, useCalculoConfigs, convertToPlanoConfig } from '@/hooks/usePlanosComerciais';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface PlanoConfig {
  id: string;
  fidelidadeAnos: number;
  descontoPercentual: number;
  label: string;
  destaque?: boolean;
  unlock?: boolean;
}

// Fallback para planos se não carregar do banco (15%, 20%, 25%, 30% - clássicos COESA)
export const PLANOS_DISPONIVEIS: PlanoConfig[] = [
  { id: 'plano-1ano', fidelidadeAnos: 1, descontoPercentual: 15, label: '1 ano' },
  { id: 'plano-2anos', fidelidadeAnos: 2, descontoPercentual: 20, label: '2 anos' },
  { id: 'plano-3anos', fidelidadeAnos: 3, descontoPercentual: 25, label: '3 anos', destaque: true },
  { id: 'plano-unlock', fidelidadeAnos: 4, descontoPercentual: 30, label: '4 anos', unlock: true },
];

// @deprecated - Use useCalculoConfigs().planoUnlockThreshold do banco de dados
// Mantido para compatibilidade com código legado
export const UNLOCK_THRESHOLD = 3000;

/**
 * Retorna o plano padrão baseado no consumo médio
 * Usa threshold dinâmico do banco de dados
 */
export function getPlanoDefaultPorConsumo(consumoMedio: number, planos: PlanoConfig[] = PLANOS_DISPONIVEIS, unlockThreshold = 3000): PlanoConfig {
  return consumoMedio > unlockThreshold 
    ? planos.find(p => p.unlock) || planos[planos.length - 1]
    : planos.find(p => p.destaque) || planos[planos.length - 2] || planos[0];
}

interface PlanSelectorProps {
  consumoMedio: number;
  tarifa: number;
  cip: number;
  tipoInstalacao: 'Monofásico' | 'Bifásico' | 'Trifásico';
  numeroUcs: number;
  planoAtual: PlanoConfig;
  onSelectPlano: (plano: PlanoConfig) => void;
  className?: string;
}

export function PlanSelector({
  consumoMedio,
  tarifa,
  cip,
  tipoInstalacao,
  numeroUcs,
  planoAtual,
  onSelectPlano,
  className,
}: PlanSelectorProps) {
  const { planos: planosDb, loading: planosLoading } = usePlanosComerciais();
  const { planoUnlockThreshold } = useCalculoConfigs();
  
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);

  // Converter planos do banco para PlanoConfig
  const planosDisponiveis = useMemo(() => {
    if (planosLoading || planosDb.length === 0) return PLANOS_DISPONIVEIS;
    return planosDb.map(convertToPlanoConfig);
  }, [planosDb, planosLoading]);

  // Calcular economia para cada plano
  const planosComCalculo = useMemo(() => {
    return planosDisponiveis.map((plano) => {
      const input: AssinanteInput = {
        tarifa,
        cip,
        consumoMedio,
        fidelidadeAnos: plano.fidelidadeAnos,
        descontoPercentual: plano.descontoPercentual,
        tipoInstalacao,
        numeroUcs,
      };
      
      const resultado = calcularPropostaAssinante(input);
      
      return {
        ...plano,
        economiaMensal: resultado.economiaMensal,
        economiaAnual: resultado.economiaAnual,
        economiaAcumulada: resultado.economiaAcumulada,
        valorComCoesa: resultado.valorComCoesa,
        valorSemCoesa: resultado.valorSemCoesa,
      };
    });
  }, [consumoMedio, tarifa, cip, tipoInstalacao, numeroUcs, planosDisponiveis]);

  // Encontrar o plano com maior economia acumulada para comparação
  const melhorPlano = planosComCalculo.reduce((max, p) => 
    p.economiaAcumulada > max.economiaAcumulada ? p : max
  , planosComCalculo[0]);

  const planoSelecionado = planosComCalculo.find(p => p.id === planoAtual.id) || planosComCalculo[2];

  return (
    <div className={cn("w-full", className)}>
      {/* Header */}
      <div className="text-center mb-4">
        <h3 className="text-lg font-bold text-gray-900 flex items-center justify-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Compare os Planos
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Escolha o plano ideal para você e veja sua economia
        </p>
      </div>

      {/* Planos Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {planosComCalculo.map((plano) => {
          const isSelected = plano.id === planoAtual.id;
          const isHovered = hoveredPlan === plano.id;
          const diferencaParaMelhor = melhorPlano.economiaAcumulada - plano.economiaAcumulada;
          
          // Verificar se o plano está bloqueado (UNLOCK requer consumo > threshold)
          const isLocked = plano.unlock && consumoMedio < planoUnlockThreshold;
          
          const handleClick = () => {
            if (isLocked) return; // Não permite selecionar plano bloqueado
            onSelectPlano(plano);
          };
          
          const cardContent = (
            <motion.div
              key={plano.id}
              whileHover={{ scale: isLocked ? 1 : 1.02 }}
              whileTap={{ scale: isLocked ? 1 : 0.98 }}
              onMouseEnter={() => setHoveredPlan(plano.id)}
              onMouseLeave={() => setHoveredPlan(null)}
            >
              <Card
                className={cn(
                  "transition-all duration-300 relative overflow-hidden",
                  isLocked 
                    ? "cursor-not-allowed opacity-60 bg-gray-100 border-gray-300"
                    : "cursor-pointer",
                  !isLocked && isSelected
                    ? plano.unlock 
                      ? "ring-2 ring-purple-500 bg-purple-50 border-purple-200 shadow-lg"
                      : "ring-2 ring-emerald-500 bg-emerald-50 border-emerald-200 shadow-lg"
                    : !isLocked && "hover:border-emerald-300 hover:shadow-md",
                  !isLocked && plano.destaque && !isSelected && "border-amber-200 bg-amber-50/50",
                  !isLocked && plano.unlock && !isSelected && "border-purple-200 bg-gradient-to-br from-purple-50 to-fuchsia-50"
                )}
                onClick={handleClick}
              >
                {/* Badge de destaque */}
                {plano.destaque && !isLocked && (
                  <div className="absolute -top-1 -right-1">
                    <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-bl-lg rounded-tr-lg">
                      <Star className="h-2.5 w-2.5 mr-0.5 inline" />
                      Popular
                    </Badge>
                  </div>
                )}
                
                {/* Badge UNLOCK ou LOCKED */}
                {plano.unlock && (
                  <div className="absolute -top-1 -right-1">
                    <Badge className={cn(
                      "text-white text-[10px] px-1.5 py-0.5 rounded-bl-lg rounded-tr-lg",
                      isLocked 
                        ? "bg-gray-500"
                        : "bg-gradient-to-r from-purple-600 to-fuchsia-600"
                    )}>
                      {isLocked ? (
                        <>
                          <Lock className="h-2.5 w-2.5 mr-0.5 inline" />
                          BLOQUEADO
                        </>
                      ) : (
                        <>
                          <Unlock className="h-2.5 w-2.5 mr-0.5 inline" />
                          UNLOCK
                        </>
                      )}
                    </Badge>
                  </div>
                )}

                <CardContent className="p-3 sm:p-4">
                  {/* Fidelidade */}
                  <div className="flex items-center justify-center gap-1 mb-2">
                    <Clock className={cn(
                      "h-4 w-4",
                      isLocked ? "text-gray-400" : isSelected ? "text-emerald-600" : "text-gray-500"
                    )} />
                    <span className={cn(
                      "font-bold text-sm sm:text-base",
                      isLocked ? "text-gray-500" : isSelected ? "text-emerald-700" : "text-gray-700"
                    )}>
                      {plano.label}
                    </span>
                  </div>

                  {/* Desconto */}
                  <div className={cn(
                    "text-center py-2 px-2 rounded-lg mb-3",
                    isSelected 
                      ? plano.unlock 
                        ? "bg-purple-100" 
                        : "bg-emerald-100" 
                      : plano.unlock
                        ? "bg-gradient-to-br from-purple-100 to-fuchsia-100"
                        : plano.destaque 
                          ? "bg-amber-100" 
                          : "bg-gray-100"
                  )}>
                    <span className={cn(
                      "text-2xl sm:text-3xl font-black",
                      isSelected 
                        ? plano.unlock
                          ? "text-purple-600"
                          : "text-emerald-600" 
                        : plano.unlock
                          ? "text-purple-600"
                          : plano.destaque 
                            ? "text-amber-600" 
                            : "text-gray-700"
                    )}>
                      {plano.descontoPercentual}%
                    </span>
                    <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5">de desconto</p>
                  </div>

                  {/* Economia Mensal */}
                  <div className="text-center mb-2">
                    <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">Economia mensal</p>
                    <p className={cn(
                      "font-bold text-sm sm:text-lg",
                      isSelected ? "text-emerald-600" : "text-gray-800"
                    )}>
                      {formatCurrency(plano.economiaMensal)}
                    </p>
                  </div>

                  {/* Economia Acumulada */}
                  <div className={cn(
                    "text-center p-2 rounded-lg",
                    isSelected 
                      ? plano.unlock 
                        ? "bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white" 
                        : "bg-emerald-600 text-white" 
                      : "bg-gray-50"
                  )}>
                    <p className={cn(
                      "text-[9px] sm:text-[10px]",
                      isSelected ? (plano.unlock ? "text-purple-100" : "text-emerald-100") : "text-gray-500"
                    )}>
                      Total em {plano.fidelidadeAnos} {plano.fidelidadeAnos === 1 ? 'ano' : 'anos'}
                    </p>
                    <p className={cn(
                      "font-black text-sm sm:text-base",
                      isSelected ? "text-white" : "text-gray-800"
                    )}>
                      {formatCurrency(plano.economiaAcumulada)}
                    </p>
                  </div>

                  {/* Checkbox de seleção */}
                  <div className="mt-3 flex justify-center">
                    <div className={cn(
                      "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                      isSelected 
                        ? "bg-emerald-500 border-emerald-500" 
                        : "border-gray-300 bg-white"
                    )}>
                      {isSelected && <Check className="h-4 w-4 text-white" />}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
          
          // Retornar com tooltip se bloqueado
          if (isLocked) {
            return (
              <TooltipProvider key={plano.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    {cardContent}
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[200px] text-center">
                    <p className="font-medium">Plano exclusivo</p>
                    <p className="text-xs text-muted-foreground">
                      Disponível para consumo acima de {planoUnlockThreshold.toLocaleString('pt-BR')} kWh/mês
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }
          
          return cardContent;
        })}
      </div>

      {/* Resumo do plano selecionado */}
      <AnimatePresence mode="wait">
        <motion.div
          key={planoSelecionado.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "mt-4 p-4 rounded-xl text-white shadow-lg",
            planoAtual.unlock
              ? "bg-gradient-to-r from-purple-600 via-fuchsia-600 to-purple-600"
              : "bg-gradient-to-r from-emerald-500 to-teal-600"
          )}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className={planoAtual.unlock ? "text-purple-100" : "text-emerald-100"} style={{ fontSize: '0.875rem' }}>
                  Plano selecionado
                </p>
                {planoAtual.unlock && (
                  <Badge className="bg-white/20 text-white text-[10px] px-2 py-0.5">
                    <Unlock className="h-3 w-3 mr-1 inline" />
                    UNLOCK
                  </Badge>
                )}
              </div>
              <p className="font-bold text-lg">
                {planoSelecionado.label} com {planoSelecionado.descontoPercentual}% de desconto
              </p>
            </div>
            <div className="text-right">
              <p className={planoAtual.unlock ? "text-purple-100" : "text-emerald-100"} style={{ fontSize: '0.875rem' }}>
                Sua economia mensal
              </p>
              <p className="font-black text-2xl">
                {formatCurrency(planoSelecionado.economiaMensal)}
              </p>
            </div>
          </div>
          
          <div className={cn(
            "mt-3 pt-3 border-t flex items-center justify-between text-sm",
            planoAtual.unlock ? "border-purple-400/30" : "border-emerald-400/30"
          )}>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span>Economia total no período:</span>
            </div>
            <span className="font-bold text-lg">
              {formatCurrency(planoSelecionado.economiaAcumulada)}
            </span>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
