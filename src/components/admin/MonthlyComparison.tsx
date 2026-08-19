import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  ArrowUp, 
  ArrowDown,
  BarChart3,
  Target,
  DollarSign
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useUIConfig } from '@/hooks/useUIConfig';

interface EmployeeComparison {
  user_id: string;
  nome: string | null;
  email: string | null;
  // Current month
  propostas_atual: number;
  aceitas_atual: number;
  valor_atual: number;
  conversao_atual: number;
  // Previous month
  propostas_anterior: number;
  aceitas_anterior: number;
  valor_anterior: number;
  conversao_anterior: number;
  // Deltas
  propostas_delta: number;
  valor_delta: number;
  conversao_delta: number;
}

export function MonthlyComparison() {
  const { availableYears, trendThreshold } = useUIConfig();
  const [comparisons, setComparisons] = useState<EmployeeComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  async function fetchComparisons() {
    setLoading(true);
    try {
      // Current month range
      const currentStart = startOfMonth(new Date(selectedYear, selectedMonth - 1));
      const currentEnd = endOfMonth(new Date(selectedYear, selectedMonth - 1));
      
      // Previous month range
      const prevDate = subMonths(currentStart, 1);
      const prevStart = startOfMonth(prevDate);
      const prevEnd = endOfMonth(prevDate);

      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, nome, email, is_active')
        .eq('is_active', true);

      if (profilesError) throw profilesError;

      // Fetch current month proposals
      const { data: currentPropostas, error: currentError } = await supabase
        .from('propostas_assinantes')
        .select('user_id, status, economia_acumulada')
        .gte('created_at', currentStart.toISOString())
        .lte('created_at', currentEnd.toISOString());

      if (currentError) throw currentError;

      // Fetch previous month proposals
      const { data: prevPropostas, error: prevError } = await supabase
        .from('propostas_assinantes')
        .select('user_id, status, economia_acumulada')
        .gte('created_at', prevStart.toISOString())
        .lte('created_at', prevEnd.toISOString());

      if (prevError) throw prevError;

      // Calculate comparisons
      const comparisonData: EmployeeComparison[] = [];

      profiles?.forEach(profile => {
        const currentUser = currentPropostas?.filter(p => p.user_id === profile.user_id) || [];
        const prevUser = prevPropostas?.filter(p => p.user_id === profile.user_id) || [];

        // Skip if no activity in both months
        if (currentUser.length === 0 && prevUser.length === 0) return;

        // Current month stats
        const currentAceitas = currentUser.filter(p => p.status === 'aceita');
        const currentNaoRascunho = currentUser.filter(p => 
          p.status === 'aceita' || p.status === 'enviada' || p.status === 'recusada'
        );
        const valorAtual = currentAceitas.reduce((sum, p) => sum + (p.economia_acumulada || 0), 0);
        const conversaoAtual = currentNaoRascunho.length > 0 
          ? (currentAceitas.length / currentNaoRascunho.length) * 100 
          : 0;

        // Previous month stats
        const prevAceitas = prevUser.filter(p => p.status === 'aceita');
        const prevNaoRascunho = prevUser.filter(p => 
          p.status === 'aceita' || p.status === 'enviada' || p.status === 'recusada'
        );
        const valorAnterior = prevAceitas.reduce((sum, p) => sum + (p.economia_acumulada || 0), 0);
        const conversaoAnterior = prevNaoRascunho.length > 0 
          ? (prevAceitas.length / prevNaoRascunho.length) * 100 
          : 0;

        comparisonData.push({
          user_id: profile.user_id,
          nome: profile.nome,
          email: profile.email,
          propostas_atual: currentUser.length,
          aceitas_atual: currentAceitas.length,
          valor_atual: valorAtual,
          conversao_atual: conversaoAtual,
          propostas_anterior: prevUser.length,
          aceitas_anterior: prevAceitas.length,
          valor_anterior: valorAnterior,
          conversao_anterior: conversaoAnterior,
          propostas_delta: currentUser.length - prevUser.length,
          valor_delta: valorAnterior > 0 ? ((valorAtual - valorAnterior) / valorAnterior) * 100 : 0,
          conversao_delta: conversaoAtual - conversaoAnterior,
        });
      });

      setComparisons(comparisonData.sort((a, b) => b.valor_delta - a.valor_delta));
    } catch (err) {
      console.error('Error fetching comparisons:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchComparisons();
  }, [selectedMonth, selectedYear]);

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  function getInitials(name: string | null, email: string | null): string {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    }
    return email?.slice(0, 2).toUpperCase() || '??';
  }

  function getDeltaIndicator(delta: number, suffix: string = '') {
    if (delta > 0) {
      return (
        <div className="flex items-center gap-1 text-green-600">
          <ArrowUp className="h-3 w-3" />
          <span className="text-xs font-medium">+{delta.toFixed(suffix === '%' ? 1 : 0)}{suffix}</span>
        </div>
      );
    }
    if (delta < 0) {
      return (
        <div className="flex items-center gap-1 text-red-600">
          <ArrowDown className="h-3 w-3" />
          <span className="text-xs font-medium">{delta.toFixed(suffix === '%' ? 1 : 0)}{suffix}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-muted-foreground">
        <Minus className="h-3 w-3" />
        <span className="text-xs">0{suffix}</span>
      </div>
    );
  }

  function getOverallTrend(employee: EmployeeComparison) {
    const score = (employee.propostas_delta * 10) + 
                  (employee.valor_delta * 0.5) + 
                  (employee.conversao_delta * 2);
    
    if (score > trendThreshold) {
      return (
        <Badge className="bg-green-500 gap-1">
          <TrendingUp className="h-3 w-3" />
          Crescendo
        </Badge>
      );
    }
    if (score < -trendThreshold) {
      return (
        <Badge variant="destructive" className="gap-1">
          <TrendingDown className="h-3 w-3" />
          Queda
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1">
        <Minus className="h-3 w-3" />
        Estável
      </Badge>
    );
  }

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: format(new Date(2024, i, 1), 'MMMM', { locale: ptBR }),
  }));

  const years = availableYears;

  const currentMonthName = format(new Date(selectedYear, selectedMonth - 1, 1), 'MMMM', { locale: ptBR });
  const prevMonthName = format(subMonths(new Date(selectedYear, selectedMonth - 1, 1), 1), 'MMMM', { locale: ptBR });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Comparativo Mensal
          </h3>
          <p className="text-sm text-muted-foreground capitalize">
            {currentMonthName} vs {prevMonthName}
          </p>
        </div>

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
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : comparisons.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhum dado de comparação para este período.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {comparisons.map((employee, index) => (
            <motion.div
              key={employee.user_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {getInitials(employee.nome, employee.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">{employee.nome || 'Sem nome'}</CardTitle>
                        <p className="text-xs text-muted-foreground truncate">{employee.email}</p>
                      </div>
                    </div>
                    {getOverallTrend(employee)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Proposals */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Propostas</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">{employee.propostas_atual}</p>
                        <p className="text-xs text-muted-foreground">
                          ant: {employee.propostas_anterior}
                        </p>
                      </div>
                      {getDeltaIndicator(employee.propostas_delta)}
                    </div>
                  </div>

                  {/* Value */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Valor Fechado</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">{formatCurrency(employee.valor_atual)}</p>
                        <p className="text-xs text-muted-foreground">
                          ant: {formatCurrency(employee.valor_anterior)}
                        </p>
                      </div>
                      {getDeltaIndicator(employee.valor_delta, '%')}
                    </div>
                  </div>

                  {/* Conversion */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-blue-600" />
                      <span className="text-sm">Conversão</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">{employee.conversao_atual.toFixed(1)}%</p>
                        <p className="text-xs text-muted-foreground">
                          ant: {employee.conversao_anterior.toFixed(1)}%
                        </p>
                      </div>
                      {getDeltaIndicator(employee.conversao_delta, 'pp')}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
