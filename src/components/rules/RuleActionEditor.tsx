/**
 * RuleActionEditor - Editor Unificado de Ações de Regra
 * 
 * Renderiza o seletor apropriado baseado no tipo de ação (kind).
 * Usa os catálogos passados para popular os selects.
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { ChangeStageSelector } from './action-selectors/ChangeStageSelector';
import { AssignQueueSelector } from './action-selectors/AssignQueueSelector';
import { AssignOwnerSelector } from './action-selectors/AssignOwnerSelector';
import { TriggerAutomationSelector } from './action-selectors/TriggerAutomationSelector';
import type { CatalogMap } from '@/types/catalog';
import type { RuleAction, RuleActionKind } from '@/types/rule-action';

// ============================================================================
// TYPES
// ============================================================================

interface RuleActionEditorProps {
  /** Ação sendo editada */
  action: RuleAction;
  /** Callback quando a ação muda */
  onChange: (action: RuleAction) => void;
  /** Callback para remover a ação */
  onRemove?: () => void;
  /** Catálogos disponíveis */
  catalogs: CatalogMap;
  /** Se está desabilitado */
  disabled?: boolean;
  /** Mostrar botão de remover */
  showRemove?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function RuleActionEditor({
  action,
  onChange,
  onRemove,
  catalogs,
  disabled = false,
  showRemove = true,
}: RuleActionEditorProps) {
  // ============================================================================
  // RENDER BY KIND
  // ============================================================================

  const renderActionSelector = () => {
    switch (action.kind) {
      case 'changeStage':
        return (
          <ChangeStageSelector
            stages={catalogs.bitrixStages || []}
            action={action}
            onChange={(updated) => onChange({ ...action, ...updated } as RuleAction)}
            disabled={disabled}
          />
        );

      case 'assignQueue':
        return (
          <AssignQueueSelector
            queues={catalogs.queues || []}
            action={action}
            onChange={(updated) => onChange({ ...action, ...updated } as RuleAction)}
            disabled={disabled}
          />
        );

      case 'assignOwner':
        return (
          <AssignOwnerSelector
            owners={catalogs.owners || []}
            action={action}
            onChange={(updated) => onChange({ ...action, ...updated } as RuleAction)}
            disabled={disabled}
          />
        );

      case 'triggerAutomation':
        return (
          <TriggerAutomationSelector
            automations={catalogs.automations || []}
            action={action}
            onChange={(updated) => onChange({ ...action, ...updated } as RuleAction)}
            disabled={disabled}
          />
        );

      // Para ações que não usam catálogo, mostrar placeholder
      default:
        return (
          <div className="text-sm text-muted-foreground p-4 bg-muted/30 rounded-lg">
            Editor para ação "{action.kind}" não implementado.
          </div>
        );
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <Card className="border-dashed">
      <CardContent className="pt-4">
        <div className="flex items-start gap-4">
          <div className="flex-1">{renderActionSelector()}</div>
          {showRemove && onRemove && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              disabled={disabled}
              className="shrink-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default RuleActionEditor;
