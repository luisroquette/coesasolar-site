import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { 
  LifeBuoy, 
  Clock, 
  AlertTriangle, 
  RefreshCw,
  TrendingUp,
  Users,
  MessageSquare,
  Target
} from 'lucide-react';

interface RescueMetrics {
  totalStuckLeads: number;
  rescuedToday: number;
  escalatedToday: number;
  pendingRescue: number;
  byReason: Record<string, number>;
}

export function StuckLeadsRescueConfig() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Buscar configuração de habilitação
  const { data: rescueEnabled, isLoading: loadingConfig } = useQuery({
    queryKey: ['stuck-leads-rescue-enabled'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', 'stuck_leads_rescue_enabled')
        .single();
      
      if (error) return true; // Default enabled
      return data?.valor !== 'false';
    },
  });

  // Buscar métricas de resgate
  const { data: metrics, isLoading: loadingMetrics, refetch: refetchMetrics } = useQuery({
    queryKey: ['stuck-leads-rescue-metrics'],
    queryFn: async (): Promise<RescueMetrics> => {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Total de leads travados (não resgatados ainda)
      const { count: totalStuckLeads } = await supabase
        .from('chatbot_conversas')
        .select('id', { count: 'exact', head: true })
        .is('ended_at', null)
        .neq('needs_human_fallback', true)
        .lt('rescue_attempts', 7)
        .not('rescue_reason', 'is', null);
      
      // Resgatados hoje (mensagens de resgate enviadas)
      const { count: rescuedToday } = await supabase
        .from('activity_logs')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'stuck_lead_rescue_sent')
        .gte('created_at', startOfDay.toISOString());
      
      // Escalados hoje
      const { count: escalatedToday } = await supabase
        .from('admin_notifications')
        .select('id', { count: 'exact', head: true })
        .ilike('title', '%Lead travado%')
        .gte('created_at', startOfDay.toISOString());
      
      // Pendentes de resgate (próximo resgate já passou)
      const { count: pendingRescue } = await supabase
        .from('chatbot_conversas')
        .select('id', { count: 'exact', head: true })
        .is('ended_at', null)
        .neq('needs_human_fallback', true)
        .lt('next_rescue_at', now.toISOString())
        .lt('rescue_attempts', 7);
      
      // Por motivo
      const { data: byReasonData } = await supabase
        .from('chatbot_conversas')
        .select('rescue_reason')
        .is('ended_at', null)
        .neq('needs_human_fallback', true)
        .not('rescue_reason', 'is', null);
      
      const byReason: Record<string, number> = {};
      byReasonData?.forEach(row => {
        const reason = row.rescue_reason || 'unknown';
        byReason[reason] = (byReason[reason] || 0) + 1;
      });
      
      return {
        totalStuckLeads: totalStuckLeads || 0,
        rescuedToday: rescuedToday || 0,
        escalatedToday: escalatedToday || 0,
        pendingRescue: pendingRescue || 0,
        byReason,
      };
    },
    refetchInterval: 60000, // Atualizar a cada 1 minuto
  });

  // Toggle habilitação
  const toggleRescue = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('configuracoes_sistema')
        .upsert({
          chave: 'stuck_leads_rescue_enabled',
          valor: enabled ? 'true' : 'false',
          descricao: 'Habilita o scheduler automático de resgate de leads travados',
        }, { onConflict: 'chave' });
      
      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      queryClient.invalidateQueries({ queryKey: ['stuck-leads-rescue-enabled'] });
      toast.success(enabled ? 'Resgate automático ativado' : 'Resgate automático desativado');
    },
    onError: () => {
      toast.error('Erro ao atualizar configuração');
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchMetrics();
    setIsRefreshing(false);
    toast.success('Métricas atualizadas');
  };

  const formatReason = (reason: string): string => {
    const labels: Record<string, string> = {
      missing_tipo_instalacao: 'Tipo Instalação',
      missing_distribuidora: 'Distribuidora',
      missing_consumo: 'Consumo/Valor',
      missing_cep: 'CEP',
      missing_email: 'E-mail',
      missing_documento_identidade: 'RG/CNH',
      missing_fatura: 'Fatura',
      missing_contrato_social: 'Contrato Social',
      inactivity: 'Inatividade',
      unknown: 'Desconhecido',
    };
    return labels[reason] || reason;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" />
            <CardTitle>Resgate de Leads Travados</CardTitle>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
        <CardDescription>
          Sistema automático de resgate com 7 tentativas e gatilhos de urgência progressiva
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Toggle de habilitação */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="space-y-1">
            <Label htmlFor="rescue-enabled" className="text-base font-medium">
              Resgate Automático
            </Label>
            <p className="text-sm text-muted-foreground">
              A Sofia entrará em contato com leads travados automaticamente
            </p>
          </div>
          <Switch
            id="rescue-enabled"
            checked={rescueEnabled ?? true}
            onCheckedChange={(checked) => toggleRescue.mutate(checked)}
            disabled={loadingConfig || toggleRescue.isPending}
          />
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-background border rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs">Travados</span>
            </div>
            <p className="text-2xl font-bold">{metrics?.totalStuckLeads ?? '-'}</p>
          </div>
          
          <div className="p-4 bg-background border rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <MessageSquare className="h-4 w-4" />
              <span className="text-xs">Resgates Hoje</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{metrics?.rescuedToday ?? '-'}</p>
          </div>
          
          <div className="p-4 bg-background border rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs">Escalados Hoje</span>
            </div>
            <p className="text-2xl font-bold text-amber-600">{metrics?.escalatedToday ?? '-'}</p>
          </div>
          
          <div className="p-4 bg-background border rounded-lg">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Target className="h-4 w-4" />
              <span className="text-xs">Pendentes</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{metrics?.pendingRescue ?? '-'}</p>
          </div>
        </div>

        <Separator />

        {/* Régua de tentativas */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Régua de Resgate (7 Tentativas)
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">1ª</Badge>
                30 minutos após travamento
              </span>
              <Badge variant="secondary">Urgência Baixa</Badge>
            </div>
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">2ª</Badge>
                +1 hora
              </span>
              <Badge variant="secondary">Urgência Baixa</Badge>
            </div>
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">3ª</Badge>
                +2 horas
              </span>
              <Badge className="bg-amber-100 text-amber-800">Urgência Média</Badge>
            </div>
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">4ª</Badge>
                +4 horas
              </span>
              <Badge className="bg-amber-100 text-amber-800">Urgência Média</Badge>
            </div>
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">5ª</Badge>
                D+1 (24h)
              </span>
              <Badge className="bg-orange-100 text-orange-800">Urgência Alta</Badge>
            </div>
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">6ª</Badge>
                D+3 (72h)
              </span>
              <Badge className="bg-orange-100 text-orange-800">Urgência Alta</Badge>
            </div>
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded">
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">7ª</Badge>
                D+7 (última chance)
              </span>
              <Badge className="bg-red-100 text-red-800">Urgência Crítica</Badge>
            </div>
          </div>
        </div>

        <Separator />

        {/* Distribuição por motivo */}
        {metrics?.byReason && Object.keys(metrics.byReason).length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Distribuição por Motivo
            </h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(metrics.byReason)
                .sort((a, b) => b[1] - a[1])
                .map(([reason, count]) => (
                  <Badge key={reason} variant="outline" className="text-xs">
                    {formatReason(reason)}: {count}
                  </Badge>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
