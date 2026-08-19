import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ConfiguracoesSistema {
  // Empresa - Dados básicos
  whatsapp_numero: string;
  email_contato: string;
  telefone_contato: string;
  empresa_nome: string;
  empresa_slogan: string;
  empresa_domain: string;
  empresa_endereco: string;
  
  // Empresa - Dados jurídicos
  empresa_cnpj: string;
  empresa_cnpj_consorcio: string;
  empresa_razao_social: string;
  empresa_site: string;
  email_financeiro: string;
  
  // Redes sociais
  rede_social_instagram: string;
  rede_social_linkedin: string;
  rede_social_facebook: string;
  
  // Bitrix24
  bitrix24_base_url: string;
  
  // Parâmetros técnicos
  pis_cofins_aliquota: string;
  disponibilidade_monofasico: string;
  disponibilidade_bifasico: string;
  disponibilidade_trifasico: string;
  
  // Comerciais
  taxa_bancaria_coesa: string;
  tarifa_padrao_coesa: string;
  
  // Públicos
  public_app_url: string;
  public_cache_bust: string;
  
  // Auth
  auth_default_email_domain: string;
  
  // WhatsApp Suporte (página pública)
  whatsapp_suporte_numero: string;
  whatsapp_suporte_mensagem: string;
  
  // Hero Section
  hero_video_youtube_id: string;
  hero_video_origin: string;
  hero_stats: string;
  
  // Home Background Images (Phase 14 - Zero Hardcode 100%)
  home_bg_about: string;
  home_bg_how_it_works: string;
  home_bg_cta: string;
  home_bg_why_choose: string;
}

const defaultConfigs: ConfiguracoesSistema = {
  // Empresa - Dados básicos
  whatsapp_numero: '5511999999999',
  email_contato: 'contato@coesaenergia.com.br',
  telefone_contato: '(11) 99999-9999',
  empresa_nome: 'COESA Energia Inteligente',
  empresa_slogan: 'Soluções em Energia Renovável',
  empresa_domain: '@coesaenergia.com.br',
  empresa_endereco: 'Av. Paulista, 1000, São Paulo - SP',
  
  // Empresa - Dados jurídicos
  empresa_cnpj: '00.000.000/0001-00',
  empresa_cnpj_consorcio: '',
  empresa_razao_social: 'COESA ENERGIA LTDA',
  empresa_site: 'www.coesaenergia.com.br',
  email_financeiro: 'financeiro@coesaenergia.com.br',
  
  // Redes sociais
  rede_social_instagram: 'https://instagram.com/coesaenergia',
  rede_social_linkedin: 'https://linkedin.com/company/coesa-energia',
  rede_social_facebook: 'https://facebook.com/coesaenergia',
  
  // Bitrix24
  bitrix24_base_url: 'https://coesaenergia.bitrix24.com.br',
  
  // Parâmetros técnicos
  pis_cofins_aliquota: '0.0365',
  disponibilidade_monofasico: '30',
  disponibilidade_bifasico: '50',
  disponibilidade_trifasico: '100',
  
  // Comerciais
  taxa_bancaria_coesa: '4.50',
  tarifa_padrao_coesa: '0.80',
  
  // Públicos
  public_app_url: '',
  public_cache_bust: Date.now().toString(),
  
  // Auth
  auth_default_email_domain: '@coesaenergia.com.br',
  
  // WhatsApp Suporte (página pública)
  whatsapp_suporte_numero: '5531999999999',
  whatsapp_suporte_mensagem: 'Olá! Preciso de ajuda com a validação dos meus documentos para a proposta de energia solar.',
  
  // Hero Section
  hero_video_youtube_id: 'ftw1xfJQ5jM',
  hero_video_origin: 'https://coesa-propose-craft.lovable.app',
  hero_stats: '[{"icon":"Zap","value":"30%","label":"Economia"},{"icon":"Leaf","value":"100%","label":"Energia Limpa"},{"icon":"Shield","value":"5 anos","label":"Garantia"},{"icon":"Clock","value":"0","label":"Investimento"}]',
  
  // Home Background Images (Phase 14 - Zero Hardcode 100%)
  home_bg_about: 'https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80',
  home_bg_how_it_works: 'https://images.unsplash.com/photo-1558449028-b53a39d100fc?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80',
  home_bg_cta: 'https://images.unsplash.com/photo-1497440001374-f26997328c1b?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80',
  home_bg_why_choose: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80',
};

export function useConfiguracoes() {
  const [configs, setConfigs] = useState<ConfiguracoesSistema>(defaultConfigs);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfigs() {
      try {
        const { data, error } = await supabase
          .from('configuracoes_sistema')
          .select('chave, valor');

        if (error) throw error;

        if (data && data.length > 0) {
          const configsMap = data.reduce((acc, item) => {
            acc[item.chave as keyof ConfiguracoesSistema] = item.valor;
            return acc;
          }, {} as ConfiguracoesSistema);

          setConfigs({ ...defaultConfigs, ...configsMap });
        }
      } catch (err) {
        console.error('Error loading configs:', err);
        setError('Erro ao carregar configurações');
      } finally {
        setLoading(false);
      }
    }

    loadConfigs();
  }, []);

  const updateConfig = async (chave: keyof ConfiguracoesSistema, valor: string) => {
    try {
      const { error } = await supabase
        .from('configuracoes_sistema')
        .update({ valor })
        .eq('chave', chave);

      if (error) throw error;

      setConfigs(prev => ({ ...prev, [chave]: valor }));
      return true;
    } catch (err) {
      console.error('Error updating config:', err);
      return false;
    }
  };

  const updateConfigs = async (updates: Partial<ConfiguracoesSistema>) => {
    try {
      const promises = Object.entries(updates).map(([chave, valor]) =>
        supabase
          .from('configuracoes_sistema')
          .update({ valor })
          .eq('chave', chave)
      );

      await Promise.all(promises);

      setConfigs(prev => ({ ...prev, ...updates }));
      return true;
    } catch (err) {
      console.error('Error updating configs:', err);
      return false;
    }
  };

  return { configs, loading, error, updateConfig, updateConfigs };
}
