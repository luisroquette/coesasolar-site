import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Target, 
  Trophy, 
  TrendingUp, 
  DollarSign, 
  FileText,
  Award,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { motion } from 'framer-motion';

interface PersonalGoals {
  propostas_meta: number;
  valor_meta: number;
  conversao_meta: number;
}

interface PersonalStats {
  propostas: number;
  aceitas: number;
  valor_fechado: number;
  conversao: number;
  ranking_position: number;
  total_employees: number;
}

export function PersonalDashboard() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<PersonalGoals | null>(null);
  const [stats, setStats] = useState<PersonalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string>('');

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const monthName = format(new Date(), 'MMMM yyyy', { locale: ptBR });

  useEffect(() => {
    async function fetchData() {
      if (!user) return;
      setLoading(true);

      try {
        // Get user profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('nome')
          .eq('user_id', user.id)
          .single();

        setUserName(profile?.nome || 'Funcionário');

        // Get personal goals
        const { data: goalsData } = await supabase
          .from('employee_goals')
          .select('propostas_meta, valor_meta, conversao_meta')
          .eq('user_id', user.id)
          .eq('month', currentMonth)
          .eq('year', currentYear)
          .single();

        setGoals(goalsData);

        // Get proposals for current month
        const monthStart = startOfMonth(new Date());
        const monthEnd = endOfMonth(new Date());

        const { data: propostas } = await supabase
          .from('propostas_assinantes')
          .select('status, economia_acumulada, user_id')
          .gte('created_at', monthStart.toISOString())
          .lte('created_at', monthEnd.toISOString());

        // Calculate personal stats
        const myPropostas = propostas?.filter(p => p.user_id === user.id) || [];
        const myAceitas = myPropostas.filter(p => p.status === 'aceita');
        const myNaoRascunho = myPropostas.filter(p => 
          p.status === 'aceita' || p.status === 'enviada' || p.status === 'recusada'
        );
        const valorFechado = myAceitas.reduce((sum, p) => sum + (p.economia_acumulada || 0), 0);
        const conversao = myNaoRascunho.length > 0 
          ? (myAceitas.length / myNaoRascunho.length) * 100 
          : 0;

        // Calculate ranking
        const userScores = new Map<string, number>();
        propostas?.forEach(p => {
          const current = userScores.get(p.user_id) || 0;
          userScores.set(p.user_id, current + (p.economia_acumulada || 0));
        });

        const sortedScores = Array.from(userScores.entries())
          .sort((a, b) => b[1] - a[1]);
        
        const myPosition = sortedScores.findIndex(([uid]) => uid === user.id) + 1;

        setStats({
          propostas: myPropostas.length,
          aceitas: myAceitas.length,
          valor_fechado: valorFechado,
          conversao,
          ranking_position: myPosition || sortedScores.length + 1,
          total_employees: sortedScores.length,
        });
      } catch (err) {
        console.error('Error fetching personal data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user, currentMonth, currentYear]);

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  function getProgressColor(percent: number): string {
    if (percent >= 100) return 'text-green-500';
    if (percent >= 70) return 'text-yellow-500';
    return 'text-muted-foreground';
  }

  function getRankingBadge(position: number) {
    if (position === 1) return <Badge className="bg-yellow-500 gap-1"><Trophy className="h-3 w-3" /> 1º Lugar</Badge>;
    if (position === 2) return <Badge className="bg-gray-400 gap-1"><Award className="h-3 w-3" /> 2º Lugar</Badge>;
    if (position === 3) return <Badge className="bg-amber-600 gap-1"><Award className="h-3 w-3" /> 3º Lugar</Badge>;
    return <Badge variant="secondary">{position}º Lugar</Badge>;
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  const propostasPercent = goals ? Math.min(100, ((stats?.propostas || 0) / goals.propostas_meta) * 100) : 0;
  const valorPercent = goals ? Math.min(100, ((stats?.valor_fechado || 0) / goals.valor_meta) * 100) : 0;
  const conversaoPercent = goals ? Math.min(100, ((stats?.conversao || 0) / goals.conversao_meta) * 100) : 0;
  const overallPercent = (propostasPercent + valorPercent + conversaoPercent) / 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <Card className="bg-gradient-to-br from-primary/10 via-background to-background border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Suas Metas - {monthName}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Olá, {userName}! Acompanhe seu progresso este mês.
              </p>
            </div>
            {stats && stats.ranking_position <= stats.total_employees && (
              <div className="text-right">
                {getRankingBadge(stats.ranking_position)}
                <p className="text-xs text-muted-foreground mt-1">
                  de {stats.total_employees} funcionários
                </p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!goals ? (
            <div className="text-center py-6 text-muted-foreground">
              <Target className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Nenhuma meta definida para este mês.</p>
              <p className="text-sm">Aguarde o administrador definir suas metas.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Overall Progress */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Progresso Geral</span>
                  <span className={`text-lg font-bold ${getProgressColor(overallPercent)}`}>
                    {overallPercent.toFixed(0)}%
                  </span>
                </div>
                <Progress value={overallPercent} className="h-3" />
                {overallPercent >= 100 && (
                  <div className="flex items-center gap-2 mt-2 text-green-600">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-medium">Parabéns! Você atingiu todas as metas!</span>
                  </div>
                )}
              </div>

              {/* Individual Goals */}
              <div className="grid gap-4 md:grid-cols-3">
                {/* Proposals Goal */}
                <div className="bg-card rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">Propostas</span>
                    </div>
                    {propostasPercent >= 100 && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">{stats?.propostas || 0}</span>
                      <span className="text-muted-foreground">/ {goals.propostas_meta}</span>
                    </div>
                    <Progress value={propostasPercent} className="h-2 mt-2" />
                    <p className={`text-xs mt-1 ${getProgressColor(propostasPercent)}`}>
                      {propostasPercent.toFixed(0)}% da meta
                    </p>
                  </div>
                </div>

                {/* Value Goal */}
                <div className="bg-card rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">Valor Fechado</span>
                    </div>
                    {valorPercent >= 100 && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold">{formatCurrency(stats?.valor_fechado || 0)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Meta: {formatCurrency(goals.valor_meta)}
                    </p>
                    <Progress value={valorPercent} className="h-2 mt-2" />
                    <p className={`text-xs mt-1 ${getProgressColor(valorPercent)}`}>
                      {valorPercent.toFixed(0)}% da meta
                    </p>
                  </div>
                </div>

                {/* Conversion Goal */}
                <div className="bg-card rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium">Conversão</span>
                    </div>
                    {conversaoPercent >= 100 && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold">{(stats?.conversao || 0).toFixed(1)}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Meta: {goals.conversao_meta}%
                    </p>
                    <Progress value={conversaoPercent} className="h-2 mt-2" />
                    <p className={`text-xs mt-1 ${getProgressColor(conversaoPercent)}`}>
                      {conversaoPercent.toFixed(0)}% da meta
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="flex items-center justify-center gap-6 pt-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>{stats?.aceitas || 0} aceitas</span>
                </div>
                <div className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  <span>{stats?.propostas || 0} total</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
