/**
 * AssignOwnerSelector - Seletor de Ação "Atribuir Responsável"
 * 
 * Implementação específica do CatalogActionSelector para proprietários
 */

import React from 'react';
import { CatalogActionSelector } from '../CatalogActionSelector';
import { RULE_ACTION_META } from '@/types/rule-action';
import type { OwnerDefinition } from '@/types/catalog';
import type { AssignOwnerAction } from '@/types/rule-action';

interface AssignOwnerSelectorProps {
  /** Responsáveis disponíveis no catálogo */
  owners: OwnerDefinition[];
  /** Ação atual (para pré-selecionar) */
  action: Partial<AssignOwnerAction>;
  /** Callback quando um responsável é selecionado */
  onChange: (action: Partial<AssignOwnerAction>) => void;
  /** Se está desabilitado */
  disabled?: boolean;
}

export function AssignOwnerSelector({
  owners,
  action,
  onChange,
  disabled,
}: AssignOwnerSelectorProps) {
  const handleSelect = (owner: OwnerDefinition | null) => {
    if (owner) {
      onChange({
        ...action,
        kind: 'assignOwner',
        value: owner.id,
        bitrixUserId: owner.bitrixUserId,
      });
    } else {
      onChange({
        ...action,
        kind: 'assignOwner',
        value: '',
        bitrixUserId: undefined,
      });
    }
  };

  const formatOption = (owner: OwnerDefinition): string => {
    const parts = [owner.label];
    if (owner.department) {
      parts.push(`• ${owner.department}`);
    }
    return parts.join(' ');
  };

  return (
    <CatalogActionSelector<OwnerDefinition>
      actionMeta={RULE_ACTION_META.assignOwner}
      items={owners}
      selectedId={action.value || null}
      onSelect={handleSelect}
      formatOption={formatOption}
      disabled={disabled}
      placeholder="Selecione o responsável..."
    />
  );
}

export default AssignOwnerSelector;
