import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Clock, GitBranch, Save, RotateCcw, Info } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Estágios padrão do Bitrix24 para referência
const DEFAULT_FUP_STAGES = [
  'NEW',
  'PROPOSTA_INICIAL',
  'IN_PROCESS',
  'COLETA_DADOS',
  'AGUARDANDO_DOCUMENTOS',
];

const STAGE_LABELS: Record<string, string> = {
  'NEW': 'Novo',
  'PROPOSTA_INICIAL': 'Proposta Inicial',
  'IN_PROCESS': 'Em Progresso',
  'COLETA_DADOS': 'Coleta de Dados',
  'AGUARDANDO_DOCUMENTOS': 'Aguardando Documentos',
  'AGUARDANDO_ASSINATURA': 'Aguardando Assinatura',
  'CONTRATO_ENVIADO': 'Contrato Enviado',
  'CONVERTED': 'Convertido',
  'JUNK': 'Descartado',
  'APPT': 'Agendamento',
  'PREPARATION': 'Preparação',
  'EXECUTING': 'Em Execução',
  'FINAL_INVOICE': 'Fatura Final',
  'UC_REGISTRATION': 'Registro UC',
};

export function AutomationSchedulerConfig() {
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(60);
  const [fupValidStages, setFupValidStages] = useState<string[]>(DEFAULT_FUP_STAGES);
  const [newStage, setNewStage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('configuracoes_sistema')
        .select('chave, valor')
        .in('chave', ['automation_activity_cooldown_minutes', 'fup_valid_stages']);

      if (error) throw error;

      data?.forEach((config) => {
        if (config.chave === 'automation_activity_cooldown_minutes') {
          const parsed = parseInt(config.valor, 10);
          if (!isNaN(parsed)) setCooldownMinutes(parsed);
        }
        if (config.chave === 'fup_valid_stages') {
          try {
            const parsed = JSON.parse(config.valor);
            if (Array.isArray(parsed)) setFupValidStages(parsed);
          } catch {
            // Manter padrão
          }
        }
      });
    } catch (error) {
      console.error('Erro ao carregar configurações de scheduler:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveStage = (stage: string) => {
    setFupValidStages(prev => prev.filter(s => s !== stage));
  };

  const handleAddStage = () => {
    const stage = newStage.trim().toUpperCase().replace(/\s+/g, '_');
    if (!stage) return;
    
    if (fupValidStages.includes(stage)) {
      toast.error('Estágio já adicionado');
      return;
    }
    
    setFupValidStages(prev => [...prev, stage]);
    setNewStage('');
  };

  const handleSave = async () => {
    if (cooldownMinutes < 15) {
      toast.error('Cooldown mínimo é 15 minutos');
      return;
    }

    if (fupValidStages.length === 0) {
      toast.error('Adicione pelo menos um estágio válido para FUP');
      return;
    }

    setSaving(true);
    try {
      // Salvar cooldown
      const { error: cooldownError } = await supabase
        .from('configuracoes_sistema')
        .upsert({
          chave: 'automation_activity_cooldown_minutes',
          valor: cooldownMinutes.toString(),
          descricao: 'Tempo mínimo (em minutos) desde a última mensagem do cliente para enviar automações',
        }, { onConflict: 'chave' });

      if (cooldownError) throw cooldownError;

      // Salvar estágios válidos para FUP
      const { error: stagesError } = await supabase
        .from('configuracoes_sistema')
        .upsert({
          chave: 'fup_valid_stages',
          valor: JSON.stringify(fupValidStages),
          descricao: 'Estágios do funil onde follow-ups automáticos são permitidos',
        }, { onConflict: 'chave' });

      if (stagesError) throw stagesError;

      toast.success('Configurações de automação salvas!');
    } catch (error: any) {
      console.error('Erro ao salvar:', error);
      toast.error(`Erro ao salvar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = () => {
    setCooldownMinutes(60);
    setFupValidStages(DEFAULT_FUP_STAGES);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5 text-blue-500" />
          Configurações de Automação (Schedulers)
        </CardTitle>
        <CardDescription>
          Configure parâmetros dos schedulers de follow-up, nudge e rescue
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Cooldown de Atividade */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="cooldown" className="font-medium">
              Cooldown de Atividade
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Tempo mínimo desde a última mensagem do cliente antes de enviar 
                    qualquer automação (FUP, nudge, rescue). Evita que a Sofia envie 
                    mensagens logo após o cliente ter falado.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-3">
            <Input
              id="cooldown"
              type="number"
              min={15}
              max={1440}
              value={cooldownMinutes}
              onChange={(e) => setCooldownMinutes(parseInt(e.target.value, 10) || 60)}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">minutos</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Mínimo: 15 min | Máximo: 1440 min (24h) | Padrão: 60 min
          </p>
        </div>

        <Separator />

        {/* Estágios Válidos para FUP */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="font-medium flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-green-500" />
              Estágios Válidos para Follow-up
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    Follow-ups automáticos só serão enviados para leads que estiverem 
                    em um destes estágios no funil. Leads em outros estágios (ex: CONVERTED, JUNK) 
                    não receberão FUPs.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Lista de estágios atuais */}
          <div className="flex flex-wrap gap-2">
            {fupValidStages.map((stage) => (
              <Badge
                key={stage}
                variant="secondary"
                className="flex items-center gap-1 cursor-pointer hover:bg-destructive/20 transition-colors"
                onClick={() => handleRemoveStage(stage)}
              >
                {STAGE_LABELS[stage] || stage}
                <span className="ml-1 text-xs opacity-60">×</span>
              </Badge>
            ))}
            {fupValidStages.length === 0 && (
              <span className="text-sm text-muted-foreground italic">
                Nenhum estágio configurado
              </span>
            )}
          </div>

          {/* Adicionar novo estágio */}
          <div className="flex gap-2">
            <Input
              placeholder="Novo estágio (ex: QUALIFICACAO)"
              value={newStage}
              onChange={(e) => setNewStage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddStage()}
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={handleAddStage}>
              Adicionar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Clique em um estágio para removê-lo. Use os IDs do Bitrix24 (ex: NEW, IN_PROCESS).
          </p>
        </div>

        <Separator />

        {/* Ações */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetToDefault}
            className="flex items-center gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Restaurar Padrão
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Salvar Configurações
              </>
            )}
          </Button>
        </div>

        {/* Dica */}
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-xs text-blue-700 dark:text-blue-300">
          <strong>Dica:</strong> Essas configurações afetam todos os schedulers (chatbot-followup-scheduler, 
          chatbot-nudge-scheduler, stuck-leads-rescue-scheduler). Alterações entram em vigor imediatamente.
        </div>
      </CardContent>
    </Card>
  );
}
