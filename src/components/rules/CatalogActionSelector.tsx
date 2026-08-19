/**
 * CatalogActionSelector - Componente Genérico de Seleção de Ação + Catálogo
 * 
 * Exibe uma ação fixa (não editável) com um select de itens do catálogo.
 * Segue o padrão "Ação Fixa + Seleção de Catálogo"
 * 
 * @see src/types/catalog.ts - Tipos de catálogo
 * @see src/types/rule-action.ts - Tipos de ação
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { CatalogItem } from '@/types/catalog';
import type { RuleActionKind, RuleActionMeta } from '@/types/rule-action';
import * as LucideIcons from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface CatalogActionSelectorProps<T extends CatalogItem> {
  /** Metadados da ação (label, icon, color, etc.) */
  actionMeta: RuleActionMeta;
  /** Itens do catálogo para popular o select */
  items: T[];
  /** ID do item selecionado (null se nenhum) */
  selectedId: string | null;
  /** Callback quando um item é selecionado */
  onSelect: (item: T | null) => void;
  /** Label customizado para o select (sobrescreve actionMeta.catalogSelectLabel) */
  selectLabel?: string;
  /** Placeholder do select */
  placeholder?: string;
  /** Se o select está desabilitado */
  disabled?: boolean;
  /** Função para formatar a exibição de cada opção */
  formatOption?: (item: T) => string;
  /** Mostrar badge de ação (default: true) */
  showActionBadge?: boolean;
  /** Layout: inline ou stacked */
  layout?: 'inline' | 'stacked';
  /** Classe CSS adicional */
  className?: string;
}

// ============================================================================
// HELPER: Dynamic Icon
// ============================================================================

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  if (!IconComponent) {
    return <LucideIcons.HelpCircle className={className} />;
  }
  return <IconComponent className={className} />;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CatalogActionSelector<T extends CatalogItem>({
  actionMeta,
  items,
  selectedId,
  onSelect,
  selectLabel,
  placeholder = 'Selecione...',
  disabled = false,
  formatOption,
  showActionBadge = true,
  layout = 'stacked',
  className,
}: CatalogActionSelectorProps<T>) {
  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSelect = (value: string) => {
    if (value === '__none__') {
      onSelect(null);
      return;
    }
    const item = items.find((i) => i.id === value);
    onSelect(item || null);
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const defaultFormatOption = (item: T): string => {
    return `${item.label} (${item.id})`;
  };

  const renderOption = formatOption || defaultFormatOption;

  const selectedItem = selectedId ? items.find((i) => i.id === selectedId) : null;

  // ============================================================================
  // RENDER
  // ============================================================================

  const isInline = layout === 'inline';

  return (
    <div
      className={cn(
        'space-y-3',
        isInline && 'flex items-center gap-4 space-y-0',
        className
      )}
    >
      {/* Action Badge */}
      {showActionBadge && (
        <div className={cn('flex items-center gap-2', isInline && 'shrink-0')}>
          <Badge
            variant="secondary"
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium',
              actionMeta.color,
              'text-white'
            )}
          >
            <DynamicIcon name={actionMeta.icon} className="h-4 w-4" />
            {actionMeta.label}
          </Badge>
        </div>
      )}

      {/* Select */}
      <div className={cn('space-y-1.5', isInline && 'flex-1')}>
        <Label className="text-sm text-muted-foreground">
          {selectLabel || actionMeta.catalogSelectLabel || 'Selecione'}
        </Label>
        <Select
          value={selectedId || '__none__'}
          onValueChange={handleSelect}
          disabled={disabled || items.length === 0}
        >
          <SelectTrigger className={cn(items.length === 0 && 'opacity-50')}>
            <SelectValue placeholder={placeholder}>
              {selectedItem ? selectedItem.label : placeholder}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-muted-foreground">
              {placeholder}
            </SelectItem>
            {items.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {renderOption(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum item cadastrado. Configure primeiro nas configurações do agente.
          </p>
        )}
      </div>
    </div>
  );
}

export default CatalogActionSelector;
