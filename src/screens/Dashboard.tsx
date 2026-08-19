import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { PersonalDashboard } from '@/components/dashboard/PersonalDashboard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Factory, FileText, TrendingUp, Plus, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/calculations';

interface DashboardStats {
  totalAssinantes: number;
  totalUsineiros: number;
  valorTotalPropostas: number;
  propostasUltimos30Dias: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalAssinantes: 0,
    totalUsineiros: 0,
    valorTotalPropostas: 0,
    propostasUltimos30Dias: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      if (!user) return;

      try {
        // Buscar propostas de assinantes
        const { data: assinantes, error: errAssinantes } = await supabase
          .from('propostas_assinantes')
          .select('economia_acumulada, created_at')
          .eq('user_id', user.id);

        // Buscar propostas de usineiros
        const { data: usineiros, error: errUsineiros } = await supabase
          .from('propostas_usineiros')
          .select('receita_bruta_anual, created_at')
          .eq('user_id', user.id);

        if (errAssinantes || errUsineiros) throw new Error('Erro ao buscar dados');

        const hoje = new Date();
        const trintaDiasAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);

        const propostasRecentes = [
          ...(assinantes || []).filter(p => new Date(p.created_at) >= trintaDiasAtras),
          ...(usineiros || []).filter(p => new Date(p.created_at) >= trintaDiasAtras),
        ].length;

        const valorTotal = (usineiros || []).reduce(
          (sum, p) => sum + (Number(p.receita_bruta_anual) || 0),
          0
        );

        setStats({
          totalAssinantes: assinantes?.length || 0,
          totalUsineiros: usineiros?.length || 0,
          valorTotalPropostas: valorTotal,
          propostasUltimos30Dias: propostasRecentes,
        });
      } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [user]);

  const statCards = [
    {
      title: 'Propostas Assinantes',
      value: stats.totalAssinantes,
      description: 'Total de propostas criadas',
      icon: Users,
      color: 'bg-primary',
    },
    {
      title: 'Propostas Usineiros',
      value: stats.totalUsineiros,
      description: 'Total de teasers de investimento',
      icon: Factory,
      color: 'bg-secondary',
    },
    {
      title: 'Receita em Propostas',
      value: formatCurrency(stats.valorTotalPropostas),
      description: 'Valor total em receita projetada',
      icon: TrendingUp,
      color: 'bg-coesa-orange',
    },
    {
      title: 'Últimos 30 dias',
      value: stats.propostasUltimos30Dias,
      description: 'Propostas geradas recentemente',
      icon: FileText,
      color: 'bg-coesa-green',
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-8 animate-fade-in">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Bem-vindo ao sistema de propostas da COESA Energia
          </p>
        </div>

        {/* Personal Goals Dashboard */}
        <PersonalDashboard />

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <Card key={card.title} className="relative overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${card.color}`}>
                  <card.icon className="h-4 w-4 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-heading">
                  {loading ? '...' : card.value}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-2 border-dashed border-primary/30 hover:border-primary/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Nova Proposta para Assinante
              </CardTitle>
              <CardDescription>
                Gere propostas comerciais para clientes que desejam economizar na conta de luz
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full gradient-coesa shadow-coesa">
                <Link to="/assinantes">
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Proposta
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-2 border-dashed border-secondary/30 hover:border-secondary/50 transition-colors">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Factory className="h-5 w-5 text-secondary" />
                Novo Invest Teaser
              </CardTitle>
              <CardDescription>
                Crie teasers de investimento para proprietários de usinas fotovoltaicas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary" className="w-full">
                <Link to="/usineiros">
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Teaser
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
