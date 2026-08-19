import { useCallback, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { CanvasElement } from './CanvasElement';
import { CanvasElementData, A4_WIDTH, A4_HEIGHT } from './types';

interface EditorCanvasProps {
  elements: CanvasElementData[];
  selectedElementId: string | null;
  zoom: number;
  showGrid: boolean;
  onSelectElement: (id: string | null) => void;
  onUpdateElement: (id: string, updates: Partial<CanvasElementData>) => void;
  onDeleteElement: (id: string) => void;
  onAddElement: (element: Omit<CanvasElementData, 'id' | 'zIndex'>) => void;
}

export function EditorCanvas({
  elements,
  selectedElementId,
  zoom,
  showGrid,
  onSelectElement,
  onUpdateElement,
  onDeleteElement,
}: EditorCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);

  const { setNodeRef, isOver } = useDroppable({
    id: 'canvas-droppable',
  });

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === canvasRef.current) {
        onSelectElement(null);
      }
    },
    [onSelectElement]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (selectedElementId) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          onDeleteElement(selectedElementId);
        }
        
        const element = elements.find((el) => el.id === selectedElementId);
        if (element && !element.locked) {
          const step = e.shiftKey ? 10 : 1;
          switch (e.key) {
            case 'ArrowUp':
              e.preventDefault();
              onUpdateElement(selectedElementId, { y: Math.max(0, element.y - step) });
              break;
            case 'ArrowDown':
              e.preventDefault();
              onUpdateElement(selectedElementId, { y: Math.min(A4_HEIGHT - element.height, element.y + step) });
              break;
            case 'ArrowLeft':
              e.preventDefault();
              onUpdateElement(selectedElementId, { x: Math.max(0, element.x - step) });
              break;
            case 'ArrowRight':
              e.preventDefault();
              onUpdateElement(selectedElementId, { x: Math.min(A4_WIDTH - element.width, element.x + step) });
              break;
          }
        }
      }
    },
    [selectedElementId, elements, onUpdateElement, onDeleteElement]
  );

  const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div 
      className="flex-1 overflow-auto bg-muted/50 p-8 flex items-start justify-center"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div
        id="editor-canvas-content"
        ref={(node) => {
          canvasRef.current = node;
          setNodeRef(node);
        }}
        className={cn(
          'relative bg-white shadow-xl transition-all',
          showGrid && 'bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:20px_20px]',
          isOver && 'ring-2 ring-primary ring-offset-2'
        )}
        style={{
          width: A4_WIDTH * zoom,
          height: A4_HEIGHT * zoom,
          transform: `scale(1)`,
          transformOrigin: 'top left',
        }}
        onClick={handleCanvasClick}
      >
        {/* Margem de segurança visual */}
        <div 
          className="absolute border border-dashed border-gray-200 pointer-events-none"
          style={{
            left: 40 * zoom,
            top: 40 * zoom,
            right: 40 * zoom,
            bottom: 40 * zoom,
            width: `calc(100% - ${80 * zoom}px)`,
            height: `calc(100% - ${80 * zoom}px)`,
          }}
        />

        {sortedElements.map((element) => (
          <CanvasElement
            key={element.id}
            element={element}
            isSelected={selectedElementId === element.id}
            zoom={zoom}
            onSelect={() => onSelectElement(element.id)}
            onUpdate={(updates) => onUpdateElement(element.id, updates)}
            onDelete={() => onDeleteElement(element.id)}
          />
        ))}
      </div>
    </div>
  );
}
