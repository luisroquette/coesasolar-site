import { useState, useEffect } from 'react';
import { 
  History, 
  RotateCcw, 
  ChevronDown, 
  ChevronRight,
  Download,
  Calendar,
  User,
  Plus,
  Minus,
  Edit2,
  Eye,
  AlertTriangle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useUIConfig } from '@/hooks/useUIConfig';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PatternVersion {
  id: string;
  version_number: number;
  snapshot: any[];
  changelog: string | null;
  patterns_added: number;
  patterns_removed: number;
  patterns_modified: number;
  total_patterns: number;
  created_by_email: string | null;
  created_at: string;
}

interface PatternVersionHistoryProps {
  onVersionRestored?: () => void;
}

export function PatternVersionHistory({ onVersionRestored }: PatternVersionHistoryProps) {
  const { queryLimitPatternVersions } = useUIConfig();
  const [versions, setVersions] = useState<PatternVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [versionToRestore, setVersionToRestore] = useState<PatternVersion | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<PatternVersion | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchVersions();
  }, [queryLimitPatternVersions]);

  const fetchVersions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sofia_detection_patterns_versions')
        .select('*')
        .order('version_number', { ascending: false })
        .limit(queryLimitPatternVersions);

      if (error) throw error;
      // Cast snapshot to any[] for type compatibility
      setVersions((data || []).map(v => ({
        ...v,
        snapshot: (v.snapshot as any[]) || []
      })));
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar histórico',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const createVersionSnapshot = async (changelog: string) => {
    try {
      // Get current patterns
      const { data: patterns, error: patternsError } = await supabase
        .from('sofia_detection_patterns')
        .select('id, category, pattern, pattern_type, description, priority, is_active, response_template')
        .order('category');

      if (patternsError) throw patternsError;

      // Get last version number
      const lastVersion = versions.length > 0 ? versions[0].version_number : 0;
      const newVersionNumber = lastVersion + 1;

      // Calculate changes from previous version
      let patternsAdded = 0;
      let patternsRemoved = 0;
      let patternsModified = 0;

      if (versions.length > 0) {
        const prevSnapshot = versions[0].snapshot as any[];
        const prevIds = new Set(prevSnapshot.map(p => p.id));
        const currIds = new Set(patterns?.map(p => p.id) || []);
        
        // Count added
        patterns?.forEach(p => {
          if (!prevIds.has(p.id)) patternsAdded++;
        });
        
        // Count removed
        prevSnapshot.forEach(p => {
          if (!currIds.has(p.id)) patternsRemoved++;
        });
        
        // Count modified (simplified - just check if pattern content changed)
        const prevMap = new Map(prevSnapshot.map(p => [p.id, p]));
        patterns?.forEach(p => {
          const prev = prevMap.get(p.id);
          if (prev && JSON.stringify(prev) !== JSON.stringify(p)) {
            patternsModified++;
          }
        });
      } else {
        patternsAdded = patterns?.length || 0;
      }

      // Insert new version
      const { error: insertError } = await supabase
        .from('sofia_detection_patterns_versions')
        .insert({
          version_number: newVersionNumber,
          snapshot: patterns,
          changelog,
          patterns_added: patternsAdded,
          patterns_removed: patternsRemoved,
          patterns_modified: patternsModified,
          total_patterns: patterns?.length || 0,
          created_by: user?.id,
          created_by_email: user?.email
        });

      if (insertError) throw insertError;

      toast({
        title: 'Versão salva',
        description: `Versão ${newVersionNumber} criada com sucesso.`
      });

      await fetchVersions();
      return newVersionNumber;
    } catch (error: any) {
      toast({
        title: 'Erro ao criar versão',
        description: error.message,
        variant: 'destructive'
      });
      return null;
    }
  };

  const restoreVersion = async (version: PatternVersion) => {
    try {
      setIsRestoring(true);
      
      // First, save current state as a new version
      await createVersionSnapshot(`Backup antes de restaurar para v${version.version_number}`);

      // Delete all current patterns
      const { error: deleteError } = await supabase
        .from('sofia_detection_patterns')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (deleteError) throw deleteError;

      // Insert patterns from snapshot
      const snapshot = version.snapshot as any[];
      if (snapshot && snapshot.length > 0) {
        // Remove id field to let DB generate new ones, but keep original data
        const patternsToInsert = snapshot.map(p => ({
          category: p.category,
          pattern: p.pattern,
          pattern_type: p.pattern_type,
          description: p.description,
          priority: p.priority || 0,
          is_active: p.is_active ?? true,
          response_template: p.response_template
        }));

        // Insert in batches
        const batchSize = 100;
        for (let i = 0; i < patternsToInsert.length; i += batchSize) {
          const batch = patternsToInsert.slice(i, i + batchSize);
          const { error: insertError } = await supabase
            .from('sofia_detection_patterns')
            .insert(batch);

          if (insertError) throw insertError;
        }
      }

      // Save a version noting the restore
      await createVersionSnapshot(`Restaurado para versão ${version.version_number}`);

      toast({
        title: 'Versão restaurada!',
        description: `${snapshot.length} patterns restaurados da versão ${version.version_number}.`
      });

      onVersionRestored?.();
    } catch (error: any) {
      toast({
        title: 'Erro ao restaurar versão',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsRestoring(false);
      setVersionToRestore(null);
    }
  };

  const downloadVersion = (version: PatternVersion) => {
    const blob = new Blob([JSON.stringify(version.snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patterns-v${version.version_number}-${format(new Date(version.created_at), 'yyyy-MM-dd')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: 'Download concluído' });
  };

  const toggleVersion = (id: string) => {
    setExpandedVersions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Versões
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Histórico de Versões
              </CardTitle>
              <CardDescription>
                {versions.length} versões salvas
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => createVersionSnapshot('Snapshot manual')}
            >
              Criar Snapshot
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma versão encontrada
            </p>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {versions.map((version, index) => (
                  <Collapsible
                    key={version.id}
                    open={expandedVersions.has(version.id)}
                    onOpenChange={() => toggleVersion(version.id)}
                  >
                    <div className="border rounded-lg">
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center justify-between w-full p-3 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3">
                            {expandedVersions.has(version.id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <Badge variant={index === 0 ? 'default' : 'secondary'}>
                              v{version.version_number}
                            </Badge>
                            <span className="text-sm font-medium">
                              {version.total_patterns} patterns
                            </span>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {version.patterns_added > 0 && (
                                <span className="flex items-center gap-1 text-green-600">
                                  <Plus className="h-3 w-3" />
                                  {version.patterns_added}
                                </span>
                              )}
                              {version.patterns_removed > 0 && (
                                <span className="flex items-center gap-1 text-red-600">
                                  <Minus className="h-3 w-3" />
                                  {version.patterns_removed}
                                </span>
                              )}
                              {version.patterns_modified > 0 && (
                                <span className="flex items-center gap-1 text-amber-600">
                                  <Edit2 className="h-3 w-3" />
                                  {version.patterns_modified}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(version.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="p-3 pt-0 border-t space-y-3">
                          {/* Changelog */}
                          {version.changelog && (
                            <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                              {version.changelog}
                            </div>
                          )}
                          
                          {/* Author */}
                          {version.created_by_email && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              {version.created_by_email}
                            </div>
                          )}
                          
                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setPreviewVersion(version)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Visualizar
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => downloadVersion(version)}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Baixar
                            </Button>
                            {index !== 0 && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setVersionToRestore(version)}
                              >
                                <RotateCcw className="h-4 w-4 mr-1" />
                                Restaurar
                              </Button>
                            )}
                            {index === 0 && (
                              <Badge variant="outline" className="text-green-600">
                                Versão Atual
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={!!previewVersion} onOpenChange={() => setPreviewVersion(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Versão {previewVersion?.version_number} - {previewVersion?.total_patterns} patterns
            </DialogTitle>
            <DialogDescription>
              {previewVersion?.changelog || 'Sem descrição'}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {previewVersion?.snapshot && (previewVersion.snapshot as any[]).map((pattern: any, idx: number) => (
                <div key={idx} className="p-2 border rounded text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {pattern.category}
                    </Badge>
                    <code className="flex-1 font-mono text-xs bg-muted px-2 py-1 rounded">
                      {pattern.pattern}
                    </code>
                    <Badge variant={pattern.is_active ? 'default' : 'secondary'} className="text-xs">
                      {pattern.pattern_type}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewVersion(null)}>
              Fechar
            </Button>
            {previewVersion && (
              <Button 
                variant="outline"
                onClick={() => {
                  downloadVersion(previewVersion);
                  setPreviewVersion(null);
                }}
              >
                <Download className="h-4 w-4 mr-2" />
                Baixar JSON
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={!!versionToRestore} onOpenChange={() => setVersionToRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Restaurar Versão {versionToRestore?.version_number}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Esta ação irá:</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>Criar um backup automático da versão atual</li>
                <li>Substituir todos os {versions[0]?.total_patterns || 0} patterns atuais</li>
                <li>Restaurar {versionToRestore?.total_patterns} patterns da versão selecionada</li>
              </ul>
              <p className="font-medium mt-2">
                Esta ação pode ser revertida restaurando o backup criado.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => versionToRestore && restoreVersion(versionToRestore)}
              disabled={isRestoring}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isRestoring ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                  Restaurando...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restaurar
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Export the snapshot function for use in other components
export async function savePatternVersion(changelog: string): Promise<number | null> {
  const supabaseClient = supabase;
  
  try {
    // Get current patterns
    const { data: patterns, error: patternsError } = await supabaseClient
      .from('sofia_detection_patterns')
      .select('id, category, pattern, pattern_type, description, priority, is_active, response_template')
      .order('category');

    if (patternsError) throw patternsError;

    // Get last version number
    const { data: lastVersionData } = await supabaseClient
      .from('sofia_detection_patterns_versions')
      .select('version_number')
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    const lastVersion = lastVersionData?.version_number || 0;
    const newVersionNumber = lastVersion + 1;

    // Get user
    const { data: { user } } = await supabaseClient.auth.getUser();

    // Insert new version
    const { error: insertError } = await supabaseClient
      .from('sofia_detection_patterns_versions')
      .insert({
        version_number: newVersionNumber,
        snapshot: patterns,
        changelog,
        total_patterns: patterns?.length || 0,
        created_by: user?.id,
        created_by_email: user?.email
      });

    if (insertError) throw insertError;

    return newVersionNumber;
  } catch (error) {
    console.error('Error saving pattern version:', error);
    return null;
  }
}
