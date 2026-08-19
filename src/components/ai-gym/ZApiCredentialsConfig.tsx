import { useState, useEffect } from 'react';
import { Eye, EyeOff, Save, Shield, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';

interface ZApiCredentialsConfigProps {
  agentId: string;
  agentName: string;
}

interface ZApiCredentials {
  zapi_instance_id: string | null;
  zapi_token: string | null;
  zapi_security_token: string | null;
}

export function ZApiCredentialsConfig({ agentId, agentName }: ZApiCredentialsConfigProps) {
  const [credentials, setCredentials] = useState<ZApiCredentials>({
    zapi_instance_id: '',
    zapi_token: '',
    zapi_security_token: '',
  });
  const [originalCredentials, setOriginalCredentials] = useState<ZApiCredentials>({
    zapi_instance_id: '',
    zapi_token: '',
    zapi_security_token: '',
  });
  const [showToken, setShowToken] = useState(false);
  const [showSecurityToken, setShowSecurityToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load credentials on mount
  useEffect(() => {
    loadCredentials();
  }, [agentId]);

  // Check for changes
  useEffect(() => {
    const changed = 
      credentials.zapi_instance_id !== originalCredentials.zapi_instance_id ||
      credentials.zapi_token !== originalCredentials.zapi_token ||
      credentials.zapi_security_token !== originalCredentials.zapi_security_token;
    setHasChanges(changed);
  }, [credentials, originalCredentials]);

  const loadCredentials = async () => {
    try {
      setLoading(true);
      // Use edge function to securely fetch credentials (admin-only)
      const { data, error } = await supabase.functions.invoke('zapi-credentials-manage', {
        body: { action: 'get', agentId }
      });

      if (error) throw error;

      const creds = data?.credentials;
      const loaded = {
        zapi_instance_id: creds?.zapi_instance_id || '',
        zapi_token: creds?.zapi_token || '',
        zapi_security_token: creds?.zapi_security_token || '',
      };

      setCredentials(loaded);
      setOriginalCredentials(loaded);
    } catch (error) {
      console.error('Error loading Z-API credentials:', error);
      toast.error('Erro ao carregar credenciais');
    } finally {
      setLoading(false);
    }
  };

  const saveCredentials = async () => {
    try {
      setSaving(true);

      // Use edge function to securely save credentials (admin-only)
      const { error } = await supabase.functions.invoke('zapi-credentials-manage', {
        body: {
          action: 'save',
          agentId,
          credentials: {
            zapi_instance_id: credentials.zapi_instance_id || null,
            zapi_token: credentials.zapi_token || null,
            zapi_security_token: credentials.zapi_security_token || null,
          }
        }
      });

      if (error) throw error;

      setOriginalCredentials({ ...credentials });
      toast.success('Credenciais Z-API salvas com sucesso');
    } catch (error) {
      console.error('Error saving Z-API credentials:', error);
      toast.error('Erro ao salvar credenciais');
    } finally {
      setSaving(false);
    }
  };

  const isConfigured = credentials.zapi_instance_id && credentials.zapi_token;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Credenciais Z-API
        </CardTitle>
        <CardDescription>
          Configure as credenciais da instância Z-API exclusiva para {agentName}.
          Cada agente pode ter sua própria instância do WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Alert */}
        {isConfigured ? (
          <Alert className="border-green-500/50 bg-green-500/10">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700">
              Credenciais configuradas. {agentName} está pronto para responder via WhatsApp.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700">
              Credenciais não configuradas. {agentName} não conseguirá responder mensagens.
              Copie os dados da sua instância Z-API abaixo.
            </AlertDescription>
          </Alert>
        )}

        {/* Instance ID */}
        <div className="space-y-2">
          <Label htmlFor="instance_id">ID da Instância</Label>
          <Input
            id="instance_id"
            placeholder="Ex: 3ED77351AA5931E579589EFD83BB2141"
            value={credentials.zapi_instance_id || ''}
            onChange={(e) => setCredentials(prev => ({
              ...prev,
              zapi_instance_id: e.target.value
            }))}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Encontre no painel Z-API → Dados da instância → ID da instância
          </p>
        </div>

        {/* Token */}
        <div className="space-y-2">
          <Label htmlFor="token">Token da Instância</Label>
          <div className="relative">
            <Input
              id="token"
              type={showToken ? 'text' : 'password'}
              placeholder="Ex: 0D040E7FCA4D220946565E41"
              value={credentials.zapi_token || ''}
              onChange={(e) => setCredentials(prev => ({
                ...prev,
                zapi_token: e.target.value
              }))}
              className="font-mono text-sm pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Encontre no painel Z-API → Dados da instância → Token da instância
          </p>
        </div>

        {/* Security Token (optional) */}
        <div className="space-y-2">
          <Label htmlFor="security_token">
            Token de Segurança <span className="text-muted-foreground">(opcional)</span>
          </Label>
          <div className="relative">
            <Input
              id="security_token"
              type={showSecurityToken ? 'text' : 'password'}
              placeholder="Deixe em branco se não configurou no Z-API"
              value={credentials.zapi_security_token || ''}
              onChange={(e) => setCredentials(prev => ({
                ...prev,
                zapi_security_token: e.target.value
              }))}
              className="font-mono text-sm pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowSecurityToken(!showSecurityToken)}
            >
              {showSecurityToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure em Z-API → Segurança → Token de Segurança (Client-Token)
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button 
            onClick={saveCredentials} 
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Salvar Credenciais
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
