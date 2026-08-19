import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUIConfig } from '@/hooks/useUIConfig';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Shield, 
  TrendingUp, 
  UserX, 
  Trash2, 
  Plus, 
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap
} from 'lucide-react';
import { formatWhatsAppDisplay } from '@/lib/whatsapp-utils';

interface BlacklistEntry {
  id: string;
  telefone: string;
  motivo: string;
  created_at: string;
  created_by: string | null;
}

interface WarmupStatus {
  data: string;
  mensagens_enviadas: number;
  limite_do_dia: number;
}

export function AntiSpamConfig() {
  const { queryLimitWarmupDays } = useUIConfig();
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [warmupHistory, setWarmupHistory] = useState<WarmupStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPhone, setNewPhone] = useState('');
  const [newMotivo, setNewMotivo] = useState('');
  const [addingToBlacklist, setAddingToBlacklist] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch blacklist
      const { data: blacklistData, error: blacklistError } = await supabase
        .from('whatsapp_blacklist')
        .select('*')
        .order('created_at', { ascending: false });

      if (blacklistError) throw blacklistError;
      setBlacklist(blacklistData || []);

      // Fetch warmup history (last 7 days)
      const { data: warmupData, error: warmupError } = await supabase
        .from('whatsapp_daily_volume')
        .select('*')
        .order('data', { ascending: false })
        .limit(queryLimitWarmupDays);

      if (warmupError) throw warmupError;
      setWarmupHistory(warmupData || []);
    } catch (error) {
      console.error('Error fetching anti-spam data:', error);
      toast.error('Erro ao carregar dados anti-spam');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToBlacklist = async () => {
    if (!newPhone.trim()) {
      toast.error('Digite um número de telefone');
      return;
    }
    if (!newMotivo.trim()) {
      toast.error('Digite o motivo do bloqueio');
      return;
    }

    setAddingToBlacklist(true);
    try {
      const normalizedPhone = newPhone.replace(/\D/g, '');
      
      const { error } = await supabase
        .from('whatsapp_blacklist')
        .insert({
          telefone: normalizedPhone,
          motivo: newMotivo.trim(),
          created_by: 'manual'
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('Este número já está na blacklist');
        } else {
          throw error;
        }
        return;
      }

      toast.success('Número adicionado à blacklist');
      setNewPhone('');
      setNewMotivo('');
      fetchData();
    } catch (error) {
      console.error('Error adding to blacklist:', error);
      toast.error('Erro ao adicionar à blacklist');
    } finally {
      setAddingToBlacklist(false);
    }
  };

  const handleRemoveFromBlacklist = async (id: string, telefone: string) => {
    try {
      const { error } = await supabase
        .from('whatsapp_blacklist')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success(`Número ${formatWhatsAppDisplay(telefone)} removido da blacklist`);
      fetchData();
    } catch (error) {
      console.error('Error removing from blacklist:', error);
      toast.error('Erro ao remover da blacklist');
    }
  };

  const todayStatus = warmupHistory[0];
  const warmupProgress = todayStatus 
    ? Math.round((todayStatus.mensagens_enviadas / todayStatus.limite_do_dia) * 100)
    : 0;

  // Calculate warm-up day
  const daysSinceStart = warmupHistory.length > 0 
    ? warmupHistory.length 
    : 0;

  const getWarmupStage = (days: number) => {
    if (days > 30) return { label: 'Completo', color: 'bg-green-500', limit: 1000 };
    if (days > 14) return { label: 'Avançado', color: 'bg-blue-500', limit: 500 };
    if (days > 7) return { label: 'Intermediário', color: 'bg-yellow-500', limit: 200 };
    if (days > 3) return { label: 'Inicial', color: 'bg-orange-500', limit: 100 };
    return { label: 'Novo', color: 'bg-red-500', limit: 50 };
  };

  const warmupStage = getWarmupStage(daysSinceStart);

  return (
    <div className="space-y-6">
      {/* Warm-up Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Status de Warm-up
          </CardTitle>
          <CardDescription>
            Aquecimento progressivo para evitar bloqueios pela Meta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{daysSinceStart}</div>
              <div className="text-sm text-muted-foreground">Dias ativos</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <Badge className={warmupStage.color}>{warmupStage.label}</Badge>
              <div className="text-sm text-muted-foreground mt-2">Estágio atual</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{todayStatus?.limite_do_dia || warmupStage.limit}</div>
              <div className="text-sm text-muted-foreground">Limite hoje</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-lg">
              <div className="text-2xl font-bold">{todayStatus?.mensagens_enviadas || 0}</div>
              <div className="text-sm text-muted-foreground">Enviadas hoje</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Uso do limite diário</span>
              <span>{warmupProgress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all ${warmupProgress > 90 ? 'bg-destructive' : warmupProgress > 70 ? 'bg-yellow-500' : 'bg-primary'}`}
                style={{ width: `${Math.min(warmupProgress, 100)}%` }}
              />
            </div>
          </div>

          {/* Warm-up schedule */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Cronograma de Warm-up
            </h4>
            <div className="grid grid-cols-5 gap-2 text-sm">
              <div className={`p-2 rounded text-center ${daysSinceStart <= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                <div className="font-bold">Dia 0-3</div>
                <div>50 msgs</div>
              </div>
              <div className={`p-2 rounded text-center ${daysSinceStart > 3 && daysSinceStart <= 7 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                <div className="font-bold">Dia 4-7</div>
                <div>100 msgs</div>
              </div>
              <div className={`p-2 rounded text-center ${daysSinceStart > 7 && daysSinceStart <= 14 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                <div className="font-bold">Dia 8-14</div>
                <div>200 msgs</div>
              </div>
              <div className={`p-2 rounded text-center ${daysSinceStart > 14 && daysSinceStart <= 30 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                <div className="font-bold">Dia 15-30</div>
                <div>500 msgs</div>
              </div>
              <div className={`p-2 rounded text-center ${daysSinceStart > 30 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                <div className="font-bold">Dia 30+</div>
                <div>1000 msgs</div>
              </div>
            </div>
          </div>

          {/* Recent history */}
          {warmupHistory.length > 1 && (
            <div>
              <h4 className="font-medium mb-2">Histórico recente</h4>
              <div className="space-y-1">
                {warmupHistory.slice(1, 5).map((day) => (
                  <div key={day.data} className="flex justify-between text-sm p-2 bg-muted/50 rounded">
                    <span>{new Date(day.data).toLocaleDateString('pt-BR')}</span>
                    <span>{day.mensagens_enviadas} / {day.limite_do_dia} mensagens</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Blacklist Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-destructive" />
            Blacklist de Números
          </CardTitle>
          <CardDescription>
            Números que nunca receberão mensagens automáticas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add to blacklist form */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                placeholder="5511999999999"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="motivo">Motivo</Label>
              <Input
                id="motivo"
                placeholder="Ex: Reclamação, Número inválido..."
                value={newMotivo}
                onChange={(e) => setNewMotivo(e.target.value)}
              />
            </div>
            <Button 
              onClick={handleAddToBlacklist} 
              disabled={addingToBlacklist}
              className="shrink-0"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </div>

          {/* Blacklist table */}
          {blacklist.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Adicionado em</TableHead>
                  <TableHead>Por</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {blacklist.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono">
                      {formatWhatsAppDisplay(entry.telefone)}
                    </TableCell>
                    <TableCell>{entry.motivo}</TableCell>
                    <TableCell>
                      {new Date(entry.created_at).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{entry.created_by || 'system'}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFromBlacklist(entry.id, entry.telefone)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum número na blacklist</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cooldown Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Cooldown por Objeção
          </CardTitle>
          <CardDescription>
            Pausas automáticas baseadas em rejeições detectadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-900">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <span className="font-medium">Rejeição Forte</span>
              </div>
              <div className="text-2xl font-bold text-red-600">72 horas</div>
              <p className="text-sm text-muted-foreground mt-1">
                "Não tenho interesse", "Parar", "Cancelar"
              </p>
            </div>
            <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-900">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-5 w-5 text-yellow-500" />
                <span className="font-medium">Objeção Leve</span>
              </div>
              <div className="text-2xl font-bold text-yellow-600">48 horas</div>
              <p className="text-sm text-muted-foreground mt-1">
                "Está caro", "Depois", "Agora não"
              </p>
            </div>
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-900">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-blue-500" />
                <span className="font-medium">Hesitação</span>
              </div>
              <div className="text-2xl font-bold text-blue-600">24 horas</div>
              <p className="text-sm text-muted-foreground mt-1">
                "Vou pensar", "Preciso avaliar"
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
