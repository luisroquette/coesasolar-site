import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ParametrosMacro {
  ano: number;
  ipca: number | null;
  cdi: number | null;
  igpm: number | null;
  inflacao_energetica: number | null;
  fio_b: number | null;
}

// Valores padrão se não houver registro no banco
export const DEFAULT_PARAMETROS_MACRO: ParametrosMacro = {
  ano: new Date().getFullYear(),
  ipca: 4.5,
  cdi: 11,
  igpm: 5,
  inflacao_energetica: 7, // 7% - valor padrão histórico
  fio_b: 0.6,
};

/**
 * Hook para buscar parâmetros macroeconômicos do banco de dados
 * Retorna os valores do ano atual ou os padrões se não existir
 */
export function useParametrosMacro() {
  const currentYear = new Date().getFullYear();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['parametros_macro', currentYear],
    queryFn: async () => {
      // Buscar parâmetros do ano atual ou do ano mais recente
      const { data, error } = await supabase
        .from('parametros_macro')
        .select('*')
        .order('ano', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[useParametrosMacro] Error fetching:', error);
        return DEFAULT_PARAMETROS_MACRO;
      }

      if (!data) {
        console.log('[useParametrosMacro] No data found, using defaults');
        return DEFAULT_PARAMETROS_MACRO;
      }

      return {
        ano: data.ano,
        ipca: data.ipca ?? DEFAULT_PARAMETROS_MACRO.ipca,
        cdi: data.cdi ?? DEFAULT_PARAMETROS_MACRO.cdi,
        igpm: data.igpm ?? DEFAULT_PARAMETROS_MACRO.igpm,
        inflacao_energetica: data.inflacao_energetica ?? DEFAULT_PARAMETROS_MACRO.inflacao_energetica,
        fio_b: data.fio_b ?? DEFAULT_PARAMETROS_MACRO.fio_b,
      } as ParametrosMacro;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Helper para converter percentual para decimal (7 -> 0.07)
  const inflacaoEnergeticaDecimal = (data?.inflacao_energetica ?? DEFAULT_PARAMETROS_MACRO.inflacao_energetica!) / 100;

  return {
    parametros: data ?? DEFAULT_PARAMETROS_MACRO,
    inflacaoEnergeticaDecimal,
    isLoading,
    error,
    refetch,
  };
}
