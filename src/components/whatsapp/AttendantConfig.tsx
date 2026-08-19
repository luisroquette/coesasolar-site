import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
} from '@/components/ui/alert-dialog';
import { Users, Plus, Pencil, Trash2, Phone, Crown, CheckCircle, AlertTriangle } from 'lucide-react';
import { formatWhatsAppNumber, isValidWhatsAppNumber, formatWhatsAppDisplay } from '@/lib/whatsapp-utils';

interface Attendant {
  id: string;
  nome: string;
  telefone: string;
  is_active: boolean;
  is_plantao: boolean;
  escalacoes_recebidas: number;
  last_escalation_at: string | null;
  created_at: string;
}

export function AttendantConfig() {
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [loading, setLoading] = useState(true);
  const [escalationMode, setEscalationMode] = useState('plantao_fixo');
  const [loadingMode, setLoadingMode] = useState(false);
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [attendantToDelete, setAttendantToDelete] = useState<Attendant | null>(null);
  const [editingAttendant, setEditingAttendant] = useState<Attendant | null>(null);
  
  // Form states
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchAttendants = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_atendentes')
        .select('*')
        .order('is_plantao', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      setAttendants(data || []);
    } catch (error) {
      console.error('Error fetching attendants:', error);
      toast.error('Erro ao carregar atendentes');
    } finally {
      setLoading(false);
    }
  };

  const fetchEscalationMode = async () => {
    try {
      const { data } = await supabase
        .from('configuracoes_sistema')
        .select('valor')
        .eq('chave', 'escalacao_modo')
        .single();

      if (data?.valor) {
        setEscalationMode(data.valor);
      }
    } catch (error) {
      console.error('Error fetching escalation mode:', error);
    }
  };

  useEffect(() => {
    fetchAttendants();
    fetchEscalationMode();
  }, []);

  const handleEscalationModeChange = async (mode: string) => {
    setLoadingMode(true);
    try {
      const { error } = await supabase
        .from('configuracoes_sistema')
        .upsert({ 
          chave: 'escalacao_modo', 
          valor: mode,
          updated_at: new Date().toISOString()
        }, { onConflict: 'chave' });

      if (error) throw error;
      
      setEscalationMode(mode);
      toast.success('Modo de escalação atualizado');
    } catch (error) {
      console.error('Error updating escalation mode:', error);
      toast.error('Erro ao atualizar modo de escalação');
    } finally {
      setLoadingMode(false);
    }
  };

  const openCreateDialog = () => {
    setEditingAttendant(null);
    setNome('');
    setTelefone('');
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEditDialog = (attendant: Attendant) => {
    setEditingAttendant(attendant);
    setNome(attendant.nome);
    setTelefone(attendant.telefone);
    setIsActive(attendant.is_active);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!nome.trim()) {
      toast.error('Preencha o nome do atendente');
      return;
    }

    if (!telefone.trim()) {
      toast.error('Preencha o telefone do atendente');
      return;
    }

    const formattedPhone = formatWhatsAppNumber(telefone);
    if (!isValidWhatsAppNumber(formattedPhone)) {
      toast.error('Telefone inválido. Use formato: DDD + 9 + número (ex: 31999999999)');
      return;
    }

    setSaving(true);
    try {
      if (editingAttendant) {
        const { error } = await supabase
          .from('whatsapp_atendentes')
          .update({
            nome: nome.trim(),
            telefone: formattedPhone,
            is_active: isActive,
          })
          .eq('id', editingAttendant.id);

        if (error) throw error;
        toast.success('Atendente atualizado');
      } else {
        const { error } = await supabase
          .from('whatsapp_atendentes')
          .insert({
            nome: nome.trim(),
            telefone: formattedPhone,
            is_active: isActive,
          });

        if (error) throw error;
        toast.success('Atendente adicionado');
      }

      setDialogOpen(false);
      fetchAttendants();
    } catch (error) {
      console.error('Error saving attendant:', error);
      toast.error('Erro ao salvar atendente');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!attendantToDelete) return;

    try {
      const { error } = await supabase
        .from('whatsapp_atendentes')
        .delete()
        .eq('id', attendantToDelete.id);

      if (error) throw error;
      
      toast.success('Atendente removido');
      fetchAttendants();
    } catch (error) {
      console.error('Error deleting attendant:', error);
      toast.error('Erro ao remover atendente');
    } finally {
      setDeleteDialogOpen(false);
      setAttendantToDelete(null);
    }
  };

  const togglePlantao = async (attendant: Attendant) => {
    try {
      // If enabling plantão, disable others first
      if (!attendant.is_plantao) {
        await supabase
          .from('whatsapp_atendentes')
          .update({ is_plantao: false })
          .neq('id', attendant.id);
      }

      const { error } = await supabase
        .from('whatsapp_atendentes')
        .update({ is_plantao: !attendant.is_plantao })
        .eq('id', attendant.id);

      if (error) throw error;
      
      toast.success(attendant.is_plantao ? 'Plantão removido' : 'Definido como plantão');
      fetchAttendants();
    } catch (error) {
      console.error('Error toggling plantão:', error);
      toast.error('Erro ao alterar plantão');
    }
  };

  const toggleActive = async (attendant: Attendant) => {
    try {
      const { error } = await supabase
        .from('whatsapp_atendentes')
        .update({ is_active: !attendant.is_active })
        .eq('id', attendant.id);

      if (error) throw error;
      
      toast.success(attendant.is_active ? 'Atendente desativado' : 'Atendente ativado');
      fetchAttendants();
    } catch (error) {
      console.error('Error toggling active:', error);
      toast.error('Erro ao alterar status');
    }
  };

  const plantaoAttendant = attendants.find(a => a.is_plantao && a.is_active);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-lg">Atendentes de Plantão</CardTitle>
              <CardDescription>
                Recebem notificação via WhatsApp quando a sofIA precisa de ajuda
              </CardDescription>
            </div>
          </div>
          <Button onClick={openCreateDialog} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Escalation Mode Selection */}
        <div className="space-y-2">
          <Label>Modo de Escalação</Label>
          <Select 
            value={escalationMode} 
            onValueChange={handleEscalationModeChange}
            disabled={loadingMode}
          >
            <SelectTrigger className="w-full md:w-[300px]">
              <SelectValue placeholder="Selecione o modo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="plantao_fixo">
                <div className="flex items-center gap-2">
                  <Crown className="h-4 w-4 text-amber-500" />
                  Plantão Fixo
                </div>
              </SelectItem>
              <SelectItem value="round_robin">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  Rodízio (Round Robin)
                </div>
              </SelectItem>
              <SelectItem value="todos">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-green-500" />
                  Notificar Todos
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {escalationMode === 'plantao_fixo' && 'Sempre notifica o atendente marcado como plantão'}
            {escalationMode === 'round_robin' && 'Alterna entre atendentes ativos a cada escalação'}
            {escalationMode === 'todos' && 'Notifica todos os atendentes ativos simultaneamente'}
          </p>
        </div>

        {/* Current Plantão Status */}
        {escalationMode === 'plantao_fixo' && (
          <div className={`p-4 rounded-lg border-2 ${plantaoAttendant ? 'border-green-500/50 bg-green-500/5' : 'border-amber-500/50 bg-amber-500/5'}`}>
            <div className="flex items-center gap-2">
              {plantaoAttendant ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="font-medium">Plantão Atual:</span>
                  <span>{plantaoAttendant.nome}</span>
                  <span className="text-muted-foreground">({formatWhatsAppDisplay(plantaoAttendant.telefone)})</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <span className="text-amber-700 dark:text-amber-300">Nenhum atendente de plantão definido</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Attendants List */}
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : attendants.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum atendente cadastrado</p>
            <p className="text-sm">Adicione atendentes para receber notificações de escalação</p>
          </div>
        ) : (
          <div className="space-y-3">
            {attendants.map((attendant) => (
              <div
                key={attendant.id}
                className={`p-4 border rounded-lg flex items-center justify-between ${
                  !attendant.is_active ? 'opacity-60 bg-muted/30' : ''
                } ${attendant.is_plantao ? 'border-amber-500/50 bg-amber-500/5' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{attendant.nome}</span>
                      {attendant.is_plantao && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
                          <Crown className="h-3 w-3 mr-1" />
                          Plantão
                        </Badge>
                      )}
                      {!attendant.is_active && (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {formatWhatsAppDisplay(attendant.telefone)}
                      </span>
                      <span>Escalações: {attendant.escalacoes_recebidas}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {escalationMode === 'plantao_fixo' && (
                    <Button
                      variant={attendant.is_plantao ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => togglePlantao(attendant)}
                      disabled={!attendant.is_active}
                      className={attendant.is_plantao ? 'bg-amber-500 hover:bg-amber-600' : ''}
                    >
                      <Crown className="h-4 w-4" />
                    </Button>
                  )}
                  <Switch
                    checked={attendant.is_active}
                    onCheckedChange={() => toggleActive(attendant)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(attendant)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setAttendantToDelete(attendant);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAttendant ? 'Editar Atendente' : 'Novo Atendente'}
            </DialogTitle>
            <DialogDescription>
              Atendentes recebem notificação via WhatsApp quando a sofIA precisa de ajuda humana.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="João Silva"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefone">WhatsApp *</Label>
              <Input
                id="telefone"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="31999999999"
              />
              <p className="text-xs text-muted-foreground">
                Número para receber notificações de escalação via Z-API
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Ativo</Label>
              <Switch
                id="is_active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Salvando...' : (editingAttendant ? 'Atualizar' : 'Adicionar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Atendente?</AlertDialogTitle>
            <AlertDialogDescription>
              {attendantToDelete && (
                <>
                  Tem certeza que deseja remover <strong>{attendantToDelete.nome}</strong>?
                  <br />
                  Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
