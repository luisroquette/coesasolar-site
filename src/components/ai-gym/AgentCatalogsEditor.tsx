/**
 * AgentCatalogsEditor - Editor de Catálogos do Agente
 * 
 * Gerencia todos os catálogos configuráveis do agente:
 * - Etapas do CRM (Bitrix)
 * - Filas de Atendimento
 * - Automações
 * - Responsáveis
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Save, Database, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BitrixStagesCatalog } from '@/components/settings/catalog/BitrixStagesCatalog';
import { QueuesCatalog } from '@/components/settings/catalog/QueuesCatalog';
import { AutomationsCatalog } from '@/components/settings/catalog/AutomationsCatalog';
import { OwnersCatalog } from '@/components/settings/catalog/OwnersCatalog';
import { useCatalogs } from '@/hooks/useCatalogs';

interface AgentCatalogsEditorProps {
  agentId: string;
  agentName: string;
}

export function AgentCatalogsEditor({ agentId, agentName }: AgentCatalogsEditorProps) {
  const {
    catalogs,
    loading,
    saving,
    error,
    saveCatalogs,
    updateQueues,
    updateAutomations,
    updateOwners,
    hasChanges,
  } = useCatalogs({ agentId });

  const handleSave = async () => {
    await saveCatalogs({
      queues: catalogs.queues,
      automations: catalogs.automations,
      owners: catalogs.owners,
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Catálogos de Entidades</CardTitle>
                <CardDescription>
                  Configure os itens disponíveis para seleção nas regras e ações de {agentName}.
                </CardDescription>
              </div>
            </div>
            <Button 
              onClick={handleSave} 
              disabled={saving || !hasChanges}
              size="sm"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Catálogos
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="stages" className="space-y-4">
            <TabsList className="grid grid-cols-4 w-full max-w-xl">
              <TabsTrigger value="stages">Etapas CRM</TabsTrigger>
              <TabsTrigger value="queues">Filas</TabsTrigger>
              <TabsTrigger value="automations">Automações</TabsTrigger>
              <TabsTrigger value="owners">Responsáveis</TabsTrigger>
            </TabsList>

            <TabsContent value="stages">
              <Alert className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  As etapas do CRM são gerenciadas na seção "Configurações &gt; Etapas do Bitrix".
                  Esta visualização mostra as etapas ativas configuradas globalmente.
                </AlertDescription>
              </Alert>
              <BitrixStagesCatalog
                stages={catalogs.bitrixStages || []}
                onChange={() => {}} // Read-only for now
              />
            </TabsContent>

            <TabsContent value="queues">
              <QueuesCatalog
                queues={catalogs.queues || []}
                onChange={updateQueues}
              />
            </TabsContent>

            <TabsContent value="automations">
              <AutomationsCatalog
                automations={catalogs.automations || []}
                onChange={updateAutomations}
              />
            </TabsContent>

            <TabsContent value="owners">
              <OwnersCatalog
                owners={catalogs.owners || []}
                onChange={updateOwners}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {hasChanges && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Você tem alterações não salvas. Clique em "Salvar Catálogos" para persistir as mudanças.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default AgentCatalogsEditor;
