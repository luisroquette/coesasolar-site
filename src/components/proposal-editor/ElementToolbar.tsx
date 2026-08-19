import { useState } from 'react';
import { 
  Type, 
  Square, 
  Circle, 
  Minus, 
  Image as ImageIcon, 
  Variable, 
  Heading1, 
  Heading2, 
  AlignLeft,
  QrCode,
  ChevronDown,
  ChevronRight,
  Upload
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { CanvasElementData, ELEMENT_PRESETS, DYNAMIC_FIELDS } from './types';

interface ElementToolbarProps {
  onAddElement: (element: Omit<CanvasElementData, 'id' | 'zIndex'>) => void;
}

export function ElementToolbar({ onAddElement }: ElementToolbarProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    textos: true,
    formas: true,
    campos: true,
    imagens: true,
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const createTextElement = (preset: keyof typeof ELEMENT_PRESETS) => {
    const config = ELEMENT_PRESETS[preset];
    onAddElement({
      type: config.type,
      x: 100,
      y: 100,
      width: config.width,
      height: config.height,
      rotation: 0,
      style: config.style,
      content: config.content,
      locked: false,
    });
  };

  const createDynamicField = (fieldKey: string, label: string) => {
    onAddElement({
      type: 'dynamic-field',
      x: 100,
      y: 100,
      width: 200,
      height: 30,
      rotation: 0,
      style: {
        fontSize: 14,
        fontWeight: 'normal',
        color: '#1f2937',
        backgroundColor: '#fef3c7',
        borderRadius: 4,
        padding: 4,
      },
      content: fieldKey,
      locked: false,
    });
  };

  const createQRCode = () => {
    onAddElement({
      type: 'qr-code',
      x: 100,
      y: 100,
      width: 120,
      height: 120,
      rotation: 0,
      style: {},
      content: '{{qr_whatsapp}}',
      locked: false,
    });
  };

  const handleImageUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          onAddElement({
            type: 'image',
            x: 100,
            y: 100,
            width: 200,
            height: 150,
            rotation: 0,
            style: {
              borderRadius: 4,
            },
            content: event.target?.result as string,
            locked: false,
          });
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const groupedFields = DYNAMIC_FIELDS.reduce((acc, field) => {
    if (!acc[field.category]) {
      acc[field.category] = [];
    }
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, typeof DYNAMIC_FIELDS[number][]>);

  const categoryLabels: Record<string, string> = {
    cliente: 'Cliente',
    comercial: 'Comercial',
    instalacao: 'Instalação',
    documento: 'Documento',
    especial: 'Especiais',
  };

  return (
    <div className="w-64 border-r bg-card flex flex-col">
      <div className="p-4 border-b">
        <h3 className="font-semibold text-sm">Elementos</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Clique para adicionar ao canvas
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {/* Textos */}
          <Collapsible open={openSections.textos} onOpenChange={() => toggleSection('textos')}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-2 h-8">
                <span className="flex items-center gap-2 text-sm">
                  <Type className="w-4 h-4" />
                  Textos
                </span>
                {openSections.textos ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 mt-1">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => createTextElement('heading')}
              >
                <Heading1 className="w-4 h-4" />
                Título
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => createTextElement('subheading')}
              >
                <Heading2 className="w-4 h-4" />
                Subtítulo
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => createTextElement('paragraph')}
              >
                <AlignLeft className="w-4 h-4" />
                Parágrafo
              </Button>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Formas */}
          <Collapsible open={openSections.formas} onOpenChange={() => toggleSection('formas')}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-2 h-8">
                <span className="flex items-center gap-2 text-sm">
                  <Square className="w-4 h-4" />
                  Formas
                </span>
                {openSections.formas ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 mt-1">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => createTextElement('rectangle')}
              >
                <Square className="w-4 h-4" />
                Retângulo
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => createTextElement('circle')}
              >
                <Circle className="w-4 h-4" />
                Círculo
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => createTextElement('line')}
              >
                <Minus className="w-4 h-4" />
                Linha
              </Button>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Imagens */}
          <Collapsible open={openSections.imagens} onOpenChange={() => toggleSection('imagens')}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-2 h-8">
                <span className="flex items-center gap-2 text-sm">
                  <ImageIcon className="w-4 h-4" />
                  Imagens
                </span>
                {openSections.imagens ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 mt-1">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={handleImageUpload}
              >
                <Upload className="w-4 h-4" />
                Upload Imagem
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={createQRCode}
              >
                <QrCode className="w-4 h-4" />
                QR Code WhatsApp
              </Button>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Campos Dinâmicos */}
          <Collapsible open={openSections.campos} onOpenChange={() => toggleSection('campos')}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-2 h-8">
                <span className="flex items-center gap-2 text-sm">
                  <Variable className="w-4 h-4" />
                  Campos Dinâmicos
                </span>
                {openSections.campos ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 mt-2">
              {Object.entries(groupedFields).map(([category, fields]) => (
                <div key={category}>
                  <p className="text-xs font-medium text-muted-foreground px-2 mb-1">
                    {categoryLabels[category] || category}
                  </p>
                  <div className="space-y-1">
                    {fields.map((field) => (
                      <Button
                        key={field.key}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-2 h-7 text-xs"
                        onClick={() => createDynamicField(field.key, field.label)}
                      >
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        {field.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </ScrollArea>
    </div>
  );
}
