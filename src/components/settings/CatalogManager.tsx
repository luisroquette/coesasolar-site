/**
 * CatalogManager - Componente Genérico de Gerenciamento de Catálogos
 * 
 * Componente reaproveitável para CRUD de itens de catálogo.
 * Segue o padrão "Ação Fixa + Seleção de Catálogo"
 * 
 * @see src/types/catalog.ts - Tipos base
 * @see .lovable/plan.md - Seção "Padrão Reaproveitável"
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Edit2, Check, X, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CatalogItem } from '@/types/catalog';

// ============================================================================
// TYPES
// ============================================================================

export interface CatalogManagerProps<T extends CatalogItem> {
  /** Título da seção */
  title: string;
  /** Descrição da seção */
  description: string;
  /** Itens atuais do catálogo */
  items: T[];
  /** Callback quando os itens mudam */
  onChange: (items: T[]) => void;
  /** Função para renderizar campos extras do item */
  renderExtraFields?: (item: T, onChange: (item: T) => void) => React.ReactNode;
  /** Função para criar um item vazio */
  createEmptyItem: () => T;
  /** Ícone opcional para o header */
  icon?: React.ReactNode;
  /** Placeholder para o campo ID */
  idPlaceholder?: string;
  /** Placeholder para o campo Label */
  labelPlaceholder?: string;
  /** Se permite reordenação */
  allowReorder?: boolean;
  /** Número máximo de itens */
  maxItems?: number;
  /** Texto do botão de adicionar */
  addButtonText?: string;
  /** Validação customizada */
  validateItem?: (item: T, allItems: T[]) => string | null;
  /** Formatar exibição do item na lista */
  formatItemDisplay?: (item: T) => { primary: string; secondary?: string };
}

interface EditingState<T> {
  index: number | null;
  item: T | null;
  isNew: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CatalogManager<T extends CatalogItem>({
  title,
  description,
  items,
  onChange,
  renderExtraFields,
  createEmptyItem,
  icon,
  idPlaceholder = 'ID técnico (ex: ITEM_001)',
  labelPlaceholder = 'Nome amigável',
  allowReorder = false,
  maxItems,
  addButtonText = 'Adicionar item',
  validateItem,
  formatItemDisplay,
}: CatalogManagerProps<T>) {
  const [editing, setEditing] = useState<EditingState<T>>({
    index: null,
    item: null,
    isNew: false,
  });
  const [error, setError] = useState<string | null>(null);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleAdd = () => {
    if (maxItems && items.length >= maxItems) {
      setError(`Máximo de ${maxItems} itens permitido`);
      return;
    }
    setEditing({
      index: items.length,
      item: createEmptyItem(),
      isNew: true,
    });
    setError(null);
  };

  const handleEdit = (index: number) => {
    setEditing({
      index,
      item: { ...items[index] },
      isNew: false,
    });
    setError(null);
  };

  const handleCancel = () => {
    setEditing({ index: null, item: null, isNew: false });
    setError(null);
  };

  const handleSave = () => {
    if (!editing.item) return;

    // Validação básica
    if (!editing.item.id.trim()) {
      setError('ID é obrigatório');
      return;
    }
    if (!editing.item.label.trim()) {
      setError('Nome é obrigatório');
      return;
    }

    // Verificar ID duplicado
    const isDuplicate = items.some(
      (item, idx) => item.id === editing.item!.id && idx !== editing.index
    );
    if (isDuplicate) {
      setError('Já existe um item com este ID');
      return;
    }

    // Validação customizada
    if (validateItem) {
      const validationError = validateItem(editing.item, items);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    // Salvar
    const newItems = [...items];
    if (editing.isNew) {
      newItems.push(editing.item);
    } else if (editing.index !== null) {
      newItems[editing.index] = editing.item;
    }

    onChange(newItems);
    handleCancel();
  };

  const handleDelete = (index: number) => {
    const newItems = items.filter((_, idx) => idx !== index);
    onChange(newItems);
  };

  const handleItemChange = (updates: Partial<T>) => {
    if (!editing.item) return;
    setEditing({
      ...editing,
      item: { ...editing.item, ...updates },
    });
    setError(null);
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const renderItemDisplay = (item: T) => {
    if (formatItemDisplay) {
      const { primary, secondary } = formatItemDisplay(item);
      return (
        <div className="flex flex-col">
          <span className="font-medium">{primary}</span>
          {secondary && (
            <span className="text-xs text-muted-foreground">{secondary}</span>
          )}
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <span className="font-medium">{item.label}</span>
        <Badge variant="secondary" className="font-mono text-xs">
          {item.id}
        </Badge>
      </div>
    );
  };

  const renderEditForm = () => {
    if (!editing.item) return null;

    return (
      <Card className="border-primary/50 bg-muted/30">
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="catalog-id">ID Técnico *</Label>
              <Input
                id="catalog-id"
                value={editing.item.id}
                onChange={(e) => handleItemChange({ id: e.target.value } as Partial<T>)}
                placeholder={idPlaceholder}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-label">Nome *</Label>
              <Input
                id="catalog-label"
                value={editing.item.label}
                onChange={(e) => handleItemChange({ label: e.target.value } as Partial<T>)}
                placeholder={labelPlaceholder}
              />
            </div>
          </div>

          {renderExtraFields && renderExtraFields(editing.item, (updatedItem) => {
            setEditing({ ...editing, item: updatedItem });
          })}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-4 w-4 mr-1" />
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Check className="h-4 w-4 mr-1" />
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAdd}
            disabled={editing.index !== null || (maxItems !== undefined && items.length >= maxItems)}
          >
            <Plus className="h-4 w-4 mr-1" />
            {addButtonText}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Lista de itens */}
        {items.length === 0 && editing.index === null ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum item cadastrado. Clique em "{addButtonText}" para adicionar.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={item.id || index}>
                {editing.index === index && !editing.isNew ? (
                  renderEditForm()
                ) : (
                  <div
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border bg-card",
                      "hover:bg-accent/50 transition-colors"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {allowReorder && (
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      )}
                      {renderItemDisplay(item)}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(index)}
                        disabled={editing.index !== null}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(index)}
                        disabled={editing.index !== null}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Formulário de novo item */}
        {editing.isNew && renderEditForm()}

        {/* Info de limite */}
        {maxItems && (
          <p className="text-xs text-muted-foreground text-right">
            {items.length} / {maxItems} itens
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default CatalogManager;
