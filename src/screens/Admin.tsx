import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { UsersList } from '@/components/admin/UsersList';
import { UserStatsCard } from '@/components/admin/UserStatsCard';
import { ActivityLog } from '@/components/admin/ActivityLog';
import { EmployeePerformance } from '@/components/admin/EmployeePerformance';
import { PerformanceCharts } from '@/components/admin/PerformanceCharts';
import { GoalsProgress } from '@/components/admin/GoalsProgress';
import { EmployeeRanking } from '@/components/admin/EmployeeRanking';
import { MonthlyComparison } from '@/components/admin/MonthlyComparison';
import { ChatbotAnalytics } from '@/components/admin/ChatbotAnalytics';
import { DistribuidorasManager } from '@/components/admin/DistribuidorasManager';
import { RecurringErrorsPanel } from '@/components/admin/RecurringErrorsPanel';
import { FunnelMetrics } from '@/components/admin/FunnelMetrics';
import { ProposalViewsTracker } from '@/components/admin/ProposalViewsTracker';
import { Users, UserCheck, Shield, FileText, Activity, BarChart3, LineChart, Target, Trophy, GitCompare, MessageCircle, Zap, AlertTriangle, Filter, Eye } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { Navigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Admin() {
  const { isAdmin, loading } = useUserRole();
  const [stats, setStats] = useState({ total: 0, active: 0 });

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Painel Administrativo
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie usuários, monitore atividades e acompanhe o desempenho da equipe
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <UserStatsCard
            title="Total de Usuários"
            value={stats.total}
            icon={Users}
          />
          <UserStatsCard
            title="Usuários Ativos"
            value={stats.active}
            icon={UserCheck}
          />
          <UserStatsCard
            title="Administradores"
            value="-"
            icon={Shield}
            description="Você é admin"
          />
          <UserStatsCard
            title="Propostas do Mês"
            value="-"
            icon={FileText}
            description="Total da equipe"
          />
        </div>

        <Tabs defaultValue="funil" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto gap-1 lg:grid lg:grid-cols-12 lg:w-[1580px]">
            <TabsTrigger value="funil" className="gap-2">
              <Filter className="h-4 w-4" />
              Funil
            </TabsTrigger>
            <TabsTrigger value="ranking" className="gap-2">
              <Trophy className="h-4 w-4" />
              Ranking
            </TabsTrigger>
            <TabsTrigger value="comparativo" className="gap-2">
              <GitCompare className="h-4 w-4" />
              Comparativo
            </TabsTrigger>
            <TabsTrigger value="graficos" className="gap-2">
              <LineChart className="h-4 w-4" />
              Gráficos
            </TabsTrigger>
            <TabsTrigger value="metas" className="gap-2">
              <Target className="h-4 w-4" />
              Metas
            </TabsTrigger>
            <TabsTrigger value="equipe" className="gap-2">
              <Users className="h-4 w-4" />
              Equipe
            </TabsTrigger>
            <TabsTrigger value="desempenho" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Desempenho
            </TabsTrigger>
            <TabsTrigger value="distribuidoras" className="gap-2">
              <Zap className="h-4 w-4" />
              Distribuidoras
            </TabsTrigger>
            <TabsTrigger value="erros" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Erros
            </TabsTrigger>
            <TabsTrigger value="chatbot" className="gap-2">
              <MessageCircle className="h-4 w-4" />
              Chatbot
            </TabsTrigger>
            <TabsTrigger value="views" className="gap-2">
              <Eye className="h-4 w-4" />
              Views
            </TabsTrigger>
            <TabsTrigger value="atividades" className="gap-2">
              <Activity className="h-4 w-4" />
              Atividades
            </TabsTrigger>
          </TabsList>

          <TabsContent value="funil">
            <div className="bg-card rounded-lg border p-6">
              <FunnelMetrics />
            </div>
          </TabsContent>

          <TabsContent value="ranking">
            <div className="bg-card rounded-lg border p-6">
              <EmployeeRanking />
            </div>
          </TabsContent>

          <TabsContent value="comparativo">
            <div className="bg-card rounded-lg border p-6">
              <MonthlyComparison />
            </div>
          </TabsContent>

          <TabsContent value="graficos">
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-xl font-semibold mb-4">Dashboard de Evolução</h2>
              <p className="text-muted-foreground mb-4">
                Acompanhe a evolução mensal de propostas, valores e taxa de conversão da equipe.
              </p>
              <PerformanceCharts />
            </div>
          </TabsContent>

          <TabsContent value="metas">
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-xl font-semibold mb-4">Metas por Funcionário</h2>
              <p className="text-muted-foreground mb-4">
                Defina metas mensais e acompanhe o progresso de cada funcionário em tempo real.
              </p>
              <GoalsProgress />
            </div>
          </TabsContent>

          <TabsContent value="equipe">
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-xl font-semibold mb-4">Gestão de Funcionários</h2>
              <UsersList onStatsUpdate={setStats} />
            </div>
          </TabsContent>

          <TabsContent value="desempenho">
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-xl font-semibold mb-4">Relatório de Desempenho</h2>
              <p className="text-muted-foreground mb-4">
                Acompanhe o desempenho individual de cada funcionário com métricas de propostas e conversão.
              </p>
              <EmployeePerformance />
            </div>
          </TabsContent>

          <TabsContent value="distribuidoras">
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-xl font-semibold mb-4">Gestão de Distribuidoras</h2>
              <p className="text-muted-foreground mb-4">
                Gerencie as distribuidoras atendidas, não atendidas e suas variações de escrita (typos).
              </p>
              <DistribuidorasManager />
            </div>
          </TabsContent>

          <TabsContent value="erros">
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-xl font-semibold mb-4">Erros Recorrentes</h2>
              <p className="text-muted-foreground mb-4">
                Monitore e resolva erros detectados pelos guardrails de IA.
              </p>
              <RecurringErrorsPanel />
            </div>
          </TabsContent>

          <TabsContent value="chatbot">
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-xl font-semibold mb-4">Analytics do Chatbot</h2>
              <p className="text-muted-foreground mb-4">
                Analise as conversas do chatbot e identifique as principais dúvidas dos clientes.
              </p>
              <ChatbotAnalytics />
            </div>
          </TabsContent>

          <TabsContent value="views">
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-xl font-semibold mb-4">Visualizações de Propostas</h2>
              <p className="text-muted-foreground mb-4">
                Acompanhe quantas vezes cada proposta foi aberta pelos clientes.
              </p>
              <ProposalViewsTracker />
            </div>
          </TabsContent>

          <TabsContent value="atividades">
            <div className="bg-card rounded-lg border p-6">
              <h2 className="text-xl font-semibold mb-4">Log de Atividades</h2>
              <p className="text-muted-foreground mb-4">
                Registro de todas as ações realizadas pelos funcionários no sistema.
              </p>
              <ActivityLog />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
