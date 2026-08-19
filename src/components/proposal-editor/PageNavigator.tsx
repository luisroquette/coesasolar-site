import { Plus, Trash2, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface PageNavigatorProps {
  totalPages: number;
  currentPage: number;
  onPageChange: (pageIndex: number) => void;
  onAddPage: () => void;
  onDeletePage: (pageIndex: number) => void;
  onDuplicatePage: (pageIndex: number) => void;
}

export function PageNavigator({
  totalPages,
  currentPage,
  onPageChange,
  onAddPage,
  onDeletePage,
  onDuplicatePage,
}: PageNavigatorProps) {
  const canDeletePage = totalPages > 1;

  return (
    <div className="h-12 border-t bg-card flex items-center justify-center gap-2 px-4">
      <TooltipProvider>
        {/* Previous page */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage === 0}
              onClick={() => onPageChange(currentPage - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Página anterior</TooltipContent>
        </Tooltip>

        {/* Page thumbnails */}
        <div className="flex items-center gap-1">
          {Array.from({ length: totalPages }).map((_, index) => (
            <button
              key={index}
              onClick={() => onPageChange(index)}
              className={cn(
                'w-8 h-10 rounded border-2 transition-all text-xs font-medium',
                'hover:border-primary/50 hover:bg-muted',
                currentPage === index
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground'
              )}
            >
              {index + 1}
            </button>
          ))}
        </div>

        {/* Next page */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage === totalPages - 1}
              onClick={() => onPageChange(currentPage + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Próxima página</TooltipContent>
        </Tooltip>

        <div className="w-px h-6 bg-border mx-2" />

        {/* Add page */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={onAddPage}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Adicionar página</TooltipContent>
        </Tooltip>

        {/* Duplicate page */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onDuplicatePage(currentPage)}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Duplicar página atual</TooltipContent>
        </Tooltip>

        {/* Delete page */}
        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  disabled={!canDeletePage}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>Excluir página atual</TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir página {currentPage + 1}?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Todos os elementos desta página serão removidos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDeletePage(currentPage)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="w-px h-6 bg-border mx-2" />

        {/* Page indicator */}
        <span className="text-sm text-muted-foreground">
          Página {currentPage + 1} de {totalPages}
        </span>
      </TooltipProvider>
    </div>
  );
}
