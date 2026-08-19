/**
 * QueuesCatalog - Gerenciador de Filas de Atendimento
 * 
 * Implementação específica do CatalogManager para filas
 */

import React from 'react';
import { Users } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CatalogManager } from '../CatalogManager';
import type { QueueDefinition } from '@/types/catalog';

interface QueuesCatalogProps {
  queues: QueueDefinition[];
  onChange: (queues: QueueDefinition[]) => void;
}

export function QueuesCatalog({ queues, onChange }: QueuesCatalogProps) {
  const createEmptyQueue = (): QueueDefinition => ({
    id: '',
    label: '',
    department: '',
    type: 'internal',
  });

  const renderExtraFields = (
    item: QueueDefinition,
    onItemChange: (item: QueueDefinition) => void
  ) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Departamento</Label>
        <Input
          value={item.department || ''}
          onChange={(e) => onItemChange({ ...item, department: e.target.value })}
          placeholder="Ex: Comercial, Suporte"
        />
      </div>
      <div className="space-y-2">
        <Label>Tipo</Label>
        <Select
          value={item.type || 'internal'}
          onValueChange={(value: 'internal' | 'external' | 'mixed') =>
            onItemChange({ ...item, type: value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="internal">Interna</SelectItem>
            <SelectItem value="external">Externa</SelectItem>
            <SelectItem value="mixed">Mista</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const formatItemDisplay = (item: QueueDefinition) => ({
    primary: item.label,
    secondary: item.department ? `${item.department} • ${item.type || 'internal'}` : item.type,
  });

  return (
    <CatalogManager<QueueDefinition>
      title="Filas de Atendimento"
      description="Configure as filas disponíveis para distribuição de leads"
      items={queues}
      onChange={onChange}
      createEmptyItem={createEmptyQueue}
      renderExtraFields={renderExtraFields}
      formatItemDisplay={formatItemDisplay}
      icon={<Users className="h-5 w-5 text-purple-500" />}
      idPlaceholder="Ex: QUEUE_VENDAS_001"
      labelPlaceholder="Ex: Fila Vendas"
      addButtonText="Adicionar fila"
    />
  );
}

export default QueuesCatalog;
