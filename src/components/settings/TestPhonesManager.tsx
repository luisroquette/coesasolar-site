import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, Phone, Terminal, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface TestPhone {
  id: string;
  phone_number: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export function TestPhonesManager() {
  const [phones, setPhones] = useState<TestPhone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newPhone, setNewPhone] = useState({ phone_number: '', name: '' });

  useEffect(() => {
    loadPhones();
  }, []);

  const loadPhones = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_test_phones')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setPhones(data || []);
    } catch (error) {
      console.error('Erro ao carregar telefones:', error);
      toast.error('Erro ao carregar lista de telefones');
    } finally {
      setLoading(false);
    }
  };

  const formatPhoneNumber = (phone: string): string => {
    // Remove non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Add country code if missing
    if (digits.length === 11) {
      return '55' + digits;
    } else if (digits.length === 10) {
      return '55' + digits;
    }
    return digits;
  };

  const formatPhoneDisplay = (phone: string): string => {
    if (phone.length === 13) {
      return phone.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, '+$1 ($2) $3-$4');
    }
    return phone;
  };

  const handleAddPhone = async () => {
    if (!newPhone.phone_number || !newPhone.name) {
      toast.error('Preencha todos os campos');
      return;
    }

    setSaving(true);
    try {
      const formattedPhone = formatPhoneNumber(newPhone.phone_number);
      
      const { error } = await supabase
        .from('whatsapp_test_phones')
        .insert({
          phone_number: formattedPhone,
          name: newPhone.name.trim(),
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('Este número já está cadastrado');
        } else {
          throw error;
        }
        return;
      }

      toast.success('Telefone adicionado com sucesso');
      setNewPhone({ phone_number: '', name: '' });
      setDialogOpen(false);
      loadPhones();
    } catch (error) {
      console.error('Erro ao adicionar telefone:', error);
      toast.error('Erro ao adicionar telefone');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (phone: TestPhone) => {
    try {
      const { error } = await supabase
        .from('whatsapp_test_phones')
        .update({ is_active: !phone.is_active })
        .eq('id', phone.id);

      if (error) throw error;

      setPhones(phones.map(p => 
        p.id === phone.id ? { ...p, is_active: !p.is_active } : p
      ));
      
      toast.success(phone.is_active ? 'Telefone desativado' : 'Telefone ativado');
    } catch (error) {
      console.error('Erro ao atualizar telefone:', error);
      toast.error('Erro ao atualizar telefone');
    }
  };

  const handleDelete = async (phone: TestPhone) => {
    if (!confirm(`Deseja remover ${phone.name} da lista?`)) return;

    try {
      const { error } = await supabase
        .from('whatsapp_test_phones')
        .delete()
        .eq('id', phone.id);

      if (error) throw error;

      setPhones(phones.filter(p => p.id !== phone.id));
      toast.success('Telefone removido');
    } catch (error) {
      console.error('Erro ao remover telefone:', error);
      toast.error('Erro ao remover telefone');
    }
  };

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Telefones de Teste</CardTitle>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Telefone de Teste</DialogTitle>
                <DialogDescription>
                  Números autorizados podem usar comandos especiais como #RESET_TESTE e #STATUS_TESTE via WhatsApp.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    placeholder="Ex: João Silva"
                    value={newPhone.name}
                    onChange={(e) => setNewPhone({ ...newPhone, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Número de Telefone</Label>
                  <Input
                    id="phone"
                    placeholder="Ex: 31991234567"
                    value={newPhone.phone_number}
                    onChange={(e) => setNewPhone({ ...newPhone, phone_number: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Digite apenas números. O código do país (55) será adicionado automaticamente.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAddPhone} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Adicionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <CardDescription>
          Gerencie os números autorizados para usar comandos de teste via WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent>
        {phones.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum telefone cadastrado</p>
            <p className="text-sm">Adicione números para autorizar comandos de teste</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {phones.map((phone) => (
                <TableRow key={phone.id}>
                  <TableCell className="font-medium">{phone.name}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatPhoneDisplay(phone.phone_number)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={phone.is_active}
                        onCheckedChange={() => handleToggleActive(phone)}
                      />
                      <Badge variant={phone.is_active ? 'default' : 'secondary'}>
                        {phone.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(phone)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <h4 className="text-sm font-medium mb-2">Comandos Disponíveis</h4>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <code className="px-2 py-0.5 bg-background rounded text-xs">#RESET_TESTE</code>
              <span>— Limpa todos os dados da conversa (lead, proposta, mensagens)</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="px-2 py-0.5 bg-background rounded text-xs">#STATUS_TESTE</code>
              <span>— Retorna status da conversa (lead score, dados, stage)</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
