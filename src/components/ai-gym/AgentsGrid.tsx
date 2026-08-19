import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { SortableAgentCard } from './SortableAgentCard';
import { Card, CardContent } from '@/components/ui/card';
import { Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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

interface AIAgent {
  id: string;
  agent_id: string;
  name: string;
  role: string;
  description: string;
  avatar_emoji: string;
  channels: string[];
  status: string;
  version: string;
  persona: any;
  guardrails: any;
  tools_config: any;
  intents: any;
  kb_sources: any;
  collection_rules: any;
  metrics: any;
  tests: any;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  display_order?: number;
}

interface AgentsGridProps {
  agents: AIAgent[];
  onAgentsChange: (agents: AIAgent[]) => void;
  onEdit: (agent: AIAgent) => void;
  onDownload: (agent: AIAgent) => void;
  onStatusChange: (agent: AIAgent, status: string) => void;
  onDelete: (agent: AIAgent) => void;
  isAdmin: boolean;
}

function DeleteDropZone({ isOver }: { isOver: boolean }) {
  const { setNodeRef } = useDroppable({
    id: 'delete-zone',
  });

  return (
    <div
      ref={setNodeRef}
      className={`
        fixed bottom-6 left-1/2 -translate-x-1/2 z-50
        px-8 py-4 rounded-2xl border-2 border-dashed
        flex items-center gap-3 transition-all duration-300
        ${isOver 
          ? 'bg-destructive/20 border-destructive text-destructive scale-110 shadow-xl' 
          : 'bg-muted/80 border-muted-foreground/30 text-muted-foreground backdrop-blur-sm'
        }
      `}
    >
      <Trash2 className={`h-6 w-6 transition-transform ${isOver ? 'scale-125' : ''}`} />
      <span className="font-medium">
        {isOver ? 'Solte para excluir' : 'Arraste aqui para excluir'}
      </span>
    </div>
  );
}

export function AgentsGrid({ 
  agents, 
  onAgentsChange, 
  onEdit, 
  onDownload, 
  onStatusChange,
  onDelete,
  isAdmin 
}: AgentsGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isOverDelete, setIsOverDelete] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<AIAgent | null>(null);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const activeAgent = activeId ? agents.find(a => a.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    setIsOverDelete(over?.id === 'delete-zone');
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);
    setIsOverDelete(false);

    if (!over) return;

    // Se soltou na zona de exclusão
    if (over.id === 'delete-zone') {
      const agent = agents.find(a => a.id === active.id);
      if (agent) {
        setAgentToDelete(agent);
      }
      return;
    }

    // Reordenação
    if (active.id !== over.id) {
      const oldIndex = agents.findIndex(a => a.id === active.id);
      const newIndex = agents.findIndex(a => a.id === over.id);
      
      const newOrder = arrayMove(agents, oldIndex, newIndex);
      onAgentsChange(newOrder);

      // Salvar nova ordem no banco
      try {
        const updates = newOrder.map((agent, index) => ({
          id: agent.id,
          display_order: index
        }));

        for (const update of updates) {
          await supabase
            .from('ai_agents')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', update.id);
        }
      } catch (error) {
        console.error('Error saving order:', error);
      }
    }
  };

  const handleConfirmDelete = async () => {
    if (!agentToDelete) return;

    try {
      const { error } = await supabase
        .from('ai_agents')
        .delete()
        .eq('id', agentToDelete.id);

      if (error) throw error;

      toast({
        title: 'Agente excluído',
        description: `${agentToDelete.name} foi removido com sucesso.`
      });

      onDelete(agentToDelete);
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setAgentToDelete(null);
    }
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={agents.map(a => a.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map(agent => (
              <SortableAgentCard
                key={agent.id}
                agent={agent}
                onEdit={() => onEdit(agent)}
                onDownload={() => onDownload(agent)}
                onStatusChange={(status) => onStatusChange(agent, status)}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </SortableContext>

        {/* Delete Drop Zone - aparece ao arrastar */}
        {activeId && <DeleteDropZone isOver={isOverDelete} />}

        {/* Overlay para o card sendo arrastado */}
        <DragOverlay>
          {activeAgent && (
            <Card className="shadow-2xl rotate-3 opacity-90">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{activeAgent.avatar_emoji}</span>
                  <div>
                    <p className="font-semibold">{activeAgent.name}</p>
                    <p className="text-sm text-muted-foreground">{activeAgent.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </DragOverlay>
      </DndContext>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={!!agentToDelete} onOpenChange={() => setAgentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Excluir {agentToDelete?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O agente <strong>{agentToDelete?.name}</strong> e todas as suas configurações serão permanentemente removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
