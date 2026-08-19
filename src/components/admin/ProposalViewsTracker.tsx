import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Eye, ExternalLink, Search, ArrowUpDown, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ProposalViewStats {
  proposal_id: string;
  cliente_nome: string;
  status: string;
  created_at: string;
  total_views: number;
  unique_views: number;
  total_duration_seconds: number;
  last_viewed_at: string | null;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}min ${s}s`;
}

export function ProposalViewsTracker() {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'total_views' | 'unique_views' | 'last_viewed_at'>('total_views');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['proposal-views-stats'],
    queryFn: async () => {
      // Fetch all proposals
      const { data: proposals, error: propError } = await supabase
        .from('propostas_assinantes')
        .select('id, cliente_nome, status, created_at')
        .order('created_at', { ascending: false });

      if (propError) throw propError;

      // Fetch all views grouped
      const { data: views, error: viewsError } = await supabase
        .from('proposal_views' as any)
        .select('proposal_id, fingerprint, viewed_at, duration_seconds');

      if (viewsError) throw viewsError;

      // Aggregate views per proposal
      const viewsMap = new Map<string, { total: number; uniqueFingerprints: Set<string>; totalDuration: number; lastViewedAt: string | null }>();
      
      for (const view of (views || []) as any[]) {
        const existing = viewsMap.get(view.proposal_id) || { total: 0, uniqueFingerprints: new Set<string>(), totalDuration: 0, lastViewedAt: null };
        existing.total++;
        existing.totalDuration += (view.duration_seconds || 0);
        if (view.fingerprint) existing.uniqueFingerprints.add(view.fingerprint);
        if (!existing.lastViewedAt || view.viewed_at > existing.lastViewedAt) {
          existing.lastViewedAt = view.viewed_at;
        }
        viewsMap.set(view.proposal_id, existing);
      }

      return (proposals || []).map((p): ProposalViewStats => {
        const v = viewsMap.get(p.id);
        return {
          proposal_id: p.id,
          cliente_nome: p.cliente_nome || 'Sem nome',
          status: p.status || 'rascunho',
          created_at: p.created_at,
          total_views: v?.total || 0,
          unique_views: v?.uniqueFingerprints.size || 0,
          total_duration_seconds: v?.totalDuration || 0,
          last_viewed_at: v?.lastViewedAt || null,
        };
      });
    },
    refetchInterval: 30000,
  });

  const filtered = (stats || [])
    .filter(s => s.cliente_nome.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aVal = sortBy === 'last_viewed_at' 
        ? (a.last_viewed_at || '').localeCompare(b.last_viewed_at || '')
        : (a[sortBy] - b[sortBy]);
      return sortDir === 'desc' ? -aVal : aVal;
    });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const totalAllViews = filtered.reduce((sum, s) => sum + s.total_views, 0);
  const proposalsWithViews = filtered.filter(s => s.total_views > 0).length;

  const statusColor = (status: string) => {
    switch (status) {
      case 'aceita': return 'default';
      case 'recusada': return 'destructive';
      case 'enviada': return 'secondary';
      default: return 'outline';
    }
  };

  const publicUrl = 'https://coesa-propose-craft.lovable.app/proposta';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-sm text-muted-foreground">Total de Visualizações</p>
          <p className="text-3xl font-bold">{totalAllViews}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-sm text-muted-foreground">Propostas Visualizadas</p>
          <p className="text-3xl font-bold">{proposalsWithViews}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4 text-center">
          <p className="text-sm text-muted-foreground">Total de Propostas</p>
          <p className="text-3xl font-bold">{filtered.length}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome do cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Link</TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => toggleSort('total_views')} className="gap-1 -ml-3">
                  Total <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => toggleSort('unique_views')} className="gap-1 -ml-3">
                  Únicos <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Tempo Total</TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => toggleSort('last_viewed_at')} className="gap-1 -ml-3">
                  Última Visita <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhuma proposta encontrada
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.proposal_id}>
                  <TableCell className="font-medium">{row.cliente_nome}</TableCell>
                  <TableCell>
                    <Badge variant={statusColor(row.status) as any}>{row.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <a
                      href={`${publicUrl}/${row.proposal_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                    >
                      Abrir <ExternalLink className="h-3 w-3" />
                    </a>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{row.total_views}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold">{row.unique_views}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{formatDuration(row.total_duration_seconds)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.last_viewed_at
                      ? format(new Date(row.last_viewed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                      : '—'}
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
