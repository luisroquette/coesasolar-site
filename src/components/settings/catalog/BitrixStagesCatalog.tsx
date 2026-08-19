/**
 * BitrixStagesCatalog - Gerenciador de Etapas do Bitrix24
 * 
 * Implementação específica do CatalogManager para etapas do CRM
 */

import React from 'react';
import { GitBranch } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CatalogManager } from '../CatalogManager';
import type { BitrixStageDefinition, BitrixStageTarget } from '@/types/catalog';

interface BitrixStagesCatalogProps {
  stages: BitrixStageDefinition[];
  onChange: (stages: BitrixStageDefinition[]) => void;
}

export function BitrixStagesCatalog({ stages, onChange }: BitrixStagesCatalogProps) {
  const createEmptyStage = (): BitrixStageDefinition => ({
    id: '',
    label: '',
    target: 'STAGE_ID',
  });

  const renderExtraFields = (
    item: BitrixStageDefinition,
    onItemChange: (item: BitrixStageDefinition) => void
  ) => (
    <div className="space-y-2">
      <Label>Campo Técnico</Label>
      <Select
        value={item.target}
        onValueChange={(value: BitrixStageTarget) =>
          onItemChange({ ...item, target: value })
        }
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="STAGE_ID">
            STAGE_ID (Etapas customizadas de pipeline)
          </SelectItem>
          <SelectItem value="STATUS_ID">
            STATUS_ID (Estágios genéricos)
          </SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        STAGE_ID: Para etapas customizadas (UC_*, DT*_*). STATUS_ID: Para estágios padrão (NEW, IN_PROCESS, WON, JUNK).
      </p>
    </div>
  );

  const formatItemDisplay = (item: BitrixStageDefinition) => ({
    primary: item.label,
    secondary: `${item.target}: ${item.id}`,
  });

  return (
    <CatalogManager<BitrixStageDefinition>
      title="Etapas do CRM"
      description="Configure as etapas do Bitrix24 disponíveis para movimentação de leads"
      items={stages}
      onChange={onChange}
      createEmptyItem={createEmptyStage}
      renderExtraFields={renderExtraFields}
      formatItemDisplay={formatItemDisplay}
      icon={<GitBranch className="h-5 w-5 text-blue-500" />}
      idPlaceholder="Ex: UC_9SLRPP, NEW, WON"
      labelPlaceholder="Ex: Proposta Inicial, Lead Qualificado"
      addButtonText="Adicionar etapa"
    />
  );
}

export default BitrixStagesCatalog;
