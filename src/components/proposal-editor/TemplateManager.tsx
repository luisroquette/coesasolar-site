import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileEdit, Trash2, Check, Copy, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { useProposalTemplates } from '@/hooks/useProposalTemplates';
import { createDefaultInitialTemplate } from '@/lib/default-proposal-template';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export function TemplateManager() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { templates, loading, createTemplate, deleteTemplate, updateTemplate } = useProposalTemplates();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isCreatingDefault, setIsCreatingDefault] = useState(false);

  const handleCreateNew = () => {
    navigate('/template-editor');
  };

  const handleEdit = (id: string) => {
    navigate(`/template-editor/${id}`);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteTemplate(deleteId);
      setDeleteId(null);
    }
  };

  const handleDuplicate = async (template: typeof templates[0]) => {
    const duplicated = await createTemplate({
      name: `${template.name} (cópia)`,
      description: template.description,
      type: template.type,
      pages: template.pages,
      is_active: false,
    });
    if (duplicated) {
      toast({
        title: 'Template duplicado',
        description: 'O template foi duplicado com sucesso.',
      });
    }
  };

  const handleSetActive = async (template: typeof templates[0]) => {
    await updateTemplate(template.id, { is_active: true });
  };

  const handleCreateDefaultTemplate = async () => {
    setIsCreatingDefault(true);
    try {
      // Use factory to generate fresh template with unique IDs
      const freshTemplate = createDefaultInitialTemplate();
      const created = await createTemplate(freshTemplate);
      if (created) {
        toast({
          title: 'Template padrão criado',
          description: 'O template padrão de proposta inicial foi criado com sucesso.',
        });
      }
    } finally {
      setIsCreatingDefault(false);
    }
  };

  const inicialTemplates = templates.filter(t => t.type === 'inicial');
  const definitivaTemplates = templates.filter(t => t.type === 'definitiva');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Templates de Proposta</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie os templates visuais das propostas
          </p>
        </div>
        <div className="flex gap-2">
          {inicialTemplates.length === 0 && (
            <Button 
              variant="outline" 
              onClick={handleCreateDefaultTemplate}
              disabled={isCreatingDefault}
            >
              {isCreatingDefault ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileEdit className="w-4 h-4 mr-2" />
              )}
              Criar Template Padrão
            </Button>
          )}
          <Button onClick={handleCreateNew}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Template
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              Nenhum template criado ainda.
            </p>
            <Button variant="outline" onClick={handleCreateDefaultTemplate} disabled={isCreatingDefault}>
              {isCreatingDefault ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileEdit className="w-4 h-4 mr-2" />
              )}
              Criar Template Padrão Inicial
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Propostas Iniciais */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">
              Propostas Iniciais
            </h4>
            {inicialTemplates.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum template para propostas iniciais.
                  <Button 
                    variant="link" 
                    className="ml-2 p-0 h-auto"
                    onClick={handleCreateDefaultTemplate}
                    disabled={isCreatingDefault}
                  >
                    Criar template padrão
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {inicialTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onEdit={() => handleEdit(template.id)}
                    onDelete={() => setDeleteId(template.id)}
                    onDuplicate={() => handleDuplicate(template)}
                    onSetActive={() => handleSetActive(template)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Propostas Definitivas */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">
              Propostas Definitivas
            </h4>
            {definitivaTemplates.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum template para propostas definitivas.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {definitivaTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onEdit={() => handleEdit(template.id)}
                    onDelete={() => setDeleteId(template.id)}
                    onDuplicate={() => handleDuplicate(template)}
                    onSetActive={() => handleSetActive(template)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O template será permanentemente excluído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface TemplateCardProps {
  template: {
    id: string;
    name: string;
    description?: string;
    type: 'inicial' | 'definitiva';
    is_active: boolean;
    updated_at: string;
  };
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSetActive: () => void;
}

function TemplateCard({ template, onEdit, onDelete, onDuplicate, onSetActive }: TemplateCardProps) {
  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{template.name}</CardTitle>
            {template.description && (
              <CardDescription className="text-xs mt-1 line-clamp-2">
                {template.description}
              </CardDescription>
            )}
          </div>
          {template.is_active && (
            <Badge variant="default" className="ml-2 shrink-0">
              <Check className="w-3 h-3 mr-1" />
              Ativo
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Atualizado em {new Date(template.updated_at).toLocaleDateString('pt-BR')}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm" onClick={onEdit} className="h-8">
            <FileEdit className="w-4 h-4 mr-1" />
            Editar
          </Button>
          <Button variant="ghost" size="sm" onClick={onDuplicate} className="h-8">
            <Copy className="w-4 h-4" />
          </Button>
          {!template.is_active && (
            <Button variant="ghost" size="sm" onClick={onSetActive} className="h-8">
              <Check className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDelete} className="h-8 text-destructive hover:text-destructive">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
