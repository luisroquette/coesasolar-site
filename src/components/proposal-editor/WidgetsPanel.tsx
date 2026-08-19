import { 
  LayoutGrid, 
  TrendingUp, 
  Calculator, 
  MessageSquare,
  Star,
  ChevronDown,
  ChevronRight,
  Sparkles,
  BarChart3,
  Clock,
  GripVertical
} from 'lucide-react';
import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { CanvasElementData, A4_WIDTH } from './types';

interface WidgetsPanelProps {
  onAddElement: (element: Omit<CanvasElementData, 'id' | 'zIndex'>) => void;
}

export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: 'interativo' | 'visualizacao' | 'info';
  create: () => Omit<CanvasElementData, 'id' | 'zIndex'>;
  preview?: React.ReactNode;
}

export const WIDGETS: WidgetDefinition[] = [
  {
    id: 'plans-comparison',
    name: 'Comparador de Planos',
    description: 'Seletor interativo de planos (15%, 20%, 25%, 30% UNLOCK)',
    icon: <LayoutGrid className="w-5 h-5 text-primary" />,
    category: 'interativo',
    create: () => ({
      type: 'plans-comparison' as const,
      x: 40,
      y: 200,
      width: A4_WIDTH - 80,
      height: 420,
      rotation: 0,
      style: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 16,
      },
      content: 'plans-comparison',
      locked: false,
    }),
    preview: (
      <div className="mt-2 p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200">
        <div className="flex gap-1.5">
          {[15, 20, 25].map((val, i) => (
            <div 
              key={val} 
              className={cn(
                "flex-1 text-center py-2 rounded text-xs font-semibold",
                i === 2 ? "bg-primary text-white" : "bg-white border border-gray-200"
              )}
            >
              {val}%
            </div>
          ))}
          <div className="flex-1 text-center py-2 rounded text-xs font-semibold bg-amber-100 border border-amber-300 text-amber-700 relative">
            🔒 30%
          </div>
        </div>
        <div className="mt-2 bg-emerald-600 text-white text-center py-1.5 rounded text-xs">
          Plano Premium · 25% · 3 anos
        </div>
      </div>
    ),
  },
  {
    id: 'savings-projection',
    name: 'Projeção de Economia',
    description: 'Barras de economia acumulada ao longo do tempo',
    icon: <TrendingUp className="w-5 h-5 text-emerald-500" />,
    category: 'visualizacao',
    create: () => ({
      type: 'text' as const,
      x: 40,
      y: 200,
      width: A4_WIDTH - 80,
      height: 200,
      rotation: 0,
      style: {
        backgroundColor: '#f0fdf4',
        borderRadius: 12,
        padding: 16,
        fontSize: 14,
        color: '#166534',
      },
      content: '📊 Projeção de Economia\n\n1 mês: {{economia_mensal}}\n1 ano: {{economia_anual}}\n2 anos: {{economia_2_anos}}\n5 anos: {{economia_5_anos}}',
      locked: false,
    }),
    preview: (
      <div className="mt-2 p-2 bg-emerald-50 rounded-lg border border-emerald-200">
        <div className="space-y-1">
          {['R$ 30', 'R$ 364', 'R$ 728', 'R$ 1.820'].map((val, i) => (
            <div key={i} className="flex items-center gap-2">
              <div 
                className="h-3 bg-emerald-500 rounded-r" 
                style={{ width: `${20 + i * 20}%` }}
              />
              <span className="text-[10px] text-emerald-700">{val}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'economy-calculator',
    name: 'Calculadora de Economia',
    description: 'Resumo com comparativo Sem COESA vs Com COESA',
    icon: <Calculator className="w-5 h-5 text-blue-500" />,
    category: 'visualizacao',
    create: () => ({
      type: 'text' as const,
      x: 40,
      y: 100,
      width: A4_WIDTH - 80,
      height: 160,
      rotation: 0,
      style: {
        backgroundColor: '#eff6ff',
        borderRadius: 12,
        padding: 16,
        fontSize: 14,
        color: '#1e40af',
      },
      content: '💰 Comparativo de Economia\n\nSem COESA: {{valor_sem_coesa}}\nCom COESA: {{valor_com_coesa}}\n\n✅ Você economiza: {{economia_mensal}}/mês',
      locked: false,
    }),
    preview: (
      <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex justify-between text-[10px]">
          <div className="text-center">
            <div className="text-red-500 font-semibold">R$ 450</div>
            <div className="text-gray-500">Sem COESA</div>
          </div>
          <div className="text-lg">→</div>
          <div className="text-center">
            <div className="text-emerald-600 font-semibold">R$ 420</div>
            <div className="text-gray-500">Com COESA</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'sofia-cta',
    name: 'CTA sofIA',
    description: 'Banner para contato via WhatsApp com a sofIA',
    icon: <MessageSquare className="w-5 h-5 text-orange-500" />,
    category: 'info',
    create: () => ({
      type: 'shape' as const,
      x: 40,
      y: 60,
      width: A4_WIDTH - 80,
      height: 70,
      rotation: 0,
      style: {
        backgroundColor: '#f97316',
        borderRadius: 16,
        padding: 16,
      },
      content: 'Economize {{economia_mensal}}/mês\nQuer saber mais? Tire suas dúvidas com a sofIA!',
      locked: false,
    }),
    preview: (
      <div className="mt-2 p-2 bg-gradient-to-r from-orange-400 to-amber-400 rounded-lg text-white text-center">
        <div className="text-xs font-semibold">Economize R$ 50,57/mês</div>
        <div className="text-[10px] opacity-90">Tire suas dúvidas com a sofIA!</div>
      </div>
    ),
  },
  {
    id: 'fidelity-badge',
    name: 'Badge de Fidelidade',
    description: 'Destaque do tempo de fidelidade selecionado',
    icon: <Clock className="w-5 h-5 text-purple-500" />,
    category: 'info',
    create: () => ({
      type: 'shape' as const,
      x: 300,
      y: 80,
      width: 180,
      height: 40,
      rotation: 0,
      style: {
        backgroundColor: '#8b5cf6',
        borderRadius: 20,
        padding: 8,
      },
      content: '{{fidelidade_anos}} anos de economia',
      locked: false,
    }),
    preview: (
      <div className="mt-2 flex justify-center">
        <div className="px-3 py-1 bg-purple-500 text-white rounded-full text-xs font-medium">
          5 anos de economia
        </div>
      </div>
    ),
  },
  {
    id: 'rating-stars',
    name: 'Avaliação de Clientes',
    description: 'Estrelas de avaliação e depoimento',
    icon: <Star className="w-5 h-5 text-yellow-500" />,
    category: 'info',
    create: () => ({
      type: 'text' as const,
      x: 40,
      y: 800,
      width: A4_WIDTH - 80,
      height: 80,
      rotation: 0,
      style: {
        backgroundColor: '#fefce8',
        borderRadius: 12,
        padding: 12,
        fontSize: 12,
        textAlign: 'center' as const,
        color: '#854d0e',
      },
      content: '⭐⭐⭐⭐⭐\n"Excelente serviço! Economizei mais do que esperava."\n— Cliente satisfeito',
      locked: false,
    }),
    preview: (
      <div className="mt-2 p-2 bg-yellow-50 rounded-lg border border-yellow-200 text-center">
        <div className="text-yellow-400 text-sm">★★★★★</div>
        <div className="text-[9px] text-yellow-800 italic">"Economizei muito!"</div>
      </div>
    ),
  },
];

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  interativo: { label: 'Interativos', icon: <Sparkles className="w-4 h-4" /> },
  visualizacao: { label: 'Visualização', icon: <BarChart3 className="w-4 h-4" /> },
  info: { label: 'Informativos', icon: <MessageSquare className="w-4 h-4" /> },
};

// Draggable widget card component
function DraggableWidgetCard({ 
  widget, 
  onClick 
}: { 
  widget: WidgetDefinition; 
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `widget-${widget.id}`,
    data: {
      type: 'widget',
      widgetId: widget.id,
    },
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group",
        isDragging && "opacity-50 z-50"
      )}
    >
      {/* Drag handle */}
      <div
        {...listeners}
        {...attributes}
        className={cn(
          "absolute left-1 top-3 p-1.5 rounded cursor-grab active:cursor-grabbing z-10",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          "bg-muted/80 hover:bg-muted"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3 h-3 text-muted-foreground" />
      </div>

      {/* Card content */}
      <div
        className={cn(
          "p-3 pl-7 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/50 cursor-pointer transition-all",
          "hover:shadow-sm active:scale-[0.98]",
          isDragging && "border-primary shadow-lg"
        )}
        onClick={onClick}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-background shadow-sm">
            {widget.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium truncate">{widget.name}</h4>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {widget.description}
            </p>
          </div>
        </div>
        {widget.preview}
      </div>
    </div>
  );
}

export function WidgetsPanel({ onAddElement }: WidgetsPanelProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    interativo: true,
    visualizacao: true,
    info: true,
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const groupedWidgets = WIDGETS.reduce((acc, widget) => {
    if (!acc[widget.category]) {
      acc[widget.category] = [];
    }
    acc[widget.category].push(widget);
    return acc;
  }, {} as Record<string, WidgetDefinition[]>);

  const handleAddWidget = (widget: WidgetDefinition) => {
    onAddElement(widget.create());
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b bg-gradient-to-r from-primary/5 to-primary/10">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-sm">Widgets</h3>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Arraste para o canvas ou clique
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {Object.entries(groupedWidgets).map(([category, widgets]) => (
            <Collapsible 
              key={category} 
              open={openSections[category]} 
              onOpenChange={() => toggleSection(category)}
            >
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between px-2 h-8">
                  <span className="flex items-center gap-2 text-sm">
                    {CATEGORY_LABELS[category]?.icon}
                    {CATEGORY_LABELS[category]?.label}
                  </span>
                  {openSections[category] ? 
                    <ChevronDown className="w-4 h-4" /> : 
                    <ChevronRight className="w-4 h-4" />
                  }
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 mt-2 px-1">
                {widgets.map((widget) => (
                  <DraggableWidgetCard
                    key={widget.id}
                    widget={widget}
                    onClick={() => handleAddWidget(widget)}
                  />
                ))}
              </CollapsibleContent>
              
              {category !== 'info' && <Separator className="my-2" />}
            </Collapsible>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
