import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/sonner';
import { Brain, CheckCircle, XCircle, AlertTriangle, RefreshCw, Sparkles, Clock, Shield, Zap, FileCode } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface Proposal {
  id: string;
  agent_id: string;
  category: string;
  title: string;
  problem_description: string;
  evidence: {
    conversation_ids?: string[];
    pattern_frequency?: number;
    metrics?: Record<string, any>;
  };
  proposed_change: string;
  expected_impact: string;
  risk_level: string;
  confidence: number;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  applied_at: string | null;
  source: string;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════

function useProposals(status: string) {
  return useQuery({
    queryKey: ['improvement-proposals', status],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('sofia-self-analysis', {
        body: { action: 'get_proposals', status, limit: 100 },
      });
      if (error) throw error;
      return (data?.proposals || []) as Proposal[];
    },
  });
}

function useRunAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config?: { period_days?: number }) => {
      const { data, error } = await supabase.functions.invoke('sofia-self-analysis', {
        body: { action: 'analyze', ...config },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['improvement-proposals'] });
      toast.success(`Análise concluída: ${data.proposals_generated} propostas geradas`);
    },
    onError: (err: any) => toast.error(`Erro na análise: ${err.message}`),
  });
}

function useReviewProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ proposalId, decision, notes }: { proposalId: string; decision: string; notes?: string }) => {
      const { data, error } = await supabase.functions.invoke('sofia-self-analysis', {
        body: { action: 'review_proposal', proposal_id: proposalId, decision, notes },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['improvement-proposals'] });
      toast.success('Proposta revisada');
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`),
  });
}

function useIndexCode() {
  return useMutation({
    mutationFn: async (force: boolean = false) => {
      const { data, error } = await supabase.functions.invoke('agent-code-indexer', {
        body: { action: 'index', force },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => toast.success(`Indexação concluída: ${data.files_processed} arquivos, ${data.chunks_created} chunks`),
    onError: (err: any) => toast.error(`Erro na indexação: ${err.message}`),
  });
}

// ═══════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  rule: <Shield className="h-4 w-4" />,
  prompt: <Sparkles className="h-4 w-4" />,
  flow: <Zap className="h-4 w-4" />,
  guardrail: <AlertTriangle className="h-4 w-4" />,
  fast_path: <Zap className="h-4 w-4" />,
  constitution: <FileCode className="h-4 w-4" />,
};

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-500/10 text-green-600 border-green-500/20',
  medium: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  high: 'bg-red-500/10 text-red-600 border-red-500/20',
};

function ProposalCard({ proposal, onReview }: { proposal: Proposal; onReview: (id: string, decision: string, notes?: string) => void }) {
  const [notes, setNotes] = useState('');
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            {CATEGORY_ICONS[proposal.category] || <Brain className="h-4 w-4 mt-0.5" />}
            <div className="min-w-0">
              <CardTitle className="text-sm font-medium leading-tight">{proposal.title}</CardTitle>
              <CardDescription className="text-xs mt-1 line-clamp-2">{proposal.problem_description}</CardDescription>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="outline" className={RISK_COLORS[proposal.risk_level] || ''}>
              {proposal.risk_level}
            </Badge>
            <span className="text-xs text-muted-foreground">{Math.round(proposal.confidence * 100)}%</span>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-3">
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Mudança Proposta</h4>
            <p className="text-sm bg-muted/50 p-3 rounded-md whitespace-pre-wrap">{proposal.proposed_change}</p>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Impacto Esperado</h4>
            <p className="text-sm">{proposal.expected_impact}</p>
          </div>

          {proposal.evidence?.conversation_ids && proposal.evidence.conversation_ids.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Evidência</h4>
              <p className="text-xs text-muted-foreground">
                {proposal.evidence.conversation_ids.length} conversa(s) analisada(s) • Frequência: {proposal.evidence.pattern_frequency || 'N/A'}
              </p>
            </div>
          )}

          {proposal.status === 'pending' && (
            <div className="space-y-2 pt-2 border-t">
              <Textarea
                placeholder="Notas de revisão (opcional)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-sm min-h-[60px]"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => onReview(proposal.id, 'approved', notes)}
                  className="gap-1"
                >
                  <CheckCircle className="h-3.5 w-3.5" /> Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onReview(proposal.id, 'rejected', notes)}
                  className="gap-1"
                >
                  <XCircle className="h-3.5 w-3.5" /> Rejeitar
                </Button>
              </div>
            </div>
          )}

          {proposal.status !== 'pending' && (
            <div className="pt-2 border-t text-xs text-muted-foreground">
              <Badge variant="secondary" className="mr-2">{proposal.status}</Badge>
              {proposal.reviewed_at && `Revisado em ${new Date(proposal.reviewed_at).toLocaleDateString('pt-BR')}`}
              {proposal.review_notes && ` — ${proposal.review_notes}`}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {new Date(proposal.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
            <Badge variant="outline" className="text-[10px] px-1.5">{proposal.category}</Badge>
            <Badge variant="outline" className="text-[10px] px-1.5">{proposal.source}</Badge>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

export default function SelfImprovement() {
  const [tab, setTab] = useState('pending');
  const pendingQuery = useProposals('pending');
  const allQuery = useProposals('all');
  const runAnalysis = useRunAnalysis();
  const reviewProposal = useReviewProposal();
  const indexCode = useIndexCode();

  const proposals = tab === 'pending' ? pendingQuery.data : allQuery.data;
  const isLoading = tab === 'pending' ? pendingQuery.isLoading : allQuery.isLoading;

  const handleReview = (proposalId: string, decision: string, notes?: string) => {
    reviewProposal.mutate({ proposalId, decision, notes });
  };

  const pendingCount = pendingQuery.data?.length || 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              Self-Improvement
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Propostas de melhoria geradas pela auto-análise da Sofia
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => indexCode.mutate(false)}
              disabled={indexCode.isPending}
              className="gap-1"
            >
              <FileCode className="h-4 w-4" />
              {indexCode.isPending ? 'Indexando...' : 'Indexar Código'}
            </Button>
            <Button
              size="sm"
              onClick={() => runAnalysis.mutate({ period_days: 7 })}
              disabled={runAnalysis.isPending}
              className="gap-1"
            >
              <RefreshCw className={`h-4 w-4 ${runAnalysis.isPending ? 'animate-spin' : ''}`} />
              {runAnalysis.isPending ? 'Analisando...' : 'Executar Análise'}
            </Button>
          </div>
        </div>

        {/* Stats */}
        {runAnalysis.data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Conversas Analisadas</p>
              <p className="text-xl font-bold">{runAnalysis.data.conversations_analyzed}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Propostas Geradas</p>
              <p className="text-xl font-bold">{runAnalysis.data.proposals_generated}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Taxa Conversão</p>
              <p className="text-xl font-bold">{runAnalysis.data.metrics?.conversion_rate || 0}%</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Taxa Abandono</p>
              <p className="text-xl font-bold">{runAnalysis.data.metrics?.drop_rate || 0}%</p>
            </Card>
          </div>
        )}

        {/* Proposals */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="pending" className="gap-1">
              Pendentes {pendingCount > 0 && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{pendingCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="all">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !proposals || proposals.length === 0 ? (
              <Card className="p-12 text-center">
                <Brain className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">
                  {tab === 'pending' ? 'Nenhuma proposta pendente. Execute uma análise!' : 'Nenhuma proposta encontrada.'}
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {proposals.map((p) => (
                  <ProposalCard key={p.id} proposal={p} onReview={handleReview} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
