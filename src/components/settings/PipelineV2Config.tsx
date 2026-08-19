import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { 
  Rocket, 
  Save, 
  Loader2, 
  Plus, 
  X, 
  Phone, 
  AlertTriangle, 
  ChevronDown, 
  Brain,
  Database,
  Bug,
  BookOpen,
  Sparkles
} from 'lucide-react';

interface PipelineConfig {
  pipeline_v2_enabled: boolean;
  pipeline_v2_rollout_percentage: number;
  pipeline_v2_test_phones: string[];
  pipeline_memory_ttl_hours: number;
  pipeline_max_facts_per_conversation: number;
  pipeline_rag_enabled: boolean;
  pipeline_learning_enabled: boolean;
  pipeline_debug_mode: boolean;
}

const defaultConfig: PipelineConfig = {
  pipeline_v2_enabled: false,
  pipeline_v2_rollout_percentage: 0,
  pipeline_v2_test_phones: [],
  pipeline_memory_ttl_hours: 168,
  pipeline_max_facts_per_conversation: 100,
  pipeline_rag_enabled: true,
  pipeline_learning_enabled: true,
  pipeline_debug_mode: false,
};

export function PipelineV2Config() {
  const [config, setConfig] = useState<PipelineConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('configuracoes_sistema')
        .select('chave, valor')
        .in('chave', [
          'pipeline_v2_enabled',
          'pipeline_v2_rollout_percentage',
          'pipeline_v2_test_phones',
          'pipeline_memory_ttl_hours',
          'pipeline_max_facts_per_conversation',
          'pipeline_rag_enabled',
          'pipeline_learning_enabled',
          'pipeline_debug_mode',
        ]);

      if (error) throw error;

      const configMap = new Map(data?.map(d => [d.chave, d.valor]) || []);
      
      const parseTestPhones = (value: string | undefined): string[] => {
        if (!value) return [];
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      };

      setConfig({
        pipeline_v2_enabled: configMap.get('pipeline_v2_enabled') === 'true',
        pipeline_v2_rollout_percentage: parseInt(configMap.get('pipeline_v2_rollout_percentage') || '0', 10),
        pipeline_v2_test_phones: parseTestPhones(configMap.get('pipeline_v2_test_phones')),
        pipeline_memory_ttl_hours: parseInt(configMap.get('pipeline_memory_ttl_hours') || '168', 10),
        pipeline_max_facts_per_conversation: parseInt(configMap.get('pipeline_max_facts_per_conversation') || '100', 10),
        pipeline_rag_enabled: configMap.get('pipeline_rag_enabled') !== 'false',
        pipeline_learning_enabled: configMap.get('pipeline_learning_enabled') !== 'false',
        pipeline_debug_mode: configMap.get('pipeline_debug_mode') === 'true',
      });
    } catch (err) {
      console.error('Erro ao carregar configurações do Pipeline v2:', err);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = [
        { chave: 'pipeline_v2_enabled', valor: String(config.pipeline_v2_enabled) },
        { chave: 'pipeline_v2_rollout_percentage', valor: String(config.pipeline_v2_rollout_percentage) },
        { chave: 'pipeline_v2_test_phones', valor: JSON.stringify(config.pipeline_v2_test_phones) },
        { chave: 'pipeline_memory_ttl_hours', valor: String(config.pipeline_memory_ttl_hours) },
        { chave: 'pipeline_max_facts_per_conversation', valor: String(config.pipeline_max_facts_per_conversation) },
        { chave: 'pipeline_rag_enabled', valor: String(config.pipeline_rag_enabled) },
        { chave: 'pipeline_learning_enabled', valor: String(config.pipeline_learning_enabled) },
        { chave: 'pipeline_debug_mode', valor: String(config.pipeline_debug_mode) },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('configuracoes_sistema')
          .update({ valor: update.valor })
          .eq('chave', update.chave);
        
        if (error) throw error;
      }

      toast.success('Configurações salvas com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar configurações:', err);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPhone = () => {
    const cleaned = newPhone.replace(/\D/g, '');
    if (!cleaned || cleaned.length < 10) {
      toast.error('Número de telefone inválido');
      return;
    }
    if (config.pipeline_v2_test_phones.includes(cleaned)) {
      toast.error('Telefone já adicionado');
      return;
    }
    setConfig(prev => ({
      ...prev,
      pipeline_v2_test_phones: [...prev.pipeline_v2_test_phones, cleaned],
    }));
    setNewPhone('');
  };

  const handleRemovePhone = (phone: string) => {
    setConfig(prev => ({
      ...prev,
      pipeline_v2_test_phones: prev.pipeline_v2_test_phones.filter(p => p !== phone),
    }));
  };

  const formatPhone = (phone: string) => {
    if (phone.length === 13) {
      return `+${phone.slice(0, 2)} ${phone.slice(2, 4)} ${phone.slice(4, 9)}-${phone.slice(9)}`;
    }
    if (phone.length === 12) {
      return `+${phone.slice(0, 2)} ${phone.slice(2, 4)} ${phone.slice(4, 8)}-${phone.slice(8)}`;
    }
    return phone;
  };

  const getStatusBadge = () => {
    if (!config.pipeline_v2_enabled) {
      return <Badge variant="secondary" className="bg-muted text-muted-foreground">Desativado</Badge>;
    }
    if (config.pipeline_v2_test_phones.length > 0 && config.pipeline_v2_rollout_percentage === 0) {
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:text-yellow-400">Testes Internos</Badge>;
    }
    if (config.pipeline_v2_rollout_percentage === 100) {
      return <Badge variant="default" className="bg-green-600">100% Ativo</Badge>;
    }
    if (config.pipeline_v2_rollout_percentage > 0) {
      return <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400">Rollout {config.pipeline_v2_rollout_percentage}%</Badge>;
    }
    return <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400">Pronto para Testes</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20">
              <Rocket className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle>Pipeline Sofia v2</CardTitle>
              <CardDescription>
                Novo motor de conversação com memória persistente e Tool Calling
              </CardDescription>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Toggle Global */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
          <div className="space-y-0.5">
            <Label className="text-base font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              Pipeline v2 Habilitado
            </Label>
            <p className="text-sm text-muted-foreground">
              Ativa o novo pipeline estrutural de 6 estágios
            </p>
          </div>
          <Switch
            checked={config.pipeline_v2_enabled}
            onCheckedChange={(checked) => setConfig(prev => ({ ...prev, pipeline_v2_enabled: checked }))}
          />
        </div>

        {/* Rollout Gradual */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Rollout Gradual</Label>
            <span className="text-2xl font-bold text-primary">{config.pipeline_v2_rollout_percentage}%</span>
          </div>
          <Slider
            value={[config.pipeline_v2_rollout_percentage]}
            onValueChange={(value) => setConfig(prev => ({ ...prev, pipeline_v2_rollout_percentage: value[0] }))}
            max={100}
            step={5}
            className="w-full"
            disabled={!config.pipeline_v2_enabled}
          />
          <p className="text-sm text-muted-foreground">
            Porcentagem de conversas que usarão o Pipeline v2 (baseado em hash do telefone)
          </p>
          
          {config.pipeline_v2_rollout_percentage === 100 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">Rollout Total</p>
                <p className="text-xs text-muted-foreground">
                  Todas as conversas usarão o Pipeline v2. Certifique-se de que os testes foram bem-sucedidos.
                </p>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Telefones de Teste */}
        <div className="space-y-4">
          <Label className="text-base font-medium flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Telefones de Teste
          </Label>
          <p className="text-sm text-muted-foreground">
            Estes números sempre usarão o Pipeline v2, independente do rollout gradual
          </p>
          
          <div className="flex gap-2">
            <Input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="Ex: 5531999999999"
              className="font-mono"
              disabled={!config.pipeline_v2_enabled}
            />
            <Button 
              onClick={handleAddPhone} 
              disabled={!config.pipeline_v2_enabled || !newPhone.trim()}
              size="icon"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {config.pipeline_v2_test_phones.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {config.pipeline_v2_test_phones.map((phone) => (
                <Badge 
                  key={phone} 
                  variant="secondary" 
                  className="text-sm py-1.5 px-3 gap-2 font-mono"
                >
                  {formatPhone(phone)}
                  <button 
                    onClick={() => handleRemovePhone(phone)}
                    className="hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Nenhum telefone de teste configurado
            </p>
          )}
        </div>

        <Separator />

        {/* Configurações Avançadas */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between">
              <span className="font-medium">Configurações Avançadas</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            {/* TTL de Memória */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-blue-500" />
                  TTL de Memória (horas)
                </Label>
                <Input
                  type="number"
                  value={config.pipeline_memory_ttl_hours}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    pipeline_memory_ttl_hours: parseInt(e.target.value, 10) || 168 
                  }))}
                  min={1}
                  max={720}
                  disabled={!config.pipeline_v2_enabled}
                />
                <p className="text-xs text-muted-foreground">
                  Por quanto tempo os fatos da conversa são mantidos (padrão: 168h = 7 dias)
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-green-500" />
                  Máx. Fatos por Conversa
                </Label>
                <Input
                  type="number"
                  value={config.pipeline_max_facts_per_conversation}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    pipeline_max_facts_per_conversation: parseInt(e.target.value, 10) || 100 
                  }))}
                  min={10}
                  max={500}
                  disabled={!config.pipeline_v2_enabled}
                />
                <p className="text-xs text-muted-foreground">
                  Limite de fatos armazenados por conversa
                </p>
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-orange-500" />
                  <div>
                    <Label className="font-medium">RAG Habilitado</Label>
                    <p className="text-xs text-muted-foreground">
                      Busca semântica na base de conhecimento
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.pipeline_rag_enabled}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, pipeline_rag_enabled: checked }))}
                  disabled={!config.pipeline_v2_enabled}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <div>
                    <Label className="font-medium">Learning Habilitado</Label>
                    <p className="text-xs text-muted-foreground">
                      Camada de aprendizado e refinamento de regras
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.pipeline_learning_enabled}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, pipeline_learning_enabled: checked }))}
                  disabled={!config.pipeline_v2_enabled}
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                <div className="flex items-center gap-2">
                  <Bug className="h-4 w-4 text-yellow-600" />
                  <div>
                    <Label className="font-medium">Debug Mode</Label>
                    <p className="text-xs text-muted-foreground">
                      Logs verbosos para diagnóstico (impacta performance)
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config.pipeline_debug_mode}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, pipeline_debug_mode: checked }))}
                  disabled={!config.pipeline_v2_enabled}
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Botão Salvar */}
        <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
          {saving ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
          ) : (
            <><Save className="mr-2 h-4 w-4" /> Salvar Configurações</>
          )}
        </Button>

        {/* Info Box */}
        <div className="p-4 rounded-lg bg-muted/50 space-y-2">
          <p className="font-medium text-sm">Como funciona o rollout:</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Se <code className="px-1 bg-muted rounded">pipeline_v2_enabled = false</code> → Ninguém usa v2</li>
            <li>Se telefone está na lista de testes → Sempre usa v2</li>
            <li>Se rollout {'>'} 0% → Hash do telefone decide (distribuição consistente)</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
