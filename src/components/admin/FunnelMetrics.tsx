import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowDown, ArrowUp, Clock, TrendingUp, Users, FileText, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBitrixStages } from '@/hooks/useBitrixStages';

interface ConversionRates {
  total_leads: number;
  com_proposta_inicial: number;
  com_proposta: number;
  docs_completos: number;
  contrato_enviado: number;
  contrato_assinado: number;
  taxa_lead_to_proposta: number;
  taxa_proposta_to_docs: number;
  taxa_docs_to_contrato: number;
  taxa_contrato_to_assinado: number;
  taxa_conversao_total: number;
}

// Estrutura transformada para uso no componente
interface StageDuration {
  avg_hours_to_proposta: number | null;
  avg_hours_proposta_to_docs: number | null;
  avg_hours_docs_to_contrato: number | null;
  avg_hours_to_assinatura: number | null;
  avg_days_total_conversion: number | null;
}

// Raw da view
interface StageDurationRow {
  stage: string;
  avg_hours: number | null;
  count: number;
}

interface DropoffData {
  dropoff_stage: string;
  quantidade: number;
  percentual: number;
  avg_dias_no_stage: number | null;
}

// Estrutura transformada para uso no componente
interface WeeklyData {
  semana: string;
  leads: number;
  propostas: number;
  conversoes: number;
  taxa_conversao: number;
  variacao_leads: number | null;
  variacao_conversoes: number | null;
}

// Raw da view
interface WeeklyDataRow {
  period: string;
  leads: number;
  propostas: number;
  conversoes: number;
}

// Estrutura transformada para uso no componente  
interface StageCount {
  stage_id: string;
  total_leads: number;
  leads_7d: number;
  leads_30d: number;
  leads_hoje: number;
}

// Raw da view
interface StageCountRow {
  total_leads: number;
  link_enviado: number;
  proposta_criada: number;
  docs_completos: number;
  contrato_enviado: number;
  contrato_assinado: number;
}

const DROPOFF_LABELS: Record<string, { label: string; color: string }> = {
  'CONVERTIDO': { label: 'Convertido ✅', color: 'bg-green-500' },
  'AGUARDANDO_ASSINATURA': { label: 'Aguardando Assinatura', color: 'bg-blue-500' },
  'DOCS_OK_SEM_CONTRATO': { label: 'Docs OK, sem Contrato', color: 'bg-yellow-500' },
  'PROPOSTA_SEM_DOCS': { label: 'Proposta sem Docs', color: 'bg-orange-500' },
  'LINK_ENVIADO_SEM_PROPOSTA': { label: 'Link Enviado', color: 'bg-amber-500' },
  'LEAD_SEM_PROPOSTA': { label: 'Lead sem Proposta', color: 'bg-red-500' },
  'SEM_LEAD': { label: 'Sem Lead Bitrix', color: 'bg-gray-500' },
};

export function FunnelMetrics() {
  const [conversionRates, setConversionRates] = useState<ConversionRates | null>(null);
  const [stageDuration, setStageDuration] = useState<StageDuration | null>(null);
  const [dropoffData, setDropoffData] = useState<DropoffData[]>([]);
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [stageCounts, setStageCounts] = useState<StageCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getStageName } = useBitrixStages();

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch all metrics in parallel
      const [
        conversionRes,
        durationRes,
        dropoffRes,
        weeklyRes,
        stageRes
      ] = await Promise.all([
        supabase.from('v_funnel_conversion_rates').select('*').single(),
        supabase.from('v_funnel_stage_duration').select('*'),
        supabase.from('v_funnel_dropoff').select('*'),
        supabase.from('v_funnel_weekly_comparison').select('*').limit(8),
        supabase.from('v_funnel_stage_counts').select('*').single()
      ]);

      if (conversionRes.error) throw conversionRes.error;
      if (durationRes.error) throw durationRes.error;
      if (dropoffRes.error) throw dropoffRes.error;
      if (weeklyRes.error) throw weeklyRes.error;
      if (stageRes.error) throw stageRes.error;

      setConversionRates(conversionRes.data);
      
      // Transform stage duration data from rows to object
      const durationRows = (durationRes.data || []) as StageDurationRow[];
      const transformedDuration: StageDuration = {
        avg_hours_to_proposta: durationRows.find(r => r.stage === 'lead_to_link')?.avg_hours ?? null,
        avg_hours_proposta_to_docs: durationRows.find(r => r.stage === 'link_to_docs')?.avg_hours ?? null,
        avg_hours_docs_to_contrato: durationRows.find(r => r.stage === 'docs_to_contract')?.avg_hours ?? null,
        avg_hours_to_assinatura: durationRows.find(r => r.stage === 'contract_to_signed')?.avg_hours ?? null,
        avg_days_total_conversion: null // Calculate from sum if needed
      };
      // Calculate total conversion time
      const totalHours = durationRows.reduce((sum, r) => sum + (r.avg_hours || 0), 0);
      transformedDuration.avg_days_total_conversion = totalHours > 0 ? totalHours / 24 : null;
      setStageDuration(transformedDuration);
      
      setDropoffData(dropoffRes.data || []);
      
      // Transform weekly data from rows to expected format
      const weeklyRows = (weeklyRes.data || []) as WeeklyDataRow[];
      const transformedWeekly: WeeklyData[] = weeklyRows.map((row, index) => {
        const prevRow = weeklyRows[index + 1];
        const taxaConversao = row.leads > 0 ? Math.round((row.conversoes / row.leads) * 100 * 100) / 100 : 0;
        return {
          semana: row.period === 'current_week' ? 'Esta semana' : 'Semana anterior',
          leads: row.leads,
          propostas: row.propostas,
          conversoes: row.conversoes,
          taxa_conversao: taxaConversao,
          variacao_leads: prevRow ? row.leads - prevRow.leads : null,
          variacao_conversoes: prevRow ? row.conversoes - prevRow.conversoes : null
        };
      });
      setWeeklyData(transformedWeekly);
      
      // Transform stage counts from single row to array format
      const stageRow = stageRes.data as StageCountRow;
      const transformedStages: StageCount[] = [
        { stage_id: 'total_leads', total_leads: stageRow.total_leads, leads_7d: 0, leads_30d: stageRow.total_leads, leads_hoje: 0 },
        { stage_id: 'link_enviado', total_leads: stageRow.link_enviado, leads_7d: 0, leads_30d: stageRow.link_enviado, leads_hoje: 0 },
        { stage_id: 'proposta_criada', total_leads: stageRow.proposta_criada, leads_7d: 0, leads_30d: stageRow.proposta_criada, leads_hoje: 0 },
        { stage_id: 'docs_completos', total_leads: stageRow.docs_completos, leads_7d: 0, leads_30d: stageRow.docs_completos, leads_hoje: 0 },
        { stage_id: 'contrato_enviado', total_leads: stageRow.contrato_enviado, leads_7d: 0, leads_30d: stageRow.contrato_enviado, leads_hoje: 0 },
        { stage_id: 'contrato_assinado', total_leads: stageRow.contrato_assinado, leads_7d: 0, leads_30d: stageRow.contrato_assinado, leads_hoje: 0 }
      ];
      setStageCounts(transformedStages);
    } catch (err) {
      console.error('Error fetching funnel metrics:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar métricas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const formatHours = (hours: number | null): string => {
    if (hours === null || isNaN(hours)) return '-';
    if (hours < 1) return `${Math.round(hours * 60)}min`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  const formatDays = (days: number | null): string => {
    if (days === null || isNaN(days)) return '-';
    if (days < 1) return `${Math.round(days * 24)}h`;
    return `${days.toFixed(1)} dias`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
          <Button onClick={fetchMetrics} variant="outline" className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Tentar Novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Métricas de Funil</h2>
          <p className="text-muted-foreground">Últimos 30 dias</p>
        </div>
        <Button onClick={fetchMetrics} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* KPIs principais */}
      {conversionRates && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Leads</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                <Users className="h-6 w-6 text-primary" />
                {conversionRates.total_leads}
              </CardTitle>
            </CardHeader>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Com Proposta</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                <FileText className="h-6 w-6 text-blue-500" />
                {conversionRates.com_proposta_inicial}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">{conversionRates.taxa_lead_to_proposta}%</Badge>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Docs Completos</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-yellow-500" />
                {conversionRates.docs_completos}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">{conversionRates.taxa_proposta_to_docs}%</Badge>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Contratos Enviados</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2">
                <FileText className="h-6 w-6 text-orange-500" />
                {conversionRates.contrato_enviado}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">{conversionRates.taxa_docs_to_contrato}%</Badge>
            </CardContent>
          </Card>
          
          <Card className="bg-primary/5 border-primary">
            <CardHeader className="pb-2">
              <CardDescription>Convertidos</CardDescription>
              <CardTitle className="text-3xl flex items-center gap-2 text-primary">
                <TrendingUp className="h-6 w-6" />
                {conversionRates.contrato_assinado}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge className="bg-primary">{conversionRates.taxa_conversao_total}% total</Badge>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Funil visual */}
      {conversionRates && (
        <Card>
          <CardHeader>
            <CardTitle>Funil de Conversão</CardTitle>
            <CardDescription>Visualização do fluxo de leads</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <FunnelBar 
                label="Leads" 
                value={conversionRates.total_leads} 
                total={conversionRates.total_leads}
                rate={100}
              />
              <FunnelBar 
                label="Proposta Inicial" 
                value={conversionRates.com_proposta_inicial} 
                total={conversionRates.total_leads}
                rate={conversionRates.taxa_lead_to_proposta}
              />
              <FunnelBar 
                label="Docs Completos" 
                value={conversionRates.docs_completos} 
                total={conversionRates.total_leads}
                rate={(conversionRates.docs_completos / conversionRates.total_leads) * 100}
              />
              <FunnelBar 
                label="Contrato Enviado" 
                value={conversionRates.contrato_enviado} 
                total={conversionRates.total_leads}
                rate={(conversionRates.contrato_enviado / conversionRates.total_leads) * 100}
              />
              <FunnelBar 
                label="Assinado" 
                value={conversionRates.contrato_assinado} 
                total={conversionRates.total_leads}
                rate={conversionRates.taxa_conversao_total}
                highlight
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="dropoff" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dropoff">Drop-off</TabsTrigger>
          <TabsTrigger value="tempo">Tempo por Estágio</TabsTrigger>
          <TabsTrigger value="semanal">Comparativo Semanal</TabsTrigger>
          <TabsTrigger value="estagios">Por Estágio Bitrix</TabsTrigger>
        </TabsList>

        {/* Drop-off Analysis */}
        <TabsContent value="dropoff">
          <Card>
            <CardHeader>
              <CardTitle>Análise de Drop-off</CardTitle>
              <CardDescription>Onde os leads param no funil</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dropoffData.map((item) => {
                  const config = DROPOFF_LABELS[item.dropoff_stage] || { 
                    label: item.dropoff_stage, 
                    color: 'bg-gray-500' 
                  };
                  return (
                    <div key={item.dropoff_stage} className="flex items-center gap-4">
                      <div className="w-48">
                        <span className="text-sm font-medium">{config.label}</span>
                      </div>
                      <div className="flex-1">
                        <Progress 
                          value={item.percentual} 
                          className="h-6"
                        />
                      </div>
                      <div className="w-24 text-right">
                        <span className="font-bold">{item.quantidade}</span>
                        <span className="text-muted-foreground text-sm ml-1">
                          ({item.percentual}%)
                        </span>
                      </div>
                      <div className="w-20 text-right text-muted-foreground text-sm">
                        {formatDays(item.avg_dias_no_stage)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tempo por Estágio */}
        <TabsContent value="tempo">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Tempo Médio por Etapa
              </CardTitle>
              <CardDescription>Últimos 90 dias</CardDescription>
            </CardHeader>
            <CardContent>
              {stageDuration && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                  <TimeCard 
                    label="Lead → Proposta" 
                    value={formatHours(stageDuration.avg_hours_to_proposta)}
                  />
                  <TimeCard 
                    label="Proposta → Docs" 
                    value={formatHours(stageDuration.avg_hours_proposta_to_docs)}
                  />
                  <TimeCard 
                    label="Docs → Contrato" 
                    value={formatHours(stageDuration.avg_hours_docs_to_contrato)}
                  />
                  <TimeCard 
                    label="Contrato → Assinatura" 
                    value={formatHours(stageDuration.avg_hours_to_assinatura)}
                  />
                  <TimeCard 
                    label="Ciclo Total" 
                    value={formatDays(stageDuration.avg_days_total_conversion)}
                    highlight
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Comparativo Semanal */}
        <TabsContent value="semanal">
          <Card>
            <CardHeader>
              <CardTitle>Evolução Semanal</CardTitle>
              <CardDescription>Últimas 8 semanas</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Semana</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Propostas</TableHead>
                    <TableHead className="text-right">Conversões</TableHead>
                    <TableHead className="text-right">Taxa</TableHead>
                    <TableHead className="text-right">Variação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyData.map((week) => (
                    <TableRow key={week.semana}>
                      <TableCell className="font-medium">
                        {new Date(week.semana).toLocaleDateString('pt-BR', { 
                          day: '2-digit', 
                          month: 'short' 
                        })}
                      </TableCell>
                      <TableCell className="text-right">{week.leads}</TableCell>
                      <TableCell className="text-right">{week.propostas}</TableCell>
                      <TableCell className="text-right font-bold">{week.conversoes}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={week.taxa_conversao >= 5 ? 'default' : 'secondary'}>
                          {week.taxa_conversao}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {week.variacao_conversoes !== null && (
                          <span className={`flex items-center justify-end gap-1 ${
                            week.variacao_conversoes > 0 ? 'text-primary' : 
                            week.variacao_conversoes < 0 ? 'text-destructive' : 'text-muted-foreground'
                          }`}>
                            {week.variacao_conversoes > 0 ? (
                              <ArrowUp className="h-4 w-4" />
                            ) : week.variacao_conversoes < 0 ? (
                              <ArrowDown className="h-4 w-4" />
                            ) : null}
                            {Math.abs(week.variacao_conversoes)}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Por Estágio Bitrix */}
        <TabsContent value="estagios">
          <Card>
            <CardHeader>
              <CardTitle>Leads por Estágio Bitrix</CardTitle>
              <CardDescription>Distribuição atual</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estágio</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Últimos 7d</TableHead>
                    <TableHead className="text-right">Últimos 30d</TableHead>
                    <TableHead className="text-right">Hoje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stageCounts.map((stage) => (
                    <TableRow key={stage.stage_id}>
                      <TableCell className="font-medium">
                        {getStageName(stage.stage_id) || stage.stage_id}
                      </TableCell>
                      <TableCell className="text-right font-bold">{stage.total_leads}</TableCell>
                      <TableCell className="text-right">{stage.leads_7d}</TableCell>
                      <TableCell className="text-right">{stage.leads_30d}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={stage.leads_hoje > 0 ? 'default' : 'secondary'}>
                          {stage.leads_hoje}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Sub-components
function FunnelBar({ 
  label, 
  value, 
  total, 
  rate, 
  highlight = false 
}: { 
  label: string; 
  value: number; 
  total: number; 
  rate: number; 
  highlight?: boolean;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  
  return (
    <div className="flex items-center gap-4">
      <div className="w-32 text-sm font-medium">{label}</div>
      <div className="flex-1 relative">
        <div 
          className={`h-8 rounded transition-all ${
            highlight ? 'bg-primary' : 'bg-primary/60'
          }`}
          style={{ width: `${percentage}%`, minWidth: value > 0 ? '2rem' : 0 }}
        />
      </div>
      <div className="w-20 text-right font-bold">{value}</div>
      <div className="w-16 text-right text-muted-foreground text-sm">
        {rate.toFixed(1)}%
      </div>
    </div>
  );
}

function TimeCard({ 
  label, 
  value, 
  highlight = false 
}: { 
  label: string; 
  value: string; 
  highlight?: boolean;
}) {
  return (
    <div className={`p-4 rounded-lg border ${highlight ? 'bg-primary/5 border-primary' : 'bg-card'}`}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</div>
    </div>
  );
}
