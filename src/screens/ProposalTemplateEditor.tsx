import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { 
  EditorCanvas, 
  ElementToolbar, 
  PropertiesPanel, 
  EditorHeader,
  PageNavigator,
  TemplatePreview,
  CanvasElementData,
  WidgetsPanel,
  WIDGETS
} from '@/components/proposal-editor';
import { useTemplateEditor } from '@/hooks/useProposalTemplates';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LayoutGrid } from 'lucide-react';
import { downloadPDF } from '@/components/pdf/pdf-utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { A4_WIDTH, A4_HEIGHT } from '@/components/proposal-editor/types';

export default function ProposalTemplateEditor() {
  const { templateId } = useParams<{ templateId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const {
    template,
    loading,
    saving,
    hasChanges,
    saveTemplate,
    resetChanges,
    updateTemplateField,
    addElement,
    updateElement,
    deleteElement,
    duplicateElement,
    bringForward,
    sendBackward,
    addPage,
    deletePage,
    duplicatePage,
  } = useTemplateEditor(templateId);

  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [zoom, setZoom] = useState(0.75);
  const [showGrid, setShowGrid] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [showAllPagesInPreview, setShowAllPagesInPreview] = useState(false);
  const [activeWidgetId, setActiveWidgetId] = useState<string | null>(null);
  const totalPages = template?.pages.length || 1;
  const currentPage = template?.pages[currentPageIndex];
  const currentElements = currentPage?.elements || [];

  // Drag sensors with activation constraint to allow clicks
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Ensure currentPageIndex is valid when pages change
  useEffect(() => {
    if (template && currentPageIndex >= template.pages.length) {
      setCurrentPageIndex(Math.max(0, template.pages.length - 1));
    }
  }, [template?.pages.length, currentPageIndex]);
  
  const selectedElement = currentElements.find((el) => el.id === selectedElementId) || null;

  const handleAddElement = useCallback(
    (element: Omit<CanvasElementData, 'id' | 'zIndex'>) => {
      addElement(currentPageIndex, element);
    },
    [addElement, currentPageIndex]
  );

  // Handle drag end for both canvas elements and widgets from sidebar
  const handleGlobalDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over, delta } = event;
      setActiveWidgetId(null);

      const activeIdStr = active.id.toString();
      const isWidget = activeIdStr.startsWith('widget-');
      
      // Check if this is a widget being dropped (anywhere - we'll add to canvas regardless)
      if (isWidget) {
        const widgetId = active.data.current?.widgetId as string;
        const widget = WIDGETS.find((w) => w.id === widgetId);
        
        if (widget) {
          const element = widget.create();
          // Position the widget where it was dropped (center of canvas by default)
          const dropX = Math.max(40, Math.min(A4_WIDTH - element.width - 40, element.x));
          const dropY = Math.max(40, Math.min(A4_HEIGHT - element.height - 40, element.y));
          
          handleAddElement({
            ...element,
            x: dropX,
            y: dropY,
          });
          
          toast({
            title: 'Widget adicionado!',
            description: `${widget.name} foi adicionado à página ${currentPageIndex + 1}.`,
          });
        }
        return;
      }

      // Handle existing element drag within canvas
      const elementId = active.id as string;
      const element = currentElements.find((el) => el.id === elementId);
      
      if (element && !element.locked) {
        const newX = Math.max(0, Math.min(A4_WIDTH - element.width, element.x + delta.x / zoom));
        const newY = Math.max(0, Math.min(A4_HEIGHT - element.height, element.y + delta.y / zoom));
        
        updateElement(currentPageIndex, elementId, { x: newX, y: newY });
      }
    },
    [currentElements, zoom, handleAddElement, updateElement, currentPageIndex, toast]
  );

  const handleDragStart = useCallback((event: DragEndEvent) => {
    if (event.active.id.toString().startsWith('widget-')) {
      setActiveWidgetId(event.active.data.current?.widgetId as string);
    }
  }, []);

  const handleUpdateElement = useCallback(
    (elementId: string, updates: Partial<CanvasElementData>) => {
      updateElement(currentPageIndex, elementId, updates);
    },
    [updateElement, currentPageIndex]
  );

  const handleDeleteElement = useCallback(
    (elementId: string) => {
      deleteElement(currentPageIndex, elementId);
      if (selectedElementId === elementId) {
        setSelectedElementId(null);
      }
    },
    [deleteElement, currentPageIndex, selectedElementId]
  );

  const handleDuplicateElement = useCallback(() => {
    if (selectedElementId) {
      duplicateElement(currentPageIndex, selectedElementId);
    }
  }, [duplicateElement, currentPageIndex, selectedElementId]);

  const handleBringForward = useCallback(() => {
    if (selectedElementId) {
      bringForward(currentPageIndex, selectedElementId);
    }
  }, [bringForward, currentPageIndex, selectedElementId]);

  const handleSendBackward = useCallback(() => {
    if (selectedElementId) {
      sendBackward(currentPageIndex, selectedElementId);
    }
  }, [sendBackward, currentPageIndex, selectedElementId]);

  const handleSave = useCallback(async () => {
    const saved = await saveTemplate();
    if (saved && !templateId) {
      // Redirect to the new template's edit page
      navigate(`/template-editor/${saved.id}`, { replace: true });
    }
  }, [saveTemplate, templateId, navigate]);

  const handleExport = useCallback(async () => {
    try {
      toast({
        title: 'Gerando PDF...',
        description: 'Aguarde enquanto o PDF é gerado.',
      });

      await downloadPDF('editor-canvas-content', {
        filename: `${template?.name || 'template'}.pdf`,
        quality: 0.95,
        scale: 2,
      });

      toast({
        title: 'PDF exportado!',
        description: 'O arquivo foi baixado com sucesso.',
      });
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      toast({
        title: 'Erro ao exportar',
        description: 'Não foi possível gerar o PDF. Tente novamente.',
        variant: 'destructive',
      });
    }
  }, [template?.name, toast]);

  const handlePageChange = useCallback((pageIndex: number) => {
    setSelectedElementId(null);
    setCurrentPageIndex(pageIndex);
  }, []);

  const handleAddPage = useCallback(() => {
    addPage();
    // Navigate to the new page after a small delay
    setTimeout(() => {
      setCurrentPageIndex(totalPages);
      setSelectedElementId(null);
    }, 50);
  }, [addPage, totalPages]);

  const handleDeletePage = useCallback((pageIndex: number) => {
    deletePage(pageIndex);
    setSelectedElementId(null);
  }, [deletePage]);

  const handleDuplicatePage = useCallback((pageIndex: number) => {
    duplicatePage(pageIndex);
    // Navigate to the duplicated page
    setTimeout(() => {
      setCurrentPageIndex(pageIndex + 1);
      setSelectedElementId(null);
    }, 50);
  }, [duplicatePage]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Template não encontrado</p>
      </div>
    );
  }

  return (
    <DndContext 
      sensors={sensors} 
      onDragStart={handleDragStart}
      onDragEnd={handleGlobalDragEnd}
    >
      <div className="h-screen flex flex-col bg-background">
        <EditorHeader
          templateName={template.name}
          templateType={template.type}
          isActive={template.is_active}
          zoom={zoom}
          showGrid={showGrid}
          isSaving={saving}
          hasChanges={hasChanges}
          onNameChange={(name) => updateTemplateField('name', name)}
          onTypeChange={(type) => updateTemplateField('type', type)}
          onActiveChange={(active) => updateTemplateField('is_active', active)}
          onZoomChange={setZoom}
          onGridToggle={() => setShowGrid(!showGrid)}
          onSave={handleSave}
          onPreview={() => setShowPreview(true)}
          onExport={handleExport}
          onReset={resetChanges}
        />

        <div className="flex-1 flex overflow-hidden">
          <ElementToolbar onAddElement={handleAddElement} />

          <div className="flex-1 flex flex-col">
            <EditorCanvas
              elements={currentElements}
              selectedElementId={selectedElementId}
              zoom={zoom}
              showGrid={showGrid}
              onSelectElement={setSelectedElementId}
              onUpdateElement={handleUpdateElement}
              onDeleteElement={handleDeleteElement}
              onAddElement={handleAddElement}
            />

            <PageNavigator
              totalPages={totalPages}
              currentPage={currentPageIndex}
              onPageChange={handlePageChange}
              onAddPage={handleAddPage}
              onDeletePage={handleDeletePage}
              onDuplicatePage={handleDuplicatePage}
            />
          </div>

          {/* Right sidebar with tabs for Properties and Widgets */}
          <div className="w-72 border-l bg-card flex flex-col">
            <Tabs defaultValue="widgets" className="flex-1 flex flex-col">
              <TabsList className="w-full rounded-none border-b bg-card h-10">
                <TabsTrigger value="widgets" className="flex-1 text-xs">
                  Widgets
                </TabsTrigger>
                <TabsTrigger value="properties" className="flex-1 text-xs">
                  Propriedades
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="widgets" className="flex-1 mt-0 overflow-hidden">
                <WidgetsPanel onAddElement={handleAddElement} />
              </TabsContent>
              
              <TabsContent value="properties" className="flex-1 mt-0 overflow-hidden">
                <PropertiesPanel
                  element={selectedElement}
                  onUpdate={(updates) => {
                    if (selectedElementId) {
                      handleUpdateElement(selectedElementId, updates);
                    }
                  }}
                  onDelete={() => {
                    if (selectedElementId) {
                      handleDeleteElement(selectedElementId);
                    }
                  }}
                  onDuplicate={handleDuplicateElement}
                  onBringForward={handleBringForward}
                  onSendBackward={handleSendBackward}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Drag Overlay for widgets */}
        <DragOverlay>
          {activeWidgetId && (
            <div className="bg-card border border-primary shadow-lg rounded-lg p-3 opacity-90">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">
                  {WIDGETS.find(w => w.id === activeWidgetId)?.name || 'Widget'}
                </span>
              </div>
            </div>
          )}
        </DragOverlay>

        {/* Preview Dialog */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>Preview do Template</DialogTitle>
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-all-pages"
                    checked={showAllPagesInPreview}
                    onCheckedChange={setShowAllPagesInPreview}
                  />
                  <Label htmlFor="show-all-pages" className="text-sm">
                    Mostrar todas as páginas
                  </Label>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Visualização com dados de exemplo de uma proposta
              </p>
            </DialogHeader>
            
            <ScrollArea className="flex-1 max-h-[70vh]">
              <div className="p-4 bg-muted/50 rounded-lg flex justify-center">
                <TemplatePreview
                  pages={template.pages}
                  currentPageIndex={currentPageIndex}
                  zoom={0.6}
                  showAllPages={showAllPagesInPreview}
                />
              </div>
            </ScrollArea>

            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-xs text-muted-foreground">
                Os dados exibidos são fictícios para demonstração
              </p>
              <Button variant="outline" onClick={() => setShowPreview(false)}>
                Fechar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DndContext>
  );
}
