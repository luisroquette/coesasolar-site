import { useState } from 'react';
import { 
  ArrowLeft, 
  Save, 
  Eye, 
  Grid3X3, 
  ZoomIn, 
  ZoomOut,
  RotateCcw,
  Settings,
  Download
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface EditorHeaderProps {
  templateName: string;
  templateType: 'inicial' | 'definitiva';
  isActive: boolean;
  zoom: number;
  showGrid: boolean;
  isSaving: boolean;
  hasChanges: boolean;
  onNameChange: (name: string) => void;
  onTypeChange: (type: 'inicial' | 'definitiva') => void;
  onActiveChange: (active: boolean) => void;
  onZoomChange: (zoom: number) => void;
  onGridToggle: () => void;
  onSave: () => void;
  onPreview: () => void;
  onExport: () => void;
  onReset: () => void;
}

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function EditorHeader({
  templateName,
  templateType,
  isActive,
  zoom,
  showGrid,
  isSaving,
  hasChanges,
  onNameChange,
  onTypeChange,
  onActiveChange,
  onZoomChange,
  onGridToggle,
  onSave,
  onPreview,
  onExport,
  onReset,
}: EditorHeaderProps) {
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);

  const zoomPercent = Math.round(zoom * 100);

  const handleZoomIn = () => {
    const currentIndex = ZOOM_LEVELS.findIndex((z) => z >= zoom);
    const nextIndex = Math.min(currentIndex + 1, ZOOM_LEVELS.length - 1);
    onZoomChange(ZOOM_LEVELS[nextIndex]);
  };

  const handleZoomOut = () => {
    const currentIndex = ZOOM_LEVELS.findIndex((z) => z >= zoom);
    const prevIndex = Math.max(currentIndex - 1, 0);
    onZoomChange(ZOOM_LEVELS[prevIndex]);
  };

  return (
    <>
      <div className="h-14 border-b bg-card flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/configuracoes')}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </Button>

          <Separator orientation="vertical" className="h-6" />

          <div className="flex items-center gap-2">
            <Input
              value={templateName}
              onChange={(e) => onNameChange(e.target.value)}
              className="h-8 w-64 font-medium"
              placeholder="Nome do template"
            />
            {hasChanges && (
              <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded">
                Não salvo
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleZoomOut}
              disabled={zoom <= ZOOM_LEVELS[0]}
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs font-medium w-12 text-center">{zoomPercent}%</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleZoomIn}
              disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Grid toggle */}
          <Button
            variant={showGrid ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={onGridToggle}
            title="Mostrar/ocultar grade"
          >
            <Grid3X3 className="w-4 h-4" />
          </Button>

          {/* Settings */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowSettings(true)}
            title="Configurações do template"
          >
            <Settings className="w-4 h-4" />
          </Button>

          <Separator orientation="vertical" className="h-6" />

          {/* Preview */}
          <Button variant="outline" size="sm" onClick={onPreview} className="gap-2">
            <Eye className="w-4 h-4" />
            Preview
          </Button>

          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="w-4 h-4" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExport}>
                Exportar como PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onReset} className="text-destructive">
                <RotateCcw className="w-4 h-4 mr-2" />
                Resetar alterações
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Save */}
          <Button 
            size="sm" 
            onClick={onSave} 
            disabled={isSaving || !hasChanges}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurações do Template</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Nome do Template</Label>
              <Input
                value={templateName}
                onChange={(e) => onNameChange(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Tipo de Proposta</Label>
              <div className="flex gap-2 mt-2">
                <Button
                  variant={templateType === 'inicial' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onTypeChange('inicial')}
                >
                  Proposta Inicial
                </Button>
                <Button
                  variant={templateType === 'definitiva' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onTypeChange('definitiva')}
                >
                  Proposta Definitiva
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Template Ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Apenas um template pode estar ativo por tipo
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={onActiveChange}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
