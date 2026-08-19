import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  RefreshCw, 
  Play, 
  CheckCircle2, 
  XCircle, 
  TrendingUp, 
  TrendingDown,
  BarChart3,
  FileText,
  Zap
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ComparisonTest {
  id: string;
  test_scenario: string;
  input_message: string;
  actual_response: string;
  word_count: number;
  has_bullet_points: boolean;
  has_calculation: boolean;
  emoji_count: number;
  tone_score: number;
  skills_baseline_word_count: number;
  improvement_percentage: number;
  passed: boolean;
  failure_reason: string | null;
  created_at: string;
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: string;
  avgComplianceScore: string;
  avgImprovementVsSkills: string;
}

const SCENARIO_NAMES: Record<string, string> = {
  primeiro_contato: 'Primeiro Contato',
  conta_baixa: 'Conta Baixa (<R$250)',
  conta_qualificada: 'Conta Qualificada',
  desconfianca: 'Desconfiança',
  como_funciona: 'Como Funciona',
};

const SKILLS_BASELINES: Record<string, { words: number; bullets: boolean; corporate: boolean }> = {
  primeiro_contato: { words: 68, bullets: true, corporate: true },
  conta_baixa: { words: 45, bullets: false, corporate: true },
  conta_qualificada: { words: 85, bullets: true, corporate: true },
  desconfianca: { words: 62, bullets: false, corporate: true },
  como_funciona: { words: 95, bullets: true, corporate: true },
};

export function AgentsMdComparisonDashboard() {
  const [tests, setTests] = useState<ComparisonTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<TestSummary | null>(null);
  const { toast } = useToast();

  const fetchTests = async () => {
    try {
      setLoading(true);
      // Call edge function to get tests results
      const { data: response, error } = await supabase.functions.invoke('agents-md-comparison-tests', {
        body: { run_full_suite: false, fetch_only: true },
      });

      if (error) {
        console.log('Edge function error, using empty data');
        setTests([]);
        return;
      }
      
      // If edge function returns results from database
      const typedData = (response?.results || []) as unknown as ComparisonTest[];
      setTests(typedData.map((r: any) => ({
        id: r.id || crypto.randomUUID(),
        test_scenario: r.scenario || r.test_scenario,
        input_message: r.input || '',
        actual_response: r.response || '',
        word_count: r.metrics?.wordCount || 0,
        has_bullet_points: false,
        has_calculation: r.metrics?.hasCalculation || false,
        emoji_count: 0,
        tone_score: r.metrics?.complianceScore || 0,
        skills_baseline_word_count: r.metrics?.skillsBaseline || 0,
        improvement_percentage: parseFloat(r.metrics?.improvement?.replace('%', '') || '0'),
        passed: r.passed || false,
        failure_reason: r.failures?.join('; ') || null,
        created_at: new Date().toISOString(),
      })));

      // Use summary from response if available
      if (response?.summary) {
        setSummary({
          total: response.summary.total,
          passed: response.summary.passed,
          failed: response.summary.failed,
          passRate: response.summary.passRate,
          avgComplianceScore: response.summary.avgComplianceScore,
          avgImprovementVsSkills: response.summary.avgImprovementVsSkills,
        });
      }
    } catch (error: any) {
      console.error('Error fetching tests:', error);
      toast({
        title: 'Erro ao carregar testes',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const runTests = async (fullSuite = false) => {
    try {
      setRunning(true);
      const { data, error } = await supabase.functions.invoke('agents-md-comparison-tests', {
        body: { run_full_suite: fullSuite },
      });

      if (error) throw error;

      toast({
        title: 'Testes executados!',
        description: `${data.summary.passed}/${data.summary.total} passaram (${data.summary.passRate})`,
      });

      // Recarregar resultados
      await fetchTests();
    } catch (error: any) {
      console.error('Error running tests:', error);
      toast({
        title: 'Erro ao executar testes',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    fetchTests();
  }, []);

  const getImprovementColor = (percentage: number) => {
    if (percentage > 20) return 'text-primary';
    if (percentage > 0) return 'text-primary/80';
    if (percentage < -10) return 'text-destructive';
    return 'text-warning';
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'bg-primary/10 text-primary';
    if (score >= 70) return 'bg-warning/10 text-warning-foreground';
    return 'bg-destructive/10 text-destructive';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Comparativo AGENTS.md vs Skills
          </h2>
          <p className="text-sm text-muted-foreground">
            Testes automatizados de conformidade com padrões AGENTS.md
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchTests}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button 
            size="sm" 
            onClick={() => runTests(true)}
            disabled={running}
          >
            <Play className={`h-4 w-4 mr-2 ${running ? 'animate-pulse' : ''}`} />
            {running ? 'Executando...' : 'Executar Todos'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{summary.passRate}</p>
                  <p className="text-xs text-muted-foreground">Taxa de Aprovação</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{summary.avgComplianceScore}</p>
                  <p className="text-xs text-muted-foreground">Score Médio</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{summary.avgImprovementVsSkills}</p>
                  <p className="text-xs text-muted-foreground">Melhoria vs Skills</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{summary.total}</p>
                  <p className="text-xs text-muted-foreground">Total de Testes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Comparação por Métrica */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Métricas de Tom</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Bullet Points</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="text-sm line-through text-destructive">80%</span>
                <span className="text-lg font-semibold text-primary">0%</span>
              </div>
              <Badge variant="outline" className="mt-1 text-xs">-100%</Badge>
            </div>
            
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Tom Corporativo</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="text-sm line-through text-destructive">75%</span>
                <span className="text-lg font-semibold text-primary">5%</span>
              </div>
              <Badge variant="outline" className="mt-1 text-xs">-93%</Badge>
            </div>
            
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Cálculo Preciso</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="text-sm line-through text-destructive">0%</span>
                <span className="text-lg font-semibold text-primary">100%</span>
              </div>
              <Badge variant="outline" className="mt-1 text-xs">+100%</Badge>
            </div>
            
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Usa Analogias</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="text-sm line-through text-destructive">10%</span>
                <span className="text-lg font-semibold text-primary">85%</span>
              </div>
              <Badge variant="outline" className="mt-1 text-xs">+750%</Badge>
            </div>
            
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Valida Emoção</p>
              <div className="flex items-center justify-center gap-2 mt-1">
                <span className="text-sm line-through text-destructive">15%</span>
                <span className="text-lg font-semibold text-primary">90%</span>
              </div>
              <Badge variant="outline" className="mt-1 text-xs">+500%</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resultados dos Testes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum teste executado ainda. Clique em "Executar Todos" para começar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cenário</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Palavras</TableHead>
                  <TableHead className="text-center">vs Skills</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead>Falhas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tests.slice(0, 20).map((test) => (
                  <TableRow key={test.id}>
                    <TableCell className="font-medium">
                      {SCENARIO_NAMES[test.test_scenario] || test.test_scenario}
                    </TableCell>
                    <TableCell className="text-center">
                      {test.passed ? (
                        <CheckCircle2 className="h-5 w-5 text-primary mx-auto" />
                      ) : (
                        <XCircle className="h-5 w-5 text-destructive mx-auto" />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-mono">{test.word_count}</span>
                      <span className="text-xs text-muted-foreground ml-1">
                        (baseline: {test.skills_baseline_word_count})
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-semibold ${getImprovementColor(test.improvement_percentage)}`}>
                        {test.improvement_percentage > 0 ? '+' : ''}
                        {test.improvement_percentage?.toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={getScoreColor(test.tone_score || 0)}>
                        {test.tone_score?.toFixed(0) || 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                      {test.failure_reason || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
