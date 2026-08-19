import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
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
import { Trophy, Medal, Award, TrendingUp, Target, DollarSign } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUIConfig } from '@/hooks/useUIConfig';

interface EmployeeRank {
  user_id: string;
  nome: string | null;
  email: string | null;
  propostas: number;
  aceitas: number;
  valor_fechado: number;
  conversao: number;
  score: number;
}

export function EmployeeRanking() {
  const { availableYears } = useUIConfig();
  const [ranking, setRanking] = useState<EmployeeRank[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  async function fetchRanking() {
    setLoading(true);
    try {
      const monthStart = startOfMonth(new Date(selectedYear, selectedMonth - 1));
      const monthEnd = endOfMonth(new Date(selectedYear, selectedMonth - 1));

      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, nome, email, is_active')
        .eq('is_active', true);

      if (profilesError) throw profilesError;

      // Fetch proposals for the month
      const { data: propostas, error: propostasError } = await supabase
        .from('propostas_assinantes')
        .select('user_id, status, economia_acumulada, created_at')
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());

      if (propostasError) throw propostasError;

      // Calculate ranking
      const rankingData: EmployeeRank[] = [];

      profiles?.forEach(profile => {
        const userPropostas = propostas?.filter(p => p.user_id === profile.user_id) || [];
        if (userPropostas.length === 0) return;

        const aceitas = userPropostas.filter(p => p.status === 'aceita');
        const totalNaoRascunho = userPropostas.filter(p => 
          p.status === 'aceita' || p.status === 'enviada' || p.status === 'recusada'
        );
        const valorFechado = aceitas.reduce((sum, p) => sum + (p.economia_acumulada || 0), 0);
        const conversao = totalNaoRascunho.length > 0 
          ? (aceitas.length / totalNaoRascunho.length) * 100 
          : 0;

        // Score calculation: weighted average
        // 40% valor fechado (normalized), 30% conversão, 30% volume propostas
        const score = (valorFechado / 10000) * 0.4 + conversao * 0.3 + userPropostas.length * 0.3;

        rankingData.push({
          user_id: profile.user_id,
          nome: profile.nome,
          email: profile.email,
          propostas: userPropostas.length,
          aceitas: aceitas.length,
          valor_fechado: valorFechado,
          conversao,
          score,
        });
      });

      setRanking(rankingData.sort((a, b) => b.score - a.score));
    } catch (err) {
      console.error('Error fetching ranking:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRanking();
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

  function getRankIcon(position: number) {
    switch (position) {
      case 0:
        return <Trophy className="h-6 w-6 text-yellow-500" />;
      case 1:
        return <Medal className="h-6 w-6 text-gray-400" />;
      case 2:
        return <Award className="h-6 w-6 text-amber-600" />;
      default:
        return <span className="w-6 h-6 flex items-center justify-center text-muted-foreground font-medium">{position + 1}</span>;
    }
  }

  function getRankBackground(position: number) {
    switch (position) {
      case 0:
        return 'bg-gradient-to-r from-yellow-500/20 via-yellow-400/10 to-transparent border-yellow-500/30';
      case 1:
        return 'bg-gradient-to-r from-gray-400/20 via-gray-300/10 to-transparent border-gray-400/30';
      case 2:
        return 'bg-gradient-to-r from-amber-600/20 via-amber-500/10 to-transparent border-amber-600/30';
      default:
        return 'bg-card border-border';
    }
  }

  function getRankBadge(position: number) {
    switch (position) {
      case 0:
        return <Badge className="bg-yellow-500 text-yellow-950">🥇 1º Lugar</Badge>;
      case 1:
        return <Badge className="bg-gray-400 text-gray-950">🥈 2º Lugar</Badge>;
      case 2:
        return <Badge className="bg-amber-600 text-amber-950">🥉 3º Lugar</Badge>;
      default:
        return null;
    }
  }

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: format(new Date(2024, i, 1), 'MMMM', { locale: ptBR }),
  }));

  const years = availableYears;

  const monthName = format(new Date(selectedYear, selectedMonth - 1, 1), 'MMMM yyyy', { locale: ptBR });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Ranking de Funcionários
          </h3>
          <p className="text-sm text-muted-foreground capitalize">{monthName}</p>
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
      ) : ranking.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Nenhum dado de desempenho para este período.</p>
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {ranking.length >= 3 && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              {/* 2nd Place */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <Card className="border-gray-400/30 bg-gradient-to-b from-gray-400/10 to-transparent">
                  <CardContent className="pt-6 text-center">
                    <div className="relative inline-block mb-3">
                      <Avatar className="h-16 w-16 border-4 border-gray-400">
                        <AvatarFallback className="bg-gray-200 text-gray-700 text-lg">
                          {getInitials(ranking[1].nome, ranking[1].email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1 -right-1 bg-gray-400 rounded-full p-1">
                        <Medal className="h-4 w-4 text-white" />
                      </div>
                    </div>
                    <p className="font-semibold truncate">{ranking[1].nome || 'Sem nome'}</p>
                    <Badge className="bg-gray-400 text-gray-950 mt-2">🥈 2º Lugar</Badge>
                    <p className="text-sm text-muted-foreground mt-2">
                      {formatCurrency(ranking[1].valor_fechado)}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              {/* 1st Place */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0 }}
              >
                <Card className="border-yellow-500/30 bg-gradient-to-b from-yellow-500/20 to-transparent -mt-4">
                  <CardContent className="pt-6 text-center">
                    <div className="relative inline-block mb-3">
                      <Avatar className="h-20 w-20 border-4 border-yellow-500">
                        <AvatarFallback className="bg-yellow-100 text-yellow-700 text-xl">
                          {getInitials(ranking[0].nome, ranking[0].email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1 -right-1 bg-yellow-500 rounded-full p-1.5">
                        <Trophy className="h-4 w-4 text-white" />
                      </div>
                    </div>
                    <p className="font-bold text-lg truncate">{ranking[0].nome || 'Sem nome'}</p>
                    <Badge className="bg-yellow-500 text-yellow-950 mt-2">🥇 1º Lugar</Badge>
                    <p className="text-sm font-medium text-yellow-600 mt-2">
                      {formatCurrency(ranking[0].valor_fechado)}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              {/* 3rd Place */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="border-amber-600/30 bg-gradient-to-b from-amber-600/10 to-transparent">
                  <CardContent className="pt-6 text-center">
                    <div className="relative inline-block mb-3">
                      <Avatar className="h-16 w-16 border-4 border-amber-600">
                        <AvatarFallback className="bg-amber-100 text-amber-700 text-lg">
                          {getInitials(ranking[2].nome, ranking[2].email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1 -right-1 bg-amber-600 rounded-full p-1">
                        <Award className="h-4 w-4 text-white" />
                      </div>
                    </div>
                    <p className="font-semibold truncate">{ranking[2].nome || 'Sem nome'}</p>
                    <Badge className="bg-amber-600 text-amber-950 mt-2">🥉 3º Lugar</Badge>
                    <p className="text-sm text-muted-foreground mt-2">
                      {formatCurrency(ranking[2].valor_fechado)}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          )}

          {/* Full Ranking List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Classificação Completa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ranking.map((employee, index) => (
                <motion.div
                  key={employee.user_id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`flex items-center gap-4 p-4 rounded-lg border ${getRankBackground(index)}`}
                >
                  {/* Position */}
                  <div className="flex-shrink-0 w-8">
                    {getRankIcon(index)}
                  </div>

                  {/* Avatar */}
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-sm">
                      {getInitials(employee.nome, employee.email)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Name & Badge */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{employee.nome || 'Sem nome'}</p>
                      {getRankBadge(index)}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{employee.email}</p>
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Target className="h-4 w-4" />
                      <span>{employee.propostas}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                      <span>{employee.conversao.toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-medium">
                      <DollarSign className="h-4 w-4 text-green-600" />
                      <span>{formatCurrency(employee.valor_fechado)}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
