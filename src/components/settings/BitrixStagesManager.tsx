import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, Check, AlertCircle, GitBranch, Save } from 'lucide-react';
import { toast } from 'sonner';

interface BitrixStage {
  id: string;
  name: string;
  sort: number;
}

interface StageConfig {
  key: string;
  label: string;
  description: string;
  icon: string;
  color: string;
}

// Pre-defined stages for Sofia workflow
const SOFIA_STAGES: StageConfig[] = [
  { 
    key: 'bitrix24_stage_novo_lead', 
    label: 'Novo Lead', 
    description: 'Cliente acabou de entrar no chat (1ª mensagem)',
    icon: '🆕',
    color: 'bg-blue-500'
  },
  { 
    key: 'bitrix24_stage_aguardando_dados', 
    label: 'Aguardando Dados - WhatsApp', 
    description: 'Sofia começou a atender, aguardando dados do cliente',
    icon: '⏳',
    color: 'bg-yellow-500'
  },
  { 
    key: 'bitrix24_stage_proposta_inicial', 
    label: 'Proposta Inicial', 
    description: 'Cliente forneceu dados (valor + distribuidora), proposta gerada',
    icon: '📋',
    color: 'bg-green-500'
  },
  { 
    key: 'bitrix24_stage_lead_frio', 
    label: 'Lead Frio - Mail MKT', 
    description: 'Cliente não respondeu após 3 nudges, vai para automação de e-mail',
    icon: '❄️',
    color: 'bg-slate-400'
  },
  { 
    key: 'bitrix24_stage_proposta_definitiva', 
    label: 'Proposta Definitiva', 
    description: 'Proposta completa com documentos (fatura + RG)',
    icon: '📄',
    color: 'bg-purple-500'
  },
  { 
    key: 'bitrix24_stage_aguardando_assinatura', 
    label: 'Aguardando Assinatura', 
    description: 'Contrato enviado via ClickSign, aguardando assinatura',
    icon: '✍️',
    color: 'bg-orange-500'
  },
  { 
    key: 'bitrix24_stage_fechado', 
    label: 'Fechado (Ganho)', 
    description: 'Negócio concluído, cliente assinou',
    icon: '✅',
    color: 'bg-emerald-600'
  },
  { 
    key: 'bitrix24_stage_descartado', 
    label: 'Lead Descartado', 
    description: 'Lead desqualificado (distribuidora não atendida, Grupo A, tarifa social)',
    icon: '🚫',
    color: 'bg-gray-500'
  },
  { 
    key: 'bitrix24_stage_perdido', 
    label: 'Perdido', 
    description: 'Lead perdido ou desistência',
    icon: '❌',
    color: 'bg-red-500'
  },
];

interface BitrixStagesManagerProps {
  bitrixStages?: BitrixStage[];
  onLoadStages?: () => void;
  loadingStages?: boolean;
}

export function BitrixStagesManager({ 
  bitrixStages = [], 
  onLoadStages,
  loadingStages = false 
}: BitrixStagesManagerProps) {
  const [stageValues, setStageValues] = useState<Record<string, string>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  // Load existing stage configurations from database
  useEffect(() => {
    loadStageConfigs();
  }, []);

  const loadStageConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('configuracoes_sistema')
        .select('chave, valor')
        .like('chave', 'bitrix24_stage_%');

      if (error) throw error;

      const values: Record<string, string> = {};
      data?.forEach(item => {
        values[item.chave] = item.valor;
      });
      setStageValues(values);
      setOriginalValues(values);
    } catch (err) {
      console.error('Error loading stage configs:', err);
      toast.error('Erro ao carregar configurações de etapas');
    } finally {
      setLoading(false);
    }
  };

  const handleStageChange = async (key: string, value: string) => {
    setSaving(key);
    try {
      // Upsert the configuration
      const { error } = await supabase
        .from('configuracoes_sistema')
        .upsert({
          chave: key,
          valor: value,
          descricao: SOFIA_STAGES.find(s => s.key === key)?.label || key
        }, { onConflict: 'chave' });

      if (error) throw error;

      setStageValues(prev => ({ ...prev, [key]: value }));
      setOriginalValues(prev => ({ ...prev, [key]: value }));
      toast.success('Etapa salva!');
    } catch (err) {
      console.error('Error saving stage config:', err);
      toast.error('Erro ao salvar etapa');
    } finally {
      setSaving(null);
    }
  };

  const handleSaveAll = async () => {
    // Find stages that have changed
    const changedStages = SOFIA_STAGES.filter(stage => 
      stageValues[stage.key] !== originalValues[stage.key]
    );

    if (changedStages.length === 0) {
      toast.info('Nenhuma alteração para salvar');
      return;
    }

    setSavingAll(true);
    try {
      // Prepare upsert data for all changed stages
      const upsertData = changedStages.map(stage => ({
        chave: stage.key,
        valor: stageValues[stage.key] || '',
        descricao: stage.label
      }));

      const { error } = await supabase
        .from('configuracoes_sistema')
        .upsert(upsertData, { onConflict: 'chave' });

      if (error) throw error;

      // Update original values to match current values
      setOriginalValues({ ...stageValues });
      toast.success(`${changedStages.length} etapa(s) salva(s) com sucesso!`);
    } catch (err) {
      console.error('Error saving all stages:', err);
      toast.error('Erro ao salvar etapas');
    } finally {
      setSavingAll(false);
    }
  };

  const hasUnsavedChanges = () => {
    return SOFIA_STAGES.some(stage => stageValues[stage.key] !== originalValues[stage.key]);
  };

  const getConfiguredCount = () => {
    return SOFIA_STAGES.filter(stage => stageValues[stage.key]).length;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-medium flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Etapas do Funil Bitrix24
          </h4>
          <p className="text-sm text-muted-foreground mt-1">
            Configure os IDs das etapas do seu funil de leads para que a Sofia movimente os leads corretamente
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm px-2 py-1 rounded ${
            getConfiguredCount() === SOFIA_STAGES.length 
              ? 'bg-green-500/20 text-green-700' 
              : 'bg-amber-500/20 text-amber-700'
          }`}>
            {getConfiguredCount()}/{SOFIA_STAGES.length} configuradas
          </span>
          {onLoadStages && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onLoadStages}
              disabled={loadingStages}
            >
              {loadingStages ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...</>
              ) : (
                <><RefreshCw className="mr-2 h-4 w-4" /> Carregar Etapas</>
              )}
            </Button>
          )}
          <Button 
            variant={hasUnsavedChanges() ? "default" : "outline"}
            size="sm" 
            onClick={handleSaveAll}
            disabled={savingAll || !hasUnsavedChanges()}
          >
            {savingAll ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
            ) : (
              <><Save className="mr-2 h-4 w-4" /> Salvar Todas</>
            )}
          </Button>
        </div>
      </div>

      {/* Stage Configuration Cards */}
      <div className="space-y-3">
        {SOFIA_STAGES.map((stage) => (
          <div 
            key={stage.key}
            className={`p-4 rounded-lg border transition-colors ${
              stageValues[stage.key] 
                ? 'bg-muted/30 border-primary/30' 
                : 'bg-muted/10 border-dashed'
            }`}
          >
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className={`w-10 h-10 rounded-lg ${stage.color} flex items-center justify-center text-white text-lg flex-shrink-0`}>
                {stage.icon}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Label className="font-medium">{stage.label}</Label>
                  {stageValues[stage.key] ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-2">{stage.description}</p>
                
                {/* Input/Select */}
                <div className="flex items-center gap-2">
                  {bitrixStages.length > 0 ? (
                    <Select
                      value={stageValues[stage.key] || '__none__'}
                      onValueChange={(val) => handleStageChange(stage.key, val === '__none__' ? '' : val)}
                      disabled={saving === stage.key}
                    >
                      <SelectTrigger className="w-full font-mono text-sm h-9">
                        <SelectValue placeholder="Selecione a etapa..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Não configurado</SelectItem>
                        {bitrixStages.map((bs) => (
                          <SelectItem key={bs.id} value={bs.id}>
                            {bs.name} ({bs.id})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={stageValues[stage.key] || ''}
                      onChange={(e) => setStageValues(prev => ({ ...prev, [stage.key]: e.target.value }))}
                      onBlur={(e) => {
                        if (e.target.value !== originalValues[stage.key]) {
                          handleStageChange(stage.key, e.target.value);
                        }
                      }}
                      placeholder="Ex: UC_XXXXXX ou NEW"
                      className="font-mono text-sm h-9"
                      disabled={saving === stage.key}
                    />
                  )}
                  {saving === stage.key && (
                    <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Info Box */}
      <div className="p-4 bg-muted/30 rounded-lg space-y-2 text-sm">
        <p className="font-medium flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          Como funciona o fluxo da Sofia:
        </p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside ml-2">
          <li><strong>Novo Lead:</strong> Cliente envia primeira mensagem no WhatsApp</li>
          <li><strong>Aguardando Dados:</strong> Sofia responde e começa a coletar informações</li>
          <li><strong>Proposta Inicial:</strong> Cliente informou valor/consumo e distribuidora</li>
          <li><strong>Lead Frio:</strong> Sem resposta após 3 tentativas → automação de e-mail</li>
          <li><strong>Proposta Definitiva:</strong> Cliente enviou documentos (fatura + RG)</li>
          <li><strong>Aguardando Assinatura:</strong> Contrato enviado para assinatura digital</li>
        </ol>
      </div>
    </div>
  );
}
