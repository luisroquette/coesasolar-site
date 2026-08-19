import { useCallback, useState, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { CanvasElementData } from './types';
import { Lock, Move } from 'lucide-react';

interface CanvasElementProps {
  element: CanvasElementData;
  isSelected: boolean;
  zoom: number;
  onSelect: () => void;
  onUpdate: (updates: Partial<CanvasElementData>) => void;
  onDelete: () => void;
}

export function CanvasElement({
  element,
  isSelected,
  zoom,
  onSelect,
  onUpdate,
  onDelete,
}: CanvasElementProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(1);
  const textRef = useRef<HTMLDivElement>(null);
  const startPosRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: element.id,
    disabled: element.locked,
  });

  const handleDoubleClick = useCallback(() => {
    if (element.type === 'text' || element.type === 'dynamic-field') {
      setIsEditing(true);
    }
  }, [element.type]);

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (textRef.current) {
      onUpdate({ content: textRef.current.innerText });
    }
  }, [onUpdate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsEditing(false);
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        setIsEditing(false);
        if (textRef.current) {
          onUpdate({ content: textRef.current.innerText });
        }
      }
    },
    [onUpdate]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, handle: string) => {
      e.stopPropagation();
      setIsResizing(true);
      setResizeHandle(handle);
      startPosRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: element.width,
        height: element.height,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = (moveEvent.clientX - startPosRef.current.x) / zoom;
        const deltaY = (moveEvent.clientY - startPosRef.current.y) / zoom;

        let newWidth = startPosRef.current.width;
        let newHeight = startPosRef.current.height;

        if (handle.includes('e')) newWidth += deltaX;
        if (handle.includes('w')) newWidth -= deltaX;
        if (handle.includes('s')) newHeight += deltaY;
        if (handle.includes('n')) newHeight -= deltaY;

        onUpdate({
          width: Math.max(20, newWidth),
          height: Math.max(20, newHeight),
        });
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        setResizeHandle(null);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [element.width, element.height, zoom, onUpdate]
  );

  useEffect(() => {
    if (isEditing && textRef.current) {
      textRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(textRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isEditing]);

  const style: React.CSSProperties = {
    position: 'absolute',
    left: element.x * zoom,
    top: element.y * zoom,
    width: element.width * zoom,
    height: element.height * zoom,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: element.zIndex,
    cursor: element.locked ? 'not-allowed' : isDragging ? 'grabbing' : 'grab',
    opacity: isDragging ? 0.8 : element.style.opacity ?? 1,
  };

  const contentStyle: React.CSSProperties = {
    fontSize: (element.style.fontSize ?? 16) * zoom,
    fontWeight: element.style.fontWeight ?? 'normal',
    fontFamily: element.style.fontFamily ?? 'inherit',
    color: element.style.color ?? '#000000',
    backgroundColor: element.style.backgroundColor ?? 'transparent',
    borderRadius: (element.style.borderRadius ?? 0) * zoom,
    borderWidth: element.style.borderWidth ? element.style.borderWidth * zoom : undefined,
    borderColor: element.style.borderColor,
    borderStyle: element.style.borderWidth ? 'solid' : undefined,
    textAlign: element.style.textAlign ?? 'left',
    padding: (element.style.padding ?? 0) * zoom,
    lineHeight: element.style.lineHeight ?? 1.2,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: element.style.textAlign === 'center' ? 'center' : element.style.textAlign === 'right' ? 'flex-end' : 'flex-start',
    overflow: 'hidden',
  };

  const renderContent = () => {
    switch (element.type) {
      case 'text':
      case 'dynamic-field':
        return (
          <div
            ref={textRef}
            contentEditable={isEditing && !element.locked}
            suppressContentEditableWarning
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={contentStyle}
            className={cn(
              'outline-none',
              isEditing && 'ring-2 ring-primary ring-inset'
            )}
          >
            {element.content}
          </div>
        );
      case 'shape':
        return <div style={contentStyle} />;
      case 'image':
        return (
          <img
            src={element.content}
            alt=""
            style={{ ...contentStyle, objectFit: 'cover' }}
            draggable={false}
          />
        );
      case 'qr-code':
        return (
          <div style={contentStyle} className="flex items-center justify-center bg-white">
            <div className="w-full h-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-500 text-xs">
              QR Code
            </div>
          </div>
        );
      case 'plans-comparison': {
        // Planos clássicos: 15%, 20%, 25%, 30% (UNLOCK)
        const plans = [
          { pct: 15, nome: 'Flex', anos: 1, unlock: false },
          { pct: 20, nome: 'Economia', anos: 2, unlock: false },
          { pct: 25, nome: 'Premium', anos: 3, unlock: false },
          { pct: 30, nome: 'UNLOCK', anos: 4, unlock: true },
        ];
        
        // No editor, simulamos consumo baixo para demonstrar o bloqueio do UNLOCK
        const consumoSimulado = 1500; // kWh - abaixo de 3000, UNLOCK bloqueado
        const consumoMinUnlock = 3000;
        
        const plansStyle: React.CSSProperties = {
          ...contentStyle,
          alignItems: 'stretch',
          justifyContent: 'flex-start',
          flexDirection: 'column',
          gap: 10 * zoom,
        };

        const pillStyle = (active: boolean, locked: boolean): React.CSSProperties => ({
          fontSize: 12 * zoom,
          padding: `${8 * zoom}px ${10 * zoom}px`,
          borderRadius: 10 * zoom,
          borderWidth: 1,
          borderStyle: 'solid',
          cursor: locked ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          opacity: locked ? 0.5 : 1,
        });

        const selectedPlan = plans[selectedPlanIndex];

        return (
          <div style={plansStyle} className="w-full">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div
                  className="font-semibold text-foreground"
                  style={{ fontSize: 16 * zoom, lineHeight: 1.1 }}
                >
                  Compare os planos
                </div>
                <div
                  className="text-muted-foreground"
                  style={{ fontSize: 12 * zoom, marginTop: 2 * zoom }}
                >
                  Clique para simular diferentes percentuais de desconto
                </div>
              </div>
              <div
                className="rounded-md border border-border bg-muted text-muted-foreground"
                style={{
                  fontSize: 11 * zoom,
                  padding: `${6 * zoom}px ${8 * zoom}px`,
                  whiteSpace: 'nowrap',
                }}
              >
                Widget interativo
              </div>
            </div>

            <div
              className="mt-2 grid grid-cols-4 gap-2"
              style={{ marginTop: 10 * zoom, gap: 8 * zoom }}
            >
              {plans.map((plan, idx) => {
                const active = idx === selectedPlanIndex;
                const isLocked = plan.unlock && consumoSimulado < consumoMinUnlock;
                
                return (
                  <button
                    key={plan.pct}
                    type="button"
                    disabled={isLocked}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isLocked) {
                        setSelectedPlanIndex(idx);
                      }
                    }}
                    className={cn(
                      'relative border border-border bg-background text-foreground transition-colors',
                      active && !isLocked && 'bg-primary text-primary-foreground border-primary',
                      isLocked && 'bg-muted/50 text-muted-foreground border-dashed'
                    )}
                    style={pillStyle(active, isLocked)}
                    title={isLocked ? `Disponível para consumo > ${consumoMinUnlock} kWh` : `Plano ${plan.nome} - ${plan.pct}%`}
                  >
                    <span className="flex items-center justify-center gap-1">
                      {isLocked && <Lock className="w-3 h-3" style={{ width: 10 * zoom, height: 10 * zoom }} />}
                      {plan.pct}%
                    </span>
                    {plan.unlock && (
                      <span
                        className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-500 text-white px-1 rounded text-[8px] font-bold"
                        style={{ fontSize: 8 * zoom, padding: `${1 * zoom}px ${4 * zoom}px` }}
                      >
                        UNLOCK
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div
              className="rounded-lg border border-border bg-background"
              style={{
                marginTop: 12 * zoom,
                padding: `${12 * zoom}px ${12 * zoom}px`,
              }}
            >
              <div
                className="text-muted-foreground"
                style={{ fontSize: 12 * zoom, marginBottom: 6 * zoom }}
              >
                Plano selecionado: <span className="font-medium text-foreground">{selectedPlan.nome}</span>
              </div>
              <div
                className="font-semibold text-foreground"
                style={{ fontSize: 16 * zoom, lineHeight: 1.1 }}
              >
                {selectedPlan.pct}% de desconto · {'{{valor_com_coesa}}'} · {selectedPlan.anos} {selectedPlan.anos === 1 ? 'ano' : 'anos'}
              </div>
              <div
                className="text-foreground"
                style={{ fontSize: 13 * zoom, marginTop: 6 * zoom }}
              >
                Economia estimada:{' '}
                <span className="font-semibold">{'{{economia_mensal}}'}</span>/mês
              </div>
            </div>

            {/* Hint sobre o plano UNLOCK */}
            <div
              className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
              style={{
                marginTop: 12 * zoom,
                padding: `${10 * zoom}px ${12 * zoom}px`,
              }}
            >
              <div className="flex items-start gap-2">
                <Lock className="text-amber-600 flex-shrink-0" style={{ width: 14 * zoom, height: 14 * zoom, marginTop: 2 * zoom }} />
                <div
                  className="text-amber-800 dark:text-amber-200"
                  style={{ fontSize: 11 * zoom, lineHeight: 1.35 }}
                >
                  <span className="font-semibold">Plano UNLOCK (30%)</span> disponível apenas para consumos acima de 3.000 kWh/mês.
                </div>
              </div>
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group transition-shadow',
        isSelected && 'ring-2 ring-primary shadow-lg',
        !isSelected && 'hover:ring-1 hover:ring-primary/50'
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={handleDoubleClick}
      {...attributes}
      {...listeners}
    >
      {renderContent()}

      {/* Lock indicator */}
      {element.locked && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-muted px-2 py-0.5 rounded text-xs flex items-center gap-1">
          <Lock className="w-3 h-3" />
        </div>
      )}

      {/* Drag indicator */}
      {isSelected && !element.locked && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-2 py-0.5 rounded text-xs flex items-center gap-1">
          <Move className="w-3 h-3" />
          Arraste
        </div>
      )}

      {/* Resize handles */}
      {isSelected && !element.locked && (
        <>
          {['nw', 'ne', 'sw', 'se'].map((handle) => (
            <div
              key={handle}
              className={cn(
                'absolute w-3 h-3 bg-primary border-2 border-white rounded-full cursor-pointer z-10',
                handle === 'nw' && '-top-1.5 -left-1.5 cursor-nw-resize',
                handle === 'ne' && '-top-1.5 -right-1.5 cursor-ne-resize',
                handle === 'sw' && '-bottom-1.5 -left-1.5 cursor-sw-resize',
                handle === 'se' && '-bottom-1.5 -right-1.5 cursor-se-resize'
              )}
              onMouseDown={(e) => handleResizeStart(e, handle)}
            />
          ))}
          {['n', 'e', 's', 'w'].map((handle) => (
            <div
              key={handle}
              className={cn(
                'absolute bg-primary rounded-sm z-10',
                handle === 'n' && 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-2 cursor-n-resize',
                handle === 's' && 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-6 h-2 cursor-s-resize',
                handle === 'e' && 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-2 h-6 cursor-e-resize',
                handle === 'w' && 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-6 cursor-w-resize'
              )}
              onMouseDown={(e) => handleResizeStart(e, handle)}
            />
          ))}
        </>
      )}
    </div>
  );
}
