import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Search, Edit2, Trash2, Zap, ZapOff, HelpCircle, Tag } from 'lucide-react';
import { EditDistribuidoraDialog } from './EditDistribuidoraDialog';
import { DistribuidoraTyposDialog } from './DistribuidoraTyposDialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Distribuidora {
  id: string;
  nome: string;
  nome_normalizado: string;
  uf: string | null;
  is_atendida: boolean;
  is_active: boolean;
  requires_clarification: boolean;
  clarification_message: string | null;
  rejection_message: string | null;
  priority: number;
  parent_id: string | null;
}

export function DistribuidorasManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editingDist, setEditingDist] = useState<Distribuidora | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [typosDistId, setTyposDistId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Distribuidora | null>(null);

  // Fetch distribuidoras
  const { data: distribuidoras = [], isLoading } = useQuery({
    queryKey: ['distribuidoras-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('distribuidoras_config')
        .select('*')
        .order('priority', { ascending: true })
        .order('nome', { ascending: true });
      
      if (error) throw error;
      return data as Distribuidora[];
    },
  });

  // Fetch typos count per distribuidora
  const { data: typosCounts = {} } = useQuery({
    queryKey: ['distribuidora-typos-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('distribuidora_typos')
        .select('distribuidora_id');
      
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      for (const t of data || []) {
        counts[t.distribuidora_id] = (counts[t.distribuidora_id] || 0) + 1;
      }
      return counts;
    },
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('distribuidoras_config')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribuidoras-admin'] });
      toast.success('Status atualizado');
    },
    onError: () => {
      toast.error('Erro ao atualizar status');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // First delete related typos
      await supabase.from('distribuidora_typos').delete().eq('distribuidora_id', id);
      
      const { error } = await supabase
        .from('distribuidoras_config')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribuidoras-admin'] });
      queryClient.invalidateQueries({ queryKey: ['distribuidora-typos-counts'] });
      toast.success('Distribuidora removida');
      setDeleteConfirm(null);
    },
    onError: () => {
      toast.error('Erro ao remover distribuidora');
    },
  });

  // Filter distribuidoras
  const filtered = distribuidoras.filter(d => 
    d.nome.toLowerCase().includes(search.toLowerCase()) ||
    d.nome_normalizado.toLowerCase().includes(search.toLowerCase()) ||
    (d.uf && d.uf.toLowerCase().includes(search.toLowerCase()))
  );

  // Stats
  const atendidas = distribuidoras.filter(d => d.is_atendida && d.is_active).length;
  const naoAtendidas = distribuidoras.filter(d => !d.is_atendida && d.is_active).length;
  const inativas = distribuidoras.filter(d => !d.is_active).length;

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-green-500" />
            <span className="text-sm text-muted-foreground">Atendidas</span>
          </div>
          <p className="text-2xl font-bold text-green-500 mt-1">{atendidas}</p>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <ZapOff className="h-5 w-5 text-orange-500" />
            <span className="text-sm text-muted-foreground">Não Atendidas</span>
          </div>
          <p className="text-2xl font-bold text-orange-500 mt-1">{naoAtendidas}</p>
        </div>
        <div className="bg-muted border rounded-lg p-4">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Inativas</span>
          </div>
          <p className="text-2xl font-bold mt-1">{inativas}</p>
        </div>
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            <span className="text-sm text-muted-foreground">Total</span>
          </div>
          <p className="text-2xl font-bold text-primary mt-1">{distribuidoras.length}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar distribuidora..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Distribuidora
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>UF</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Typos</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhuma distribuidora encontrada
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((dist) => (
                <TableRow key={dist.id} className={!dist.is_active ? 'opacity-50' : ''}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{dist.nome}</p>
                      <p className="text-xs text-muted-foreground">{dist.nome_normalizado}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {dist.uf ? (
                      <Badge variant="outline">{dist.uf}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {dist.requires_clarification ? (
                      <Badge variant="secondary">
                        <HelpCircle className="h-3 w-3 mr-1" />
                        Clarificação
                      </Badge>
                    ) : dist.is_atendida ? (
                      <Badge className="bg-green-500/20 text-green-600 hover:bg-green-500/30">
                        <Zap className="h-3 w-3 mr-1" />
                        Atendida
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="bg-orange-500/20 text-orange-600 hover:bg-orange-500/30">
                        <ZapOff className="h-3 w-3 mr-1" />
                        Não Atendida
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTyposDistId(dist.id)}
                      className="h-8 px-2"
                    >
                      <Tag className="h-3 w-3 mr-1" />
                      {typosCounts[dist.id] || 0}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={dist.is_active}
                      onCheckedChange={(checked) => 
                        toggleActiveMutation.mutate({ id: dist.id, is_active: checked })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingDist(dist)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteConfirm(dist)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <EditDistribuidoraDialog
        distribuidora={editingDist}
        open={!!editingDist || isCreateOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditingDist(null);
            setIsCreateOpen(false);
          }
        }}
      />

      {/* Typos Dialog */}
      <DistribuidoraTyposDialog
        distribuidoraId={typosDistId}
        distribuidoraNome={distribuidoras.find(d => d.id === typosDistId)?.nome || ''}
        open={!!typosDistId}
        onOpenChange={(open) => {
          if (!open) setTyposDistId(null);
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a distribuidora <strong>{deleteConfirm?.nome}</strong>?
              Esta ação também removerá todos os typos associados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
