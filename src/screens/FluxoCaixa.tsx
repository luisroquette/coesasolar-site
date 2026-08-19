import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatNumber, calcularPropostaUsineiro, UsineiroInput } from '@/lib/calculations';
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';

interface PropostaUsineiro {
  id: string;
  nome_projeto: string;
  potencia_mwp: number;
  capex_total: number;
  created_at: string;
}

export default function FluxoCaixa() {
  const { user } = useAuth();
  const [propostas, setPropostas] = useState<PropostaUsineiro[]>([]);
  const [propostaSelecionada, setPropostaSelecionada] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Simulação de fluxo de caixa para demonstração
  // Na prática, virá do banco de dados ou recalculado
  const fluxoCaixaDemo = Array.from({ length: 26 }, (_, i) => {
    const ano = i;
    if (ano === 0) {
      return {
        ano,
        receitaLiquida: 0,
        custos: 0,
        ebitda: 0,
        lucroLiquido: -4000000,
        fluxoCaixaAcumulado: -4000000,
      };
    }
    const degradacao = Math.pow(0.995, ano - 1);
    const inflacao = Math.pow(1.07, ano - 1);
    const receita = 800000 * degradacao * inflacao;
    const custos = 150000 * Math.pow(1.045, ano - 1);
    const ebitda = receita - custos;
    const lucro = ebitda * 0.75;
    
    return {
      ano,
      receitaLiquida: receita,
      custos,
      ebitda,
      lucroLiquido: lucro,
      fluxoCaixaAcumulado: 0,
    };
  });

  // Calcular fluxo acumulado
  let acumulado = 0;
  fluxoCaixaDemo.forEach((item, index) => {
    acumulado += item.lucroLiquido;
    fluxoCaixaDemo[index].fluxoCaixaAcumulado = acumulado;
  });

  useEffect(() => {
    async function fetchPropostas() {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('propostas_usineiros')
          .select('id, nome_projeto, potencia_mwp, capex_total, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setPropostas(data || []);
        if (data && data.length > 0) {
          setPropostaSelecionada(data[0].id);
        }
      } catch (error) {
        console.error('Erro ao carregar propostas:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchPropostas();
  }, [user]);

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">
              Fluxo de Caixa Projetado
            </h1>
            <p className="text-muted-foreground mt-1">
              Projeção de 25 anos com DCF (Discounted Cash Flow)
            </p>
          </div>
          
          {propostas.length > 0 && (
            <Select value={propostaSelecionada} onValueChange={setPropostaSelecionada}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Selecione uma proposta" />
              </SelectTrigger>
              <SelectContent>
                {propostas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome_projeto} ({formatNumber(p.potencia_mwp, 1)} MWp)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {propostas.length === 0 && !loading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                Nenhuma proposta de usineiro encontrada. Crie uma proposta primeiro.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Gráficos */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Receita vs Custos */}
              <Card>
                <CardHeader>
                  <CardTitle>Receita vs Custos</CardTitle>
                  <CardDescription>Evolução ao longo dos 25 anos</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={fluxoCaixaDemo.slice(1)}>
                        <defs>
                          <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorCustos" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="ano" 
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis 
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => `${(v/1000000).toFixed(1)}M`}
                        />
                        <Tooltip 
                          formatter={(value: number) => formatCurrency(value)}
                          labelFormatter={(label) => `Ano ${label}`}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="receitaLiquida" 
                          name="Receita"
                          stroke="hsl(var(--primary))"
                          fillOpacity={1}
                          fill="url(#colorReceita)"
                          strokeWidth={2}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="custos" 
                          name="Custos"
                          stroke="hsl(var(--destructive))"
                          fillOpacity={1}
                          fill="url(#colorCustos)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Fluxo de Caixa Acumulado */}
              <Card>
                <CardHeader>
                  <CardTitle>Fluxo de Caixa Acumulado</CardTitle>
                  <CardDescription>Payback e retorno do investimento</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={fluxoCaixaDemo}>
                        <defs>
                          <linearGradient id="colorAcumulado" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="ano" 
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis 
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => `${(v/1000000).toFixed(1)}M`}
                        />
                        <Tooltip 
                          formatter={(value: number) => formatCurrency(value)}
                          labelFormatter={(label) => `Ano ${label}`}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="fluxoCaixaAcumulado" 
                          name="Acumulado"
                          stroke="hsl(var(--secondary))"
                          fillOpacity={1}
                          fill="url(#colorAcumulado)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabela de Fluxo de Caixa */}
            <Card>
              <CardHeader>
                <CardTitle>Demonstrativo Detalhado</CardTitle>
                <CardDescription>Valores anuais projetados</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Ano</TableHead>
                        <TableHead className="text-right">Receita Líquida</TableHead>
                        <TableHead className="text-right">Custos</TableHead>
                        <TableHead className="text-right">EBITDA</TableHead>
                        <TableHead className="text-right">Lucro Líquido</TableHead>
                        <TableHead className="text-right">Acumulado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fluxoCaixaDemo.map((item) => (
                        <TableRow key={item.ano}>
                          <TableCell className="font-medium">{item.ano}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.receitaLiquida)}</TableCell>
                          <TableCell className="text-right text-destructive">{formatCurrency(item.custos)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.ebitda)}</TableCell>
                          <TableCell className={`text-right font-medium ${item.lucroLiquido >= 0 ? 'text-primary' : 'text-destructive'}`}>
                            {formatCurrency(item.lucroLiquido)}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${item.fluxoCaixaAcumulado >= 0 ? 'text-primary' : 'text-destructive'}`}>
                            {formatCurrency(item.fluxoCaixaAcumulado)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
