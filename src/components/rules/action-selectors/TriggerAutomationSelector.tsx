/**
 * TriggerAutomationSelector - Seletor de Ação "Disparar Automação"
 * 
 * Implementação específica do CatalogActionSelector para automações
 */

import React from 'react';
import { CatalogActionSelector } from '../CatalogActionSelector';
import { RULE_ACTION_META } from '@/types/rule-action';
import type { AutomationDefinition } from '@/types/catalog';
import type { TriggerAutomationAction } from '@/types/rule-action';

interface TriggerAutomationSelectorProps {
  /** Automações disponíveis no catálogo */
  automations: AutomationDefinition[];
  /** Ação atual (para pré-selecionar) */
  action: Partial<TriggerAutomationAction>;
  /** Callback quando uma automação é selecionada */
  onChange: (action: Partial<TriggerAutomationAction>) => void;
  /** Se está desabilitado */
  disabled?: boolean;
}

export function TriggerAutomationSelector({
  automations,
  action,
  onChange,
  disabled,
}: TriggerAutomationSelectorProps) {
  const handleSelect = (automation: AutomationDefinition | null) => {
    if (automation) {
      onChange({
        ...action,
        kind: 'triggerAutomation',
        value: automation.id,
        webhookUrl: automation.webhookUrl,
      });
    } else {
      onChange({
        ...action,
        kind: 'triggerAutomation',
        value: '',
        webhookUrl: undefined,
      });
    }
  };

  const formatOption = (automation: AutomationDefinition): string => {
    const typeLabels: Record<string, string> = {
      webhook: 'Webhook',
      internal: 'Interna',
      bitrix_bp: 'Bitrix BP',
    };
    const type = typeLabels[automation.type || 'webhook'] || 'Webhook';
    return `${automation.label} (${type})`;
  };

  return (
    <CatalogActionSelector<AutomationDefinition>
      actionMeta={RULE_ACTION_META.triggerAutomation}
      items={automations}
      selectedId={action.value || null}
      onSelect={handleSelect}
      formatOption={formatOption}
      disabled={disabled}
      placeholder="Selecione a automação..."
    />
  );
}

export default TriggerAutomationSelector;
