/**
 * ActionSummary - Componente de Resumo de Ação
 * 
 * Exibe um resumo visual de uma ação de regra, mostrando
 * o label fixo da ação e o item selecionado do catálogo.
 * 
 * FASE 7: Usa o catalog-mapper para resolver labels amigáveis.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import * as LucideIcons from 'lucide-react';
import { RULE_ACTION_META } from '@/types/rule-action';
import { getActionDisplayLabel } from '@/lib/catalog-mapper';
import type { RuleAction } from '@/types/rule-action';
import type { CatalogMap } from '@/types/catalog';

// ============================================================================
// DYNAMIC ICON
// ============================================================================

function DynamicIcon({ 
  name, 
  className 
}: { 
  name: string; 
  className?: string 
}) {
  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  if (!IconComponent) return null;
  return <IconComponent className={className} />;
}

// ============================================================================
// TYPES
// ============================================================================

interface ActionSummaryProps {
  /** Ação a ser exibida */
  action: RuleAction;
  /** Catálogos para resolver labels */
  catalogs: CatalogMap;
  /** Tamanho do componente */
  size?: 'sm' | 'md' | 'lg';
  /** Se está inválido (item não encontrado no catálogo) */
  showValidation?: boolean;
  /** Classe adicional */
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ActionSummary({
  action,
  catalogs,
  size = 'md',
  showValidation = false,
  className,
}: ActionSummaryProps) {
  const meta = RULE_ACTION_META[action.kind];
  const displayLabel = getActionDisplayLabel(action, catalogs);
  const hasValue = 'value' in action && action.value;
  const isUnresolved = hasValue && displayLabel.startsWith('ID:');

  // Size variants
  const sizeClasses = {
    sm: 'text-xs gap-1.5 p-1.5',
    md: 'text-sm gap-2 p-2',
    lg: 'text-base gap-3 p-3',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <div
      className={cn(
        'flex items-center rounded-lg border bg-card',
        sizeClasses[size],
        showValidation && isUnresolved && 'border-destructive/50 bg-destructive/5',
        className
      )}
    >
      {/* Icon */}
      <div className={cn('rounded-md p-1', meta.color, 'text-white')}>
        <DynamicIcon name={meta.icon} className={iconSizes[size]} />
      </div>

      {/* Action Label */}
      <span className="font-medium text-foreground">{meta.label}</span>

      {/* Arrow */}
      <DynamicIcon name="ArrowRight" className={cn('text-muted-foreground', iconSizes[size])} />

      {/* Selected Item */}
      <Badge
        variant={isUnresolved ? 'destructive' : 'secondary'}
        className={cn(size === 'sm' && 'text-xs')}
      >
        {displayLabel}
      </Badge>

      {/* Validation Warning */}
      {showValidation && isUnresolved && (
        <DynamicIcon 
          name="AlertTriangle" 
          className={cn('text-destructive ml-auto', iconSizes[size])} 
        />
      )}
    </div>
  );
}

// ============================================================================
// COMPACT VARIANT
// ============================================================================

interface ActionBadgeProps {
  action: RuleAction;
  catalogs: CatalogMap;
  className?: string;
}

/**
 * Versão compacta em badge único
 */
export function ActionBadge({ action, catalogs, className }: ActionBadgeProps) {
  const meta = RULE_ACTION_META[action.kind];
  const displayLabel = getActionDisplayLabel(action, catalogs);

  return (
    <Badge variant="outline" className={cn('gap-1.5', className)}>
      <DynamicIcon name={meta.icon} className="h-3 w-3" />
      <span>{meta.label}:</span>
      <span className="font-semibold">{displayLabel}</span>
    </Badge>
  );
}

// ============================================================================
// LIST VARIANT
// ============================================================================

interface ActionListSummaryProps {
  actions: RuleAction[];
  catalogs: CatalogMap;
  size?: 'sm' | 'md' | 'lg';
  showValidation?: boolean;
  className?: string;
}

/**
 * Lista de ações com resumo
 */
export function ActionListSummary({
  actions,
  catalogs,
  size = 'md',
  showValidation = false,
  className,
}: ActionListSummaryProps) {
  if (actions.length === 0) {
    return (
      <div className={cn('text-muted-foreground text-sm italic', className)}>
        Nenhuma ação configurada
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {actions.map((action, index) => (
        <ActionSummary
          key={action.actionId || index}
          action={action}
          catalogs={catalogs}
          size={size}
          showValidation={showValidation}
        />
      ))}
    </div>
  );
}

export default ActionSummary;
