/**
 * OwnersCatalog - Gerenciador de Proprietários/Responsáveis
 * 
 * Implementação específica do CatalogManager para responsáveis
 */

import React from 'react';
import { UserCheck } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { CatalogManager } from '../CatalogManager';
import type { OwnerDefinition } from '@/types/catalog';

interface OwnersCatalogProps {
  owners: OwnerDefinition[];
  onChange: (owners: OwnerDefinition[]) => void;
}

export function OwnersCatalog({ owners, onChange }: OwnersCatalogProps) {
  const createEmptyOwner = (): OwnerDefinition => ({
    id: '',
    label: '',
    bitrixUserId: '',
    email: '',
    department: '',
  });

  const renderExtraFields = (
    item: OwnerDefinition,
    onItemChange: (item: OwnerDefinition) => void
  ) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label>ID no Bitrix24</Label>
        <Input
          value={item.bitrixUserId || ''}
          onChange={(e) => onItemChange({ ...item, bitrixUserId: e.target.value })}
          placeholder="Ex: 123"
          className="font-mono"
        />
      </div>
      <div className="space-y-2">
        <Label>E-mail</Label>
        <Input
          value={item.email || ''}
          onChange={(e) => onItemChange({ ...item, email: e.target.value })}
          placeholder="usuario@empresa.com"
          type="email"
        />
      </div>
      <div className="space-y-2">
        <Label>Departamento</Label>
        <Input
          value={item.department || ''}
          onChange={(e) => onItemChange({ ...item, department: e.target.value })}
          placeholder="Ex: Comercial"
        />
      </div>
    </div>
  );

  const formatItemDisplay = (item: OwnerDefinition) => ({
    primary: item.label,
    secondary: [item.department, item.email].filter(Boolean).join(' • '),
  });

  return (
    <CatalogManager<OwnerDefinition>
      title="Responsáveis"
      description="Configure os responsáveis disponíveis para atribuição de leads"
      items={owners}
      onChange={onChange}
      createEmptyItem={createEmptyOwner}
      renderExtraFields={renderExtraFields}
      formatItemDisplay={formatItemDisplay}
      icon={<UserCheck className="h-5 w-5 text-green-500" />}
      idPlaceholder="Ex: OWNER_JOAO"
      labelPlaceholder="Ex: João Silva"
      addButtonText="Adicionar responsável"
    />
  );
}

export default OwnersCatalog;
