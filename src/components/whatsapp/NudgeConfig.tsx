import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Clock, 
  MessageCircle, 
  Save, 
  RotateCcw,
  Bell,
  Timer
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NudgeConfig {
  nudge_1_delay_minutes: number;
  nudge_2_delay_minutes: number;
  nudge_3_delay_minutes: number;
  nudge_1_messages: string;
  nudge_2_messages: string;
  nudge_3_messages: string;
}

const DEFAULT_CONFIG: NudgeConfig = {
  nudge_1_delay_minutes: 10,
  nudge_2_delay_minutes: 30,
  nudge_3_delay_minutes: 120,
  nudge_1_messages: `Oi, você ainda está aí? 😊
Ficou alguma dúvida sobre o que conversamos?
Posso te ajudar com mais alguma coisa?
Tudo certo por aí? Estou aqui se precisar!`,
  nudge_2_messages: `Sem problemas se estiver ocupado(a)! Fico por aqui quando precisar.
Sei que o dia é corrido. Quando puder, a gente continua! 😊
Fique à vontade pra responder quando der!`,
  nudge_3_messages: `Quando puder, me avisa que a gente retoma de onde parou! 😉
Vou deixar a conversa salva aqui. É só mandar um "oi" quando quiser continuar!
Fico no aguardo! Qualquer coisa, é só chamar.`,
};

export function NudgeConfig() {
  const [config, setConfig] = useState<NudgeConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('configuracoes_sistema')
        .select('chave, valor')
        .in('chave', [
          'nudge_1_delay_minutes',
          'nudge_2_delay_minutes',
          'nudge_3_delay_minutes',
          'nudge_1_messages',
          'nudge_2_messages',
          'nudge_3_messages',
        ]);

      if (error) throw error;

      const newConfig: NudgeConfig = { ...DEFAULT_CONFIG };
      data?.forEach((item) => {
        if (item.chave === 'nudge_1_delay_minutes') {
          newConfig.nudge_1_delay_minutes = parseInt(item.valor) || DEFAULT_CONFIG.nudge_1_delay_minutes;
        } else if (item.chave === 'nudge_2_delay_minutes') {
          newConfig.nudge_2_delay_minutes = parseInt(item.valor) || DEFAULT_CONFIG.nudge_2_delay_minutes;
        } else if (item.chave === 'nudge_3_delay_minutes') {
          newConfig.nudge_3_delay_minutes = parseInt(item.valor) || DEFAULT_CONFIG.nudge_3_delay_minutes;
        } else if (item.chave === 'nudge_1_messages') {
          newConfig.nudge_1_messages = item.valor || DEFAULT_CONFIG.nudge_1_messages;
        } else if (item.chave === 'nudge_2_messages') {
          newConfig.nudge_2_messages = item.valor || DEFAULT_CONFIG.nudge_2_messages;
        } else if (item.chave === 'nudge_3_messages') {
          newConfig.nudge_3_messages = item.valor || DEFAULT_CONFIG.nudge_3_messages;
        }
      });

      setConfig(newConfig);
    } catch (error) {
      console.error('Error fetching nudge config:', error);
      toast.error('Erro ao carregar configurações de nudge');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);

      const configKeys = Object.keys(config) as (keyof NudgeConfig)[];
      
      for (const key of configKeys) {
        const value = String(config[key]);
        
        const { error } = await supabase
          .from('configuracoes_sistema')
          .upsert(
            { chave: key, valor: value },
            { onConflict: 'chave' }
          );

        if (error) throw error;
      }

      toast.success('Configurações de nudge salvas com sucesso!');
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving nudge config:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
    setHasChanges(true);
  };

  const updateConfig = (key: keyof NudgeConfig, value: string | number) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const formatTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Configuração de Nudges
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-500" />
              Configuração de Nudges
            </CardTitle>
            <CardDescription>
              Configure os tempos e mensagens de reengajamento automático
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <Badge variant="outline" className="text-amber-600 border-amber-600">
                Alterações não salvas
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={saving}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restaurar Padrão
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !hasChanges}
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Explanation */}
        <div className="p-4 bg-muted/50 rounded-lg border">
          <p className="text-sm text-muted-foreground">
            <strong>Como funciona:</strong> Quando a sofIA envia uma mensagem e o lead não responde, 
            o sistema envia nudges automáticos para reengajar a conversa. Após 3 nudges sem resposta, 
            a conversa entra no fluxo de follow-up D+1 normal.
          </p>
        </div>

        {/* Nudge 1 */}
        <div className="p-4 border rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                <span className="text-green-600 font-bold text-sm">1</span>
              </div>
              <div>
                <h4 className="font-medium">Primeiro Nudge</h4>
                <p className="text-xs text-muted-foreground">Reengajamento leve</p>
              </div>
            </div>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {formatTime(config.nudge_1_delay_minutes)}
            </Badge>
          </div>
          
          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="nudge_1_delay" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Tempo (minutos)
              </Label>
              <Input
                id="nudge_1_delay"
                type="number"
                min={1}
                max={60}
                value={config.nudge_1_delay_minutes}
                onChange={(e) => updateConfig('nudge_1_delay_minutes', parseInt(e.target.value) || 10)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nudge_1_messages" className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Mensagens (uma por linha, aleatória)
              </Label>
              <Textarea
                id="nudge_1_messages"
                rows={4}
                value={config.nudge_1_messages}
                onChange={(e) => updateConfig('nudge_1_messages', e.target.value)}
                placeholder="Digite uma mensagem por linha..."
              />
            </div>
          </div>
        </div>

        {/* Nudge 2 */}
        <div className="p-4 border rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                <span className="text-amber-600 font-bold text-sm">2</span>
              </div>
              <div>
                <h4 className="font-medium">Segundo Nudge</h4>
                <p className="text-xs text-muted-foreground">Oferta de continuidade</p>
              </div>
            </div>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {formatTime(config.nudge_2_delay_minutes)}
            </Badge>
          </div>
          
          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="nudge_2_delay" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Tempo (minutos)
              </Label>
              <Input
                id="nudge_2_delay"
                type="number"
                min={1}
                max={180}
                value={config.nudge_2_delay_minutes}
                onChange={(e) => updateConfig('nudge_2_delay_minutes', parseInt(e.target.value) || 30)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nudge_2_messages" className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Mensagens (uma por linha, aleatória)
              </Label>
              <Textarea
                id="nudge_2_messages"
                rows={4}
                value={config.nudge_2_messages}
                onChange={(e) => updateConfig('nudge_2_messages', e.target.value)}
                placeholder="Digite uma mensagem por linha..."
              />
            </div>
          </div>
        </div>

        {/* Nudge 3 */}
        <div className="p-4 border rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                <span className="text-red-600 font-bold text-sm">3</span>
              </div>
              <div>
                <h4 className="font-medium">Terceiro Nudge</h4>
                <p className="text-xs text-muted-foreground">Fechamento suave (último)</p>
              </div>
            </div>
            <Badge variant="secondary" className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              {formatTime(config.nudge_3_delay_minutes)}
            </Badge>
          </div>
          
          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="nudge_3_delay" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Tempo (minutos)
              </Label>
              <Input
                id="nudge_3_delay"
                type="number"
                min={1}
                max={480}
                value={config.nudge_3_delay_minutes}
                onChange={(e) => updateConfig('nudge_3_delay_minutes', parseInt(e.target.value) || 120)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nudge_3_messages" className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Mensagens (uma por linha, aleatória)
              </Label>
              <Textarea
                id="nudge_3_messages"
                rows={4}
                value={config.nudge_3_messages}
                onChange={(e) => updateConfig('nudge_3_messages', e.target.value)}
                placeholder="Digite uma mensagem por linha..."
              />
            </div>
          </div>
        </div>

        {/* Visual Timeline */}
        <div className="p-4 bg-muted/30 rounded-lg">
          <h4 className="font-medium mb-4 flex items-center gap-2">
            <Timer className="h-4 w-4" />
            Timeline de Nudges
          </h4>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <div className="flex-shrink-0 px-3 py-2 bg-primary/10 rounded-lg text-center">
              <span className="text-xs text-muted-foreground">Sofia responde</span>
              <div className="text-sm font-medium mt-1">0 min</div>
            </div>
            <div className="flex-shrink-0 w-8 border-t-2 border-dashed border-green-500" />
            <div className="flex-shrink-0 px-3 py-2 bg-green-500/10 rounded-lg text-center">
              <span className="text-xs text-green-600">Nudge 1</span>
              <div className="text-sm font-medium mt-1">{formatTime(config.nudge_1_delay_minutes)}</div>
            </div>
            <div className="flex-shrink-0 w-8 border-t-2 border-dashed border-amber-500" />
            <div className="flex-shrink-0 px-3 py-2 bg-amber-500/10 rounded-lg text-center">
              <span className="text-xs text-amber-600">Nudge 2</span>
              <div className="text-sm font-medium mt-1">{formatTime(config.nudge_1_delay_minutes + config.nudge_2_delay_minutes)}</div>
            </div>
            <div className="flex-shrink-0 w-8 border-t-2 border-dashed border-red-500" />
            <div className="flex-shrink-0 px-3 py-2 bg-red-500/10 rounded-lg text-center">
              <span className="text-xs text-red-600">Nudge 3</span>
              <div className="text-sm font-medium mt-1">{formatTime(config.nudge_1_delay_minutes + config.nudge_2_delay_minutes + config.nudge_3_delay_minutes)}</div>
            </div>
            <div className="flex-shrink-0 w-8 border-t-2 border-dashed border-muted-foreground" />
            <div className="flex-shrink-0 px-3 py-2 bg-muted rounded-lg text-center">
              <span className="text-xs text-muted-foreground">Follow-up D+1</span>
              <div className="text-sm font-medium mt-1">24h</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
