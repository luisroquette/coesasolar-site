import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  Key, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Info
} from 'lucide-react';
import { AgentSecret } from '@/hooks/useAgentVoiceConfig';

interface AgentSecretsManagerProps {
  secrets: AgentSecret[];
  mode: 'inbound' | 'outbound';
  onAdd: (name: string, key: string, description?: string) => Promise<boolean>;
  onRemove: (secretId: string) => Promise<boolean>;
  onMarkConfigured: (secretId: string, configured: boolean) => Promise<boolean>;
}

const COMMON_SECRETS = [
  { 
    name: 'RETELL_API_KEY', 
    key: 'retell_api_key',
    description: 'Chave de API do Retell AI' 
  },
  { 
    name: 'RETELL_AGENT_ID', 
    key: 'retell_agent_id',
    description: 'ID do agente no Retell' 
  },
  { 
    name: 'RETELL_FROM_NUMBER', 
    key: 'retell_from_number',
    description: 'Número de telefone de origem' 
  },
  { 
    name: 'TWILIO_ACCOUNT_SID', 
    key: 'twilio_account_sid',
    description: 'Account SID do Twilio' 
  },
  { 
    name: 'TWILIO_AUTH_TOKEN', 
    key: 'twilio_auth_token',
    description: 'Auth Token do Twilio' 
  },
];

export function AgentSecretsManager({
  secrets,
  mode,
  onAdd,
  onRemove,
  onMarkConfigured
}: AgentSecretsManagerProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newSecretName, setNewSecretName] = useState('');
  const [newSecretKey, setNewSecretKey] = useState('');
  const [newSecretDescription, setNewSecretDescription] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (!newSecretName || !newSecretKey) return;

    setIsAdding(true);
    const success = await onAdd(newSecretName, newSecretKey, newSecretDescription);
    
    if (success) {
      setNewSecretName('');
      setNewSecretKey('');
      setNewSecretDescription('');
      setIsAddDialogOpen(false);
    }
    setIsAdding(false);
  };

  const handleQuickAdd = async (secret: typeof COMMON_SECRETS[0]) => {
    setIsAdding(true);
    await onAdd(secret.name, secret.key, secret.description);
    setIsAdding(false);
  };

  const existingSecretNames = secrets.map(s => s.secret_name);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Secrets ({mode === 'inbound' ? 'Entrada' : 'Saída'})</CardTitle>
              <CardDescription>
                Chaves de API e credenciais para este modo
              </CardDescription>
            </div>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Secret</DialogTitle>
                <DialogDescription>
                  Registre uma nova secret para o modo {mode === 'inbound' ? 'entrada' : 'saída'}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome da Secret</Label>
                  <Input
                    value={newSecretName}
                    onChange={(e) => setNewSecretName(e.target.value.toUpperCase())}
                    placeholder="RETELL_API_KEY"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Chave (referência)</Label>
                  <Input
                    value={newSecretKey}
                    onChange={(e) => setNewSecretKey(e.target.value.toLowerCase())}
                    placeholder="retell_api_key"
                  />
                  <p className="text-xs text-muted-foreground">
                    Esta chave será usada para referenciar a secret no Supabase
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Descrição (opcional)</Label>
                  <Input
                    value={newSecretDescription}
                    onChange={(e) => setNewSecretDescription(e.target.value)}
                    placeholder="Chave de API do Retell AI"
                  />
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-2">Secrets comuns:</p>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_SECRETS.filter(s => !existingSecretNames.includes(s.name)).map(secret => (
                      <Button
                        key={secret.key}
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickAdd(secret)}
                        disabled={isAdding}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {secret.name}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAdd} disabled={!newSecretName || !newSecretKey || isAdding}>
                  Adicionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {secrets.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhuma secret configurada para este modo</p>
            <p className="text-xs mt-1">
              Adicione as secrets necessárias para integrar com o provider de voz
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {secrets.map(secret => (
              <div
                key={secret.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${secret.is_configured ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
                    {secret.is_configured ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                    )}
                  </div>
                  <div>
                    <p className="font-mono text-sm font-medium">{secret.secret_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {secret.description || `Chave: ${secret.secret_key}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={secret.is_configured ? 'default' : 'secondary'}>
                    {secret.is_configured ? 'Configurada' : 'Pendente'}
                  </Badge>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover Secret?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Isso removerá a referência a "{secret.secret_name}" deste agente.
                          A secret no Supabase não será afetada.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onRemove(secret.id)}>
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}

            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium">Como configurar as secrets:</p>
                  <ol className="list-decimal list-inside mt-1 space-y-0.5">
                    <li>Adicione a referência aqui</li>
                    <li>Configure o valor real nas Secrets do Supabase</li>
                    <li>Marque como "Configurada" após adicionar no Supabase</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
