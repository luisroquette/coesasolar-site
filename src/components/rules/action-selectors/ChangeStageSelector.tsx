/**
 * ChangeStageSelector - Seletor de Ação "Alterar Etapa"
 * 
 * Implementação específica do CatalogActionSelector para etapas do Bitrix24
 */

import React from 'react';
import { CatalogActionSelector } from '../CatalogActionSelector';
import { RULE_ACTION_META } from '@/types/rule-action';
import type { BitrixStageDefinition } from '@/types/catalog';
import type { ChangeStageAction } from '@/types/rule-action';

interface ChangeStageSelectorProps {
  /** Etapas disponíveis no catálogo */
  stages: BitrixStageDefinition[];
  /** Ação atual (para pré-selecionar) */
  action: Partial<ChangeStageAction>;
  /** Callback quando uma etapa é selecionada */
  onChange: (action: Partial<ChangeStageAction>) => void;
  /** Se está desabilitado */
  disabled?: boolean;
}

export function ChangeStageSelector({
  stages,
  action,
  onChange,
  disabled,
}: ChangeStageSelectorProps) {
  const handleSelect = (stage: BitrixStageDefinition | null) => {
    if (stage) {
      onChange({
        ...action,
        kind: 'changeStage',
        target: stage.target,
        value: stage.id,
      });
    } else {
      onChange({
        ...action,
        kind: 'changeStage',
        target: 'STAGE_ID',
        value: '',
      });
    }
  };

  const formatOption = (stage: BitrixStageDefinition): string => {
    return `${stage.label} (${stage.target}: ${stage.id})`;
  };

  return (
    <CatalogActionSelector<BitrixStageDefinition>
      actionMeta={RULE_ACTION_META.changeStage}
      items={stages}
      selectedId={action.value || null}
      onSelect={handleSelect}
      formatOption={formatOption}
      disabled={disabled}
      placeholder="Selecione a etapa destino..."
    />
  );
}

export default ChangeStageSelector;
