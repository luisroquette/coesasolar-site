import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUIConfig } from '@/hooks/useUIConfig';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Calculator, Unlock, GitBranch, RotateCcw, Save, Info, History } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ProposalDefaults {
  cip_default: string;
  desconto_default: string;
  fidelidade_default: string;
  plano_unlock_threshold: string;
  plano_unlock_desconto: string;
  plano_unlock_fidelidade: string;
  inferencia_limite_bifasico: string;
  inferencia_permitir_monofasico: string;
}

interface AuditLogEntry {
  id: string;
  chave: string;
  valor_anterior: string | null;
  valor_novo: string;
  alterado_por_nome: string | null;
  created_at: string;
}

const DEFAULT_VALUES: ProposalDefaults = {
  cip_default: '25',
  desconto_default: '25',
  fidelidade_default: '36',
  plano_unlock_threshold: '3000',
  plano_unlock_desconto: '30',
  plano_unlock_fidelidade: '48',
  inferencia_limite_bifasico: '1000',
  inferencia_permitir_monofasico: 'false',
};

const CONFIG_KEYS = Object.keys(DEFAULT_VALUES) as (keyof ProposalDefaults)[];

const CONFIG_LABELS: Record<string, string> = {
  cip_default: 'CIP Padrão',
  desconto_default: 'Desconto Padrão',
  fidelidade_default: 'Fidelidade Padrão',
  plano_unlock_threshold: 'Threshold UNLOCK',
  plano_unlock_desconto: 'Desconto UNLOCK',
  plano_unlock_fidelidade: 'Fidelidade UNLOCK',
  inferencia_limite_bifasico: 'Limite Bifásico',
  inferencia_permitir_monofasico: 'Permitir Monofásico',
};

export function ProposalDefaultsConfig() {
  const { user } = useAuth();
  const { queryLimitProposalAuditLog } = useUIConfig();
  const [config, setConfig] = useState<ProposalDefaults>(DEFAULT_VALUES);
  const [originalConfig, setOriginalConfig] = useState<ProposalDefaults>(DEFAULT_VALUES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
    loadUserName();
  }, [user]);

  const loadUserName = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('profiles')
      .select('nome')
      .eq('user_id', user.id)
      .single();
    setUserName(data?.nome || user.email || null);
  };

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('configuracoes_sistema')
        .select('chave, valor')
        .in('chave', CONFIG_KEYS);

      if (error) throw error;

      if (data && data.length > 0) {
        const configMap = data.reduce((acc, item) => {
          acc[item.chave as keyof ProposalDefaults] = item.valor;
          return acc;
        }, {} as ProposalDefaults);

        const loadedConfig = { ...DEFAULT_VALUES, ...configMap };
        setConfig(loadedConfig);
        setOriginalConfig(loadedConfig);
      }
    } catch (err) {
      console.error('Erro ao carregar configurações:', err);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLog = async () => {
    try {
      const { data, error } = await supabase
        .from('configuracoes_audit_log')
        .select('id, chave, valor_anterior, valor_novo, alterado_por_nome, created_at')
        .in('chave', CONFIG_KEYS)
        .order('created_at', { ascending: false })
        .limit(queryLimitProposalAuditLog);

      if (error) throw error;
      setAuditLog(data || []);
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Identificar quais campos foram alterados
      const changedKeys = CONFIG_KEYS.filter(
        (key) => config[key] !== originalConfig[key]
      );

      if (changedKeys.length === 0) {
        toast.info('Nenhuma alteração detectada.');
        setSaving(false);
        return;
      }

      // Salvar configurações
      for (const chave of CONFIG_KEYS) {
        const { error } = await supabase
          .from('configuracoes_sistema')
          .upsert({
            chave,
            valor: config[chave],
            descricao: getDescription(chave),
          }, { onConflict: 'chave' });

        if (error) throw error;
      }

      // Registrar alterações no log de auditoria
      const auditEntries = changedKeys.map((chave) => ({
        chave,
        valor_anterior: originalConfig[chave],
        valor_novo: config[chave],
        alterado_por_id: user?.id || null,
        alterado_por_email: user?.email || null,
        alterado_por_nome: userName || user?.email || null,
      }));

      const { error: auditError } = await supabase
        .from('configuracoes_audit_log')
        .insert(auditEntries);

      if (auditError) {
        console.error('Erro ao registrar auditoria:', auditError);
        // Não falhar a operação por causa do log
      }

      // Atualizar estado original
      setOriginalConfig({ ...config });
      
      toast.success(`${changedKeys.length} configuração(ões) salva(s) com sucesso!`);
      
      // Recarregar log se estiver visível
      if (showAuditLog) {
        loadAuditLog();
      }
    } catch (err) {
      console.error('Erro ao salvar configurações:', err);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_VALUES);
    toast.info('Valores restaurados para padrão. Clique em Salvar para confirmar.');
  };

  const handleChange = (key: keyof ProposalDefaults, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const getDescription = (key: keyof ProposalDefaults): string => {
    const descriptions: Record<keyof ProposalDefaults, string> = {
      cip_default: 'CIP padrão (R$) quando não informado no lead',
      desconto_default: 'Desconto padrão (%) aplicado na proposta inicial',
      fidelidade_default: 'Fidelidade padrão (meses) para proposta inicial',
      plano_unlock_threshold: 'Consumo mínimo (kWh) para desbloquear plano UNLOCK',
      plano_unlock_desconto: 'Desconto máximo (%) do plano UNLOCK',
      plano_unlock_fidelidade: 'Fidelidade (meses) do plano UNLOCK',
      inferencia_limite_bifasico: 'Limite (kWh) para inferir instalação Bifásica (acima = Trifásico)',
      inferencia_permitir_monofasico: 'Permitir inferência de instalação Monofásica',
    };
    return descriptions[key];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <Tabs defaultValue="presuncoes" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="presuncoes" className="flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              <span className="hidden sm:inline">Presunções</span>
            </TabsTrigger>
            <TabsTrigger value="unlock" className="flex items-center gap-2">
              <Unlock className="h-4 w-4" />
              <span className="hidden sm:inline">Plano UNLOCK</span>
            </TabsTrigger>
            <TabsTrigger value="inferencia" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              <span className="hidden sm:inline">Inferência</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="presuncoes" className="mt-4">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Presunções de Cálculo</CardTitle>
                <CardDescription>
                  Valores usados quando o lead não possui todos os dados necessários
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="cip_default">CIP Padrão (R$)</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Contribuição de Iluminação Pública presumida
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="cip_default"
                      type="number"
                      step="0.01"
                      min="0"
                      value={config.cip_default}
                      onChange={(e) => handleChange('cip_default', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="desconto_default">Desconto Padrão (%)</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Desconto aplicado automaticamente nas propostas iniciais
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="desconto_default"
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={config.desconto_default}
                      onChange={(e) => handleChange('desconto_default', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="fidelidade_default">Fidelidade Padrão (meses)</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Período mínimo de contrato para propostas padrão
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="fidelidade_default"
                      type="number"
                      step="1"
                      min="0"
                      value={config.fidelidade_default}
                      onChange={(e) => handleChange('fidelidade_default', e.target.value)}
                    />
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                  <Info className="h-4 w-4 inline-block mr-2" />
                  Estes valores são usados <strong>apenas</strong> quando o campo correspondente não está preenchido no CRM.
                </div>

                <div className="bg-primary/10 rounded-lg p-3 text-sm text-primary">
                  <strong>💡 Consumo:</strong> O consumo é sempre calculado automaticamente pela fórmula: <code className="bg-primary/20 px-1 rounded">Valor da Conta ÷ Tarifa com Impostos</code>.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="unlock" className="mt-4">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Configurações do Plano UNLOCK</CardTitle>
                <CardDescription>
                  Plano premium desbloqueado para clientes de alto consumo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="plano_unlock_threshold">Consumo Mínimo (kWh)</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Clientes com consumo acima deste valor terão acesso ao plano UNLOCK
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="plano_unlock_threshold"
                      type="number"
                      step="100"
                      min="0"
                      value={config.plano_unlock_threshold}
                      onChange={(e) => handleChange('plano_unlock_threshold', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="plano_unlock_desconto">Desconto UNLOCK (%)</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Desconto máximo oferecido no plano UNLOCK
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="plano_unlock_desconto"
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={config.plano_unlock_desconto}
                      onChange={(e) => handleChange('plano_unlock_desconto', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="plano_unlock_fidelidade">Fidelidade UNLOCK (meses)</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Período de contrato exigido para o plano UNLOCK
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="plano_unlock_fidelidade"
                      type="number"
                      step="1"
                      min="0"
                      value={config.plano_unlock_fidelidade}
                      onChange={(e) => handleChange('plano_unlock_fidelidade', e.target.value)}
                    />
                  </div>
                </div>

                <div className="bg-primary/10 rounded-lg p-3 text-sm">
                  <Unlock className="h-4 w-4 inline-block mr-2 text-primary" />
                  O plano UNLOCK aparece como <strong>bloqueado</strong> para clientes abaixo do consumo mínimo configurado.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inferencia" className="mt-4">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Regras de Inferência</CardTitle>
                <CardDescription>
                  Como determinar o tipo de instalação quando não informado
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="inferencia_limite_bifasico">Limite para Bifásico (kWh)</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Consumo até este valor será considerado Bifásico; acima será Trifásico
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Input
                      id="inferencia_limite_bifasico"
                      type="number"
                      step="100"
                      min="0"
                      value={config.inferencia_limite_bifasico}
                      onChange={(e) => handleChange('inferencia_limite_bifasico', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="inferencia_permitir_monofasico">Permitir Monofásico</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Se desativado, consumos muito baixos serão considerados Bifásico
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="pt-2">
                      <Switch
                        id="inferencia_permitir_monofasico"
                        checked={config.inferencia_permitir_monofasico === 'true'}
                        onCheckedChange={(checked) =>
                          handleChange('inferencia_permitir_monofasico', checked ? 'true' : 'false')
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
                  <GitBranch className="h-4 w-4 inline-block mr-2" />
                  A inferência é usada apenas quando o tipo de instalação não é informado na conta de luz.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between gap-3 pt-4 border-t">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              setShowAuditLog(!showAuditLog);
              if (!showAuditLog) loadAuditLog();
            }}
          >
            <History className="h-4 w-4 mr-2" />
            {showAuditLog ? 'Ocultar Histórico' : 'Ver Histórico'}
          </Button>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleReset} disabled={saving}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Restaurar Padrões
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Configuração
            </Button>
          </div>
        </div>

        {/* Histórico de Alterações */}
        {showAuditLog && (
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <History className="h-4 w-4" />
                Histórico de Alterações
              </CardTitle>
              <CardDescription>
                Últimas 20 alterações nas configurações de automação
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditLog.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Nenhuma alteração registrada ainda.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {auditLog.map((entry) => (
                    <div 
                      key={entry.id} 
                      className="flex items-start justify-between p-2 rounded-md bg-muted/50 text-sm"
                    >
                      <div className="flex-1">
                        <span className="font-medium">
                          {CONFIG_LABELS[entry.chave] || entry.chave}
                        </span>
                        <span className="text-muted-foreground mx-2">:</span>
                        <span className="text-destructive line-through mr-1">
                          {entry.valor_anterior || '(vazio)'}
                        </span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-primary ml-1 font-medium">
                          {entry.valor_novo}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground text-right ml-4 whitespace-nowrap">
                        <div>{entry.alterado_por_nome || 'Sistema'}</div>
                        <div>
                          {format(new Date(entry.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
