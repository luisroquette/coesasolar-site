import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Tag } from 'lucide-react';

interface Typo {
  id: string;
  typo: string;
  is_confirmed: boolean;
  confirmation_count: number;
}

interface Props {
  distribuidoraId: string | null;
  distribuidoraNome: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DistribuidoraTyposDialog({ distribuidoraId, distribuidoraNome, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [newTypo, setNewTypo] = useState('');

  // Fetch typos for this distribuidora
  const { data: typos = [], isLoading } = useQuery({
    queryKey: ['distribuidora-typos', distribuidoraId],
    queryFn: async () => {
      if (!distribuidoraId) return [];
      
      const { data, error } = await supabase
        .from('distribuidora_typos')
        .select('*')
        .eq('distribuidora_id', distribuidoraId)
        .order('typo', { ascending: true });
      
      if (error) throw error;
      return data as Typo[];
    },
    enabled: !!distribuidoraId,
  });

  // Add typo mutation
  const addMutation = useMutation({
    mutationFn: async (typo: string) => {
      if (!distribuidoraId) throw new Error('No distribuidora selected');
      
      const { error } = await supabase
        .from('distribuidora_typos')
        .insert({
          distribuidora_id: distribuidoraId,
          typo: typo.toLowerCase().trim(),
          is_confirmed: true,
          confirmation_count: 1,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribuidora-typos', distribuidoraId] });
      queryClient.invalidateQueries({ queryKey: ['distribuidora-typos-counts'] });
      setNewTypo('');
      toast.success('Variação adicionada');
    },
    onError: (error: Error) => {
      if (error.message.includes('duplicate')) {
        toast.error('Esta variação já existe');
      } else {
        toast.error(`Erro: ${error.message}`);
      }
    },
  });

  // Delete typo mutation
  const deleteMutation = useMutation({
    mutationFn: async (typoId: string) => {
      const { error } = await supabase
        .from('distribuidora_typos')
        .delete()
        .eq('id', typoId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribuidora-typos', distribuidoraId] });
      queryClient.invalidateQueries({ queryKey: ['distribuidora-typos-counts'] });
      toast.success('Variação removida');
    },
    onError: () => {
      toast.error('Erro ao remover variação');
    },
  });

  const handleAdd = () => {
    if (newTypo.trim()) {
      addMutation.mutate(newTypo);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Variações de "{distribuidoraNome}"
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add new typo */}
          <div className="flex gap-2">
            <Input
              placeholder="Adicionar variação (ex: cemg, cemig-d)"
              value={newTypo}
              onChange={(e) => setNewTypo(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Button 
              onClick={handleAdd} 
              disabled={!newTypo.trim() || addMutation.isPending}
              size="icon"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* List of typos */}
          <div className="space-y-2">
            {isLoading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
              </div>
            ) : typos.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nenhuma variação cadastrada
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {typos.map((typo) => (
                  <Badge
                    key={typo.id}
                    variant={typo.is_confirmed ? 'default' : 'secondary'}
                    className="text-sm py-1 px-3 flex items-center gap-1"
                  >
                    {typo.typo}
                    {typo.confirmation_count > 1 && (
                      <span className="text-xs opacity-70">({typo.confirmation_count})</span>
                    )}
                    <button
                      onClick={() => deleteMutation.mutate(typo.id)}
                      className="ml-1 hover:text-destructive"
                      disabled={deleteMutation.isPending}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Variações são formas alternativas que os clientes podem digitar para esta distribuidora.
            O sistema reconhecerá automaticamente e mapeará para o nome correto.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
