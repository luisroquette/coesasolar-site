import { useCallback } from 'react';
import { 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Bold, 
  Italic,
  Lock,
  Unlock,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CanvasElementData, ElementStyle } from './types';

interface PropertiesPanelProps {
  element: CanvasElementData | null;
  onUpdate: (updates: Partial<CanvasElementData>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
}

const FONT_OPTIONS = [
  { value: 'inherit', label: 'Padrão' },
  { value: 'Inter, sans-serif', label: 'Inter' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Courier New, monospace', label: 'Courier' },
  { value: 'Arial, sans-serif', label: 'Arial' },
];

export function PropertiesPanel({
  element,
  onUpdate,
  onDelete,
  onDuplicate,
  onBringForward,
  onSendBackward,
}: PropertiesPanelProps) {
  const updateStyle = useCallback(
    (styleUpdates: Partial<ElementStyle>) => {
      if (!element) return;
      onUpdate({
        style: { ...element.style, ...styleUpdates },
      });
    },
    [element, onUpdate]
  );

  if (!element) {
    return (
      <div className="flex-1 p-4">
        <div className="text-center text-muted-foreground py-8">
          <p className="text-sm">Selecione um elemento para editar suas propriedades</p>
        </div>
      </div>
    );
  }

  const isTextElement = element.type === 'text' || element.type === 'dynamic-field';

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Propriedades</h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onDuplicate}
              title="Duplicar"
            >
              <Copy className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onUpdate({ locked: !element.locked })}
              title={element.locked ? 'Desbloquear' : 'Bloquear'}
            >
              {element.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onDelete}
              title="Excluir"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1 capitalize">
          {element.type === 'dynamic-field' ? 'Campo Dinâmico' : element.type}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Posição */}
          <div>
            <Label className="text-xs font-medium">Posição</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <Label className="text-xs text-muted-foreground">X</Label>
                <Input
                  type="number"
                  value={Math.round(element.x)}
                  onChange={(e) => onUpdate({ x: Number(e.target.value) })}
                  className="h-8"
                  disabled={element.locked}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Y</Label>
                <Input
                  type="number"
                  value={Math.round(element.y)}
                  onChange={(e) => onUpdate({ y: Number(e.target.value) })}
                  className="h-8"
                  disabled={element.locked}
                />
              </div>
            </div>
          </div>

          {/* Tamanho */}
          <div>
            <Label className="text-xs font-medium">Tamanho</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <Label className="text-xs text-muted-foreground">Largura</Label>
                <Input
                  type="number"
                  value={Math.round(element.width)}
                  onChange={(e) => onUpdate({ width: Math.max(20, Number(e.target.value)) })}
                  className="h-8"
                  disabled={element.locked}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Altura</Label>
                <Input
                  type="number"
                  value={Math.round(element.height)}
                  onChange={(e) => onUpdate({ height: Math.max(20, Number(e.target.value)) })}
                  className="h-8"
                  disabled={element.locked}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Camadas */}
          <div>
            <Label className="text-xs font-medium">Camadas</Label>
            <div className="flex gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8"
                onClick={onBringForward}
                disabled={element.locked}
              >
                <ArrowUp className="w-4 h-4 mr-1" />
                Para frente
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8"
                onClick={onSendBackward}
                disabled={element.locked}
              >
                <ArrowDown className="w-4 h-4 mr-1" />
                Para trás
              </Button>
            </div>
          </div>

          <Separator />

          {/* Tipografia (para texto) */}
          {isTextElement && (
            <>
              <div>
                <Label className="text-xs font-medium">Tipografia</Label>
                <div className="space-y-2 mt-2">
                  <Select
                    value={element.style.fontFamily || 'inherit'}
                    onValueChange={(value) => updateStyle({ fontFamily: value })}
                    disabled={element.locked}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((font) => (
                        <SelectItem key={font.value} value={font.value}>
                          {font.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Tamanho</Label>
                      <Input
                        type="number"
                        value={element.style.fontSize || 16}
                        onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
                        className="h-8"
                        min={8}
                        max={120}
                        disabled={element.locked}
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs text-muted-foreground">Peso</Label>
                      <Select
                        value={element.style.fontWeight || 'normal'}
                        onValueChange={(value: ElementStyle['fontWeight']) => updateStyle({ fontWeight: value })}
                        disabled={element.locked}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">Leve</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="semibold">Médio</SelectItem>
                          <SelectItem value="bold">Negrito</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Alinhamento</Label>
                    <div className="flex gap-1 mt-1">
                      {(['left', 'center', 'right'] as const).map((align) => (
                        <Button
                          key={align}
                          variant={element.style.textAlign === align ? 'default' : 'outline'}
                          size="sm"
                          className="flex-1 h-8"
                          onClick={() => updateStyle({ textAlign: align })}
                          disabled={element.locked}
                        >
                          {align === 'left' && <AlignLeft className="w-4 h-4" />}
                          {align === 'center' && <AlignCenter className="w-4 h-4" />}
                          {align === 'right' && <AlignRight className="w-4 h-4" />}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <Separator />
            </>
          )}

          {/* Cores */}
          <div>
            <Label className="text-xs font-medium">Cores</Label>
            <div className="space-y-2 mt-2">
              {isTextElement && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground w-20">Texto</Label>
                  <Input
                    type="color"
                    value={element.style.color || '#000000'}
                    onChange={(e) => updateStyle({ color: e.target.value })}
                    className="h-8 w-12 p-1 cursor-pointer"
                    disabled={element.locked}
                  />
                  <Input
                    type="text"
                    value={element.style.color || '#000000'}
                    onChange={(e) => updateStyle({ color: e.target.value })}
                    className="h-8 flex-1 font-mono text-xs"
                    disabled={element.locked}
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground w-20">Fundo</Label>
                <Input
                  type="color"
                  value={element.style.backgroundColor || '#ffffff'}
                  onChange={(e) => updateStyle({ backgroundColor: e.target.value })}
                  className="h-8 w-12 p-1 cursor-pointer"
                  disabled={element.locked}
                />
                <Input
                  type="text"
                  value={element.style.backgroundColor || 'transparent'}
                  onChange={(e) => updateStyle({ backgroundColor: e.target.value })}
                  className="h-8 flex-1 font-mono text-xs"
                  disabled={element.locked}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Borda e Arredondamento */}
          <div>
            <Label className="text-xs font-medium">Borda</Label>
            <div className="space-y-2 mt-2">
              <div>
                <Label className="text-xs text-muted-foreground">Arredondamento</Label>
                <Slider
                  value={[element.style.borderRadius || 0]}
                  min={0}
                  max={50}
                  step={1}
                  onValueChange={([value]) => updateStyle({ borderRadius: value })}
                  disabled={element.locked}
                  className="mt-2"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Opacidade */}
          <div>
            <Label className="text-xs font-medium">Opacidade</Label>
            <Slider
              value={[(element.style.opacity ?? 1) * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={([value]) => updateStyle({ opacity: value / 100 })}
              disabled={element.locked}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round((element.style.opacity ?? 1) * 100)}%
            </p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
