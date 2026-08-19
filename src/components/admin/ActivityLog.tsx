import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Search, 
  Plus, 
  Pencil, 
  Trash2, 
  FileText,
  Factory,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useUIConfig } from '@/hooks/useUIConfig';

interface ActivityLogEntry {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_nome: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_name: string | null;
  details: unknown;
  created_at: string;
}

const actionLabels: Record<string, { label: string; icon: typeof Plus; color: string }> = {
  create: { label: 'Criou', icon: Plus, color: 'bg-green-500' },
  update: { label: 'Editou', icon: Pencil, color: 'bg-blue-500' },
  delete: { label: 'Excluiu', icon: Trash2, color: 'bg-red-500' },
};

const entityLabels: Record<string, { label: string; icon: typeof FileText }> = {
  proposta_assinante: { label: 'Proposta Assinante', icon: FileText },
  proposta_usineiro: { label: 'Projeto Usineiro', icon: Factory },
};

interface ActivityLogProps {
  limit?: number;
  showFilters?: boolean;
}

export function ActivityLog({ limit = 50, showFilters = true }: ActivityLogProps) {
  const { activityLogPageSize } = useUIConfig();
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const pageSize = activityLogPageSize;

  async function fetchLogs() {
    setLoading(true);
    try {
      let query = supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }
      if (entityFilter !== 'all') {
        query = query.eq('entity_type', entityFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter, entityFilter]);

  const filteredLogs = logs.filter(log => {
    const searchLower = search.toLowerCase();
    return (
      log.user_nome?.toLowerCase().includes(searchLower) ||
      log.user_email?.toLowerCase().includes(searchLower) ||
      log.entity_name?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-4">
      {showFilters && (
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por usuário ou entidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Ação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas ações</SelectItem>
              <SelectItem value="create">Criações</SelectItem>
              <SelectItem value="update">Edições</SelectItem>
              <SelectItem value="delete">Exclusões</SelectItem>
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos tipos</SelectItem>
              <SelectItem value="proposta_assinante">Assinantes</SelectItem>
              <SelectItem value="proposta_usineiro">Usineiros</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Data/Hora</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Entidade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nenhuma atividade encontrada
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log) => {
                const actionInfo = actionLabels[log.action] || { label: log.action, icon: FileText, color: 'bg-gray-500' };
                const entityInfo = entityLabels[log.entity_type] || { label: log.entity_type, icon: FileText };
                const ActionIcon = actionInfo.icon;
                const EntityIcon = entityInfo.icon;

                return (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{log.user_nome || 'Usuário'}</p>
                        <p className="text-xs text-muted-foreground">{log.user_email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="gap-1">
                        <ActionIcon className="h-3 w-3" />
                        {actionInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <EntityIcon className="h-4 w-4" />
                        {entityInfo.label}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {log.entity_name || '-'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Página {page + 1}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => p + 1)}
            disabled={logs.length < pageSize}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
