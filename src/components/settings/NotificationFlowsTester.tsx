import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Play, Clock, Users, Zap, Calendar, BarChart3, Eye } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FlowConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  schedule: string;
  trigger: 'cron' | 'webhook';
  functionName: string;
  notificationType: string;
}

const FLOWS: FlowConfig[] = [
  {
    id: 'daily',
    name: 'Relatório Diário',
    description: 'Resumo de métricas e conversões do dia',
    icon: '📊',
    schedule: '20:00 (Seg-Sex)',
    trigger: 'cron',
    functionName: 'sofia-daily-stats',
    notificationType: 'daily_report',
  },
  {
    id: 'weekly',
    name: 'Resumo Semanal',
    description: 'Análise completa da semana anterior',
    icon: '📅',
    schedule: '09:00 (Segundas)',
    trigger: 'cron',
    functionName: 'sofia-weekly-stats',
    notificationType: 'weekly_report',
  },
  {
    id: 'hot_lead',
    name: 'Alerta Lead Quente',
    description: 'Notificação instantânea de leads qualificados',
    icon: '🔥',
    schedule: 'Tempo real',
    trigger: 'webhook',
    functionName: 'sofia-hot-lead-alert',
    notificationType: 'hot_lead',
  },
];

export const NotificationFlowsTester = () => {
  const [testing, setTesting] = useState<string | null>(null);
  const [recipientCounts, setRecipientCounts] = useState<Record<string, number>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<{ title: string; content: string } | null>(null);

  useEffect(() => {
    loadRecipientCounts();
  }, []);

  const loadRecipientCounts = async () => {
    try {
      const { data } = await supabase
        .from('daily_report_recipients')
        .select('notification_types, is_active');

      if (!data) return;

      const counts: Record<string, number> = {
        daily_report: 0,
        weekly_report: 0,
        hot_lead: 0,
      };

      data.forEach((recipient) => {
        if (recipient.is_active && recipient.notification_types) {
          recipient.notification_types.forEach((type: string) => {
            if (counts[type] !== undefined) {
              counts[type]++;
            }
          });
        }
      });

      setRecipientCounts(counts);
    } catch (error) {
      console.error('Erro ao carregar contagem:', error);
    }
  };

  const handleTest = async (flow: FlowConfig) => {
    setTesting(flow.id);
    try {
      let body = {};
      
      // Para hot lead, enviar dados mock
      if (flow.id === 'hot_lead') {
        body = {
          nome: 'Lead Teste',
          telefone: '5531999999999',
          economia_estimada: 2500,
          lead_score: 85,
          teste: true,
        };
      }

      const { data, error } = await supabase.functions.invoke(flow.functionName, {
        body,
      });

      if (error) throw error;

      toast.success(`Teste do ${flow.name} disparado com sucesso!`);
      console.log('Resultado:', data);
    } catch (error) {
      console.error('Erro ao testar:', error);
      toast.error('Erro ao disparar teste');
    } finally {
      setTesting(null);
    }
  };

  const handlePreview = (flow: FlowConfig) => {
    let content = '';
    
    if (flow.id === 'daily') {
      content = `📊 *RELATÓRIO DIÁRIO SOFIA*
📅 ${new Date().toLocaleDateString('pt-BR')}

👥 *LEADS*
• Atendidos: 23

📨 *FOLLOW-UPS*
• Disparados: 45
• Respondidos: 18 (40%)

📄 *PROPOSTAS*
• Iniciais: 15
• Contratos solicitados: 8

📝 *CONTRATOS*
• Emitidos: 5
• Assinados: 3 (60%)

_Relatório automático - Sofia IA_`;
    } else if (flow.id === 'weekly') {
      content = `📊 *RESUMO SEMANAL SOFIA*
📅 27/01/2025 a 02/02/2025

👥 *LEADS*
• Atendidos: 156

📨 *FOLLOW-UPS*
• Disparados: 312
• Respondidos: 125 (40%)

📄 *PROPOSTAS*
• Iniciais: 89 (57% dos leads)
• Contratos solicitados: 45

📝 *CONTRATOS*
• Emitidos: 32
• Assinados: 21 (13% dos leads)

_Relatório semanal gerado automaticamente pela Sofia_`;
    } else if (flow.id === 'hot_lead') {
      content = `🔥🔥🔥 *LEAD QUENTE!* 🔥🔥🔥

👤 *João Silva*
📱 +55 31 99999-9999
📧 joao@email.com
📍 Belo Horizonte
⚡ CEMIG

💰 *Valor da conta:* R$ 850
💚 *Economia estimada:* R$ 2.550/ano
📊 *Lead Score:* 85/100
🎯 *Origem:* whatsapp

💬 *Mensagem de gatilho:*
"Quero fechar o contrato!"

_Alerta gerado automaticamente pela Sofia_`;
    }

    setPreviewContent({
      title: flow.name,
      content,
    });
    setPreviewOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" />
          Fluxos de Notificação
        </CardTitle>
        <CardDescription>
          Teste e monitore os relatórios automáticos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {FLOWS.map((flow) => (
          <div
            key={flow.id}
            className="rounded-lg border p-4 space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{flow.icon}</span>
                <div>
                  <h4 className="font-medium">{flow.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {flow.description}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={flow.trigger === 'cron' 
                  ? 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                  : 'bg-orange-500/10 text-orange-600 border-orange-500/30'
                }
              >
                {flow.trigger === 'cron' ? (
                  <Clock className="h-3 w-3 mr-1" />
                ) : (
                  <Zap className="h-3 w-3 mr-1" />
                )}
                {flow.trigger === 'cron' ? 'Agendado' : 'Tempo Real'}
              </Badge>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {flow.schedule}
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {recipientCounts[flow.notificationType] || 0} destinatário(s)
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTest(flow)}
                disabled={testing === flow.id}
                className="gap-2"
              >
                {testing === flow.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {flow.id === 'hot_lead' ? 'Testar com Mock' : 'Testar Agora'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePreview(flow)}
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                Ver Preview
              </Button>
            </div>
          </div>
        ))}

        <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <strong>Dica:</strong> Os testes disparam as funções reais e enviam mensagens aos destinatários ativos.
          </p>
        </div>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Preview: {previewContent?.title}</DialogTitle>
              <DialogDescription>
                Exemplo de como a mensagem será enviada
              </DialogDescription>
            </DialogHeader>
            <div className="bg-[#0b141a] text-white p-4 rounded-lg font-mono text-sm whitespace-pre-wrap">
              {previewContent?.content}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
