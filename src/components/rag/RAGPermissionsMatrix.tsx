import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Users, 
  Shield, 
  RefreshCw,
  Bot,
  Save
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUIConfig } from '@/hooks/useUIConfig';

interface Permission {
  id: string;
  agent_id: string;
  category: string;
  access_level: string;
  priority: number;
}

interface Agent {
  agent_id: string;
  name: string;
  avatar_emoji: string;
}

export function RAGPermissionsMatrix() {
  const { ragCategories, ragCategoryLabels } = useUIConfig();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState<Map<string, boolean>>(new Map());
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [permissionsRes, agentsRes] = await Promise.all([
        supabase.from('rag_permissions').select('*'),
        supabase.from('ai_agents').select('agent_id, name, avatar_emoji')
      ]);

      if (permissionsRes.error) throw permissionsRes.error;
      if (agentsRes.error) throw agentsRes.error;

      setPermissions(permissionsRes.data || []);
      setAgents(agentsRes.data || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar permissões',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const getPermission = (agentId: string, category: string): Permission | undefined => {
    return permissions.find(p => p.agent_id === agentId && p.category === category);
  };

  const hasAccess = (agentId: string, category: string): boolean => {
    const key = `${agentId}:${category}`;
    if (changes.has(key)) {
      return changes.get(key)!;
    }
    const perm = getPermission(agentId, category);
    return perm?.access_level === 'read' || perm?.access_level === 'write' || perm?.access_level === 'admin';
  };

  const toggleAccess = (agentId: string, category: string) => {
    const key = `${agentId}:${category}`;
    const currentValue = hasAccess(agentId, category);
    setChanges(prev => new Map(prev).set(key, !currentValue));
  };

  const saveChanges = async () => {
    try {
      setSaving(true);

      for (const [key, newValue] of changes.entries()) {
        const [agentId, category] = key.split(':');
        const existing = getPermission(agentId, category);

        if (existing) {
          // Update existing
          await supabase
            .from('rag_permissions')
            .update({ access_level: newValue ? 'read' : 'none' })
            .eq('id', existing.id);
        } else if (newValue) {
          // Insert new
          await supabase
            .from('rag_permissions')
            .insert({ agent_id: agentId, category, access_level: 'read', priority: 50 });
        }
      }

      toast({
        title: 'Permissões salvas',
        description: 'A matriz de permissões foi atualizada com sucesso.'
      });

      setChanges(new Map());
      fetchData();
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

  const getCategoryLabel = (category: string) => {
    return ragCategoryLabels[category] || category;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Matriz de Permissões
            </CardTitle>
            <CardDescription>
              Configure quais categorias de conhecimento cada agente pode acessar
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {changes.size > 0 && (
              <Button onClick={saveChanges} disabled={saving} size="sm">
                <Save className="h-4 w-4 mr-2" />
                Salvar ({changes.size})
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">Agente</TableHead>
                {ragCategories.map(cat => (
                  <TableHead key={cat} className="text-center min-w-[100px]">
                    {getCategoryLabel(cat)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={ragCategories.length + 1} className="text-center py-8">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : agents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={ragCategories.length + 1} className="text-center py-8 text-muted-foreground">
                    Nenhum agente encontrado
                  </TableCell>
                </TableRow>
              ) : (
                agents.map(agent => (
                  <TableRow key={agent.agent_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{agent.avatar_emoji}</span>
                        <div>
                          <p className="font-medium">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">{agent.agent_id}</p>
                        </div>
                      </div>
                    </TableCell>
                    {ragCategories.map(category => {
                      const key = `${agent.agent_id}:${category}`;
                      const isChanged = changes.has(key);
                      const access = hasAccess(agent.agent_id, category);
                      
                      return (
                        <TableCell key={category} className="text-center">
                          <div className="flex items-center justify-center">
                            <Switch
                              checked={access}
                              onCheckedChange={() => toggleAccess(agent.agent_id, category)}
                              className={isChanged ? 'ring-2 ring-primary ring-offset-2' : ''}
                            />
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-primary" />
            <span>Acesso permitido</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-muted" />
            <span>Sem acesso</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
