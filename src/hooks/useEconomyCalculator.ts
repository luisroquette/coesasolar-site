import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface EconomyConfig {
  disponibilidadeMonofasico: number;
  disponibilidadeBifasico: number;
  disponibilidadeTrifasico: number;
  cipDefault: number;
  tarifaFallback: number;
  pisCofinsAliquota: number;
  inflacaoEnergetica: number;
  unlockThreshold: number;
  descontoDefault: number;
  fidelidadeDefault: number;
  whatsappNumero: string;
}

export interface PlanoComercial {
  id: string;
  nome: string;
  desconto_percentual: number;
  fidelidade_anos: number;
  consumo_minimo_kwh: number;
  ativo: boolean;
  destaque: boolean;
  unlock: boolean;
  ordem: number;
}

export interface Concessionaria {
  id: string;
  nome: string;
  uf: string | null;
  tarifa: number;
}

export interface CalculoResult {
  consumoEstimado: number;
  tipoInstalacao: 'Monofásico' | 'Bifásico' | 'Trifásico';
  disponibilidadeKwh: number;
  disponibilidadeValor: number;
  valorAtual: number;
  valorComCoesa: number;
  pisCofinsValor: number;
  economiaMensal: number;
  economiaPercentual: number;
  economiaAnual: number;
  economiaAcumulada: number;
  planoUnlockBloqueado: boolean;
  fidelidadeAnos: number;
  tarifaUtilizada: number;
}

export type TipoInstalacao = 'Monofásico' | 'Bifásico' | 'Trifásico';

const defaultConfig: EconomyConfig = {
  disponibilidadeMonofasico: 30,
  disponibilidadeBifasico: 50,
  disponibilidadeTrifasico: 100,
  cipDefault: 25,
  tarifaFallback: 0.79,
  pisCofinsAliquota: 0.0365,
  inflacaoEnergetica: 0.07,
  unlockThreshold: 3000,
  descontoDefault: 25,
  fidelidadeDefault: 3,
  whatsappNumero: '5531936180487',
};

// Cache for configs
let cachedConfig: EconomyConfig | null = null;
let cachedPlanos: PlanoComercial[] | null = null;
let cachedConcessionarias: Concessionaria[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Fallback distribuidoras (usado apenas se BD falhar)
const DEFAULT_MAIN_DISTRIBUIDORAS = [
  { nome: 'CEMIG-D', uf: 'MG', tarifa: 0.86 },
  { nome: 'COELBA', uf: 'BA', tarifa: 0.82 },
  { nome: 'CPFL-PAULISTA', uf: 'SP', tarifa: 0.78 },
];

export function useEconomyCalculator() {
  const [config, setConfig] = useState<EconomyConfig>(defaultConfig);
  const [planos, setPlanos] = useState<PlanoComercial[]>([]);
  const [concessionarias, setConcessionarias] = useState<Concessionaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfigs() {
      const now = Date.now();
      
      // Use cache if valid
      if (cachedConfig && cachedPlanos && cachedConcessionarias && now - cacheTimestamp < CACHE_TTL_MS) {
        setConfig(cachedConfig);
        setPlanos(cachedPlanos);
        setConcessionarias(cachedConcessionarias);
        setLoading(false);
        return;
      }

      try {
        // Load configs first to get dynamic distribuidoras list
        const configResult = await supabase
          .from('configuracoes_sistema')
          .select('chave, valor')
          .or('chave.like.economy_%,chave.eq.whatsapp_numero');

        if (configResult.error) throw configResult.error;

        // Parse configs to get main distribuidoras from DB
        const configMap = new Map<string, string>();
        configResult.data?.forEach((item) => {
          configMap.set(item.chave, item.valor);
        });

        // Get main distribuidoras from config (or use fallback)
        let mainDistribuidoras: Array<{ nome: string; uf: string; tarifa: number }>;
        try {
          const configValue = configMap.get('economy_main_distribuidoras');
          mainDistribuidoras = configValue 
            ? JSON.parse(configValue) 
            : DEFAULT_MAIN_DISTRIBUIDORAS;
        } catch {
          mainDistribuidoras = DEFAULT_MAIN_DISTRIBUIDORAS;
        }

        const mainNomes = mainDistribuidoras.map(d => d.nome);

        // Load rest in parallel
        const [planosResult, concessionariasResult, icmsResult] = await Promise.all([
          supabase
            .from('planos_comerciais')
            .select('*')
            .eq('ativo', true)
            .order('ordem', { ascending: true }),
          supabase
            .from('concessionarias')
            .select('id, nome, uf, tarifa_com_impostos, tarifa_media')
            .in('nome', mainNomes),
          supabase
            .from('icms_estados')
            .select('uf, icms_percentual'),
        ]);

        if (planosResult.error) throw planosResult.error;
        if (concessionariasResult.error) throw concessionariasResult.error;

        const loadedConfig: EconomyConfig = {
          disponibilidadeMonofasico: parseFloat(configMap.get('economy_disponibilidade_monofasico') || '') || defaultConfig.disponibilidadeMonofasico,
          disponibilidadeBifasico: parseFloat(configMap.get('economy_disponibilidade_bifasico') || '') || defaultConfig.disponibilidadeBifasico,
          disponibilidadeTrifasico: parseFloat(configMap.get('economy_disponibilidade_trifasico') || '') || defaultConfig.disponibilidadeTrifasico,
          cipDefault: parseFloat(configMap.get('economy_cip_default') || '') || defaultConfig.cipDefault,
          tarifaFallback: parseFloat(configMap.get('economy_tarifa_fallback') || '') || defaultConfig.tarifaFallback,
          pisCofinsAliquota: parseFloat(configMap.get('economy_pis_cofins_aliquota') || '') || defaultConfig.pisCofinsAliquota,
          inflacaoEnergetica: parseFloat(configMap.get('economy_inflacao_energetica') || '') || defaultConfig.inflacaoEnergetica,
          unlockThreshold: parseFloat(configMap.get('economy_unlock_threshold') || '') || defaultConfig.unlockThreshold,
          descontoDefault: parseFloat(configMap.get('economy_desconto_default') || '') || defaultConfig.descontoDefault,
          fidelidadeDefault: parseFloat(configMap.get('economy_fidelidade_default') || '') || defaultConfig.fidelidadeDefault,
          whatsappNumero: configMap.get('whatsapp_numero') || defaultConfig.whatsappNumero,
        };

        // Build ICMS map by UF
        const icmsMap = new Map<string, number>();
        icmsResult.data?.forEach((item) => {
          icmsMap.set(item.uf, item.icms_percentual / 100); // Convert to decimal
        });

        // Parse concessionarias - calculate tarifa_com_impostos including ICMS + PIS/COFINS
        // Formula: tarifa_com_impostos = tarifa_media / (1 - ICMS) / (1 - PIS/COFINS)
        const pisCofins = loadedConfig.pisCofinsAliquota;
        const loadedConcessionarias: Concessionaria[] = (concessionariasResult.data || []).map((c) => {
          const tarifaBase = c.tarifa_media || defaultConfig.tarifaFallback;
          
          // Se tarifa_com_impostos já existe no BD, usa ela
          if (c.tarifa_com_impostos) {
            return {
              id: c.id,
              nome: c.nome,
              uf: c.uf,
              tarifa: c.tarifa_com_impostos,
            };
          }
          
          // Senão, calcula incluindo ICMS + PIS/COFINS
          const icmsAliquota = icmsMap.get(c.uf || '') || 0;
          const tarifaComImpostos = tarifaBase / (1 - icmsAliquota) / (1 - pisCofins);
          
          return {
            id: c.id,
            nome: c.nome,
            uf: c.uf,
            tarifa: tarifaComImpostos,
          };
        });

        // If main distribuidoras not found in DB, add from config fallback
        const existingNomes = loadedConcessionarias.map(c => c.nome);
        mainDistribuidoras.forEach(dist => {
          if (!existingNomes.includes(dist.nome)) {
            loadedConcessionarias.push({
              id: `${dist.nome.toLowerCase().replace(/[^a-z0-9]/g, '-')}-fallback`,
              nome: dist.nome,
              uf: dist.uf,
              tarifa: dist.tarifa,
            });
          }
        });

        // Update cache
        cachedConfig = loadedConfig;
        cachedPlanos = planosResult.data || [];
        cachedConcessionarias = loadedConcessionarias;
        cacheTimestamp = now;

        setConfig(loadedConfig);
        setPlanos(planosResult.data || []);
        setConcessionarias(loadedConcessionarias);
      } catch (err) {
        console.error('Error loading economy configs:', err);
        setError('Erro ao carregar configurações');
        // Set fallback concessionarias on error (from constant)
        setConcessionarias(
          DEFAULT_MAIN_DISTRIBUIDORAS.map(d => ({
            id: `${d.nome.toLowerCase().replace(/[^a-z0-9]/g, '-')}-fallback`,
            nome: d.nome,
            uf: d.uf,
            tarifa: d.tarifa,
          }))
        );
      } finally {
        setLoading(false);
      }
    }

    loadConfigs();
  }, []);

  const calcular = useCallback(
    (
      valorConta: number,
      descontoPercentual: number,
      cipCustom?: number,
      tipoInstalacaoCustom?: TipoInstalacao,
      tarifaCustom?: number
    ): CalculoResult | null => {
      if (valorConta <= 0) return null;

      // Use custom values or defaults
      const cip = cipCustom ?? config.cipDefault;
      const tarifa = tarifaCustom ?? config.tarifaFallback;

      // 1. Estima consumo
      const consumo = Math.max(0, (valorConta - cip) / tarifa);

      // 2. Determina tipo de instalação (custom or automatic)
      let tipoInstalacao: TipoInstalacao;
      let disponibilidadeKwh: number;

      if (tipoInstalacaoCustom) {
        tipoInstalacao = tipoInstalacaoCustom;
        disponibilidadeKwh = tipoInstalacao === 'Monofásico' 
          ? config.disponibilidadeMonofasico 
          : tipoInstalacao === 'Bifásico' 
            ? config.disponibilidadeBifasico 
            : config.disponibilidadeTrifasico;
      } else {
        if (consumo <= 200) {
          tipoInstalacao = 'Monofásico';
          disponibilidadeKwh = config.disponibilidadeMonofasico;
        } else if (consumo <= 1000) {
          tipoInstalacao = 'Bifásico';
          disponibilidadeKwh = config.disponibilidadeBifasico;
        } else {
          tipoInstalacao = 'Trifásico';
          disponibilidadeKwh = config.disponibilidadeTrifasico;
        }
      }

      // 3. Calcula base COM COESA
      const disponibilidadeValor = disponibilidadeKwh * tarifa;
      const consumoExcedente = Math.max(0, consumo - disponibilidadeKwh);
      const valorExcedenteComDesconto =
        consumoExcedente * tarifa * (1 - descontoPercentual / 100);
      const baseAntesImpostos = disponibilidadeValor + cip + valorExcedenteComDesconto;

      // 4. Aplica PIS/COFINS "por dentro" (gross-up)
      const baseComPisCofins = baseAntesImpostos / (1 - config.pisCofinsAliquota);
      const pisCofinsValor = baseComPisCofins - baseAntesImpostos;

      // 5. Total COM COESA
      const valorComCoesa = baseComPisCofins;

      // 6. Economia
      const economiaMensal = Math.max(0, valorConta - valorComCoesa);
      const economiaPercentual = valorConta > 0 ? (economiaMensal / valorConta) * 100 : 0;
      const economiaAnual = economiaMensal * 12;

      // 7. Determina fidelidade baseado no plano
      const plano = planos.find((p) => p.desconto_percentual === descontoPercentual);
      const fidelidadeAnos = plano?.fidelidade_anos || config.fidelidadeDefault;

      // 8. Economia acumulada (com inflação)
      let economiaAcumulada = 0;
      for (let ano = 1; ano <= fidelidadeAnos; ano++) {
        economiaAcumulada += economiaAnual * Math.pow(1 + config.inflacaoEnergetica, ano - 1);
      }

      // 9. Verifica UNLOCK
      const planoUnlockBloqueado = consumo < config.unlockThreshold && descontoPercentual >= 30;

      return {
        consumoEstimado: Math.round(consumo),
        tipoInstalacao,
        disponibilidadeKwh,
        disponibilidadeValor,
        valorAtual: valorConta,
        valorComCoesa,
        pisCofinsValor,
        economiaMensal,
        economiaPercentual,
        economiaAnual,
        economiaAcumulada,
        planoUnlockBloqueado,
        fidelidadeAnos,
        tarifaUtilizada: tarifa,
      };
    },
    [config, planos]
  );

  const getWhatsAppLink = useCallback(
    (mensagem?: string) => {
      const texto = mensagem || 'Olá! Vi a calculadora no site e gostaria de um orçamento.';
      return `https://wa.me/${config.whatsappNumero}?text=${encodeURIComponent(texto)}`;
    },
    [config.whatsappNumero]
  );

  return {
    config,
    planos,
    concessionarias,
    loading,
    error,
    calcular,
    getWhatsAppLink,
  };
}
