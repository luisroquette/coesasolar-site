import { AlertTriangle, CheckCircle2, ArrowRight, FileCheck2, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { DataDivergence, ComparisonResult } from '@/types/data-comparison';
import { cn } from '@/lib/utils';

interface DataDivergenceAlertProps {
  comparison: ComparisonResult;
  className?: string;
}

function formatDisplayValue(value: string | number | null, tipo: 'texto' | 'numero' | 'documento'): string {
  if (value === null || value === undefined || value === '') {
    return '(não informado)';
  }
  
  if (tipo === 'numero' && typeof value === 'number') {
    return value.toLocaleString('pt-BR') + ' kWh';
  }
  
  return String(value);
}

function DivergenceRow({ divergence }: { divergence: DataDivergence }) {
  return (
    <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center py-2 border-b border-amber-100 last:border-0">
      {/* Original Value */}
      <div className="text-left">
        <span className="text-xs text-muted-foreground block mb-0.5">
          Cadastrado
        </span>
        <span className="text-sm text-red-600 line-through">
          {formatDisplayValue(divergence.valorOriginal, divergence.tipo)}
        </span>
      </div>
      
      {/* Arrow */}
      <div className="flex items-center justify-center">
        <ArrowRight className="h-4 w-4 text-amber-500" />
      </div>
      
      {/* Extracted Value */}
      <div className="text-right">
        <span className="text-xs text-muted-foreground block mb-0.5">
          Documento
        </span>
        <span className="text-sm text-emerald-700 font-medium flex items-center justify-end gap-1">
          {formatDisplayValue(divergence.valorExtraido, divergence.tipo)}
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        </span>
      </div>
    </div>
  );
}

export function DataDivergenceAlert({ comparison, className }: DataDivergenceAlertProps) {
  if (!comparison.hasDivergences) {
    return null;
  }

  return (
    <Card className={cn("bg-gradient-to-r from-amber-50 to-orange-50 border-amber-300 shadow-md", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 rounded-full">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg text-amber-800 flex items-center gap-2">
              Divergências Detectadas
              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 text-xs">
                {comparison.totalDivergencias} {comparison.totalDivergencias === 1 ? 'campo' : 'campos'}
              </Badge>
            </CardTitle>
            <p className="text-sm text-amber-700 mt-1">
              Os dados extraídos dos documentos diferem dos informados anteriormente.
            </p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {/* Divergences Table */}
        <div className="bg-white/80 rounded-lg border border-amber-200 p-3 mb-4">
          <div className="grid grid-cols-[1fr,auto,1fr] gap-2 text-xs font-medium text-muted-foreground border-b border-amber-100 pb-2 mb-2">
            <span className="text-left">Valor Cadastrado</span>
            <span></span>
            <span className="text-right">Valor do Documento</span>
          </div>
          
          {comparison.divergences.map((divergence, index) => (
            <div key={index}>
              <div className="text-xs font-medium text-amber-800 mb-1 mt-2 first:mt-0">
                {divergence.campoLabel}
              </div>
              <DivergenceRow divergence={divergence} />
            </div>
          ))}
        </div>

        {/* Action Info */}
        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <FileCheck2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-emerald-800">
              Ação automática
            </p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Os dados extraídos dos documentos oficiais serão utilizados por serem a fonte mais confiável.
              O Bitrix24 será atualizado automaticamente com as informações corretas.
            </p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-emerald-500" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  Documentos oficiais como RG, CNH e conta de energia são considerados fontes primárias.
                  Dados digitados manualmente podem conter erros de transcrição.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}
