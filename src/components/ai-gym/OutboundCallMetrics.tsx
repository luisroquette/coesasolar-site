import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Phone, PhoneIncoming, PhoneOff, Clock, CheckCircle, TrendingUp } from 'lucide-react';

interface CallResult {
  outcome: string;
  intent_detected: string;
}

interface Metrics {
  total_calls: number;
  answered: number;
  no_answer: number;
  positive_rate: number;
  avg_attempts: number;
  today_calls: number;
}

export function OutboundCallMetrics() {
  const [metrics, setMetrics] = useState<Metrics>({
    total_calls: 0,
    answered: 0,
    no_answer: 0,
    positive_rate: 0,
    avg_attempts: 0,
    today_calls: 0,
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Get all results
        const { data: results, error } = await supabase
          .from('outbound_call_results')
          .select('outcome, intent_detected, created_at');

        if (error) throw error;

        if (!results || results.length === 0) {
          return;
        }

        const today = new Date().toISOString().split('T')[0];
        const todayCalls = results.filter(r => r.created_at.startsWith(today)).length;
        
        const answered = results.filter(r => r.outcome === 'answered').length;
        const noAnswer = results.filter(r => r.outcome === 'no_answer' || r.outcome === 'busy').length;
        const positive = results.filter(r => 
          r.intent_detected === 'positive_whatsapp' || 
          r.intent_detected === 'positive'
        ).length;

        // Get queue stats for avg attempts
        const { data: queueData } = await supabase
          .from('outbound_call_queue')
          .select('attempts')
          .eq('status', 'completed');

        const avgAttempts = queueData && queueData.length > 0
          ? queueData.reduce((sum, q) => sum + (q.attempts || 1), 0) / queueData.length
          : 0;

        setMetrics({
          total_calls: results.length,
          answered,
          no_answer: noAnswer,
          positive_rate: answered > 0 ? Math.round((positive / answered) * 100) : 0,
          avg_attempts: Math.round(avgAttempts * 10) / 10,
          today_calls: todayCalls,
        });
      } catch (error) {
        console.error('Error fetching metrics:', error);
      }
    };

    fetchMetrics();
  }, []);

  const answerRate = metrics.total_calls > 0 
    ? Math.round((metrics.answered / metrics.total_calls) * 100) 
    : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Total
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.total_calls}</div>
          <p className="text-xs text-muted-foreground">ligações</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Hoje
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-500">{metrics.today_calls}</div>
          <p className="text-xs text-muted-foreground">ligações</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <PhoneIncoming className="h-4 w-4" />
            Atendidas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-500">{metrics.answered}</div>
          <p className="text-xs text-muted-foreground">{answerRate}% taxa</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <PhoneOff className="h-4 w-4" />
            Não Atend.
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-500">{metrics.no_answer}</div>
          <p className="text-xs text-muted-foreground">tentativas</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Positivas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-emerald-500">{metrics.positive_rate}%</div>
          <p className="text-xs text-muted-foreground">das atendidas</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Média Tent.
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.avg_attempts}</div>
          <p className="text-xs text-muted-foreground">por lead</p>
        </CardContent>
      </Card>
    </div>
  );
}
