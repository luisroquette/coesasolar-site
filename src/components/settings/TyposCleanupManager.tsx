import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUIConfig } from '@/hooks/useUIConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Trash2, RefreshCw, Loader2, CheckCircle, XCircle, Clock, BarChart3 } from 'lucide-react';

interface TypoStats {
  sugestao: string;
  typo_detectado: string;
  total: number;
  confirmados: number;
  rejeitados: number;
  pendentes: number;
  taxa_confirmacao: number;
}

export function TyposCleanupManager() {
  const { typosCleanupDisplayLimit } = useUIConfig();
  const [stats, setStats] = useState<TypoStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [totals, setTotals] = useState({
    total: 0,
    confirmados: 0,
    rejeitados: 0,
    pendentes: 0,
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('distribuidora_typos_log')
        .select('typo_detectado, sugestao, confirmado');

      if (error) {
        console.error('Erro ao carregar typos:', error);
        toast.error('Erro ao carregar estatísticas');
        return;
      }

      if (!data || data.length === 0) {
        setStats([]);
        setTotals({ total: 0, confirmados: 0, rejeitados: 0, pendentes: 0 });
        return;
      }

      // Aggregate stats
      const aggregated: Record<string, { 
        sugestao: string; 
        typo_detectado: string;
        confirmed: number; 
        rejected: number; 
        pending: number 
      }> = {};

      let totalConfirmados = 0;
      let totalRejeitados = 0;
      let totalPendentes = 0;

      for (const t of data) {
        const key = `${t.sugestao?.toLowerCase()?.trim()}|${t.typo_detectado?.toLowerCase()?.trim()}`;
        if (!aggregated[key]) {
          aggregated[key] = { 
            sugestao: t.sugestao || '', 
            typo_detectado: t.typo_detectado || '',
            confirmed: 0, 
            rejected: 0, 
            pending: 0 
          };
        }

        if (t.confirmado === true) {
          aggregated[key].confirmed++;
          totalConfirmados++;
        } else if (t.confirmado === false) {
          aggregated[key].rejected++;
          totalRejeitados++;
        } else {
          aggregated[key].pending++;
          totalPendentes++;
        }
      }

      const statsArray: TypoStats[] = Object.values(aggregated).map(a => {
        const total = a.confirmed + a.rejected + a.pending;
        return {
          sugestao: a.sugestao,
          typo_detectado: a.typo_detectado,
          total,
          confirmados: a.confirmed,
          rejeitados: a.rejected,
          pendentes: a.pending,
          taxa_confirmacao: total > 0 ? (a.confirmed / total) * 100 : 0,
        };
      });

      // Sort by total occurrences
      statsArray.sort((a, b) => b.total - a.total);

      setStats(statsArray);
      setTotals({
        total: data.length,
        confirmados: totalConfirmados,
        rejeitados: totalRejeitados,
        pendentes: totalPendentes,
      });
    } catch (err) {
      console.error('Erro inesperado:', err);
      toast.error('Erro ao carregar estatísticas');
    } finally {
      setLoading(false);
    }
  };

  const handleCleanup = async () => {
    setCleaning(true);
    try {
      const { data, error } = await supabase.functions.invoke('cleanup-typos');

      if (error) {
        console.error('Erro na limpeza:', error);
        toast.error('Erro ao executar limpeza');
        return;
      }

      if (data?.success) {
        toast.success(data.message || 'Limpeza concluída!');
        
        if (data.stats?.lowQualityPatterns?.length > 0) {
          console.log('Padrões de baixa qualidade removidos:', data.stats.lowQualityPatterns);
        }
        
        // Reload stats
        await loadStats();
      } else {
        toast.error(data?.error || 'Erro na limpeza');
      }
    } catch (err) {
      console.error('Erro inesperado:', err);
      toast.error('Erro ao executar limpeza');
    } finally {
      setCleaning(false);
    }
  };

  const getTaxaBadge = (taxa: number) => {
    if (taxa >= 70) return <Badge className="bg-green-500">Alta ({taxa.toFixed(0)}%)</Badge>;
    if (taxa >= 40) return <Badge className="bg-yellow-500">Média ({taxa.toFixed(0)}%)</Badge>;
    if (taxa >= 20) return <Badge className="bg-orange-500">Baixa ({taxa.toFixed(0)}%)</Badge>;
    return <Badge variant="destructive">Muito Baixa ({taxa.toFixed(0)}%)</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Analytics de Typos de Distribuidoras
        </CardTitle>
        <CardDescription>
          Monitore e limpe typos detectados automaticamente pelo sistema de reconhecimento de distribuidoras
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">{totals.total}</div>
            <div className="text-sm text-muted-foreground">Total Registros</div>
          </div>
          <div className="bg-green-500/10 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600 flex items-center justify-center gap-1">
              <CheckCircle className="h-5 w-5" />
              {totals.confirmados}
            </div>
            <div className="text-sm text-muted-foreground">Confirmados</div>
          </div>
          <div className="bg-red-500/10 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-600 flex items-center justify-center gap-1">
              <XCircle className="h-5 w-5" />
              {totals.rejeitados}
            </div>
            <div className="text-sm text-muted-foreground">Rejeitados</div>
          </div>
          <div className="bg-yellow-500/10 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600 flex items-center justify-center gap-1">
              <Clock className="h-5 w-5" />
              {totals.pendentes}
            </div>
            <div className="text-sm text-muted-foreground">Pendentes</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadStats} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Atualizar
          </Button>
          <Button variant="destructive" onClick={handleCleanup} disabled={cleaning || totals.total === 0}>
            {cleaning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Executar Limpeza Manual
          </Button>
        </div>

        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
          <strong>A limpeza manual remove:</strong>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Typos pendentes há mais de 30 dias (sem resposta do usuário)</li>
            <li>Typos rejeitados há mais de 7 dias</li>
            <li>Padrões com taxa de confirmação menor que 20% (mínimo 3 ocorrências)</li>
          </ul>
        </div>

        {/* Stats Table */}
        {stats.length > 0 ? (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Distribuidora Sugerida</TableHead>
                  <TableHead>Typo Detectado</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">✓</TableHead>
                  <TableHead className="text-center">✗</TableHead>
                  <TableHead className="text-center">⏳</TableHead>
                  <TableHead>Taxa Confirmação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.slice(0, typosCleanupDisplayLimit).map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{s.sugestao}</TableCell>
                    <TableCell className="text-muted-foreground">{s.typo_detectado}</TableCell>
                    <TableCell className="text-center">{s.total}</TableCell>
                    <TableCell className="text-center text-green-600">{s.confirmados}</TableCell>
                    <TableCell className="text-center text-red-600">{s.rejeitados}</TableCell>
                    <TableCell className="text-center text-yellow-600">{s.pendentes}</TableCell>
                    <TableCell>{getTaxaBadge(s.taxa_confirmacao)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {stats.length > 20 && (
              <div className="p-3 text-center text-sm text-muted-foreground border-t">
                Mostrando 20 de {stats.length} padrões
              </div>
            )}
          </div>
        ) : !loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum typo registrado ainda
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
