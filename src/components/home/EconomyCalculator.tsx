import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calculator, Zap, TrendingUp, Lock, ExternalLink, HelpCircle } from 'lucide-react';
import { useEconomyCalculator, CalculoResult, TipoInstalacao } from '@/hooks/useEconomyCalculator';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import faturaCipExemplo from '@/assets/fatura-cip-exemplo.png';
import faturaTipoInstalacaoExemplo from '@/assets/fatura-tipo-instalacao-exemplo.png';
interface PlanOption {
  desconto: number;
  nome: string;
  fidelidade: number;
  destaque: boolean;
  unlock: boolean;
}

const TIPOS_INSTALACAO: { value: TipoInstalacao; label: string; kwh: number }[] = [
  { value: 'Monofásico', label: 'Monofásico', kwh: 30 },
  { value: 'Bifásico', label: 'Bifásico', kwh: 50 },
  { value: 'Trifásico', label: 'Trifásico', kwh: 100 },
];

export function EconomyCalculator() {
  const { config, planos, concessionarias, loading, calcular, getWhatsAppLink } = useEconomyCalculator();
  
  // Main inputs
  const [valorConta, setValorConta] = useState<string>('');
  const [valorNumerico, setValorNumerico] = useState<number>(0);
  const [descontoSelecionado, setDescontoSelecionado] = useState<number>(25);
  
  // Parameters inputs (always visible)
  const [cipCustom, setCipCustom] = useState<string>('');
  const [tipoInstalacao, setTipoInstalacao] = useState<TipoInstalacao>('Bifásico');
  const [distribuidoraSelecionada, setDistribuidoraSelecionada] = useState<string>('CEMIG-D');

  // Initialize defaults from config
  useEffect(() => {
    if (config.descontoDefault) {
      setDescontoSelecionado(config.descontoDefault);
    }
  }, [config.descontoDefault]);

  // Get tariff for selected distribuidora
  const tarifaSelecionada = useMemo(() => {
    const conc = concessionarias.find(c => c.nome === distribuidoraSelecionada);
    return conc?.tarifa || config.tarifaFallback;
  }, [distribuidoraSelecionada, concessionarias, config.tarifaFallback]);

  // Get disponibilidade for selected tipo
  const disponibilidadeSelecionada = useMemo(() => {
    return TIPOS_INSTALACAO.find(t => t.value === tipoInstalacao)?.kwh || 50;
  }, [tipoInstalacao]);

  // Convert planos to plan options
  const planOptions: PlanOption[] = useMemo(() => {
    if (planos.length > 0) {
      return planos.map((p) => ({
        desconto: p.desconto_percentual,
        nome: p.nome,
        fidelidade: p.fidelidade_anos,
        destaque: p.destaque,
        unlock: p.unlock,
      }));
    }
    // Fallback options
    return [
      { desconto: 15, nome: 'Flex', fidelidade: 1, destaque: false, unlock: false },
      { desconto: 20, nome: 'Economia', fidelidade: 2, destaque: false, unlock: false },
      { desconto: 25, nome: 'Premium', fidelidade: 3, destaque: true, unlock: false },
      { desconto: 30, nome: 'Unlock', fidelidade: 4, destaque: false, unlock: true },
    ];
  }, [planos]);

  // Calculate result with custom params
  const resultado: CalculoResult | null = useMemo(() => {
    if (valorNumerico <= 0) return null;
    
    const cipValue = cipCustom ? parseFloat(cipCustom.replace(',', '.')) : undefined;
    
    return calcular(
      valorNumerico,
      descontoSelecionado,
      cipValue,
      tipoInstalacao,
      tarifaSelecionada
    );
  }, [valorNumerico, descontoSelecionado, cipCustom, tipoInstalacao, tarifaSelecionada, calcular]);

  // Handle input change with currency mask
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    const numValue = parseInt(raw, 10) / 100;
    
    if (isNaN(numValue)) {
      setValorConta('');
      setValorNumerico(0);
      return;
    }

    setValorNumerico(numValue);
    setValorConta(
      numValue.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  };

  // Format currency
  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Input Section */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-muted-foreground">
          Quanto você paga de luz por mês?
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-muted-foreground">
            R$
          </span>
          <input
            type="text"
            value={valorConta}
            onChange={handleInputChange}
            placeholder="0,00"
            className="w-full pl-14 pr-4 py-4 text-2xl font-bold bg-background border-2 border-border rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none"
          />
        </div>
      </div>

      {/* Parameters Section - Always Visible */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-muted-foreground">
            Parâmetros da simulação
          </p>
          <span className="text-xs text-muted-foreground/70">
            (deixe em branco para usar os valores padrão)
          </span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-xl border border-border">
          {/* CIP */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <label className="block text-xs font-medium text-muted-foreground">
                Contribuição de Iluminação Pública (R$)
              </label>
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="w-80 p-3">
                    <p className="text-xs mb-2"><strong>CIP</strong> (Contribuição para Iluminação Pública) é uma taxa municipal cobrada na sua conta de luz.</p>
                    <div className="relative rounded-md overflow-hidden border border-border group cursor-zoom-in">
                      <img 
                        src={faturaCipExemplo} 
                        alt="Exemplo de CIP na fatura" 
                        className="w-full transition-transform duration-300 group-hover:scale-150 origin-center" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none group-hover:opacity-0 transition-opacity duration-300" />
                      <div className="absolute bottom-1 left-1 right-1 text-[10px] text-white font-medium text-center group-hover:opacity-0 transition-opacity duration-300">
                        Procure por "Contrib Ilum Publica" na sua fatura
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Passe o mouse para ampliar</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <input
              type="text"
              value={cipCustom}
              onChange={(e) => setCipCustom(e.target.value.replace(/[^\d,]/g, ''))}
              placeholder={config.cipDefault.toString()}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none"
            />
            <p className="text-[10px] text-muted-foreground">
              Se não preenchido: <span className="font-medium text-foreground">R$ {config.cipDefault}</span>
            </p>
          </div>

          {/* Disponibilidade */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <label className="block text-xs font-medium text-muted-foreground">
                Tipo de Instalação
              </label>
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="w-80 p-3">
                    <p className="text-xs mb-1"><strong>Tipo de Instalação</strong> define a demanda mínima cobrada:</p>
                    <ul className="text-xs mb-2 space-y-0.5">
                      <li>• <strong>Monofásico</strong>: 30 kWh</li>
                      <li>• <strong>Bifásico</strong>: 50 kWh</li>
                      <li>• <strong>Trifásico</strong>: 100 kWh</li>
                    </ul>
                    <div className="relative rounded-md overflow-hidden border border-border group cursor-zoom-in">
                      <img 
                        src={faturaTipoInstalacaoExemplo} 
                        alt="Exemplo de Tipo de Instalação na fatura" 
                        className="w-full transition-transform duration-300 group-hover:scale-150 origin-center" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none group-hover:opacity-0 transition-opacity duration-300" />
                      <div className="absolute bottom-1 left-1 right-1 text-[10px] text-white font-medium text-center group-hover:opacity-0 transition-opacity duration-300">
                        Veja em "Classe" na sua fatura (ex: Trifásico)
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5 text-center">Passe o mouse para ampliar</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <select
              value={tipoInstalacao}
              onChange={(e) => setTipoInstalacao(e.target.value as TipoInstalacao)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none"
            >
              {TIPOS_INSTALACAO.map((tipo) => (
                <option key={tipo.value} value={tipo.value}>
                  {tipo.label} ({tipo.kwh} kWh)
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">
              Padrão: <span className="font-medium text-foreground">Bifásico (50 kWh)</span>
            </p>
          </div>

          {/* Distribuidora */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <label className="block text-xs font-medium text-muted-foreground">
                Distribuidora
              </label>
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-xs">
                    <p><strong>Distribuidora</strong> é a empresa que entrega a energia elétrica na sua região. Cada uma tem tarifas diferentes definidas pela ANEEL.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <select
              value={distribuidoraSelecionada}
              onChange={(e) => setDistribuidoraSelecionada(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all outline-none"
            >
              {concessionarias.map((c) => (
                <option key={c.id} value={c.nome}>
                  {c.nome} {c.uf ? `(${c.uf})` : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">
              Tarifa c/ impostos: <span className="font-medium text-foreground">R$ {tarifaSelecionada.toFixed(4)}/kWh</span>
            </p>
          </div>
        </div>
      </div>

      {/* Plan Selector */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-muted-foreground">
          Selecione seu plano de desconto:
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {planOptions.map((plan) => {
            // Unlock plan (30%) requires minimum consumption from config (3000 kWh)
            const consumoAtual = resultado?.consumoEstimado || 0;
            const isUnlockBlocked = plan.unlock && consumoAtual < config.unlockThreshold;
            const isSelected = descontoSelecionado === plan.desconto;

            return (
              <button
                key={plan.desconto}
                onClick={() => !isUnlockBlocked && setDescontoSelecionado(plan.desconto)}
                disabled={isUnlockBlocked}
                className={cn(
                  'relative p-3 rounded-xl border-2 transition-all text-center',
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
                    : 'border-border hover:border-primary/50',
                  isUnlockBlocked && 'opacity-50 cursor-not-allowed bg-muted/30',
                  plan.destaque && !isSelected && 'border-primary/30'
                )}
              >
                {plan.destaque && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[10px] font-bold bg-primary text-primary-foreground rounded-full">
                    POPULAR
                  </span>
                )}
                {isUnlockBlocked && (
                  <div className="absolute -top-2 right-1 flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold bg-amber-500 text-white rounded-full">
                    <Lock className="h-2.5 w-2.5" />
                    BLOQUEADO
                  </div>
                )}
                <div className={cn("text-2xl font-bold", isUnlockBlocked ? "text-muted-foreground" : "text-foreground")}>
                  {plan.desconto}%
                </div>
                <div className="text-xs text-muted-foreground">{plan.nome}</div>
                <div className="text-xs text-muted-foreground">
                  {plan.fidelidade} {plan.fidelidade === 1 ? 'ano' : 'anos'}
                </div>
              </button>
            );
          })}
        </div>
        
        {/* Unlock Banner */}
        {planOptions.some(p => p.unlock) && (resultado?.consumoEstimado || 0) < config.unlockThreshold && valorNumerico >= 100 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl"
          >
            <div className="p-1.5 bg-amber-500/20 rounded-lg">
              <Lock className="h-4 w-4 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Plano UNLOCK (30%) bloqueado
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Disponível apenas para consumos acima de <strong className="text-foreground">{config.unlockThreshold.toLocaleString('pt-BR')} kWh/mês</strong>. 
                Seu consumo estimado: <strong className="text-foreground">{resultado?.consumoEstimado || 0} kWh/mês</strong>
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {resultado && valorNumerico >= 100 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            {/* Main Results Card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-background to-primary/5 border border-primary/20 p-6">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
              
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
                <Zap className="h-5 w-5 text-primary" />
                Sua economia com COESA
              </h3>

              {/* Consumption Estimate */}
              <div className="text-sm text-muted-foreground mb-4">
                📊 Consumo estimado: <span className="font-semibold text-foreground">~{resultado.consumoEstimado} kWh/mês</span>
                <span className="ml-2 text-xs">({resultado.tipoInstalacao})</span>
              </div>

              {/* Before/After */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Você paga hoje:</div>
                  <div className="text-xl font-bold text-foreground">
                    {formatCurrency(resultado.valorAtual)}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Com COESA:</div>
                  <motion.div
                    key={resultado.valorComCoesa}
                    initial={{ scale: 1.1 }}
                    animate={{ scale: 1 }}
                    className="text-xl font-bold text-primary"
                  >
                    {formatCurrency(resultado.valorComCoesa)}
                  </motion.div>
                </div>
              </div>

              {/* Savings Breakdown */}
              <div className="space-y-3 p-4 rounded-xl bg-background/50 border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Calculator className="h-4 w-4" />
                    Economia Mensal:
                  </span>
                  <motion.span
                    key={resultado.economiaMensal}
                    initial={{ scale: 1.2, color: 'hsl(var(--primary))' }}
                    animate={{ scale: 1, color: 'hsl(var(--foreground))' }}
                    className="font-bold text-lg"
                  >
                    {formatCurrency(resultado.economiaMensal)}
                    <span className="text-sm text-primary ml-1">
                      ({resultado.economiaPercentual.toFixed(1)}%)
                    </span>
                  </motion.span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">📅 Economia Anual:</span>
                  <span className="font-semibold">{formatCurrency(resultado.economiaAnual)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Em {resultado.fidelidadeAnos} {resultado.fidelidadeAnos === 1 ? 'ano' : 'anos'}:
                  </span>
                  <motion.span
                    key={resultado.economiaAcumulada}
                    initial={{ scale: 1.1 }}
                    animate={{ scale: 1 }}
                    className="font-bold text-primary"
                  >
                    {formatCurrency(resultado.economiaAcumulada)}
                  </motion.span>
                </div>
              </div>

              {/* Technical Details */}
              <div className="mt-4 text-xs text-muted-foreground flex flex-wrap gap-2">
                <span className="px-2 py-1 bg-muted/50 rounded">
                  CIP: R$ {cipCustom ? parseFloat(cipCustom.replace(',', '.')) : config.cipDefault}
                </span>
                <span className="px-2 py-1 bg-muted/50 rounded">
                  Disponibilidade: {resultado.disponibilidadeKwh} kWh
                </span>
                <span className="px-2 py-1 bg-muted/50 rounded">
                  Tarifa c/ impostos: R$ {resultado.tarifaUtilizada.toFixed(4)}/kWh
                </span>
                <span className="px-2 py-1 bg-muted/50 rounded">
                  PIS/COFINS: {(config.pisCofinsAliquota * 100).toFixed(2)}%
                </span>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                ⚠️ <strong>Valores simulados.</strong> O cálculo considera estimativas baseadas em médias de mercado.
              </p>
              <p className="text-sm text-muted-foreground">
                Para ter acesso a um orçamento personalizado com base na sua fatura real,{' '}
                <a
                  href={getWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-semibold hover:underline inline-flex items-center gap-1"
                >
                  clique aqui para falar com a sofIA no WhatsApp
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>

            {/* CTA Button */}
            <a
              href={getWhatsAppLink('Simulei minha economia no site e queria uma proposta inicial, sofIA!')}
              target="_blank"
              rel="noopener noreferrer"
              className="group block w-full py-5 px-8 bg-primary text-primary-foreground font-bold text-lg text-center rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover-scale"
            >
              QUERO MEU DESCONTO
              <span className="inline-block ml-2 transition-transform group-hover:translate-x-1">→</span>
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Placeholder when no value */}
      {(!resultado || valorNumerico < 100) && valorNumerico > 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Digite um valor acima de R$ 100,00 para ver sua economia</p>
        </div>
      )}
    </div>
  );
}
