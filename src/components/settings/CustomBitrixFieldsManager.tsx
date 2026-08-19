import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, Settings2 } from 'lucide-react';

interface CustomBitrixField {
  id: string;
  chave: string;
  valor: string;
  descricao: string | null;
}

interface BitrixFieldOption {
  fieldName: string;
  label: string;
  type: string;
}

interface CustomBitrixFieldsManagerProps {
  bitrixFields: BitrixFieldOption[];
  onFieldsChange?: () => void;
}

export function CustomBitrixFieldsManager({ bitrixFields, onFieldsChange }: CustomBitrixFieldsManagerProps) {
  const [customFields, setCustomFields] = useState<CustomBitrixField[]>([]);
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
        .like('chave', 'bitrix24_custom_field_%')
        .order('chave');
      
      if (error) throw error;
      setCustomFields(data || []);
    } catch (error) {
      console.error('Erro ao carregar campos customizados:', error);
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
      
      const chave = `bitrix24_custom_field_${sanitizedName}`;

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
          descricao: newFieldDescription.trim() || `Campo customizado: ${newFieldName}`,
        });

      if (error) throw error;

      toast.success('Campo adicionado com sucesso!');
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
    // bitrix24_custom_field_nome_campo -> Nome Campo
    const name = chave.replace('bitrix24_custom_field_', '');
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <h5 className="text-sm font-medium">Campos Customizados</h5>
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
              <DialogTitle>Adicionar Campo Bitrix24</DialogTitle>
              <DialogDescription>
                Crie um novo mapeamento de campo customizado do Bitrix24.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="fieldName">Nome do Campo</Label>
                <Input
                  id="fieldName"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder="Ex: Data de Nascimento, Profissão, etc."
                />
                <p className="text-xs text-muted-foreground">
                  Nome amigável para identificar o campo
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fieldId">ID do Campo no Bitrix24</Label>
                {bitrixFields.length > 0 ? (
                  <Select
                    value={newFieldId || "__manual__"}
                    onValueChange={(val) => setNewFieldId(val === "__manual__" ? "" : val)}
                  >
                    <SelectTrigger className="font-mono text-sm">
                      <SelectValue placeholder="Selecione ou digite manualmente..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__manual__">Digitar manualmente</SelectItem>
                      {bitrixFields.map((field) => (
                        <SelectItem key={field.fieldName} value={field.fieldName}>
                          {field.label} ({field.fieldName})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                {(!bitrixFields.length || newFieldId === "" || !bitrixFields.find(f => f.fieldName === newFieldId)) && (
                  <Input
                    id="fieldIdManual"
                    value={newFieldId}
                    onChange={(e) => setNewFieldId(e.target.value)}
                    placeholder="Ex: UF_CRM_1234567890"
                    className="font-mono text-sm"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  O identificador do campo customizado no Bitrix24 (começa com UF_CRM_)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fieldDesc">Descrição (opcional)</Label>
                <Input
                  id="fieldDesc"
                  value={newFieldDescription}
                  onChange={(e) => setNewFieldDescription(e.target.value)}
                  placeholder="Ex: Data de nascimento do cliente para bonificação"
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
          <Settings2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Nenhum campo customizado adicionado.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Clique em "Adicionar Campo" para criar novos mapeamentos.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome do Campo</TableHead>
                <TableHead>ID Bitrix24</TableHead>
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
                    {bitrixFields.length > 0 ? (
                      <Select
                        value={field.valor || "__none__"}
                        onValueChange={(val) => handleUpdateField(field.id, val === "__none__" ? "" : val)}
                      >
                        <SelectTrigger className="font-mono text-sm h-8">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Não configurado</SelectItem>
                          {bitrixFields.map((f) => (
                            <SelectItem key={f.fieldName} value={f.fieldName}>
                              {f.label} ({f.fieldName})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={field.valor}
                        onChange={(e) => handleUpdateField(field.id, e.target.value)}
                        className="font-mono text-sm h-8"
                        placeholder="UF_CRM_..."
                      />
                    )}
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
        Campos customizados são salvos automaticamente e ficam disponíveis para uso na integração.
      </p>
    </div>
  );
}
