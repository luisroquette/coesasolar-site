/**
 * AutomationsCatalog - Gerenciador de Automações
 * 
 * Implementação específica do CatalogManager para automações/webhooks
 */

import React from 'react';
import { Zap } from 'lucide-react';
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
import type { AutomationDefinition } from '@/types/catalog';

interface AutomationsCatalogProps {
  automations: AutomationDefinition[];
  onChange: (automations: AutomationDefinition[]) => void;
}

export function AutomationsCatalog({ automations, onChange }: AutomationsCatalogProps) {
  const createEmptyAutomation = (): AutomationDefinition => ({
    id: '',
    label: '',
    type: 'webhook',
    webhookUrl: '',
  });

  const renderExtraFields = (
    item: AutomationDefinition,
    onItemChange: (item: AutomationDefinition) => void
  ) => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Tipo de Automação</Label>
        <Select
          value={item.type || 'webhook'}
          onValueChange={(value: 'webhook' | 'internal' | 'bitrix_bp') =>
            onItemChange({ ...item, type: value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="webhook">Webhook externo</SelectItem>
            <SelectItem value="internal">Automação interna</SelectItem>
            <SelectItem value="bitrix_bp">Business Process (Bitrix)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {item.type === 'webhook' && (
        <div className="space-y-2">
          <Label>URL do Webhook</Label>
          <Input
            value={item.webhookUrl || ''}
            onChange={(e) => onItemChange({ ...item, webhookUrl: e.target.value })}
            placeholder="https://..."
            type="url"
          />
        </div>
      )}

      {item.type === 'bitrix_bp' && (
        <div className="space-y-2">
          <Label>ID do Business Process</Label>
          <Input
            value={item.bitrixBpId || ''}
            onChange={(e) => onItemChange({ ...item, bitrixBpId: e.target.value })}
            placeholder="Ex: BP_123"
            className="font-mono"
          />
        </div>
      )}
    </div>
  );

  const formatItemDisplay = (item: AutomationDefinition) => {
    const typeLabels = {
      webhook: 'Webhook',
      internal: 'Interna',
      bitrix_bp: 'Bitrix BP',
    };
    return {
      primary: item.label,
      secondary: typeLabels[item.type || 'webhook'],
    };
  };

  return (
    <CatalogManager<AutomationDefinition>
      title="Automações"
      description="Configure automações e webhooks disponíveis para disparo"
      items={automations}
      onChange={onChange}
      createEmptyItem={createEmptyAutomation}
      renderExtraFields={renderExtraFields}
      formatItemDisplay={formatItemDisplay}
      icon={<Zap className="h-5 w-5 text-yellow-500" />}
      idPlaceholder="Ex: AUTO_WELCOME_EMAIL"
      labelPlaceholder="Ex: Enviar e-mail de boas-vindas"
      addButtonText="Adicionar automação"
    />
  );
}

export default AutomationsCatalog;
