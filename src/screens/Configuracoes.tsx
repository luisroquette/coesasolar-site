import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useUIConfig } from '@/hooks/useUIConfig';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Settings, TrendingUp, Building, MapPin, Save, Loader2, User, Upload, Database, Phone, Mail, MessageSquare, Check, X, Link2, RefreshCw, Zap, Percent, Edit2, Pencil, Flag, AlertTriangle, Bell, Users, Terminal, GitBranch, MessageCircle, BarChart3, Clock, Rocket, Calendar, Bot } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { EmailPreferences } from '@/components/settings/EmailPreferences';
import { CustomBitrixFieldsManager } from '@/components/settings/CustomBitrixFieldsManager';
import { CustomBitrixContactFieldsManager } from '@/components/settings/CustomBitrixContactFieldsManager';
import { NotificationRecipientsManager } from '@/components/settings/NotificationRecipientsManager';
import { NotificationFlowsTester } from '@/components/settings/NotificationFlowsTester';
import { NotificationLogsViewer } from '@/components/settings/NotificationLogsViewer';

import { TestPhonesManager } from '@/components/settings/TestPhonesManager';
import { TyposCleanupManager } from '@/components/settings/TyposCleanupManager';
import { PipelineV2Config } from '@/components/settings/PipelineV2Config';
import { BitrixStagesManager } from '@/components/settings/BitrixStagesManager';
import { TemplateManager } from '@/components/proposal-editor/TemplateManager';
import { CronogramaGD2Manager } from '@/components/settings/CronogramaGD2Manager';
import { AutomationSchedulerConfig } from '@/components/settings/AutomationSchedulerConfig';
import { AgentConfigManager } from '@/components/settings/AgentConfigManager';
import { useConfiguracoes } from '@/hooks/useConfiguracoes';
import { formatWhatsAppNumber, isValidWhatsAppNumber, formatWhatsAppDisplay } from '@/lib/whatsapp-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { calcularTarifaComImpostos, detalharImpostosTarifa } from '@/lib/calculations';

const UF_OPTIONS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

interface IcmsEstado {
  id: string;
  uf: string;
  nome_estado: string;
  icms_percentual: number;
  observacoes: string | null;
  icms_isenta_compensacao: boolean | null;
  base_legal: string | null;
  observacoes_gd: string | null;
  vigencia_ate: string | null;
}

interface Concessionaria {
  id: string;
  nome: string;
  uf: string | null;
  tarifa_media: number | null;
  tarifa_com_impostos: number | null;
  tusd: number | null;
  te: number | null;
  subgrupo: string | null;
  modalidade: string | null;
  vigencia_inicio: string | null;
  ultima_atualizacao: string | null;
}

interface BandeiraTarifaria {
  id: string;
  ano_mes: string;
  bandeira: string;
  valor_kwh: number;
}

export default function Configuracoes() {
  const { user } = useAuth();
  const { configs, loading: loadingConfigs, updateConfigs } = useConfiguracoes();
  const { queryLimitBandeiras } = useUIConfig();
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [cidadesCount, setCidadesCount] = useState<number | null>(null);
  
  // Perfil do usuário
  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('');
  
  // Contatos da empresa
  const [whatsappNumero, setWhatsappNumero] = useState('');
  const [emailContato, setEmailContato] = useState('');
  const [telefoneContato, setTelefoneContato] = useState('');
  const [empresaNome, setEmpresaNome] = useState('');
  const [empresaSlogan, setEmpresaSlogan] = useState('');
  const [atendentePlantaoTelefone, setAtendentePlantaoTelefone] = useState('');
  
  // Parâmetros macro
  const [ipca, setIpca] = useState(4.5);
  const [cdi, setCdi] = useState(11);
  const [igpm, setIgpm] = useState(4);
  const [inflacaoEnergetica, setInflacaoEnergetica] = useState(7);
  
  // Concessionárias (do banco)
  const [concessionariasDb, setConcessionariasDb] = useState<Concessionaria[]>([]);
  const [loadingConcessionarias, setLoadingConcessionarias] = useState(false);
  const [syncingAneel, setSyncingAneel] = useState(false);
  const [syncSubgrupo, setSyncSubgrupo] = useState('B1');
  const [syncModalidade, setSyncModalidade] = useState('Convencional');
  const [syncClasse, setSyncClasse] = useState('Residencial');
  const [syncSubclasse, setSyncSubclasse] = useState('Residencial');
  const [syncBaseTarifaria, setSyncBaseTarifaria] = useState('Tarifa de Aplicação');
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string | null>(null);

  // Bitrix24
  const [bitrix24Enabled, setBitrix24Enabled] = useState(false);
  const [bitrix24WebhookUrl, setBitrix24WebhookUrl] = useState('');
  const [bitrix24TargetStatusId, setBitrix24TargetStatusId] = useState('');
  const [bitrix24TargetStatusIdInicial, setBitrix24TargetStatusIdInicial] = useState('');
  const [bitrix24FieldValorConta, setBitrix24FieldValorConta] = useState('');
  const [bitrix24FieldConcessionaria, setBitrix24FieldConcessionaria] = useState('');
  const [bitrix24LinkWhatsappEnabled, setBitrix24LinkWhatsappEnabled] = useState(true);
  const [publicAppUrl, setPublicAppUrl] = useState('');
  const [testingBitrix24, setTestingBitrix24] = useState(false);
  const [loadingStages, setLoadingStages] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [bitrixStages, setBitrixStages] = useState<{id: string; name: string; sort: number}[]>([]);
  const [bitrixFields, setBitrixFields] = useState<{fieldName: string; label: string; type: string}[]>([]);
  
  // Estados removidos - agora todos os campos Bitrix24 são gerenciados dinamicamente pelo CustomBitrixFieldsManager

  // ICMS Estados
  const [icmsEstados, setIcmsEstados] = useState<IcmsEstado[]>([]);
  const [loadingIcms, setLoadingIcms] = useState(false);
  const [editingIcms, setEditingIcms] = useState<string | null>(null);
  const [editIcmsValue, setEditIcmsValue] = useState('');
  const [savingIcms, setSavingIcms] = useState(false);
  const [recalculatingTarifas, setRecalculatingTarifas] = useState(false);

  // Edição de UF de concessionária
  const [editingUfId, setEditingUfId] = useState<string | null>(null);
  const [editUfValue, setEditUfValue] = useState('');
  const [savingUf, setSavingUf] = useState(false);

  // Bandeiras Tarifárias
  const [bandeiras, setBandeiras] = useState<BandeiraTarifaria[]>([]);
  const [loadingBandeiras, setLoadingBandeiras] = useState(false);
  const [syncingBandeiras, setSyncingBandeiras] = useState(false);

  // Load configs when they're ready
  useEffect(() => {
    if (!loadingConfigs) {
      setWhatsappNumero(configs.whatsapp_numero);
      setEmailContato(configs.email_contato);
      setTelefoneContato(configs.telefone_contato);
      setEmpresaNome(configs.empresa_nome);
      setEmpresaSlogan(configs.empresa_slogan);
    }
  }, [configs, loadingConfigs]);

  // Load Bitrix24 config (apenas configs essenciais - os campos customizados são gerenciados pelo CustomBitrixFieldsManager)
  useEffect(() => {
    async function loadBitrix24Config() {
      const { data } = await supabase
        .from('configuracoes_sistema')
        .select('chave, valor')
        .in('chave', [
          'bitrix24_enabled', 
          'bitrix24_webhook_url', 
          'bitrix24_target_status_id', 
          'bitrix24_target_status_id_inicial',
          'bitrix24_field_valor_conta',
          'bitrix24_field_concessionaria',
          'bitrix24_link_whatsapp_enabled',
          'public_app_url',
          'atendente_plantao_telefone'
        ]);

      data?.forEach((config) => {
        if (config.chave === 'bitrix24_enabled') {
          setBitrix24Enabled(config.valor === 'true');
        }
        if (config.chave === 'bitrix24_webhook_url') {
          setBitrix24WebhookUrl(config.valor);
        }
        if (config.chave === 'bitrix24_target_status_id') {
          setBitrix24TargetStatusId(config.valor);
        }
        if (config.chave === 'bitrix24_target_status_id_inicial') {
          setBitrix24TargetStatusIdInicial(config.valor);
        }
        if (config.chave === 'bitrix24_field_valor_conta') {
          setBitrix24FieldValorConta(config.valor);
        }
        if (config.chave === 'bitrix24_field_concessionaria') {
          setBitrix24FieldConcessionaria(config.valor);
        }
        if (config.chave === 'bitrix24_link_whatsapp_enabled') {
          setBitrix24LinkWhatsappEnabled(config.valor !== 'false');
        }
        if (config.chave === 'public_app_url') {
          setPublicAppUrl(config.valor);
        }
        if (config.chave === 'atendente_plantao_telefone') {
          setAtendentePlantaoTelefone(config.valor);
        }
      });
    }
    loadBitrix24Config();
  }, []);

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('nome, cargo')
        .eq('user_id', user.id)
        .single();
      
      if (data) {
        setNome(data.nome || '');
        setCargo(data.cargo || '');
      }
    }
    
    async function loadCidadesCount() {
      const { count } = await supabase
        .from('cidades')
        .select('*', { count: 'exact', head: true });
      setCidadesCount(count);
    }
    
    loadProfile();
    loadCidadesCount();
  }, [user]);

  // Carrega concessionárias, ICMS, bandeiras e parâmetros macro ao montar
  useEffect(() => {
    loadConcessionarias();
    loadIcmsEstados();
    loadBandeiras();
    loadParametrosMacro();
  }, []);

  const loadParametrosMacro = async () => {
    try {
      const anoAtual = new Date().getFullYear();
      const { data, error } = await supabase
        .from('parametros_macro')
        .select('ipca, cdi, igpm, inflacao_energetica')
        .eq('ano', anoAtual)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('Erro ao carregar parâmetros macro:', error);
        return;
      }
      
      if (data) {
        if (data.ipca !== null) setIpca(data.ipca);
        if (data.cdi !== null) setCdi(data.cdi);
        if (data.igpm !== null) setIgpm(data.igpm);
        if (data.inflacao_energetica !== null) setInflacaoEnergetica(data.inflacao_energetica);
      }
    } catch (err) {
      console.error('Erro ao carregar parâmetros macro:', err);
    }
  };

  const loadConcessionarias = async () => {
    setLoadingConcessionarias(true);
    try {
      const { data, error } = await supabase
        .from('concessionarias')
        .select('*')
        .order('nome');
      
      if (error) {
        console.error('Erro ao carregar concessionárias:', error);
        toast.error(`Erro ao carregar concessionárias: ${error.message}`);
        return;
      }
      
      if (data) {
        setConcessionariasDb(data);
        const maisRecente = data.reduce((max, c) => {
          if (!c.ultima_atualizacao) return max;
          return !max || c.ultima_atualizacao > max ? c.ultima_atualizacao : max;
        }, null as string | null);
        setUltimaAtualizacao(maisRecente);
      }
    } catch (err) {
      console.error('Erro inesperado:', err);
      toast.error('Erro inesperado ao carregar concessionárias');
    } finally {
      setLoadingConcessionarias(false);
    }
  };

  const loadIcmsEstados = async () => {
    setLoadingIcms(true);
    try {
      const { data, error } = await supabase
        .from('icms_estados')
        .select('*')
        .order('uf');
      
      if (error) {
        console.error('Erro ao carregar ICMS:', error);
        return;
      }
      
      if (data) {
        setIcmsEstados(data);
      }
    } catch (err) {
      console.error('Erro inesperado:', err);
    } finally {
      setLoadingIcms(false);
    }
  };

  const loadBandeiras = async () => {
    setLoadingBandeiras(true);
    try {
      const { data, error } = await supabase
        .from('bandeiras_tarifarias')
        .select('*')
        .order('ano_mes', { ascending: false })
        .limit(queryLimitBandeiras);
      
      if (error) {
        console.error('Erro ao carregar bandeiras:', error);
        return;
      }
      
      if (data) {
        setBandeiras(data);
      }
    } catch (err) {
      console.error('Erro inesperado:', err);
    } finally {
      setLoadingBandeiras(false);
    }
  };

  const handleUpdateIcms = async (id: string, novoValor: number) => {
    setSavingIcms(true);
    try {
      const { error } = await supabase
        .from('icms_estados')
        .update({ icms_percentual: novoValor })
        .eq('id', id);
      
      if (error) throw error;
      
      toast.success('ICMS atualizado!');
      setEditingIcms(null);
      await loadIcmsEstados();
    } catch (error) {
      console.error('Erro ao atualizar ICMS:', error);
      toast.error('Erro ao atualizar ICMS');
    } finally {
      setSavingIcms(false);
    }
  };

  const handleRecalcularTarifasComImpostos = async () => {
    setRecalculatingTarifas(true);
    try {
      // Carregar ICMS por estado
      const { data: icmsData } = await supabase.from('icms_estados').select('uf, icms_percentual');
      const icmsMap = new Map(icmsData?.map(i => [i.uf, i.icms_percentual / 100]) || []);
      
      // Atualizar cada concessionária
      let atualizadas = 0;
      for (const c of concessionariasDb) {
        if (c.tarifa_media && c.uf) {
          const icms = icmsMap.get(c.uf) || 0.18;
          const tarifaComImpostos = calcularTarifaComImpostos(c.tarifa_media, c.uf, icms);
          
          const { error } = await supabase
            .from('concessionarias')
            .update({ tarifa_com_impostos: tarifaComImpostos })
            .eq('id', c.id);
          
          if (!error) atualizadas++;
        }
      }
      
      toast.success(`${atualizadas} tarifas recalculadas com impostos!`);
      await loadConcessionarias();
    } catch (error) {
      console.error('Erro ao recalcular tarifas:', error);
      toast.error('Erro ao recalcular tarifas');
    } finally {
      setRecalculatingTarifas(false);
    }
  };

  const handleSyncAneel = async () => {
    setSyncingAneel(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('aneel-tarifas', {
        body: {
          sync: true,
          subgrupo: syncSubgrupo,
          modalidade: syncModalidade,
          classe: syncClasse,
          subclasse: syncSubclasse,
          base_tarifaria: syncBaseTarifaria,
          apenas_vigente: true,
        },
      });
      
      if (error) {
        console.error('Erro na chamada:', error);
        throw new Error(error.message || 'Erro ao chamar função de sincronização');
      }
      
      if (!result?.success) {
        throw new Error(result?.error || 'Erro na sincronização');
      }
      
      toast.success(`Sincronização concluída! ${result.inseridas || 0} inseridas, ${result.atualizadas || 0} atualizadas`);
      
      // Reload concessionárias
      await loadConcessionarias();
    } catch (error: any) {
      console.error('Erro ao sincronizar ANEEL:', error);
      toast.error(`Erro: ${error.message || 'Falha na sincronização'}`);
    } finally {
      setSyncingAneel(false);
    }
  };

  const handleSyncBandeiras = async () => {
    setSyncingBandeiras(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('aneel-bandeiras', {
        body: {
          sync: true,
          limite: 24,
        },
      });
      
      if (error) {
        console.error('Erro na chamada:', error);
        throw new Error(error.message || 'Erro ao chamar função de sincronização');
      }
      
      if (!result?.success) {
        throw new Error(result?.error || 'Erro na sincronização');
      }
      
      const stats = result.stats || {};
      toast.success(`Sincronização concluída! ${stats.inserted || 0} inseridas, ${stats.updated || 0} atualizadas`);
      
      // Reload bandeiras
      await loadBandeiras();
    } catch (error: any) {
      console.error('Erro ao sincronizar bandeiras:', error);
      toast.error(`Erro: ${error.message || 'Falha na sincronização'}`);
    } finally {
      setSyncingBandeiras(false);
    }
  };

  const getBandeiraColor = (bandeira: string) => {
    switch (bandeira?.toLowerCase()) {
      case 'verde': return 'bg-green-500';
      case 'amarela': return 'bg-yellow-500';
      case 'vermelha1': return 'bg-red-400';
      case 'vermelha2': return 'bg-red-600';
      case 'escassez': return 'bg-purple-600';
      default: return 'bg-gray-400';
    }
  };

  const getBandeiraLabel = (bandeira: string) => {
    switch (bandeira?.toLowerCase()) {
      case 'verde': return 'Verde';
      case 'amarela': return 'Amarela';
      case 'vermelha1': return 'Vermelha 1';
      case 'vermelha2': return 'Vermelha 2';
      case 'escassez': return 'Escassez Hídrica';
      default: return bandeira;
    }
  };

  const handleUpdateConcessionariaUf = async (id: string, novoUf: string) => {
    setSavingUf(true);
    try {
      const { error } = await supabase
        .from('concessionarias')
        .update({ uf: novoUf || null })
        .eq('id', id);
      
      if (error) throw error;
      
      toast.success('UF atualizada!');
      setEditingUfId(null);
      await loadConcessionarias();
    } catch (error) {
      console.error('Erro ao atualizar UF:', error);
      toast.error('Erro ao atualizar UF');
    } finally {
      setSavingUf(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ nome, cargo })
        .eq('user_id', user.id);
      
      if (error) throw error;
      toast.success('Perfil atualizado com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar perfil');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMacro = async () => {
    setSaving(true);
    try {
      const anoAtual = new Date().getFullYear();
      
      // Verificar se já existe registro para o ano atual
      const { data: existingData, error: fetchError } = await supabase
        .from('parametros_macro')
        .select('id')
        .eq('ano', anoAtual)
        .single();
      
      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }
      
      if (existingData) {
        // Atualizar registro existente
        const { error: updateError } = await supabase
          .from('parametros_macro')
          .update({
            ipca: ipca,
            cdi: cdi,
            igpm: igpm,
            inflacao_energetica: inflacaoEnergetica,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingData.id);
        
        if (updateError) throw updateError;
      } else {
        // Inserir novo registro
        const { error: insertError } = await supabase
          .from('parametros_macro')
          .insert({
            ano: anoAtual,
            ipca: ipca,
            cdi: cdi,
            igpm: igpm,
            inflacao_energetica: inflacaoEnergetica
          });
        
        if (insertError) throw insertError;
      }
      
      toast.success('Parâmetros macroeconômicos salvos!');
    } catch (error) {
      console.error('Erro ao salvar parâmetros macro:', error);
      toast.error('Erro ao salvar parâmetros');
    } finally {
      setSaving(false);
    }
  };

  const handleImportCidades = async () => {
    setImporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-cidades');
      
      if (error) throw error;
      
      toast.success(`${data.count} cidades importadas com sucesso!`);
      setCidadesCount(data.count);
    } catch (error) {
      console.error('Erro ao importar cidades:', error);
      toast.error('Erro ao importar cidades. Tente novamente.');
    } finally {
      setImporting(false);
    }
  };

  const handleSaveBitrix24 = async () => {
    setSaving(true);
    try {
      // Upsert apenas configs essenciais - os campos customizados são gerenciados pelo CustomBitrixFieldsManager
      const configs = [
        { chave: 'bitrix24_enabled', valor: bitrix24Enabled ? 'true' : 'false' },
        { chave: 'bitrix24_webhook_url', valor: bitrix24WebhookUrl },
        { chave: 'bitrix24_target_status_id', valor: bitrix24TargetStatusId },
        { chave: 'bitrix24_target_status_id_inicial', valor: bitrix24TargetStatusIdInicial },
        { chave: 'bitrix24_field_valor_conta', valor: bitrix24FieldValorConta },
        { chave: 'bitrix24_field_concessionaria', valor: bitrix24FieldConcessionaria },
        { chave: 'bitrix24_link_whatsapp_enabled', valor: bitrix24LinkWhatsappEnabled ? 'true' : 'false' },
        { chave: 'public_app_url', valor: publicAppUrl },
      ];

      for (const config of configs) {
        const { error } = await supabase
          .from('configuracoes_sistema')
          .upsert({ chave: config.chave, valor: config.valor }, { onConflict: 'chave' });
        if (error) throw error;
      }

      toast.success('Configurações salvas!');
    } catch (error) {
      console.error('Error saving Bitrix24 config:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleTestBitrix24 = async () => {
    if (!bitrix24WebhookUrl) {
      toast.error('Configure a URL do webhook primeiro');
      return;
    }

    setTestingBitrix24(true);
    try {
      const { data, error } = await supabase.functions.invoke('bitrix24-sync', {
        body: { action: 'test_connection' },
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message || 'Conexão estabelecida!');
      } else {
        toast.error(data.error || 'Erro na conexão');
      }
    } catch (error) {
      console.error('Error testing Bitrix24:', error);
      toast.error('Erro ao testar conexão');
    } finally {
      setTestingBitrix24(false);
    }
  };

  const handleLoadBitrixStages = async () => {
    if (!bitrix24WebhookUrl) {
      toast.error('Configure a URL do webhook primeiro');
      return;
    }

    setLoadingStages(true);
    try {
      const { data, error } = await supabase.functions.invoke('bitrix24-get-stages');

      if (error) throw error;

      if (data.success && data.stages) {
        setBitrixStages(data.stages);
        toast.success(`${data.stages.length} etapas carregadas do Bitrix24`);
      } else {
        toast.error(data.error || 'Erro ao carregar etapas');
      }
    } catch (error) {
      console.error('Error loading Bitrix24 stages:', error);
      toast.error('Erro ao carregar etapas do Bitrix24');
    } finally {
      setLoadingStages(false);
    }
  };

  const handleLoadBitrixFields = async () => {
    if (!bitrix24WebhookUrl) {
      toast.error('Configure a URL do webhook primeiro');
      return;
    }

    setLoadingFields(true);
    try {
      const { data, error } = await supabase.functions.invoke('bitrix24-list-fields');

      if (error) throw error;

      if (data.success && data.fields) {
        setBitrixFields(data.fields);
        toast.success(`${data.fields.length} campos customizados carregados do Bitrix24`);
      } else {
        toast.error(data.error || 'Erro ao carregar campos');
      }
    } catch (error) {
      console.error('Error loading Bitrix24 fields:', error);
      toast.error('Erro ao carregar campos do Bitrix24');
    } finally {
      setLoadingFields(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">
            Configurações
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie seu perfil e parâmetros do sistema
          </p>
        </div>

        <Tabs defaultValue="perfil" className="space-y-6">
          {/* Menu lateral de navegação agrupado */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Sidebar com grupos de abas */}
            <div className="lg:w-64 shrink-0">
              <div className="sticky top-4 space-y-2">
                <Accordion type="multiple" defaultValue={["geral", "tarifario", "integracoes", "automacao"]} className="w-full">
                  {/* Grupo: Geral */}
                  <AccordionItem value="geral" className="border rounded-lg px-2">
                    <AccordionTrigger className="hover:no-underline py-3">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <User className="h-4 w-4 text-primary" />
                        Geral
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <TabsList className="flex flex-col h-auto w-full bg-transparent gap-1">
                        <TabsTrigger value="perfil" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <User className="h-4 w-4" />
                          Perfil
                        </TabsTrigger>
                        <TabsTrigger value="contatos" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <Phone className="h-4 w-4" />
                          Contatos
                        </TabsTrigger>
                        <TabsTrigger value="notificacoes-email" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <Mail className="h-4 w-4" />
                          E-mails
                        </TabsTrigger>
                        <TabsTrigger value="alertas-sofia" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <Bell className="h-4 w-4" />
                          Alertas Sofia
                        </TabsTrigger>
                        <TabsTrigger value="templates" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <Edit2 className="h-4 w-4" />
                          Templates PDF
                        </TabsTrigger>
                      </TabsList>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Grupo: Tarifário */}
                  <AccordionItem value="tarifario" className="border rounded-lg px-2">
                    <AccordionTrigger className="hover:no-underline py-3">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        Tarifário
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <TabsList className="flex flex-col h-auto w-full bg-transparent gap-1">
                        <TabsTrigger value="concessionarias" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <Building className="h-4 w-4" />
                          Concessionárias
                        </TabsTrigger>
                        <TabsTrigger value="icms" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <Percent className="h-4 w-4" />
                          ICMS
                        </TabsTrigger>
                        <TabsTrigger value="bandeiras" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <Flag className="h-4 w-4" />
                          Bandeiras
                        </TabsTrigger>
                        <TabsTrigger value="cidades" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <MapPin className="h-4 w-4" />
                          Cidades
                        </TabsTrigger>
                        <TabsTrigger value="macro" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <TrendingUp className="h-4 w-4" />
                          Macroeconômicos
                        </TabsTrigger>
                        <TabsTrigger value="cronograma-gd2" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <Calendar className="h-4 w-4" />
                          Cronograma GD2
                        </TabsTrigger>
                      </TabsList>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Grupo: Integrações */}
                  <AccordionItem value="integracoes" className="border rounded-lg px-2">
                    <AccordionTrigger className="hover:no-underline py-3">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Link2 className="h-4 w-4 text-blue-500" />
                        Integrações
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <TabsList className="flex flex-col h-auto w-full bg-transparent gap-1">
                        <TabsTrigger value="integracoes" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <GitBranch className="h-4 w-4" />
                          Bitrix24
                        </TabsTrigger>
                      </TabsList>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Grupo: Automação */}
                  <AccordionItem value="automacao" className="border rounded-lg px-2">
                    <AccordionTrigger className="hover:no-underline py-3">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <MessageCircle className="h-4 w-4 text-green-500" />
                        Automação
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <TabsList className="flex flex-col h-auto w-full bg-transparent gap-1">
                        <TabsTrigger value="agent-configs" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <Bot className="h-4 w-4" />
                          Configs por Agente
                        </TabsTrigger>
                        <TabsTrigger value="pipeline-v2" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <Rocket className="h-4 w-4" />
                          Pipeline Sofia v2
                        </TabsTrigger>
                        <TabsTrigger value="schedulers" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <Clock className="h-4 w-4" />
                          Schedulers
                        </TabsTrigger>
                        <TabsTrigger value="test-phones" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <Terminal className="h-4 w-4" />
                          Testes WhatsApp
                        </TabsTrigger>
                        <TabsTrigger value="typos-analytics" className="w-full justify-start gap-2 data-[state=active]:bg-primary/10">
                          <BarChart3 className="h-4 w-4" />
                          Typos Sofia
                        </TabsTrigger>
                      </TabsList>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </div>

            {/* Conteúdo principal */}
            <div className="flex-1 min-w-0">

          {/* Perfil */}
          <TabsContent value="perfil">
            <Card>
              <CardHeader>
                <CardTitle>Informações do Perfil</CardTitle>
                <CardDescription>
                  Seus dados pessoais e de acesso
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
                  <div className="sm:col-span-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      value={user?.email || ''}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  <div>
                    <Label htmlFor="nome">Nome Completo</Label>
                    <Input
                      id="nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Seu nome"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cargo">Cargo</Label>
                    <Input
                      id="cargo"
                      value={cargo}
                      onChange={(e) => setCargo(e.target.value)}
                      placeholder="Ex: Consultor Comercial"
                    />
                  </div>
                </div>
                <Button onClick={handleSaveProfile} disabled={saving}>
                  {saving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
                  ) : (
                    <><Save className="mr-2 h-4 w-4" /> Salvar Perfil</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contatos da Empresa */}
          <TabsContent value="contatos">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  Contatos da Empresa
                </CardTitle>
                <CardDescription>
                  Informações de contato exibidas no PDF e QR Code
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
                  <div className="sm:col-span-2">
                    <Label htmlFor="empresaNome">Nome da Empresa</Label>
                    <Input
                      id="empresaNome"
                      value={empresaNome}
                      onChange={(e) => setEmpresaNome(e.target.value)}
                      placeholder="Nome da empresa"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="empresaSlogan">Slogan</Label>
                    <Input
                      id="empresaSlogan"
                      value={empresaSlogan}
                      onChange={(e) => setEmpresaSlogan(e.target.value)}
                      placeholder="Slogan da empresa"
                    />
                  </div>
                  <div>
                    <Label htmlFor="whatsappNumero" className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      Número WhatsApp
                    </Label>
                    <div className="relative">
                      <Input
                        id="whatsappNumero"
                        value={whatsappNumero}
                        onChange={(e) => setWhatsappNumero(e.target.value)}
                        onBlur={(e) => {
                          const formatted = formatWhatsAppNumber(e.target.value);
                          setWhatsappNumero(formatted);
                        }}
                        placeholder="5531999999999"
                        className={whatsappNumero ? (isValidWhatsAppNumber(whatsappNumero) ? 'border-green-500 pr-10' : 'border-red-500 pr-10') : ''}
                      />
                      {whatsappNumero && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {isValidWhatsAppNumber(whatsappNumero) ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <X className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Formato: DDI+DDD+9+Celular → Ex: 5531991703646
                    </p>
                    {whatsappNumero && isValidWhatsAppNumber(whatsappNumero) && (
                      <p className="text-xs text-green-600 mt-1">
                        ✓ {formatWhatsAppDisplay(whatsappNumero)}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="telefoneContato" className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      Telefone (exibição)
                    </Label>
                    <Input
                      id="telefoneContato"
                      value={telefoneContato}
                      onChange={(e) => setTelefoneContato(e.target.value)}
                      placeholder="(11) 99999-9999"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="emailContato" className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      Email de Contato
                    </Label>
                    <Input
                      id="emailContato"
                      type="email"
                      value={emailContato}
                      onChange={(e) => setEmailContato(e.target.value)}
                      placeholder="contato@empresa.com.br"
                    />
                  </div>
                </div>

                <Separator />

                {/* Atendente de Plantão para Escalação */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Bell className="h-5 w-5 text-orange-500" />
                    <div>
                      <h4 className="font-medium">Atendente de Plantão (Escalação sofIA)</h4>
                      <p className="text-xs text-muted-foreground">
                        Número que receberá alertas via WhatsApp quando a sofIA escalar uma conversa para atendimento humano
                      </p>
                    </div>
                  </div>
                  
                  <div className="max-w-md">
                    <Label htmlFor="atendentePlantao" className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      WhatsApp do Atendente de Plantão
                    </Label>
                    <div className="relative">
                      <Input
                        id="atendentePlantao"
                        value={atendentePlantaoTelefone}
                        onChange={(e) => setAtendentePlantaoTelefone(e.target.value)}
                        onBlur={(e) => {
                          const formatted = formatWhatsAppNumber(e.target.value);
                          setAtendentePlantaoTelefone(formatted);
                        }}
                        placeholder="5531999999999 (deixe vazio para desativar)"
                        className={atendentePlantaoTelefone ? (isValidWhatsAppNumber(atendentePlantaoTelefone) ? 'border-green-500 pr-10' : 'border-red-500 pr-10') : ''}
                      />
                      {atendentePlantaoTelefone && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          {isValidWhatsAppNumber(atendentePlantaoTelefone) ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <X className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Formato: DDI+DDD+9+Celular → Ex: 5531991703646
                    </p>
                    {atendentePlantaoTelefone && isValidWhatsAppNumber(atendentePlantaoTelefone) && (
                      <p className="text-xs text-green-600 mt-1">
                        ✓ {formatWhatsAppDisplay(atendentePlantaoTelefone)}
                      </p>
                    )}
                  </div>

                  <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      <strong>Como funciona:</strong> Quando a sofIA não souber responder uma pergunta, 
                      ela vai informar ao cliente que verificará com a equipe e automaticamente enviará 
                      um alerta para este número com os detalhes da conversa.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <strong>QR Code:</strong> O número de WhatsApp será usado para gerar o QR Code no PDF. 
                    Ao escanear, o cliente será direcionado para uma conversa no WhatsApp com uma mensagem personalizada.
                  </p>
                </div>

                <Button 
                  onClick={async () => {
                    // Validar WhatsApp antes de salvar
                    if (whatsappNumero && !isValidWhatsAppNumber(whatsappNumero)) {
                      toast.error('Número de WhatsApp inválido. Use o formato: DDI+DDD+9+Celular (ex: 5531991703646)');
                      return;
                    }
                    
                    if (atendentePlantaoTelefone && !isValidWhatsAppNumber(atendentePlantaoTelefone)) {
                      toast.error('Número do atendente de plantão inválido. Use o formato: DDI+DDD+9+Celular (ex: 5531991703646)');
                      return;
                    }
                    
                    setSaving(true);
                    
                    // Save regular configs
                    const success = await updateConfigs({
                      whatsapp_numero: whatsappNumero,
                      email_contato: emailContato,
                      telefone_contato: telefoneContato,
                      empresa_nome: empresaNome,
                      empresa_slogan: empresaSlogan,
                    });
                    
                    // Save atendente plantão separately (upsert)
                    const { error: plantaoError } = await supabase
                      .from('configuracoes_sistema')
                      .update({ valor: atendentePlantaoTelefone })
                      .eq('chave', 'atendente_plantao_telefone');
                    
                    setSaving(false);
                    if (success && !plantaoError) {
                      toast.success('Contatos atualizados com sucesso!');
                    } else {
                      toast.error('Erro ao salvar contatos');
                    }
                  }} 
                  disabled={saving}
                >
                  {saving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
                  ) : (
                    <><Save className="mr-2 h-4 w-4" /> Salvar Contatos</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Parâmetros Macroeconômicos */}
          <TabsContent value="macro">
            <Card>
              <CardHeader>
                <CardTitle>Parâmetros Macroeconômicos</CardTitle>
                <CardDescription>
                  Índices utilizados nas projeções financeiras
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 max-w-2xl">
                  <div>
                    <Label htmlFor="ipca">IPCA (% a.a.)</Label>
                    <Input
                      id="ipca"
                      type="number"
                      step="0.1"
                      value={ipca}
                      onChange={(e) => setIpca(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cdi">CDI (% a.a.)</Label>
                    <Input
                      id="cdi"
                      type="number"
                      step="0.25"
                      value={cdi}
                      onChange={(e) => setCdi(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="igpm">IGPM (% a.a.)</Label>
                    <Input
                      id="igpm"
                      type="number"
                      step="0.1"
                      value={igpm}
                      onChange={(e) => setIgpm(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="inflacaoEnergetica">Inflação Energética (% a.a.)</Label>
                    <Input
                      id="inflacaoEnergetica"
                      type="number"
                      step="0.5"
                      value={inflacaoEnergetica}
                      onChange={(e) => setInflacaoEnergetica(Number(e.target.value))}
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Estes valores são usados como padrão nas novas propostas. Você pode alterá-los individualmente em cada proposta.
                </p>
                <Button onClick={handleSaveMacro} disabled={saving}>
                  {saving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
                  ) : (
                    <><Save className="mr-2 h-4 w-4" /> Salvar Parâmetros</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cronograma GD2 */}
          <TabsContent value="cronograma-gd2">
            <CronogramaGD2Manager />
          </TabsContent>

          {/* Concessionárias */}
          <TabsContent value="concessionarias">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Sincronização com ANEEL
                </CardTitle>
                <CardDescription>
                  Importe tarifas oficiais da API de dados abertos da ANEEL
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Info box */}
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    <strong>Filtros aplicados:</strong> Apenas tarifas vigentes (resolução mais recente) serão importadas.
                    Configure os filtros abaixo conforme a imagem do Power BI da ANEEL.
                  </p>
                </div>

                {/* Filtros de sincronização - 2 linhas */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label>Base Tarifária</Label>
                    <Select value={syncBaseTarifaria} onValueChange={setSyncBaseTarifaria}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Tarifa de Aplicação">Tarifa de Aplicação</SelectItem>
                        <SelectItem value="Base Econômica">Base Econômica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Subgrupo</Label>
                    <Select value={syncSubgrupo} onValueChange={setSyncSubgrupo}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="B1">B1 - Residencial</SelectItem>
                        <SelectItem value="B2">B2 - Rural</SelectItem>
                        <SelectItem value="B3">B3 - Comercial</SelectItem>
                        <SelectItem value="A4">A4 - Alta Tensão</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Modalidade</Label>
                    <Select value={syncModalidade} onValueChange={setSyncModalidade}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Convencional">Convencional</SelectItem>
                        <SelectItem value="Branca">Branca</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Classe</Label>
                    <Select value={syncClasse} onValueChange={setSyncClasse}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Residencial">Residencial</SelectItem>
                        <SelectItem value="Comercial">Comercial</SelectItem>
                        <SelectItem value="Industrial">Industrial</SelectItem>
                        <SelectItem value="Rural">Rural</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Subclasse</Label>
                    <Select value={syncSubclasse} onValueChange={setSyncSubclasse}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Residencial">Residencial (padrão)</SelectItem>
                        <SelectItem value="Baixa Renda">Baixa Renda</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <Button 
                    onClick={handleSyncAneel} 
                    disabled={syncingAneel}
                    size="lg"
                  >
                    {syncingAneel ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sincronizando...</>
                    ) : (
                      <><RefreshCw className="mr-2 h-4 w-4" /> Sincronizar com ANEEL</>
                    )}
                  </Button>
                  
                  {ultimaAtualizacao && (
                    <p className="text-sm text-muted-foreground">
                      Última atualização: {new Date(ultimaAtualizacao).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>

                <Separator />

                {/* Bandeira Tarifária Vigente */}
                {bandeiras.length > 0 && (
                  <div className="p-4 bg-muted/50 rounded-lg flex items-center gap-4">
                    <Flag className={`h-6 w-6 ${
                      bandeiras[0].bandeira.toLowerCase().includes('verde') ? 'text-green-600' :
                      bandeiras[0].bandeira.toLowerCase().includes('amarela') ? 'text-yellow-500' :
                      bandeiras[0].bandeira.toLowerCase().includes('vermelha') ? 'text-red-600' :
                      'text-muted-foreground'
                    }`} />
                    <div>
                      <p className="text-sm text-muted-foreground">Bandeira Tarifária Vigente ({bandeiras[0].ano_mes})</p>
                      <p className="font-semibold">{bandeiras[0].bandeira} — R$ {bandeiras[0].valor_kwh.toFixed(5).replace('.', ',')}/kWh</p>
                    </div>
                  </div>
                )}

                {/* Tabela de concessionárias */}
                <div>
                  <h4 className="font-medium mb-4">Concessionárias Cadastradas ({concessionariasDb.length})</h4>
                  
                  {loadingConcessionarias ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : concessionariasDb.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Nenhuma concessionária cadastrada.</p>
                      <p className="text-sm">Clique em "Sincronizar ANEEL" para importar.</p>
                    </div>
                  ) : (
                    <div className="rounded-md border max-h-96 overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                          <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>UF</TableHead>
                            <TableHead className="text-right">TUSD</TableHead>
                            <TableHead className="text-right">TE</TableHead>
                            <TableHead className="text-right">Bandeira</TableHead>
                            <TableHead className="text-right">Tarifa s/ Impostos</TableHead>
                            <TableHead className="text-right">Tarifa c/ Impostos</TableHead>
                            <TableHead>Subgrupo</TableHead>
                            <TableHead>Vigência</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {concessionariasDb.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="font-medium">{c.nome}</TableCell>
                              <TableCell>
                                {editingUfId === c.id ? (
                                  <div className="flex items-center gap-1">
                                    <Select 
                                      value={editUfValue} 
                                      onValueChange={setEditUfValue}
                                    >
                                      <SelectTrigger className="w-20 h-8">
                                        <SelectValue placeholder="UF" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="">-</SelectItem>
                                        {UF_OPTIONS.map(uf => (
                                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8"
                                      disabled={savingUf}
                                      onClick={() => handleUpdateConcessionariaUf(c.id, editUfValue)}
                                    >
                                      {savingUf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8"
                                      onClick={() => setEditingUfId(null)}
                                    >
                                      <X className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span className={c.uf ? '' : 'text-muted-foreground'}>{c.uf || '-'}</span>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6 opacity-50 hover:opacity-100"
                                      onClick={() => {
                                        setEditingUfId(c.id);
                                        setEditUfValue(c.uf || '');
                                      }}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {c.tusd ? `R$ ${c.tusd.toFixed(4).replace('.', ',')}` : '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {c.te ? `R$ ${c.te.toFixed(4).replace('.', ',')}` : '-'}
                              </TableCell>
                              <TableCell className={`text-right font-mono text-xs ${
                                bandeiras[0]?.bandeira?.toLowerCase().includes('verde') ? 'text-green-600' :
                                bandeiras[0]?.bandeira?.toLowerCase().includes('amarela') ? 'text-yellow-600' :
                                bandeiras[0]?.bandeira?.toLowerCase().includes('vermelha') ? 'text-red-600' :
                                ''
                              }`}>
                                {bandeiras[0] ? `R$ ${bandeiras[0].valor_kwh.toFixed(5).replace('.', ',')}` : '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {c.tarifa_media ? `R$ ${c.tarifa_media.toFixed(4).replace('.', ',')}` : '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono font-bold text-primary">
                                {c.tarifa_com_impostos 
                                  ? `R$ ${c.tarifa_com_impostos.toFixed(4).replace('.', ',')}` 
                                  : c.tarifa_media && c.uf 
                                    ? `R$ ${calcularTarifaComImpostos(c.tarifa_media, c.uf).toFixed(4).replace('.', ',')}*`
                                    : '-'}
                              </TableCell>
                              <TableCell>{c.subgrupo || '-'}</TableCell>
                              <TableCell>
                                {c.vigencia_inicio 
                                  ? new Date(c.vigencia_inicio).toLocaleDateString('pt-BR')
                                  : '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-4 items-center">
                  <Button 
                    onClick={handleRecalcularTarifasComImpostos}
                    disabled={recalculatingTarifas || concessionariasDb.length === 0}
                    variant="outline"
                  >
                    {recalculatingTarifas ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recalculando...</>
                    ) : (
                      <><Percent className="mr-2 h-4 w-4" /> Calcular Tarifas com Impostos</>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    * Valores calculados em tempo real (não salvos no banco)
                  </p>
                </div>

                <p className="text-xs text-muted-foreground">
                  Dados importados da API de Dados Abertos da ANEEL. Recomenda-se sincronizar mensalmente.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cidades */}
          <TabsContent value="cidades">
            <Card>
              <CardHeader>
                <CardTitle>Base de Cidades</CardTitle>
                <CardDescription>
                  Índices solarimétricos por cidade do Brasil
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                  <Database className="h-8 w-8 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">Cidades cadastradas</p>
                    <p className="text-2xl font-bold text-primary">
                      {cidadesCount !== null ? cidadesCount.toLocaleString('pt-BR') : '...'}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Importar Base de Cidades</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Importa aproximadamente 750 cidades principais do Brasil com seus índices solarimétricos médios.
                      Esta ação substitui todos os dados existentes.
                    </p>
                    <Button 
                      onClick={handleImportCidades} 
                      disabled={importing}
                      variant="outline"
                    >
                      {importing ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importando...</>
                      ) : (
                        <><Upload className="mr-2 h-4 w-4" /> Importar Cidades</>
                      )}
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Os índices solarimétricos são utilizados para calcular a geração estimada das usinas fotovoltaicas.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ICMS por Estado */}
          <TabsContent value="icms">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-5 w-5 text-primary" />
                  ICMS por Estado
                </CardTitle>
                <CardDescription>
                  Alíquotas de ICMS e regras fiscais da compensação de energia (Convênio ICMS 16/2015)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Info Box sobre ICMS Tarifário vs Compensação */}
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-amber-900 dark:text-amber-100">ICMS Tarifário ≠ ICMS da Compensação</h4>
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                        O <strong>ICMS Tarifário</strong> (alíquota %) incide sobre o fornecimento de energia. 
                        O <strong>ICMS da Compensação</strong> (toggle) define se o estado isenta a energia compensada na GD (Convênio 16/2015).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <h4 className="font-medium">Fórmula do Cálculo Tarifário</h4>
                  <code className="block p-3 bg-background rounded text-sm font-mono">
                    Tarifa Final = (TE + TUSD) ÷ (1 − 3,65%) × (1 + ICMS)
                  </code>
                  <p className="text-xs text-muted-foreground">
                    PIS (0,65%) + COFINS (3,00%) = 3,65% incidem "por dentro". ICMS incide "por fora".
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button 
                    onClick={handleRecalcularTarifasComImpostos}
                    disabled={recalculatingTarifas || concessionariasDb.length === 0}
                  >
                    {recalculatingTarifas ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recalculando...</>
                    ) : (
                      <><RefreshCw className="mr-2 h-4 w-4" /> Recalcular Tarifas com Impostos</>
                    )}
                  </Button>
                </div>

                <Separator />

                {loadingIcms ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="rounded-md border max-h-[500px] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card z-10">
                        <TableRow>
                          <TableHead>UF</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead className="text-right">ICMS Tarifa (%)</TableHead>
                          <TableHead className="text-center">Isenta Compensação GD?</TableHead>
                          <TableHead>Base Legal / Observações</TableHead>
                          <TableHead className="w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {icmsEstados.map((estado) => (
                          <TableRow key={estado.id}>
                            <TableCell className="font-bold">{estado.uf}</TableCell>
                            <TableCell>{estado.nome_estado}</TableCell>
                            <TableCell className="text-right">
                              {editingIcms === estado.id ? (
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={editIcmsValue}
                                  onChange={(e) => setEditIcmsValue(e.target.value)}
                                  className="w-24 text-right"
                                  autoFocus
                                />
                              ) : (
                                <span className="font-mono text-primary font-bold">
                                  {estado.icms_percentual.toFixed(2).replace('.', ',')}%
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-2">
                                <Switch
                                  checked={estado.icms_isenta_compensacao ?? false}
                                  onCheckedChange={async (checked) => {
                                    try {
                                      const { error } = await supabase
                                        .from('icms_estados')
                                        .update({ icms_isenta_compensacao: checked })
                                        .eq('id', estado.id);
                                      if (error) throw error;
                                      await loadIcmsEstados();
                                      toast.success(`${estado.uf}: isenção ${checked ? 'ativada' : 'desativada'}`);
                                    } catch (err) {
                                      toast.error('Erro ao atualizar');
                                    }
                                  }}
                                />
                                <span className={`text-xs font-medium ${estado.icms_isenta_compensacao ? 'text-green-600' : 'text-muted-foreground'}`}>
                                  {estado.icms_isenta_compensacao ? 'SIM' : 'NÃO'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-64">
                              <div className="space-y-0.5">
                                {estado.base_legal && (
                                  <p className="font-medium text-foreground">{estado.base_legal}</p>
                                )}
                                {estado.observacoes_gd && (
                                  <p className="text-amber-600 dark:text-amber-400">{estado.observacoes_gd}</p>
                                )}
                                {estado.vigencia_ate && (
                                  <p className="text-red-600 dark:text-red-400">
                                    Vigência até: {new Date(estado.vigencia_ate).toLocaleDateString('pt-BR')}
                                  </p>
                                )}
                                {!estado.base_legal && !estado.observacoes_gd && (
                                  <span>{estado.observacoes || '-'}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {editingIcms === estado.id ? (
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleUpdateIcms(estado.id, parseFloat(editIcmsValue))}
                                    disabled={savingIcms}
                                  >
                                    {savingIcms ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingIcms(null)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingIcms(estado.id);
                                    setEditIcmsValue(estado.icms_percentual.toString());
                                  }}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="p-3 rounded-lg bg-muted/30 border text-xs text-muted-foreground space-y-1">
                  <p>
                    <strong>ICMS da Compensação:</strong> Estados que concedem isenção (Convênio ICMS 16/2015) excluem a energia compensada da base do ICMS.
                  </p>
                  <p>
                    Estados <strong>SEM</strong> isenção cobram ICMS sobre toda a energia, reduzindo a economia do cliente em GD.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bandeiras Tarifárias */}
          <TabsContent value="bandeiras">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flag className="h-5 w-5 text-primary" />
                  Bandeiras Tarifárias
                </CardTitle>
                <CardDescription>
                  Histórico de bandeiras tarifárias da ANEEL para cálculo de faturas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Bandeira Vigente */}
                {bandeiras.length > 0 && (
                  <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                    <div className={`w-12 h-12 rounded-full ${getBandeiraColor(bandeiras[0].bandeira)} flex items-center justify-center`}>
                      <Flag className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Bandeira Vigente ({bandeiras[0].ano_mes})</p>
                      <p className="text-xl font-bold">{getBandeiraLabel(bandeiras[0].bandeira)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Adicional</p>
                      <p className="text-xl font-bold font-mono">
                        R$ {bandeiras[0].valor_kwh.toFixed(5).replace('.', ',')} /kWh
                      </p>
                    </div>
                  </div>
                )}

                {/* Sincronização */}
                <div className="flex items-center gap-4 p-4 rounded-lg border">
                  <div className="flex-1">
                    <p className="font-medium">Sincronizar com ANEEL</p>
                    <p className="text-sm text-muted-foreground">
                      Atualiza o histórico de bandeiras tarifárias diretamente da API de Dados Abertos da ANEEL
                    </p>
                  </div>
                  <Button 
                    onClick={handleSyncBandeiras}
                    disabled={syncingBandeiras}
                  >
                    {syncingBandeiras ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sincronizando...</>
                    ) : (
                      <><RefreshCw className="mr-2 h-4 w-4" /> Sincronizar Bandeiras</>
                    )}
                  </Button>
                </div>

                <Separator />

                {/* Tabela de Histórico */}
                <div>
                  <h4 className="font-medium mb-3">Histórico de Bandeiras (últimos 24 meses)</h4>
                  
                  {loadingBandeiras ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : bandeiras.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Flag className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Nenhuma bandeira cadastrada.</p>
                      <p className="text-sm">Clique em "Sincronizar Bandeiras" para importar da ANEEL.</p>
                    </div>
                  ) : (
                    <div className="rounded-md border max-h-96 overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-card z-10">
                          <TableRow>
                            <TableHead>Período</TableHead>
                            <TableHead>Bandeira</TableHead>
                            <TableHead className="text-right">Adicional (R$/kWh)</TableHead>
                            <TableHead className="text-right">Adicional (R$/MWh)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bandeiras.map((b) => (
                            <TableRow key={b.id}>
                              <TableCell className="font-mono">{b.ano_mes}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className={`w-3 h-3 rounded-full ${getBandeiraColor(b.bandeira)}`} />
                                  <span className="font-medium">{getBandeiraLabel(b.bandeira)}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                R$ {b.valor_kwh.toFixed(5).replace('.', ',')}
                              </TableCell>
                              <TableCell className="text-right font-mono text-muted-foreground">
                                R$ {(b.valor_kwh * 1000).toFixed(2).replace('.', ',')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-muted/30 rounded-lg space-y-2">
                  <p className="font-medium text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Sobre as Bandeiras Tarifárias
                  </p>
                  <p className="text-xs text-muted-foreground">
                    A bandeira tarifária é definida mensalmente pela ANEEL e indica o custo adicional da geração de energia.
                    Bandeira Verde não tem custo adicional. As bandeiras Amarela e Vermelha (patamares 1 e 2) 
                    adicionam valores à tarifa para cobrir custos de geração térmica em períodos de estiagem.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Integrações */}
          <TabsContent value="integracoes">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-5 w-5 text-primary" />
                  Integração Bitrix24
                </CardTitle>
                <CardDescription>
                  Configure a integração bidirecional com o Bitrix24 CRM
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Configurações Básicas - Sempre Visível */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">Integração Ativa</p>
                    <p className="text-sm text-muted-foreground">
                      Ative para sincronizar leads automaticamente
                    </p>
                  </div>
                  <Switch
                    checked={bitrix24Enabled}
                    onCheckedChange={setBitrix24Enabled}
                  />
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">Enviar Link via WhatsApp</p>
                    <p className="text-sm text-muted-foreground">
                      Quando o campo "Link Proposta COESA" for preenchido no Bitrix24, a IA envia automaticamente via WhatsApp
                    </p>
                  </div>
                  <Switch
                    checked={bitrix24LinkWhatsappEnabled}
                    onCheckedChange={setBitrix24LinkWhatsappEnabled}
                  />
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="publicAppUrl">URL Pública do Aplicativo</Label>
                    <Input
                      id="publicAppUrl"
                      value={publicAppUrl}
                      onChange={(e) => setPublicAppUrl(e.target.value)}
                      placeholder="https://coesasolar.com.br"
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      URL base do aplicativo usada nos links de proposta enviados ao cliente
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="bitrix24WebhookUrl">URL do Webhook (Inbound)</Label>
                    <Input
                      id="bitrix24WebhookUrl"
                      value={bitrix24WebhookUrl}
                      onChange={(e) => setBitrix24WebhookUrl(e.target.value)}
                      placeholder="https://seu-dominio.bitrix24.com.br/rest/..."
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Cole aqui a URL do webhook gerado no Bitrix24
                    </p>
                  </div>

                  {/* Controle de Versão de Cache */}
                  <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-3">
                    <div className="flex items-start gap-2">
                      <RefreshCw className="h-5 w-5 text-amber-600 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-medium text-amber-900 dark:text-amber-100">Controle de Versão do Cache</h4>
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                          Se clientes estiverem vendo versões antigas da proposta, clique em "Forçar Nova Versão".
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <code className="text-xs px-2 py-1 bg-amber-100 dark:bg-amber-900/50 rounded font-mono">
                        v={configs.public_cache_bust || 'não definido'}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-300 text-amber-700 hover:bg-amber-100"
                        onClick={async () => {
                          const newVersion = Date.now().toString();
                          try {
                            const { error } = await supabase
                              .from('configuracoes_sistema')
                              .upsert({ chave: 'public_cache_bust', valor: newVersion }, { onConflict: 'chave' });
                            
                            if (error) throw error;
                            
                            await updateConfigs({ public_cache_bust: newVersion } as any);
                            toast.success('Nova versão gerada! Novos links usarão v=' + newVersion.slice(-6));
                          } catch (err) {
                            console.error('Erro ao atualizar cache bust:', err);
                            toast.error('Erro ao gerar nova versão');
                          }
                        }}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Forçar Nova Versão
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button onClick={handleSaveBitrix24} disabled={saving}>
                    {saving ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
                    ) : (
                      <><Save className="mr-2 h-4 w-4" /> Salvar Configurações</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleTestBitrix24}
                    disabled={testingBitrix24 || !bitrix24WebhookUrl}
                  >
                    {testingBitrix24 ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testando...</>
                    ) : (
                      <><Link2 className="mr-2 h-4 w-4" /> Testar Conexão</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleLoadBitrixStages}
                    disabled={loadingStages || !bitrix24WebhookUrl}
                  >
                    {loadingStages ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...</>
                    ) : (
                      <><RefreshCw className="mr-2 h-4 w-4" /> Carregar Etapas</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleLoadBitrixFields}
                    disabled={loadingFields || !bitrix24WebhookUrl}
                  >
                    {loadingFields ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...</>
                    ) : (
                      <><Database className="mr-2 h-4 w-4" /> Carregar Campos</>
                    )}
                  </Button>
                </div>

                <Separator />

                {/* Accordion para as seções */}
                <Accordion type="multiple" defaultValue={["etapas-funil"]} className="w-full">
                  
                  {/* Seção 1: Etapas do Funil */}
                  <AccordionItem value="etapas-funil">
                    <AccordionTrigger>
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-5 w-5 text-purple-500" />
                        <span>Etapas do Funil</span>
                        {bitrixStages.length > 0 && (
                          <span className="ml-2 text-xs bg-purple-500/20 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
                            {bitrixStages.length} etapas carregadas
                          </span>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-6 pt-4">
                      {/* Colunas Gatilho */}
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Etapa para Proposta Inicial</Label>
                          {bitrixStages.length > 0 ? (
                            <Select
                              value={bitrix24TargetStatusIdInicial || "__none__"}
                              onValueChange={(val) => setBitrix24TargetStatusIdInicial(val === "__none__" ? "" : val)}
                            >
                              <SelectTrigger className="font-mono text-sm">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Desabilitado</SelectItem>
                                {bitrixStages.map((stage) => (
                                  <SelectItem key={stage.id} value={stage.id}>
                                    {stage.name} ({stage.id})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={bitrix24TargetStatusIdInicial}
                              onChange={(e) => setBitrix24TargetStatusIdInicial(e.target.value)}
                              placeholder="Ex: UC_XXXXXX"
                              className="font-mono text-sm"
                            />
                          )}
                          <p className="text-xs text-muted-foreground">
                            Calcula consumo a partir do valor da conta (estimativa)
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label>Etapa para Proposta Definitiva</Label>
                          {bitrixStages.length > 0 ? (
                            <Select
                              value={bitrix24TargetStatusId || "__all__"}
                              onValueChange={(val) => setBitrix24TargetStatusId(val === "__all__" ? "" : val)}
                            >
                              <SelectTrigger className="font-mono text-sm">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__all__">Processar todas as etapas</SelectItem>
                                {bitrixStages.map((stage) => (
                                  <SelectItem key={stage.id} value={stage.id}>
                                    {stage.name} ({stage.id})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={bitrix24TargetStatusId}
                              onChange={(e) => setBitrix24TargetStatusId(e.target.value)}
                              placeholder="Ex: UC_XXXXXX"
                              className="font-mono text-sm"
                            />
                          )}
                          <p className="text-xs text-muted-foreground">
                            Dados completos do lead (consumo, tipo instalação, etc.)
                          </p>
                        </div>
                      </div>

                      <Separator />

                      {/* Gerenciador de Etapas do Funil (sofIA) */}
                      <BitrixStagesManager 
                        bitrixStages={bitrixStages}
                        onLoadStages={handleLoadBitrixStages}
                        loadingStages={loadingStages}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* Seção 2: Campos do Negócio (Lead) */}
                  <AccordionItem value="campos-negocio">
                    <AccordionTrigger>
                      <div className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-blue-500" />
                        <span>Campos do Negócio (Lead)</span>
                        {bitrixFields.length > 0 && (
                          <span className="ml-2 text-xs bg-blue-500/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                            {bitrixFields.length} campos disponíveis
                          </span>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-6 pt-4">
                      {/* Campos Essenciais */}
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Campo "Valor da Conta de Luz"</Label>
                          {bitrixFields.length > 0 ? (
                            <Select
                              value={bitrix24FieldValorConta || "__none__"}
                              onValueChange={(val) => setBitrix24FieldValorConta(val === "__none__" ? "" : val)}
                            >
                              <SelectTrigger className="font-mono text-sm">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Não configurado</SelectItem>
                                {bitrixFields.map((field) => (
                                  <SelectItem key={field.fieldName} value={field.fieldName}>
                                    {field.label} ({field.fieldName})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={bitrix24FieldValorConta}
                              onChange={(e) => setBitrix24FieldValorConta(e.target.value)}
                              placeholder="Ex: UF_CRM_1234567890"
                              className="font-mono text-sm"
                            />
                          )}
                          <p className="text-xs text-muted-foreground">
                            Campo onde o valor aproximado da conta de luz (R$) é armazenado
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label>Campo "Concessionária"</Label>
                          {bitrixFields.length > 0 ? (
                            <Select
                              value={bitrix24FieldConcessionaria || "__none__"}
                              onValueChange={(val) => setBitrix24FieldConcessionaria(val === "__none__" ? "" : val)}
                            >
                              <SelectTrigger className="font-mono text-sm">
                                <SelectValue placeholder="Selecione..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Não configurado (usa ID padrão)</SelectItem>
                                {bitrixFields.map((field) => (
                                  <SelectItem key={field.fieldName} value={field.fieldName}>
                                    {field.label} ({field.fieldName})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              value={bitrix24FieldConcessionaria}
                              onChange={(e) => setBitrix24FieldConcessionaria(e.target.value)}
                              placeholder="Ex: UF_CRM_1234567890"
                              className="font-mono text-sm"
                            />
                          )}
                          <p className="text-xs text-muted-foreground">
                            Campo onde a concessionária de energia é selecionada
                          </p>
                        </div>
                      </div>

                      <Separator />

                      {/* Gerenciador de Campos Customizados do Lead */}
                      <div className="space-y-4">
                        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                          <p className="font-medium text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                            <Database className="h-4 w-4" />
                            Mapeamento Completo de Campos do Lead
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Todos os campos customizados do Bitrix24 para o Lead são gerenciados dinamicamente abaixo.
                          </p>
                        </div>

                        <CustomBitrixFieldsManager 
                          bitrixFields={bitrixFields} 
                          onFieldsChange={() => {}}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Seção 3: Campos do Contato */}
                  <AccordionItem value="campos-contato">
                    <AccordionTrigger>
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-green-500" />
                        <span>Campos do Contato</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-6 pt-4">
                      <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                        <p className="font-medium text-sm text-blue-700 dark:text-blue-400 flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Campos de Contato (diferente de Lead)
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Estes campos são utilizados ao criar ou atualizar o Contato vinculado ao Lead no Bitrix24.
                          Os IDs geralmente começam com UF_CRM_ ou UF_CRM_CONTACT_.
                        </p>
                      </div>

                      <CustomBitrixContactFieldsManager 
                        onFieldsChange={() => {}}
                      />

                      <div className="p-4 bg-muted/30 rounded-lg space-y-2">
                        <p className="font-medium text-sm">Diferença entre Lead e Contato:</p>
                        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                          <li><strong>Lead:</strong> Representa o negócio/oportunidade</li>
                          <li><strong>Contato:</strong> Representa a pessoa física/jurídica associada ao negócio</li>
                        </ul>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Seção 4: Integração ChatApp */}
                </Accordion>

                <Separator />

                <div className="p-4 bg-muted/30 rounded-lg space-y-2">
                  <p className="font-medium text-sm">URL para Webhook de Saída (Bitrix24 → COESA):</p>
                  <code className="block p-2 bg-background rounded text-xs font-mono break-all">
                    https://sapsikmekwfwcnpyvzed.supabase.co/functions/v1/bitrix24-webhook
                  </code>
                  <p className="text-xs text-muted-foreground">
                    Configure esta URL no Bitrix24 para receber atualizações de leads (eventos: ONCRMLEADADD, ONCRMLEADUPDATE)
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Como funciona a integração:</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Lead criado no Bitrix24 → Proposta gerada automaticamente no COESA</li>
                    <li>Link da proposta é adicionado ao timeline do lead no Bitrix24</li>
                    <li>Cliente aceita/recusa a proposta → Status atualizado no Bitrix24</li>
                    <li>Negócio fechado no Bitrix24 → Registrado no painel de admin</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notificações por E-mail */}
          <TabsContent value="notificacoes-email">
            <EmailPreferences />
          </TabsContent>

          {/* Alertas Sofia (WhatsApp) */}
          <TabsContent value="alertas-sofia">
            <div className="space-y-6">
              <NotificationRecipientsManager />
              <NotificationFlowsTester />
              <NotificationLogsViewer />
            </div>
          </TabsContent>

          {/* Templates de Proposta */}
          <TabsContent value="templates">
            <Card>
              <CardHeader>
                <CardTitle>Templates de Proposta</CardTitle>
                <CardDescription>
                  Crie e gerencie templates visuais para as propostas geradas pelo sistema
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TemplateManager />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Configurações por Agente */}
          <TabsContent value="agent-configs">
            <AgentConfigManager />
          </TabsContent>

          {/* Pipeline Sofia v2 */}
          <TabsContent value="pipeline-v2">
            <PipelineV2Config />
          </TabsContent>

          {/* Configurações de Schedulers */}
          <TabsContent value="schedulers">
            <AutomationSchedulerConfig />
          </TabsContent>

          {/* Telefones de Teste WhatsApp */}
          <TabsContent value="test-phones">
            <TestPhonesManager />
          </TabsContent>

          {/* Analytics de Typos */}
          <TabsContent value="typos-analytics">
            <TyposCleanupManager />
          </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </AppLayout>
  );
}
