import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Loader2, Users, Trash2, Pencil, Phone, Mail } from 'lucide-react';
import { AddRecipientDialog } from './AddRecipientDialog';
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

interface Recipient {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  notify_via: string[];
  notification_types: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const NOTIFICATION_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  daily_report: { label: 'Diário', icon: '📊', color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  weekly_report: { label: 'Semanal', icon: '📅', color: 'bg-purple-500/10 text-purple-600 border-purple-500/30' },
  hot_lead: { label: 'Lead Quente', icon: '🔥', color: 'bg-orange-500/10 text-orange-600 border-orange-500/30' },
};

export function NotificationRecipientsManager() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recipientToDelete, setRecipientToDelete] = useState<Recipient | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadRecipients();
  }, []);

  const loadRecipients = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('daily_report_recipients')
        .select('*')
        .order('nome');

      if (error) throw error;
      setRecipients(data || []);
    } catch (error) {
      console.error('Erro ao carregar destinatários:', error);
      toast.error('Erro ao carregar destinatários');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (recipient: Recipient) => {
    setToggling(recipient.id);
    try {
      const { error } = await supabase
        .from('daily_report_recipients')
        .update({ is_active: !recipient.is_active })
        .eq('id', recipient.id);

      if (error) throw error;
      
      setRecipients(prev => 
        prev.map(r => r.id === recipient.id ? { ...r, is_active: !r.is_active } : r)
      );
      toast.success(recipient.is_active ? 'Destinatário desativado' : 'Destinatário ativado');
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      toast.error('Erro ao alterar status');
    } finally {
      setToggling(null);
    }
  };

  const handleEdit = (recipient: Recipient) => {
    setEditingRecipient(recipient);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!recipientToDelete) return;
    
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('daily_report_recipients')
        .delete()
        .eq('id', recipientToDelete.id);

      if (error) throw error;
      
      setRecipients(prev => prev.filter(r => r.id !== recipientToDelete.id));
      toast.success('Destinatário excluído');
      setDeleteDialogOpen(false);
      setRecipientToDelete(null);
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir destinatário');
    } finally {
      setDeleting(false);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingRecipient(null);
  };

  const handleSaved = () => {
    handleDialogClose();
    loadRecipients();
  };

  const formatPhone = (phone: string) => {
    if (!phone) return '-';
    // Format: +55 31 99999-9999
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 13) {
      return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    return phone;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Destinatários de Notificações
            </CardTitle>
            <CardDescription>
              Gerencie quem recebe alertas e relatórios da Sofia
            </CardDescription>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : recipients.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum destinatário cadastrado</p>
            <p className="text-sm">Clique em "Adicionar" para cadastrar o primeiro</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Tipos de Notificação</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((recipient) => (
                  <TableRow key={recipient.id}>
                    <TableCell className="font-medium">{recipient.nome}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        {recipient.telefone && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {formatPhone(recipient.telefone)}
                          </div>
                        )}
                        {recipient.email && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {recipient.email}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {recipient.notification_types?.map((type) => {
                          const config = NOTIFICATION_TYPE_LABELS[type];
                          if (!config) return null;
                          return (
                            <Badge
                              key={type}
                              variant="outline"
                              className={config.color}
                            >
                              <span className="mr-1">{config.icon}</span>
                              {config.label}
                            </Badge>
                          );
                        })}
                        {(!recipient.notification_types || recipient.notification_types.length === 0) && (
                          <span className="text-muted-foreground text-sm">Nenhum tipo selecionado</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={recipient.is_active}
                        onCheckedChange={() => handleToggleActive(recipient)}
                        disabled={toggling === recipient.id}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(recipient)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setRecipientToDelete(recipient);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Legenda */}
            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="font-medium">Legenda:</span>
              {Object.entries(NOTIFICATION_TYPE_LABELS).map(([key, config]) => (
                <span key={key} className="flex items-center gap-1">
                  {config.icon} {config.label}
                </span>
              ))}
            </div>
          </>
        )}

        <AddRecipientDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          recipient={editingRecipient}
          onSaved={handleSaved}
          onClose={handleDialogClose}
        />

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir destinatário?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir "{recipientToDelete?.nome}"? 
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Excluindo...</>
                ) : (
                  'Excluir'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
