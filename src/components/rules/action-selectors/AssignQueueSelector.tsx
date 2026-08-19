/**
 * AssignQueueSelector - Seletor de Ação "Atribuir Fila"
 * 
 * Implementação específica do CatalogActionSelector para filas
 */

import React from 'react';
import { CatalogActionSelector } from '../CatalogActionSelector';
import { RULE_ACTION_META } from '@/types/rule-action';
import type { QueueDefinition } from '@/types/catalog';
import type { AssignQueueAction } from '@/types/rule-action';

interface AssignQueueSelectorProps {
  /** Filas disponíveis no catálogo */
  queues: QueueDefinition[];
  /** Ação atual (para pré-selecionar) */
  action: Partial<AssignQueueAction>;
  /** Callback quando uma fila é selecionada */
  onChange: (action: Partial<AssignQueueAction>) => void;
  /** Se está desabilitado */
  disabled?: boolean;
}

export function AssignQueueSelector({
  queues,
  action,
  onChange,
  disabled,
}: AssignQueueSelectorProps) {
  const handleSelect = (queue: QueueDefinition | null) => {
    if (queue) {
      onChange({
        ...action,
        kind: 'assignQueue',
        value: queue.id,
      });
    } else {
      onChange({
        ...action,
        kind: 'assignQueue',
        value: '',
      });
    }
  };

  const formatOption = (queue: QueueDefinition): string => {
    const parts = [queue.label];
    if (queue.department) {
      parts.push(`• ${queue.department}`);
    }
    return parts.join(' ');
  };

  return (
    <CatalogActionSelector<QueueDefinition>
      actionMeta={RULE_ACTION_META.assignQueue}
      items={queues}
      selectedId={action.value || null}
      onSelect={handleSelect}
      formatOption={formatOption}
      disabled={disabled}
      placeholder="Selecione a fila..."
    />
  );
}

export default AssignQueueSelector;
