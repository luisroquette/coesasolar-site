import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO'
];

const formSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  nome_normalizado: z.string().min(2, 'Nome normalizado é obrigatório'),
  uf: z.string().optional(),
  is_atendida: z.boolean(),
  is_active: z.boolean(),
  requires_clarification: z.boolean(),
  clarification_message: z.string().optional(),
  rejection_message: z.string().optional(),
  priority: z.number().min(0),
});

type FormValues = z.infer<typeof formSchema>;

interface Distribuidora {
  id: string;
  nome: string;
  nome_normalizado: string;
  uf: string | null;
  is_atendida: boolean;
  is_active: boolean;
  requires_clarification: boolean;
  clarification_message: string | null;
  rejection_message: string | null;
  priority: number;
}

interface Props {
  distribuidora: Distribuidora | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditDistribuidoraDialog({ distribuidora, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const isEditing = !!distribuidora;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: '',
      nome_normalizado: '',
      uf: '',
      is_atendida: false,
      is_active: true,
      requires_clarification: false,
      clarification_message: '',
      rejection_message: '',
      priority: 0,
    },
  });

  // Reset form when distribuidora changes
  useEffect(() => {
    if (distribuidora) {
      form.reset({
        nome: distribuidora.nome,
        nome_normalizado: distribuidora.nome_normalizado,
        uf: distribuidora.uf || '',
        is_atendida: distribuidora.is_atendida,
        is_active: distribuidora.is_active,
        requires_clarification: distribuidora.requires_clarification,
        clarification_message: distribuidora.clarification_message || '',
        rejection_message: distribuidora.rejection_message || '',
        priority: distribuidora.priority,
      });
    } else {
      form.reset({
        nome: '',
        nome_normalizado: '',
        uf: '',
        is_atendida: false,
        is_active: true,
        requires_clarification: false,
        clarification_message: '',
        rejection_message: '',
        priority: 0,
      });
    }
  }, [distribuidora, form]);

  // Auto-generate normalized name
  const watchNome = form.watch('nome');
  useEffect(() => {
    if (!isEditing && watchNome) {
      const normalized = watchNome
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
      form.setValue('nome_normalizado', normalized);
    }
  }, [watchNome, isEditing, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        nome: values.nome,
        nome_normalizado: values.nome_normalizado,
        uf: values.uf || null,
        is_atendida: values.is_atendida,
        is_active: values.is_active,
        requires_clarification: values.requires_clarification,
        clarification_message: values.clarification_message || null,
        rejection_message: values.rejection_message || null,
        priority: values.priority,
        updated_at: new Date().toISOString(),
      };

      if (isEditing && distribuidora) {
        const { error } = await supabase
          .from('distribuidoras_config')
          .update(payload)
          .eq('id', distribuidora.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('distribuidoras_config')
          .insert(payload);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distribuidoras-admin'] });
      toast.success(isEditing ? 'Distribuidora atualizada' : 'Distribuidora criada');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(`Erro: ${error.message}`);
    },
  });

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values);
  };

  const requiresClarification = form.watch('requires_clarification');
  const isAtendida = form.watch('is_atendida');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Distribuidora' : 'Nova Distribuidora'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: CEMIG, Neoenergia Coelba" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nome_normalizado"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Normalizado</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: CEMIG, NEOENERGIA COELBA" {...field} />
                  </FormControl>
                  <FormDescription>
                    Usado para busca e comparação (sem acentos, maiúsculo)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="uf"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>UF</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o estado" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">Nenhum</SelectItem>
                      {UF_OPTIONS.map(uf => (
                        <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prioridade</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      min={0}
                      {...field}
                      onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Menor número = maior prioridade na busca
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Ativa</FormLabel>
                      <FormDescription className="text-xs">
                        Visível no sistema
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_atendida"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Atendida</FormLabel>
                      <FormDescription className="text-xs">
                        COESA atende
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="requires_clarification"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Requer Clarificação</FormLabel>
                    <FormDescription className="text-xs">
                      Nome genérico que precisa de confirmação (ex: "Neoenergia")
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            {requiresClarification && (
              <FormField
                control={form.control}
                name="clarification_message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mensagem de Clarificação</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Ex: Qual Neoenergia? Atendemos apenas a *Neoenergia Coelba* (BA)."
                        rows={3}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!isAtendida && !requiresClarification && (
              <FormField
                control={form.control}
                name="rejection_message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mensagem de Rejeição</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Mensagem exibida quando cliente informa esta distribuidora não atendida"
                        rows={3}
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Deixe vazio para usar mensagem padrão
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Salvando...' : isEditing ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
