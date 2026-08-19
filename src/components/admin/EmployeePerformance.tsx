import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  DollarSign,
  CheckCircle
} from 'lucide-react';

interface EmployeeStats {
  user_id: string;
  nome: string | null;
  email: string | null;
  cargo: string | null;
  total_propostas: number;
  propostas_aceitas: number;
  propostas_enviadas: number;
  propostas_recusadas: number;
  valor_total: number;
  valor_aceito: number;
  taxa_conversao: number;
}

export function EmployeePerformance() {
  const [stats, setStats] = useState<EmployeeStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({
    propostas: 0,
    valor: 0,
    aceitas: 0,
  });

  async function fetchStats() {
    setLoading(true);
    try {
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, nome, email, cargo');

      if (profilesError) throw profilesError;

      // Get all propostas_assinantes
      const { data: propostas, error: propostasError } = await supabase
        .from('propostas_assinantes')
        .select('user_id, status, economia_acumulada');

      if (propostasError) throw propostasError;

      // Calculate stats per user
      const statsMap = new Map<string, EmployeeStats>();

      profiles?.forEach(profile => {
        statsMap.set(profile.user_id, {
          user_id: profile.user_id,
          nome: profile.nome,
          email: profile.email,
          cargo: profile.cargo,
          total_propostas: 0,
          propostas_aceitas: 0,
          propostas_enviadas: 0,
          propostas_recusadas: 0,
          valor_total: 0,
          valor_aceito: 0,
          taxa_conversao: 0,
        });
      });

      propostas?.forEach(proposta => {
        const stat = statsMap.get(proposta.user_id);
        if (stat) {
          stat.total_propostas++;
          stat.valor_total += proposta.economia_acumulada || 0;

          switch (proposta.status) {
            case 'aceita':
              stat.propostas_aceitas++;
              stat.valor_aceito += proposta.economia_acumulada || 0;
              break;
            case 'enviada':
              stat.propostas_enviadas++;
              break;
            case 'recusada':
              stat.propostas_recusadas++;
              break;
          }
        }
      });

      // Calculate conversion rate
      statsMap.forEach(stat => {
        const totalNaoRascunho = stat.propostas_aceitas + stat.propostas_enviadas + stat.propostas_recusadas;
        stat.taxa_conversao = totalNaoRascunho > 0 
          ? (stat.propostas_aceitas / totalNaoRascunho) * 100 
          : 0;
      });

      const statsArray = Array.from(statsMap.values())
        .filter(s => s.total_propostas > 0)
        .sort((a, b) => b.valor_aceito - a.valor_aceito);

      setStats(statsArray);

      // Calculate totals
      setTotals({
        propostas: statsArray.reduce((sum, s) => sum + s.total_propostas, 0),
        valor: statsArray.reduce((sum, s) => sum + s.valor_aceito, 0),
        aceitas: statsArray.reduce((sum, s) => sum + s.propostas_aceitas, 0),
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStats();
  }, []);

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  function getConversionBadge(rate: number) {
    if (rate >= 50) {
      return (
        <Badge variant="default" className="bg-green-500 gap-1">
          <TrendingUp className="h-3 w-3" />
          {rate.toFixed(0)}%
        </Badge>
      );
    } else if (rate >= 25) {
      return (
        <Badge variant="secondary" className="gap-1">
          <Minus className="h-3 w-3" />
          {rate.toFixed(0)}%
        </Badge>
      );
    } else {
      return (
        <Badge variant="destructive" className="gap-1">
          <TrendingDown className="h-3 w-3" />
          {rate.toFixed(0)}%
        </Badge>
      );
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <FileText className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-2xl font-bold">{totals.propostas}</p>
          <p className="text-sm text-muted-foreground">Propostas Total</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-500" />
          <p className="text-2xl font-bold">{totals.aceitas}</p>
          <p className="text-sm text-muted-foreground">Propostas Aceitas</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <DollarSign className="h-6 w-6 mx-auto mb-2 text-primary" />
          <p className="text-2xl font-bold">{formatCurrency(totals.valor)}</p>
          <p className="text-sm text-muted-foreground">Valor Fechado</p>
        </div>
      </div>

      {/* Performance Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead className="text-center">Propostas</TableHead>
              <TableHead className="text-center">Aceitas</TableHead>
              <TableHead className="text-right">Valor Fechado</TableHead>
              <TableHead className="text-center">Conversão</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : stats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nenhum dado de desempenho
                </TableCell>
              </TableRow>
            ) : (
              stats.map((stat) => (
                <TableRow key={stat.user_id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{stat.nome || 'Sem nome'}</p>
                      <p className="text-xs text-muted-foreground">{stat.cargo || stat.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-medium">{stat.total_propostas}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-medium text-green-600">{stat.propostas_aceitas}</span>
                    {stat.propostas_recusadas > 0 && (
                      <span className="text-sm text-muted-foreground ml-1">
                        ({stat.propostas_recusadas} rec.)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(stat.valor_aceito)}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      {getConversionBadge(stat.taxa_conversao)}
                      <Progress 
                        value={stat.taxa_conversao} 
                        className="h-1 w-16"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
