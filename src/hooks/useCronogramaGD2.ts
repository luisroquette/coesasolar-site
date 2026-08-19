import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CronogramaGD2 {
  id: string;
  ano: number;
  percentual: number;
  descricao: string | null;
  created_at: string;
  updated_at: string;
}

// Cache simples
let cachedCronograma: Record<number, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export function useCronogramaGD2() {
  const [cronograma, setCronograma] = useState<CronogramaGD2[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCronograma = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('cronograma_gd2')
        .select('*')
        .order('ano', { ascending: true });

      if (fetchError) throw fetchError;

      setCronograma(data as CronogramaGD2[]);
      
      // Atualiza cache
      cachedCronograma = {};
      data?.forEach((item: CronogramaGD2) => {
        cachedCronograma![item.ano] = item.percentual;
      });
      cacheTimestamp = Date.now();
      
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar cronograma GD2:', err);
      setError('Erro ao carregar cronograma');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateItem = async (id: string, percentual: number, descricao?: string) => {
    try {
      const { error } = await supabase
        .from('cronograma_gd2')
        .update({ percentual, descricao })
        .eq('id', id);

      if (error) throw error;
      
      // Invalida cache
      cachedCronograma = null;
      await fetchCronograma();
      return true;
    } catch (err) {
      console.error('Erro ao atualizar cronograma:', err);
      return false;
    }
  };

  const addItem = async (ano: number, percentual: number, descricao?: string) => {
    try {
      const { error } = await supabase
        .from('cronograma_gd2')
        .insert({ ano, percentual, descricao });

      if (error) throw error;
      
      cachedCronograma = null;
      await fetchCronograma();
      return true;
    } catch (err) {
      console.error('Erro ao adicionar ao cronograma:', err);
      return false;
    }
  };

  const deleteItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from('cronograma_gd2')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      cachedCronograma = null;
      await fetchCronograma();
      return true;
    } catch (err) {
      console.error('Erro ao excluir do cronograma:', err);
      return false;
    }
  };

  useEffect(() => {
    fetchCronograma();
  }, [fetchCronograma]);

  return { 
    cronograma, 
    loading, 
    error, 
    refresh: fetchCronograma,
    updateItem,
    addItem,
    deleteItem
  };
}

/**
 * Retorna o percentual GD2 para um ano específico
 * Usado nos cálculos de propostas
 */
export async function getPercentualGD2(ano: number): Promise<number> {
  // Usar cache se válido
  if (cachedCronograma && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedCronograma[ano] ?? getDefaultPercentual(ano);
  }

  try {
    const { data } = await supabase
      .from('cronograma_gd2')
      .select('ano, percentual');

    if (data) {
      cachedCronograma = {};
      data.forEach((item: { ano: number; percentual: number }) => {
        cachedCronograma![item.ano] = item.percentual;
      });
      cacheTimestamp = Date.now();
      return cachedCronograma[ano] ?? getDefaultPercentual(ano);
    }
  } catch (err) {
    console.error('Erro ao buscar percentual GD2:', err);
  }

  return getDefaultPercentual(ano);
}

/**
 * Retorna todo o cronograma como Record<ano, percentual>
 */
export async function getCronogramaGD2Completo(): Promise<Record<number, number>> {
  if (cachedCronograma && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedCronograma;
  }

  try {
    const { data } = await supabase
      .from('cronograma_gd2')
      .select('ano, percentual');

    if (data) {
      cachedCronograma = {};
      data.forEach((item: { ano: number; percentual: number }) => {
        cachedCronograma![item.ano] = item.percentual;
      });
      cacheTimestamp = Date.now();
      return cachedCronograma;
    }
  } catch (err) {
    console.error('Erro ao buscar cronograma GD2:', err);
  }

  return getDefaultCronograma();
}

// Fallback hardcoded (usado apenas se BD falhar)
function getDefaultPercentual(ano: number): number {
  const defaults: Record<number, number> = {
    2023: 0,
    2024: 0.15,
    2025: 0.30,
    2026: 0.45,
    2027: 0.60,
    2028: 0.75,
    2029: 0.90,
  };
  return defaults[ano] ?? 0.90;
}

function getDefaultCronograma(): Record<number, number> {
  return {
    2023: 0,
    2024: 0.15,
    2025: 0.30,
    2026: 0.45,
    2027: 0.60,
    2028: 0.75,
    2029: 0.90,
  };
}
