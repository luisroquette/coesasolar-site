import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, Users } from 'lucide-react';

interface CustomBitrixContactField {
  id: string;
  chave: string;
  valor: string;
  descricao: string | null;
}

interface CustomBitrixContactFieldsManagerProps {
  onFieldsChange?: () => void;
}

export function CustomBitrixContactFieldsManager({ onFieldsChange }: CustomBitrixContactFieldsManagerProps) {
  const [customFields, setCustomFields] = useState<CustomBitrixContactField[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // New field form
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldId, setNewFieldId] = useState('');
  const [newFieldDescription, setNewFieldDescription] = useState('');

  useEffect(() => {
    loadCustomFields();
  }, []);

  const loadCustomFields = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('configuracoes_sistema')
        .select('id, chave, valor, descricao')
        .like('chave', 'bitrix24_contact_field_%')
        .order('chave');
      
      if (error) throw error;
      setCustomFields(data || []);
    } catch (error) {
      console.error('Erro ao carregar campos de contato:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddField = async () => {
    if (!newFieldName.trim() || !newFieldId.trim()) {
      toast.error('Preencha o nome e ID do campo');
      return;
    }

    setSaving(true);
    try {
      // Create a sanitized key from the field name
      const sanitizedName = newFieldName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
      
      const chave = `bitrix24_contact_field_${sanitizedName}`;

      // Check if already exists
      const { data: existing } = await supabase
        .from('configuracoes_sistema')
        .select('id')
        .eq('chave', chave)
        .single();

      if (existing) {
        toast.error('Já existe um campo com esse nome');
        return;
      }

      const { error } = await supabase
        .from('configuracoes_sistema')
        .insert({
          chave,
          valor: newFieldId.trim(),
          descricao: newFieldDescription.trim() || `Campo de contato: ${newFieldName}`,
        });

      if (error) throw error;

      toast.success('Campo de contato adicionado!');
      setNewFieldName('');
      setNewFieldId('');
      setNewFieldDescription('');
      setDialogOpen(false);
      await loadCustomFields();
      onFieldsChange?.();
    } catch (error: any) {
      console.error('Erro ao adicionar campo:', error);
      toast.error(`Erro ao adicionar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateField = async (id: string, newValue: string) => {
    try {
      const { error } = await supabase
        .from('configuracoes_sistema')
        .update({ valor: newValue })
        .eq('id', id);

      if (error) throw error;

      setCustomFields(prev => 
        prev.map(f => f.id === id ? { ...f, valor: newValue } : f)
      );
      toast.success('Campo atualizado!');
      onFieldsChange?.();
    } catch (error: any) {
      console.error('Erro ao atualizar campo:', error);
      toast.error(`Erro: ${error.message}`);
    }
  };

  const handleDeleteField = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await supabase
        .from('configuracoes_sistema')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Campo removido!');
      await loadCustomFields();
      onFieldsChange?.();
    } catch (error: any) {
      console.error('Erro ao remover campo:', error);
      toast.error(`Erro: ${error.message}`);
    } finally {
      setDeleting(null);
    }
  };

  const getFieldLabel = (chave: string) => {
    // bitrix24_contact_field_nome_campo -> Nome Campo
    const name = chave.replace('bitrix24_contact_field_', '');
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h5 className="text-sm font-medium">Campos de Contato Bitrix24</h5>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1">
              <Plus className="h-4 w-4" />
              Adicionar Campo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Campo de Contato</DialogTitle>
              <DialogDescription>
                Crie um mapeamento para campos customizados de Contato no Bitrix24.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="contactFieldName">Nome do Campo</Label>
                <Input
                  id="contactFieldName"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder="Ex: RG, Estado Civil, CPF"
                />
                <p className="text-xs text-muted-foreground">
                  Nome amigável para identificar o campo de contato
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactFieldId">ID do Campo no Bitrix24</Label>
                <Input
                  id="contactFieldId"
                  value={newFieldId}
                  onChange={(e) => setNewFieldId(e.target.value)}
                  placeholder="Ex: UF_CRM_1751997517"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  ID do campo customizado de Contato (geralmente UF_CRM_... ou UF_CRM_CONTACT_...)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactFieldDesc">Descrição (opcional)</Label>
                <Input
                  id="contactFieldDesc"
                  value={newFieldDescription}
                  onChange={(e) => setNewFieldDescription(e.target.value)}
                  placeholder="Ex: CPF do contato para assinatura digital"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddField} disabled={saving}>
                {saving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
                ) : (
                  <><Plus className="mr-2 h-4 w-4" /> Adicionar</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : customFields.length === 0 ? (
        <div className="text-center py-6 border border-dashed rounded-lg">
          <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Nenhum campo de contato configurado.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Clique em "Adicionar Campo" para criar mapeamentos de Contato.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome do Campo</TableHead>
                <TableHead>ID Bitrix24 (Contato)</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customFields.map((field) => (
                <TableRow key={field.id}>
                  <TableCell>
                    <div>
                      <span className="font-medium">{getFieldLabel(field.chave)}</span>
                      {field.descricao && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {field.descricao}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={field.valor}
                      onChange={(e) => handleUpdateField(field.id, e.target.value)}
                      className="font-mono text-sm h-8"
                      placeholder="UF_CRM_..."
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteField(field.id)}
                      disabled={deleting === field.id}
                    >
                      {deleting === field.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Campos de contato são usados ao criar/atualizar o Contato vinculado ao Lead no Bitrix24.
      </p>
    </div>
  );
}
