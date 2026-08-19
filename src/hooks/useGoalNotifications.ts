import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface GoalAchievement {
  user_id: string;
  nome: string;
  type: 'propostas' | 'valor' | 'conversao' | 'all';
}

export function useGoalNotifications() {
  const notifiedGoals = useRef<Set<string>>(new Set());

  async function checkAndNotifyGoals() {
    try {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);

      // Get goals for current month
      const { data: goals, error: goalsError } = await supabase
        .from('employee_goals')
        .select('*')
        .eq('month', currentMonth)
        .eq('year', currentYear);

      if (goalsError || !goals?.length) return;

      // Get profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, nome');

      if (profilesError) return;

      // Get proposals for current month
      const { data: propostas, error: propostasError } = await supabase
        .from('propostas_assinantes')
        .select('user_id, status, economia_acumulada')
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());

      if (propostasError) return;

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.nome]) || []);

      for (const goal of goals) {
        const userPropostas = propostas?.filter(p => p.user_id === goal.user_id) || [];
        const aceitas = userPropostas.filter(p => p.status === 'aceita');
        const totalNaoRascunho = userPropostas.filter(p => 
          p.status === 'aceita' || p.status === 'enviada' || p.status === 'recusada'
        );

        const propostasAtual = userPropostas.length;
        const valorAtual = aceitas.reduce((sum, p) => sum + (p.economia_acumulada || 0), 0);
        const conversaoAtual = totalNaoRascunho.length > 0 
          ? (aceitas.length / totalNaoRascunho.length) * 100 
          : 0;

        const nome = profileMap.get(goal.user_id) || 'Funcionário';
        const monthName = format(now, 'MMMM', { locale: ptBR });

        // Check proposals goal
        if (propostasAtual >= (goal.propostas_meta || 10)) {
          const key = `propostas_${goal.user_id}_${currentMonth}_${currentYear}`;
          if (!notifiedGoals.current.has(key)) {
            notifiedGoals.current.add(key);
            await sendGoalNotification(
              `${nome} atingiu a meta de propostas!`,
              `Meta de ${goal.propostas_meta} propostas alcançada em ${monthName}.`,
              goal.user_id
            );
          }
        }

        // Check value goal
        if (valorAtual >= (goal.valor_meta || 50000)) {
          const key = `valor_${goal.user_id}_${currentMonth}_${currentYear}`;
          if (!notifiedGoals.current.has(key)) {
            notifiedGoals.current.add(key);
            await sendGoalNotification(
              `${nome} atingiu a meta de valor!`,
              `Meta de R$ ${(goal.valor_meta || 50000).toLocaleString('pt-BR')} alcançada em ${monthName}.`,
              goal.user_id
            );
          }
        }

        // Check conversion goal
        if (conversaoAtual >= (goal.conversao_meta || 30)) {
          const key = `conversao_${goal.user_id}_${currentMonth}_${currentYear}`;
          if (!notifiedGoals.current.has(key)) {
            notifiedGoals.current.add(key);
            await sendGoalNotification(
              `${nome} atingiu a meta de conversão!`,
              `Meta de ${goal.conversao_meta}% de conversão alcançada em ${monthName}.`,
              goal.user_id
            );
          }
        }
      }
    } catch (err) {
      console.error('Error checking goals:', err);
    }
  }

  async function sendGoalNotification(title: string, message: string, userId: string) {
    try {
      // Insert notification for all admins
      await supabase.rpc('notify_admins', {
        p_title: title,
        p_message: message,
        p_type: 'goal_achieved',
        p_entity_type: 'meta',
        p_entity_id: userId
      });
    } catch (err) {
      console.error('Error sending goal notification:', err);
    }
  }

  useEffect(() => {
    // Check goals on mount
    checkAndNotifyGoals();

    // Subscribe to proposal changes to check goals in real-time
    const channel = supabase
      .channel('goal-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'propostas_assinantes',
        },
        () => {
          checkAndNotifyGoals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { checkAndNotifyGoals };
}
