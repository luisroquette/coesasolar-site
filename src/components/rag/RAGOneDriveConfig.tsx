import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Cloud, 
  Save, 
  RefreshCw, 
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Key,
  FolderTree
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface OneDriveConfig {
  id: string;
  tenant_id: string | null;
  client_id: string | null;
  drive_id: string | null;
  root_folder_path: string;
  folder_category_mapping: Record<string, string>;
  sync_enabled: boolean;
  sync_interval_hours: number;
  last_sync_at: string | null;
  next_sync_at: string | null;
  is_configured: boolean;
}

interface Props {
  onConfigSaved: () => void;
}

export function RAGOneDriveConfig({ onConfigSaved }: Props) {
  const [config, setConfig] = useState<OneDriveConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const { toast } = useToast();

  // Form state
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [driveId, setDriveId] = useState('');
  const [rootFolderPath, setRootFolderPath] = useState('/COESA Knowledge Base');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncIntervalHours, setSyncIntervalHours] = useState(6);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('rag_onedrive_config')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        const configData: OneDriveConfig = {
          ...data,
          folder_category_mapping: (data.folder_category_mapping || {}) as Record<string, string>,
        };
        setConfig(configData);
        setTenantId(data.tenant_id || '');
        setClientId(data.client_id || '');
        setDriveId(data.drive_id || '');
        // IMPORTANT: allow empty string to persist ("use drive root").
        // Using || would overwrite "" with the default.
        setRootFolderPath((data.root_folder_path ?? '/COESA Knowledge Base') as string);
        setSyncEnabled(data.sync_enabled || false);
        setSyncIntervalHours(data.sync_interval_hours || 6);
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar configuração',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const isConfigured = !!(tenantId && clientId && driveId);
      const normalizedRootFolderPath = rootFolderPath.trim();

      const { error } = await supabase
        .from('rag_onedrive_config')
        .update({
          tenant_id: tenantId || null,
          client_id: clientId || null,
          drive_id: driveId || null,
          // Empty string means "use drive root" (edge function normalizes it)
          root_folder_path: normalizedRootFolderPath,
          sync_enabled: syncEnabled,
          sync_interval_hours: syncIntervalHours,
          is_configured: isConfigured,
          updated_at: new Date().toISOString(),
        })
        .eq('id', config?.id);

      if (error) throw error;

      toast({
        title: 'Configuração salva',
        description: 'As configurações do OneDrive foram atualizadas.'
      });

      onConfigSaved();
      fetchConfig();
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);

      // Save first
      await handleSave();

      // Try to sync (will fail if credentials are wrong)
      const { error } = await supabase.functions.invoke('onedrive-sync', {
        body: { sync_type: 'incremental' }
      });

      if (error) {
        setTestResult('error');
        throw error;
      }

      setTestResult('success');
      toast({
        title: 'Conexão bem-sucedida!',
        description: 'O OneDrive foi conectado com sucesso.'
      });
    } catch (error: any) {
      setTestResult('error');
      toast({
        title: 'Falha na conexão',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Status da Integração
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {config?.is_configured ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle className="h-3 w-3" /> Configurado
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> Não Configurado
                </Badge>
              )}
              {config?.sync_enabled ? (
                <Badge variant="outline" className="gap-1">
                  <RefreshCw className="h-3 w-3" /> Sync Ativo
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  Sync Desativado
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {config?.last_sync_at ? (
                <span>Último sync: {new Date(config.last_sync_at).toLocaleString('pt-BR')}</span>
              ) : (
                <span>Nunca sincronizado</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-5 w-5" />
            Credenciais do Azure AD
          </CardTitle>
          <CardDescription>
            Configure as credenciais do App Registration no Azure Active Directory
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <p className="text-sm font-medium">Como obter as credenciais:</p>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Acesse o <a href="https://portal.azure.com" target="_blank" rel="noopener" className="text-primary underline">Portal do Azure</a></li>
              <li>Vá para Azure Active Directory → App Registrations</li>
              <li>Crie um novo app ou selecione existente</li>
              <li>Adicione permissões: Files.Read.All, Sites.Read.All</li>
              <li>Crie um Client Secret e copie os valores</li>
            </ol>
            <Button variant="link" size="sm" className="p-0 h-auto" asChild>
              <a href="https://docs.microsoft.com/en-us/graph/auth-v2-service" target="_blank" rel="noopener">
                Ver documentação completa <ExternalLink className="h-3 w-3 ml-1" />
              </a>
            </Button>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tenant ID</Label>
              <Input
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Client ID</Label>
              <Input
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Drive ID</Label>
            <Input
              placeholder="ID do drive do OneDrive corporativo"
              value={driveId}
              onChange={(e) => setDriveId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Encontre em: Graph Explorer → /me/drives ou /sites/{'{site-id}'}/drives
            </p>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-3 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Importante:</strong> O Client Secret deve ser configurado como um secret do projeto 
              com o nome <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">MICROSOFT_CLIENT_SECRET</code>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Folder Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Configuração de Pastas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Pasta Raiz</Label>
            <Input
              placeholder="/COESA Knowledge Base"
              value={rootFolderPath}
              onChange={(e) => setRootFolderPath(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Pasta no OneDrive onde estão os documentos
            </p>
          </div>

          <div className="space-y-2">
            <Label>Mapeamento de Pastas → Categorias</Label>
            <div className="bg-muted p-3 rounded-lg text-sm font-mono space-y-1">
              <p>📁 Vendas/ → vendas</p>
              <p>📁 SAC/ → sac</p>
              <p>📁 Cobranca/ → cobranca</p>
              <p>📁 Geral/ → geral</p>
              <p>📁 Treinamento/ → treinamento</p>
              <p>📁 Regulatorio/ → regulatorio</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Organize seus documentos nestas pastas para categorização automática
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sync Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Configurações de Sincronização
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Sincronização Automática</Label>
              <p className="text-sm text-muted-foreground">
                Sincronizar automaticamente com o OneDrive
              </p>
            </div>
            <Switch
              checked={syncEnabled}
              onCheckedChange={setSyncEnabled}
            />
          </div>

          <div className="space-y-2">
            <Label>Intervalo de Sincronização (horas)</Label>
            <Input
              type="number"
              min={1}
              max={24}
              value={syncIntervalHours}
              onChange={(e) => setSyncIntervalHours(parseInt(e.target.value) || 6)}
              disabled={!syncEnabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button 
          variant="outline" 
          onClick={handleTestConnection}
          disabled={testing || !tenantId || !clientId || !driveId}
        >
          {testing ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : testResult === 'success' ? (
            <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
          ) : testResult === 'error' ? (
            <XCircle className="h-4 w-4 mr-2 text-red-500" />
          ) : (
            <Cloud className="h-4 w-4 mr-2" />
          )}
          Testar Conexão
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
