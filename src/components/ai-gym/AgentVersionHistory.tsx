import { useState, useEffect } from 'react';
import { useUIConfig } from '@/hooks/useUIConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  History, 
  RotateCcw, 
  Download,
  GitCommit,
  Clock,
  User,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Eye,
  Diff
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AIAgent {
  id: string;
  agent_id: string;
  name: string;
  role: string;
  description: string;
  avatar_emoji: string;
  channels: string[];
  status: string;
  version: string;
  persona: any;
  guardrails: any;
  tools_config: any;
  intents: any;
  kb_sources: any;
  collection_rules: any;
  metrics: any;
  tests: any;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

interface AgentVersion {
  id: string;
  agent_id: string;
  version: string;
  changelog: string | null;
  brain_snapshot: any;
  is_published: boolean | null;
  created_at: string;
  created_by: string | null;
}

interface AgentVersionHistoryProps {
  agent: AIAgent;
  onVersionRestored: () => void;
}

export function AgentVersionHistory({ agent, onVersionRestored }: AgentVersionHistoryProps) {
  const { analyticsVersionChangesLimit } = useUIConfig();
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [newVersion, setNewVersion] = useState('');
  const [changelog, setChangelog] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<AgentVersion | null>(null);
  const [showDiffDialog, setShowDiffDialog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchVersions();
  }, [agent.id]);

  const fetchVersions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('ai_agent_versions')
        .select('*')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVersions(data || []);
    } catch (error: any) {
      console.error('Error fetching versions:', error);
      toast({
        title: 'Erro ao carregar versões',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const generateNextVersion = () => {
    const currentParts = agent.version.split('.');
    const major = parseInt(currentParts[0] || '0');
    const minor = parseInt(currentParts[1] || '0');
    const patch = parseInt(currentParts[2] || '0');
    return `${major}.${minor}.${patch + 1}`;
  };

  const createVersion = async () => {
    if (!newVersion.trim()) {
      toast({
        title: 'Versão obrigatória',
        description: 'Informe o número da versão.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setCreating(true);

      // Create brain snapshot
      const brainSnapshot = {
        persona: agent.persona,
        guardrails: agent.guardrails,
        tools_config: agent.tools_config,
        intents: agent.intents,
        kb_sources: agent.kb_sources,
        collection_rules: agent.collection_rules,
        tests: agent.tests,
        description: agent.description,
        channels: agent.channels
      };

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Insert version
      const { error: versionError } = await supabase
        .from('ai_agent_versions')
        .insert({
          agent_id: agent.id,
          version: newVersion,
          changelog: changelog || null,
          brain_snapshot: brainSnapshot,
          is_published: false,
          created_by: user?.id || null
        });

      if (versionError) throw versionError;

      // Update agent version
      const { error: agentError } = await supabase
        .from('ai_agents')
        .update({ version: newVersion })
        .eq('id', agent.id);

      if (agentError) throw agentError;

      toast({
        title: 'Versão criada',
        description: `Versão ${newVersion} salva com sucesso.`
      });

      setShowCreateDialog(false);
      setNewVersion('');
      setChangelog('');
      fetchVersions();
      onVersionRestored();
    } catch (error: any) {
      toast({
        title: 'Erro ao criar versão',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setCreating(false);
    }
  };

  const restoreVersion = async (version: AgentVersion) => {
    try {
      setRestoring(version.id);

      const snapshot = version.brain_snapshot as any;

      // Restore agent from snapshot
      const { error } = await supabase
        .from('ai_agents')
        .update({
          persona: snapshot.persona,
          guardrails: snapshot.guardrails,
          tools_config: snapshot.tools_config,
          intents: snapshot.intents,
          kb_sources: snapshot.kb_sources,
          collection_rules: snapshot.collection_rules,
          tests: snapshot.tests,
          description: snapshot.description,
          channels: snapshot.channels,
          version: version.version
        })
        .eq('id', agent.id);

      if (error) throw error;

      toast({
        title: 'Versão restaurada',
        description: `Agente restaurado para a versão ${version.version}.`
      });

      onVersionRestored();
    } catch (error: any) {
      toast({
        title: 'Erro ao restaurar versão',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setRestoring(null);
    }
  };

  const downloadVersion = (version: AgentVersion) => {
    const snapshot = version.brain_snapshot as any;
    const brainData = {
      agent_id: agent.agent_id,
      name: agent.name,
      role: agent.role,
      version: version.version,
      changelog: version.changelog,
      exported_at: new Date().toISOString(),
      ...snapshot
    };

    const blob = new Blob([JSON.stringify(brainData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agent.agent_id}-brain-v${version.version}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const compareVersions = (current: any, previous: any): string[] => {
    const changes: string[] = [];
    
    const compare = (path: string, a: any, b: any) => {
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        changes.push(path);
      }
    };

    compare('Persona', current.persona, previous.persona);
    compare('Guardrails', current.guardrails, previous.guardrails);
    compare('Ferramentas', current.tools_config, previous.tools_config);
    compare('Intenções', current.intents, previous.intents);
    compare('Base de Conhecimento', current.kb_sources, previous.kb_sources);
    compare('Régua de Cobrança', current.collection_rules, previous.collection_rules);
    compare('Testes', current.tests, previous.tests);
    compare('Descrição', current.description, previous.description);
    compare('Canais', current.channels, previous.channels);

    return changes;
  };

  const getChangesSummary = (version: AgentVersion, index: number): string[] => {
    if (index === versions.length - 1) return ['Versão inicial'];
    
    const previousVersion = versions[index + 1];
    const current = version.brain_snapshot as any;
    const previous = previousVersion.brain_snapshot as any;
    
    return compareVersions(current, previous);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Versões
            </CardTitle>
            <CardDescription>
              Gerencie versões do cérebro e faça rollback quando necessário
            </CardDescription>
          </div>
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button onClick={() => setNewVersion(generateNextVersion())}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Versão
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Nova Versão</DialogTitle>
                <DialogDescription>
                  Salve o estado atual do cérebro como uma nova versão
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="version">Número da Versão</Label>
                  <Input
                    id="version"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    placeholder="ex: 1.2.0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Versão atual: {agent.version}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="changelog">Changelog (opcional)</Label>
                  <Textarea
                    id="changelog"
                    value={changelog}
                    onChange={(e) => setChangelog(e.target.value)}
                    placeholder="Descreva as alterações desta versão..."
                    rows={4}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={createVersion} disabled={creating}>
                  {creating ? 'Criando...' : 'Criar Versão'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Carregando versões...
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-8">
            <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Nenhuma versão salva ainda
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Crie uma versão para começar a rastrear alterações
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-4">
              {versions.map((version, index) => {
                const changes = getChangesSummary(version, index);
                const isCurrentVersion = version.version === agent.version;
                
                return (
                  <div
                    key={version.id}
                    className={`border rounded-lg p-4 ${
                      isCurrentVersion ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <GitCommit className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono font-semibold">
                            v{version.version}
                          </span>
                          {isCurrentVersion && (
                            <Badge variant="default" className="text-xs">
                              Atual
                            </Badge>
                          )}
                          {version.is_published && (
                            <Badge variant="secondary" className="text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Publicada
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(version.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>

                        {version.changelog && (
                          <p className="text-sm text-muted-foreground mt-2">
                            {version.changelog}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-1 mt-2">
                          {changes.slice(0, analyticsVersionChangesLimit).map((change, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {change}
                            </Badge>
                          ))}
                          {changes.length > analyticsVersionChangesLimit && (
                            <Badge variant="outline" className="text-xs">
                              +{changes.length - analyticsVersionChangesLimit} mais
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedVersion(version);
                            setShowDiffDialog(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadVersion(version)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {!isCurrentVersion && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={restoring === version.id}
                              >
                                <RotateCcw className="h-4 w-4 mr-1" />
                                {restoring === version.id ? 'Restaurando...' : 'Rollback'}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2">
                                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                                  Confirmar Rollback
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Isso irá restaurar o agente para a versão <strong>v{version.version}</strong>.
                                  <br /><br />
                                  Todas as configurações atuais serão substituídas. Recomendamos criar uma versão do estado atual antes de prosseguir.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => restoreVersion(version)}>
                                  Confirmar Rollback
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {/* Version Preview Dialog */}
        <Dialog open={showDiffDialog} onOpenChange={setShowDiffDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>
                Detalhes da Versão {selectedVersion?.version}
              </DialogTitle>
              <DialogDescription>
                Snapshot do cérebro nesta versão
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[500px] pr-4">
              {selectedVersion && (
                <div className="space-y-4">
                  {selectedVersion.changelog && (
                    <div>
                      <Label className="text-sm font-medium">Changelog</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        {selectedVersion.changelog}
                      </p>
                    </div>
                  )}
                  
                  <div>
                    <Label className="text-sm font-medium">Brain Snapshot</Label>
                    <pre className="mt-2 p-4 bg-muted rounded-lg text-xs overflow-x-auto">
                      {JSON.stringify(selectedVersion.brain_snapshot, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
