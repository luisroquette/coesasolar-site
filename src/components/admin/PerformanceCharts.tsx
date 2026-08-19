import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUIConfig } from '@/hooks/useUIConfig';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Download, FileText, FileSpreadsheet } from 'lucide-react';
import { exportPerformanceToExcel, exportPerformanceToPDF } from '@/lib/export-utils';
import { toast } from 'sonner';

interface MonthlyData {
  month: string;
  total: number;
  aceitas: number;
  enviadas: number;
  recusadas: number;
  valor: number;
}

interface EmployeeMonthlyData {
  month: string;
  [key: string]: number | string;
}

// COLORS moved to useUIConfig

export function PerformanceCharts() {
  const { chartColors, chartEmployeesLimit } = useUIConfig();
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [employeeData, setEmployeeData] = useState<EmployeeMonthlyData[]>([]);
  const [statusData, setStatusData] = useState<{ name: string; value: number }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; nome: string }[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('6');
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);
    try {
      const months = parseInt(selectedPeriod);
      const monthsArray: { start: Date; end: Date; label: string }[] = [];
      
      for (let i = months - 1; i >= 0; i--) {
        const date = subMonths(new Date(), i);
        monthsArray.push({
          start: startOfMonth(date),
          end: endOfMonth(date),
          label: format(date, 'MMM/yy', { locale: ptBR }),
        });
      }

      // Fetch all proposals
      const { data: propostas, error: propostasError } = await supabase
        .from('propostas_assinantes')
        .select('id, user_id, status, economia_acumulada, created_at');

      if (propostasError) throw propostasError;

      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, nome');

      if (profilesError) throw profilesError;

      const employeeMap = new Map<string, string>();
      profiles?.forEach(p => {
        employeeMap.set(p.user_id, p.nome || 'Sem nome');
      });

      // Calculate monthly data
      const monthly: MonthlyData[] = monthsArray.map(m => {
        const monthPropostas = propostas?.filter(p => {
          const created = new Date(p.created_at);
          return created >= m.start && created <= m.end;
        }) || [];

        return {
          month: m.label,
          total: monthPropostas.length,
          aceitas: monthPropostas.filter(p => p.status === 'aceita').length,
          enviadas: monthPropostas.filter(p => p.status === 'enviada').length,
          recusadas: monthPropostas.filter(p => p.status === 'recusada').length,
          valor: monthPropostas
            .filter(p => p.status === 'aceita')
            .reduce((sum, p) => sum + (p.economia_acumulada || 0), 0),
        };
      });

      setMonthlyData(monthly);

      // Calculate employee monthly data - limit from config
      const uniqueEmployees = Array.from(new Set(propostas?.map(p => p.user_id) || []));
      const employeeList = uniqueEmployees.map(id => ({
        id,
        nome: employeeMap.get(id) || 'Sem nome',
      })).slice(0, chartEmployeesLimit);

      setEmployees(employeeList);

      const employeeMonthly: EmployeeMonthlyData[] = monthsArray.map(m => {
        const row: EmployeeMonthlyData = { month: m.label };
        
        employeeList.forEach(emp => {
          const empPropostas = propostas?.filter(p => {
            const created = new Date(p.created_at);
            return p.user_id === emp.id && created >= m.start && created <= m.end;
          }) || [];
          row[emp.nome] = empPropostas.length;
        });

        return row;
      });

      setEmployeeData(employeeMonthly);

      // Calculate status distribution
      const statusCounts = {
        rascunho: propostas?.filter(p => p.status === 'rascunho').length || 0,
        enviada: propostas?.filter(p => p.status === 'enviada').length || 0,
        aceita: propostas?.filter(p => p.status === 'aceita').length || 0,
        recusada: propostas?.filter(p => p.status === 'recusada').length || 0,
      };

      setStatusData([
        { name: 'Rascunho', value: statusCounts.rascunho },
        { name: 'Enviada', value: statusCounts.enviada },
        { name: 'Aceita', value: statusCounts.aceita },
        { name: 'Recusada', value: statusCounts.recusada },
      ].filter(d => d.value > 0));

    } catch (err) {
      console.error('Error fetching chart data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [selectedPeriod]);

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Selector & Export */}
      <div className="flex justify-end gap-2">
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Últimos 3 meses</SelectItem>
            <SelectItem value="6">Últimos 6 meses</SelectItem>
            <SelectItem value="12">Últimos 12 meses</SelectItem>
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={monthlyData.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => {
                exportPerformanceToExcel(monthlyData, selectedPeriod);
                toast.success('Arquivo Excel exportado com sucesso!');
              }}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Exportar Excel
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => {
                exportPerformanceToPDF(monthlyData, selectedPeriod);
                toast.success('Arquivo PDF exportado com sucesso!');
              }}
            >
              <FileText className="mr-2 h-4 w-4" />
              Exportar PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Main Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Evolution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Evolução Mensal de Propostas</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))' }}
                />
                <Line
                  type="monotone"
                  dataKey="aceitas"
                  name="Aceitas"
                  stroke="hsl(142, 76%, 36%)"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(142, 76%, 36%)' }}
                />
                <Line
                  type="monotone"
                  dataKey="enviadas"
                  name="Enviadas"
                  stroke="hsl(38, 92%, 50%)"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(38, 92%, 50%)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Value Evolution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Valor Fechado por Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(value) => `R$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar
                  dataKey="valor"
                  name="Valor Fechado"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Second Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Employee Performance */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Propostas por Funcionário (Mensal)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={employeeData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="month" 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis 
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                {employees.map((emp, index) => (
                  <Bar
                    key={emp.id}
                    dataKey={emp.nome}
                    fill={chartColors[index % chartColors.length]}
                    radius={[2, 2, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {statusData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Rate Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Taxa de Conversão Mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart 
              data={monthlyData.map(m => ({
                ...m,
                conversao: m.total > 0 ? ((m.aceitas / m.total) * 100) : 0,
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="month" 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip
                formatter={(value: number) => `${value.toFixed(1)}%`}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Line
                type="monotone"
                dataKey="conversao"
                name="Taxa de Conversão"
                stroke="hsl(142, 76%, 36%)"
                strokeWidth={3}
                dot={{ fill: 'hsl(142, 76%, 36%)', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
