import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ═══════════════════════════════════════════════════════════════
// ZERO HARDCODE: Form options loaded from configuracoes_sistema
// ═══════════════════════════════════════════════════════════════

interface FormOptions {
  tiposInstalacao: string[];
  tiposGD: string[];
  tiposComercializacao: string[];
  regimesTributarios: string[];
  loading: boolean;
}

// Fallback values for resilience
const FALLBACK_TIPOS_INSTALACAO = ['Monofásico', 'Bifásico', 'Trifásico'];
const FALLBACK_TIPOS_GD = ['GD I', 'GD II', 'GD III'];
const FALLBACK_TIPOS_COMERCIALIZACAO = ['Melhores Esforços', 'PPA'];
const FALLBACK_REGIMES_TRIBUTARIOS = ['SIMPLES', 'Lucro Presumido'];

// Cache
let cachedOptions: Omit<FormOptions, 'loading'> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useFormOptions(): FormOptions {
  const [options, setOptions] = useState<Omit<FormOptions, 'loading'>>({
    tiposInstalacao: cachedOptions?.tiposInstalacao || FALLBACK_TIPOS_INSTALACAO,
    tiposGD: cachedOptions?.tiposGD || FALLBACK_TIPOS_GD,
    tiposComercializacao: cachedOptions?.tiposComercializacao || FALLBACK_TIPOS_COMERCIALIZACAO,
    regimesTributarios: cachedOptions?.regimesTributarios || FALLBACK_REGIMES_TRIBUTARIOS,
  });
  const [loading, setLoading] = useState(!cachedOptions || Date.now() - cacheTimestamp > CACHE_TTL);

  useEffect(() => {
    if (cachedOptions && Date.now() - cacheTimestamp < CACHE_TTL) {
      setOptions(cachedOptions);
      setLoading(false);
      return;
    }

    const loadOptions = async () => {
      try {
        const { data, error } = await supabase
          .from('configuracoes_sistema')
          .select('chave, valor')
          .in('chave', [
            'tipos_instalacao',
            'tipos_gd',
            'tipos_comercializacao',
            'regimes_tributarios',
          ]);

        if (error) {
          console.error('Error loading form options:', error);
          return;
        }

        if (data) {
          const configMap = Object.fromEntries(data.map(d => [d.chave, d.valor]));

          const parsedOptions = {
            tiposInstalacao: configMap['tipos_instalacao']
              ? JSON.parse(configMap['tipos_instalacao'])
              : FALLBACK_TIPOS_INSTALACAO,
            tiposGD: configMap['tipos_gd']
              ? JSON.parse(configMap['tipos_gd'])
              : FALLBACK_TIPOS_GD,
            tiposComercializacao: configMap['tipos_comercializacao']
              ? JSON.parse(configMap['tipos_comercializacao'])
              : FALLBACK_TIPOS_COMERCIALIZACAO,
            regimesTributarios: configMap['regimes_tributarios']
              ? JSON.parse(configMap['regimes_tributarios'])
              : FALLBACK_REGIMES_TRIBUTARIOS,
          };

          cachedOptions = parsedOptions;
          cacheTimestamp = Date.now();
          setOptions(parsedOptions);
        }
      } catch (err) {
        console.error('Error parsing form options:', err);
      } finally {
        setLoading(false);
      }
    };

    loadOptions();
  }, []);

  return { ...options, loading };
}

// ═══════════════════════════════════════════════════════════════
// UI CONFIG HOOK
// ═══════════════════════════════════════════════════════════════

interface UIConfig {
  defaultPageSize: number;
  toastLimit: number;
  toastRemoveDelay: number;
  activityLogPageSize: number;
  loading: boolean;
}

const FALLBACK_UI_CONFIG = {
  defaultPageSize: 20,
  toastLimit: 1,
  toastRemoveDelay: 1000000,
  activityLogPageSize: 20,
};

let cachedUIConfig: Omit<UIConfig, 'loading'> | null = null;
let uiCacheTimestamp = 0;

export function useUIConfig(): UIConfig {
  const [config, setConfig] = useState<Omit<UIConfig, 'loading'>>(
    cachedUIConfig || FALLBACK_UI_CONFIG
  );
  const [loading, setLoading] = useState(!cachedUIConfig || Date.now() - uiCacheTimestamp > CACHE_TTL);

  useEffect(() => {
    if (cachedUIConfig && Date.now() - uiCacheTimestamp < CACHE_TTL) {
      setConfig(cachedUIConfig);
      setLoading(false);
      return;
    }

    const loadConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('configuracoes_sistema')
          .select('chave, valor')
          .in('chave', [
            'ui_default_page_size',
            'ui_toast_limit',
            'ui_toast_remove_delay_ms',
            'ui_activity_log_page_size',
          ]);

        if (error) {
          console.error('Error loading UI config:', error);
          return;
        }

        if (data) {
          const configMap = Object.fromEntries(data.map(d => [d.chave, d.valor]));

          const parsedConfig = {
            defaultPageSize: parseInt(configMap['ui_default_page_size'] || '') || FALLBACK_UI_CONFIG.defaultPageSize,
            toastLimit: parseInt(configMap['ui_toast_limit'] || '') || FALLBACK_UI_CONFIG.toastLimit,
            toastRemoveDelay: parseInt(configMap['ui_toast_remove_delay_ms'] || '') || FALLBACK_UI_CONFIG.toastRemoveDelay,
            activityLogPageSize: parseInt(configMap['ui_activity_log_page_size'] || '') || FALLBACK_UI_CONFIG.activityLogPageSize,
          };

          cachedUIConfig = parsedConfig;
          uiCacheTimestamp = Date.now();
          setConfig(parsedConfig);
        }
      } catch (err) {
        console.error('Error parsing UI config:', err);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  return { ...config, loading };
}

// ═══════════════════════════════════════════════════════════════
// DEMO CONFIG HOOK (for proposal editor simulations)
// ═══════════════════════════════════════════════════════════════

interface DemoConfig {
  consumoSimuladoKwh: number;
  consumoMinUnlockKwh: number;
  loading: boolean;
}

const FALLBACK_DEMO_CONFIG = {
  consumoSimuladoKwh: 1500,
  consumoMinUnlockKwh: 3000,
};

let cachedDemoConfig: Omit<DemoConfig, 'loading'> | null = null;
let demoCacheTimestamp = 0;

export function useDemoConfig(): DemoConfig {
  const [config, setConfig] = useState<Omit<DemoConfig, 'loading'>>(
    cachedDemoConfig || FALLBACK_DEMO_CONFIG
  );
  const [loading, setLoading] = useState(!cachedDemoConfig || Date.now() - demoCacheTimestamp > CACHE_TTL);

  useEffect(() => {
    if (cachedDemoConfig && Date.now() - demoCacheTimestamp < CACHE_TTL) {
      setConfig(cachedDemoConfig);
      setLoading(false);
      return;
    }

    const loadConfig = async () => {
      try {
        const { data, error } = await supabase
          .from('configuracoes_sistema')
          .select('chave, valor')
          .in('chave', ['demo_consumo_simulado_kwh', 'demo_consumo_min_unlock_kwh']);

        if (error) {
          console.error('Error loading demo config:', error);
          return;
        }

        if (data) {
          const configMap = Object.fromEntries(data.map(d => [d.chave, d.valor]));

          const parsedConfig = {
            consumoSimuladoKwh: parseInt(configMap['demo_consumo_simulado_kwh'] || '') || FALLBACK_DEMO_CONFIG.consumoSimuladoKwh,
            consumoMinUnlockKwh: parseInt(configMap['demo_consumo_min_unlock_kwh'] || '') || FALLBACK_DEMO_CONFIG.consumoMinUnlockKwh,
          };

          cachedDemoConfig = parsedConfig;
          demoCacheTimestamp = Date.now();
          setConfig(parsedConfig);
        }
      } catch (err) {
        console.error('Error parsing demo config:', err);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  return { ...config, loading };
}
