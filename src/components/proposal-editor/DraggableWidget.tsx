import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { GripVertical } from 'lucide-react';

interface DraggableWidgetProps {
  id: string;
  children: React.ReactNode;
  onClick: () => void;
}

export function DraggableWidget({ id, children, onClick }: DraggableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `widget-${id}`,
    data: {
      type: 'widget',
      widgetId: id,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group",
        isDragging && "opacity-50 z-50"
      )}
      onClick={onClick}
    >
      {/* Drag handle */}
      <div
        {...listeners}
        {...attributes}
        className={cn(
          "absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded cursor-grab active:cursor-grabbing",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          "bg-muted hover:bg-muted-foreground/20 z-10"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3 h-3 text-muted-foreground" />
      </div>
      {children}
    </div>
  );
}
