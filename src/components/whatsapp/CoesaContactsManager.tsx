import { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, Phone, Save, X, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatWhatsAppDisplay, formatWhatsAppNumber, isValidWhatsAppNumber } from '@/lib/whatsapp-utils';

interface CoesaContato {
  id: string;
  identificador: string;
  nome: string;
  telefone: string;
  descricao: string | null;
  is_active: boolean;
  created_at: string;
}

export function CoesaContactsManager() {
  const [contatos, setContatos] = useState<CoesaContato[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    identificador: '',
    nome: '',
    telefone: '',
    descricao: '',
  });

  const fetchContatos = async () => {
    try {
      const { data, error } = await supabase
        .from('coesa_contatos')
        .select('*')
        .order('nome');
      
      if (error) throw error;
      setContatos(data || []);
    } catch (error) {
      console.error('Erro ao buscar contatos:', error);
      toast.error('Erro ao carregar contatos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContatos();
  }, []);

  const resetForm = () => {
    setFormData({ identificador: '', nome: '', telefone: '', descricao: '' });
    setEditingId(null);
  };

  const handleOpenDialog = (contato?: CoesaContato) => {
    if (contato) {
      setEditingId(contato.id);
      setFormData({
        identificador: contato.identificador,
        nome: contato.nome,
        telefone: contato.telefone,
        descricao: contato.descricao || '',
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.identificador || !formData.nome || !formData.telefone) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    // Normalize phone number
    const normalizedPhone = formatWhatsAppNumber(formData.telefone);
    if (!isValidWhatsAppNumber(normalizedPhone)) {
      toast.error('Telefone inválido. Use o formato: DDD + 9 + número');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        identificador: formData.identificador.toLowerCase().replace(/\s+/g, '_'),
        nome: formData.nome,
        telefone: normalizedPhone,
        descricao: formData.descricao || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from('coesa_contatos')
          .update(payload)
          .eq('id', editingId);
        
        if (error) throw error;
        toast.success('Contato atualizado!');
      } else {
        const { error } = await supabase
          .from('coesa_contatos')
          .insert(payload);
        
        if (error) throw error;
        toast.success('Contato criado!');
      }

      setDialogOpen(false);
      resetForm();
      fetchContatos();
    } catch (error: any) {
      console.error('Erro ao salvar contato:', error);
      if (error.code === '23505') {
        toast.error('Já existe um contato com esse identificador');
      } else {
        toast.error('Erro ao salvar contato');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('coesa_contatos')
        .update({ is_active: !currentStatus })
        .eq('id', id);
      
      if (error) throw error;
      
      setContatos(prev => prev.map(c => 
        c.id === id ? { ...c, is_active: !currentStatus } : c
      ));
      
      toast.success(!currentStatus ? 'Contato ativado' : 'Contato desativado');
    } catch (error) {
      console.error('Erro ao alterar status:', error);
      toast.error('Erro ao alterar status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este contato?')) return;
    
    try {
      const { error } = await supabase
        .from('coesa_contatos')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      setContatos(prev => prev.filter(c => c.id !== id));
      toast.success('Contato excluído');
    } catch (error) {
      console.error('Erro ao excluir contato:', error);
      toast.error('Erro ao excluir contato');
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
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Contatos COESA (Triagem)
            </CardTitle>
            <CardDescription>
              Telefones de departamentos para onde a sofIA redireciona clientes existentes
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-1" />
                Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingId ? 'Editar Contato' : 'Novo Contato'}
                </DialogTitle>
                <DialogDescription>
                  Configure um contato/departamento para triagem de clientes
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="identificador">Identificador *</Label>
                  <Input
                    id="identificador"
                    placeholder="Ex: financeiro, atendimento, suporte"
                    value={formData.identificador}
                    onChange={(e) => setFormData(prev => ({ ...prev, identificador: e.target.value }))}
                    disabled={!!editingId}
                  />
                  <p className="text-xs text-muted-foreground">
                    Usado internamente para identificar o contato. Não pode ser alterado depois.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome de Exibição *</Label>
                  <Input
                    id="nome"
                    placeholder="Ex: Financeiro, Atendimento ao Cliente"
                    value={formData.nome}
                    onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone *</Label>
                  <Input
                    id="telefone"
                    placeholder="Ex: 31984400889"
                    value={formData.telefone}
                    onChange={(e) => setFormData(prev => ({ ...prev, telefone: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Formato: DDD + 9 + número (ex: 31984400889)
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="descricao">Descrição</Label>
                  <Input
                    id="descricao"
                    placeholder="Ex: Questões financeiras, boletos, pagamentos"
                    value={formData.descricao}
                    onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                  <X className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" />
                  )}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {contatos.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            Nenhum contato cadastrado. Clique em "Adicionar" para começar.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identificador</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-center">Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contatos.map((contato) => (
                <TableRow key={contato.id}>
                  <TableCell>
                    <Badge variant="outline">{contato.identificador}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{contato.nome}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatWhatsAppDisplay(contato.telefone)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                    {contato.descricao || '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={contato.is_active}
                      onCheckedChange={() => handleToggleActive(contato.id, contato.is_active)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(contato)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(contato.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
