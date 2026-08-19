import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const goalSchema = z.object({
  propostas_meta: z.coerce.number().min(1, 'Mínimo 1'),
  valor_meta: z.coerce.number().min(1000, 'Mínimo R$ 1.000'),
  conversao_meta: z.coerce.number().min(1).max(100, 'Entre 1% e 100%'),
});

type GoalFormData = z.infer<typeof goalSchema>;

interface Employee {
  user_id: string;
  nome: string | null;
  email: string | null;
}

interface SetGoalsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function SetGoalsDialog({ open, onOpenChange, onSuccess }: SetGoalsDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const form = useForm<GoalFormData>({
    resolver: zodResolver(goalSchema),
    defaultValues: {
      propostas_meta: 10,
      valor_meta: 50000,
      conversao_meta: 30,
    },
  });

  async function fetchEmployees() {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, nome, email')
      .order('nome');

    if (!error && data) {
      setEmployees(data);
    }
  }

  async function fetchExistingGoal() {
    if (!selectedEmployee) return;

    const { data, error } = await supabase
      .from('employee_goals')
      .select('*')
      .eq('user_id', selectedEmployee)
      .eq('month', selectedMonth)
      .eq('year', selectedYear)
      .maybeSingle();

    if (!error && data) {
      form.reset({
        propostas_meta: data.propostas_meta || 10,
        valor_meta: data.valor_meta || 50000,
        conversao_meta: data.conversao_meta || 30,
      });
    } else {
      form.reset({
        propostas_meta: 10,
        valor_meta: 50000,
        conversao_meta: 30,
      });
    }
  }

  useEffect(() => {
    if (open) {
      fetchEmployees();
    }
  }, [open]);

  useEffect(() => {
    fetchExistingGoal();
  }, [selectedEmployee, selectedMonth, selectedYear]);

  async function onSubmit(data: GoalFormData) {
    if (!selectedEmployee) {
      toast({
        title: 'Selecione um funcionário',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('employee_goals')
        .upsert({
          user_id: selectedEmployee,
          month: selectedMonth,
          year: selectedYear,
          propostas_meta: data.propostas_meta,
          valor_meta: data.valor_meta,
          conversao_meta: data.conversao_meta,
        }, {
          onConflict: 'user_id,month,year',
        });

      if (error) throw error;

      toast({
        title: 'Meta definida',
        description: 'Meta salva com sucesso.',
      });

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: format(new Date(2024, i, 1), 'MMMM', { locale: ptBR }),
  }));

  const years = [2024, 2025, 2026, 2027];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Definir Metas</DialogTitle>
          <DialogDescription>
            Configure as metas mensais para um funcionário.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">Funcionário</label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.user_id} value={emp.user_id}>
                      {emp.nome || emp.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Mês</label>
              <Select 
                value={selectedMonth.toString()} 
                onValueChange={(v) => setSelectedMonth(parseInt(v))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m.value} value={m.value.toString()}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Ano</label>
              <Select 
                value={selectedYear.toString()} 
                onValueChange={(v) => setSelectedYear(parseInt(v))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map(y => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="propostas_meta"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meta de Propostas</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="valor_meta"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meta de Valor (R$)</FormLabel>
                    <FormControl>
                      <Input type="number" step="1000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="conversao_meta"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Meta de Conversão (%)</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" max="100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading || !selectedEmployee}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar Meta
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
