import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Target, TrendingUp, TrendingDown, Check, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { SetGoalsDialog } from './SetGoalsDialog';
import { exportGoalsToExcel, exportGoalsToPDF } from '@/lib/export-utils';
import { toast } from 'sonner';

interface GoalProgress {
  user_id: string;
  nome: string | null;
  email: string | null;
  propostas_atual: number;
  propostas_meta: number;
  propostas_percent: number;
  valor_atual: number;
  valor_meta: number;
  valor_percent: number;
  conversao_atual: number;
  conversao_meta: number;
  conversao_percent: number;
}

export function GoalsProgress() {
  const [goals, setGoals] = useState<GoalProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [dialogOpen, setDialogOpen] = useState(false);

  async function fetchGoals() {
    setLoading(true);
    try {
      // Get all goals for the selected period
      const { data: goalsData, error: goalsError } = await supabase
        .from('employee_goals')
        .select('*')
        .eq('month', selectedMonth)
        .eq('year', selectedYear);

      if (goalsError) throw goalsError;

      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, nome, email');

      if (profilesError) throw profilesError;

      // Get propostas for the month
      const monthStart = startOfMonth(new Date(selectedYear, selectedMonth - 1));
      const monthEnd = endOfMonth(new Date(selectedYear, selectedMonth - 1));

      const { data: propostas, error: propostasError } = await supabase
        .from('propostas_assinantes')
        .select('user_id, status, economia_acumulada, created_at')
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());

      if (propostasError) throw propostasError;

      // Calculate progress for each employee with goals
      const progressData: GoalProgress[] = [];

      profiles?.forEach(profile => {
        const goal = goalsData?.find(g => g.user_id === profile.user_id);
        if (!goal) return;

        const userPropostas = propostas?.filter(p => p.user_id === profile.user_id) || [];
        const aceitas = userPropostas.filter(p => p.status === 'aceita');
        const totalNaoRascunho = userPropostas.filter(p => 
          p.status === 'aceita' || p.status === 'enviada' || p.status === 'recusada'
        );

        const propostasAtual = userPropostas.length;
        const valorAtual = aceitas.reduce((sum, p) => sum + (p.economia_acumulada || 0), 0);
        const conversaoAtual = totalNaoRascunho.length > 0 
          ? (aceitas.length / totalNaoRascunho.length) * 100 
          : 0;

        progressData.push({
          user_id: profile.user_id,
          nome: profile.nome,
          email: profile.email,
          propostas_atual: propostasAtual,
          propostas_meta: goal.propostas_meta || 10,
          propostas_percent: Math.min(100, (propostasAtual / (goal.propostas_meta || 10)) * 100),
          valor_atual: valorAtual,
          valor_meta: goal.valor_meta || 50000,
          valor_percent: Math.min(100, (valorAtual / (goal.valor_meta || 50000)) * 100),
          conversao_atual: conversaoAtual,
          conversao_meta: goal.conversao_meta || 30,
          conversao_percent: Math.min(100, (conversaoAtual / (goal.conversao_meta || 30)) * 100),
        });
      });

      setGoals(progressData.sort((a, b) => b.valor_percent - a.valor_percent));
    } catch (err) {
      console.error('Error fetching goals:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchGoals();
  }, [selectedMonth, selectedYear]);

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  function getProgressColor(percent: number): string {
    if (percent >= 100) return 'bg-green-500';
    if (percent >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  function getProgressBadge(percent: number, label: string) {
    if (percent >= 100) {
      return (
        <Badge variant="default" className="bg-green-500 gap-1">
          <Check className="h-3 w-3" />
          {label}
        </Badge>
      );
    }
    if (percent >= 70) {
      return (
        <Badge variant="secondary" className="gap-1">
          <TrendingUp className="h-3 w-3" />
          {label}
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="gap-1">
        <TrendingDown className="h-3 w-3" />
        {label}
      </Badge>
    );
  }

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: format(new Date(2024, i, 1), 'MMMM', { locale: ptBR }),
  }));

  const years = [2024, 2025, 2026, 2027];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-2">
          <Select 
            value={selectedMonth.toString()} 
            onValueChange={(v) => setSelectedMonth(parseInt(v))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map(m => (
                <SelectItem key={m.value} value={m.value.toString()}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select 
            value={selectedYear.toString()} 
            onValueChange={(v) => setSelectedYear(parseInt(v))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={goals.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => {
                  exportGoalsToExcel(goals, selectedMonth, selectedYear);
                  toast.success('Arquivo Excel exportado com sucesso!');
                }}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Exportar Excel
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => {
                  exportGoalsToPDF(goals, selectedMonth, selectedYear);
                  toast.success('Arquivo PDF exportado com sucesso!');
                }}
              >
                <FileText className="mr-2 h-4 w-4" />
                Exportar PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button onClick={() => setDialogOpen(true)}>
            <Target className="mr-2 h-4 w-4" />
            Definir Metas
          </Button>
        </div>
      </div>

      {goals.length === 0 && !loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhuma meta definida para este período.</p>
          <p className="text-sm mt-1">Clique em "Definir Metas" para começar.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead>Propostas</TableHead>
                <TableHead>Valor Fechado</TableHead>
                <TableHead>Conversão</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : (
                goals.map((goal) => {
                  const overallPercent = (goal.propostas_percent + goal.valor_percent + goal.conversao_percent) / 3;
                  
                  return (
                    <TableRow key={goal.user_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{goal.nome || 'Sem nome'}</p>
                          <p className="text-xs text-muted-foreground">{goal.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>{goal.propostas_atual}</span>
                            <span className="text-muted-foreground">/ {goal.propostas_meta}</span>
                          </div>
                          <Progress 
                            value={goal.propostas_percent} 
                            className="h-2"
                          />
                          <p className="text-xs text-muted-foreground">
                            {goal.propostas_percent.toFixed(0)}%
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>{formatCurrency(goal.valor_atual)}</span>
                            <span className="text-muted-foreground">/ {formatCurrency(goal.valor_meta)}</span>
                          </div>
                          <Progress 
                            value={goal.valor_percent} 
                            className="h-2"
                          />
                          <p className="text-xs text-muted-foreground">
                            {goal.valor_percent.toFixed(0)}%
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>{goal.conversao_atual.toFixed(1)}%</span>
                            <span className="text-muted-foreground">/ {goal.conversao_meta}%</span>
                          </div>
                          <Progress 
                            value={goal.conversao_percent} 
                            className="h-2"
                          />
                          <p className="text-xs text-muted-foreground">
                            {goal.conversao_percent.toFixed(0)}%
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {getProgressBadge(overallPercent, `${overallPercent.toFixed(0)}%`)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <SetGoalsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchGoals}
      />
    </div>
  );
}
