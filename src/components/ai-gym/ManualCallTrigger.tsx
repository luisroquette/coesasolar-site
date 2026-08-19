import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Plus, Phone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ManualCallTriggerProps {
  onSuccess?: () => void;
}

export function ManualCallTrigger({ onSuccess }: ManualCallTriggerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    phone: '',
    customer_name: '',
    consumption_kwh: '',
    discount_percentage: '25',
    distributor: '',
    bitrix_lead_id: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.phone) {
      toast.error('Telefone é obrigatório');
      return;
    }

    // Format phone to E.164
    let phone = formData.phone.replace(/\D/g, '');
    if (!phone.startsWith('55')) {
      phone = '55' + phone;
    }
    if (!phone.startsWith('+')) {
      phone = '+' + phone;
    }

    setLoading(true);

    try {
      // 1. Add to queue
      const { data: queueItem, error: queueError } = await supabase
        .from('outbound_call_queue')
        .insert({
          phone,
          customer_name: formData.customer_name || null,
          status: 'pending',
          priority: 10, // High priority for manual calls
          bitrix_lead_id: formData.bitrix_lead_id || null,
          lead_context: {
            consumption_kwh: formData.consumption_kwh ? parseInt(formData.consumption_kwh) : null,
            discount_percentage: parseInt(formData.discount_percentage) || 25,
            distributor: formData.distributor || null,
            days_since_contact: 0,
            manual_trigger: true,
          },
        })
        .select()
        .single();

      if (queueError) throw queueError;

      toast.success('Lead adicionado à fila!');
      
      // 2. Optional: Immediately trigger the call
      const triggerNow = window.confirm('Deseja ligar agora?');
      
      if (triggerNow && queueItem) {
        const response = await supabase.functions.invoke('retell-create-outbound-call', {
          body: { queue_id: queueItem.id }
        });

        if (response.error) {
          toast.error('Erro ao iniciar ligação: ' + response.error.message);
        } else {
          toast.success('Ligação iniciada!');
        }
      }

      setOpen(false);
      setFormData({
        phone: '',
        customer_name: '',
        consumption_kwh: '',
        discount_percentage: '25',
        distributor: '',
        bitrix_lead_id: '',
      });
      onSuccess?.();
    } catch (error) {
      console.error('Error adding to queue:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar à fila');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Ligação
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Nova Ligação Outbound
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Telefone *</Label>
            <Input
              id="phone"
              placeholder="(11) 99999-9999"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer_name">Nome do Cliente</Label>
            <Input
              id="customer_name"
              placeholder="João Silva"
              value={formData.customer_name}
              onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="consumption_kwh">Consumo (kWh)</Label>
              <Input
                id="consumption_kwh"
                type="number"
                placeholder="450"
                value={formData.consumption_kwh}
                onChange={(e) => setFormData({ ...formData, consumption_kwh: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount_percentage">Desconto (%)</Label>
              <Input
                id="discount_percentage"
                type="number"
                placeholder="25"
                value={formData.discount_percentage}
                onChange={(e) => setFormData({ ...formData, discount_percentage: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="distributor">Distribuidora</Label>
            <Input
              id="distributor"
              placeholder="CEMIG, CPFL, etc"
              value={formData.distributor}
              onChange={(e) => setFormData({ ...formData, distributor: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bitrix_lead_id">ID Lead Bitrix (opcional)</Label>
            <Input
              id="bitrix_lead_id"
              placeholder="12345"
              value={formData.bitrix_lead_id}
              onChange={(e) => setFormData({ ...formData, bitrix_lead_id: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adicionando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar à Fila
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
