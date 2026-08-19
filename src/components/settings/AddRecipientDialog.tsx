import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Recipient {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  notify_via: string[];
  notification_types: string[];
  is_active: boolean;
}

interface AddRecipientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipient: Recipient | null;
  onSaved: () => void;
  onClose: () => void;
}

const NOTIFICATION_TYPES = [
  { id: 'daily_report', label: 'Relatório Diário', description: 'Resumo diário às 20h (Seg-Sex)', icon: '📊' },
  { id: 'weekly_report', label: 'Resumo Semanal', description: 'Relatório semanal às 9h (Segundas)', icon: '📅' },
  { id: 'hot_lead', label: 'Alerta Lead Quente', description: 'Notificação em tempo real de leads qualificados', icon: '🔥' },
];

const NOTIFY_VIA = [
  { id: 'whatsapp', label: 'WhatsApp', icon: '📱' },
  { id: 'email', label: 'E-mail', icon: '📧' },
];

export function AddRecipientDialog({
  open,
  onOpenChange,
  recipient,
  onSaved,
  onClose,
}: AddRecipientDialogProps) {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [notifyVia, setNotifyVia] = useState<string[]>(['whatsapp']);
  const [notificationTypes, setNotificationTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const isEditing = !!recipient;

  useEffect(() => {
    if (recipient) {
      setNome(recipient.nome);
      setTelefone(recipient.telefone);
      setEmail(recipient.email || '');
      setNotifyVia(recipient.notify_via || ['whatsapp']);
      setNotificationTypes(recipient.notification_types || []);
    } else {
      setNome('');
      setTelefone('');
      setEmail('');
      setNotifyVia(['whatsapp']);
      setNotificationTypes([]);
    }
  }, [recipient, open]);

  const handleNotifyViaToggle = (id: string) => {
    setNotifyVia(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  const handleNotificationTypeToggle = (id: string) => {
    setNotificationTypes(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const formatPhoneNumber = (phone: string) => {
    // Remove tudo que não é dígito
    let cleaned = phone.replace(/\D/g, '');
    
    // Remove zero inicial se houver
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.slice(1);
    }
    
    // Adiciona 55 se não tiver
    if (cleaned.length === 11 && cleaned[2] === '9') {
      cleaned = '55' + cleaned;
    } else if (cleaned.length === 10) {
      cleaned = '55' + cleaned.slice(0, 2) + '9' + cleaned.slice(2);
    }
    
    return cleaned;
  };

  const handleSave = async () => {
    if (!nome.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    if (notifyVia.includes('whatsapp') && !telefone.trim()) {
      toast.error('Telefone é obrigatório para notificações via WhatsApp');
      return;
    }

    if (notifyVia.includes('email') && !email.trim()) {
      toast.error('E-mail é obrigatório para notificações via e-mail');
      return;
    }

    if (notificationTypes.length === 0) {
      toast.error('Selecione pelo menos um tipo de notificação');
      return;
    }

    if (notifyVia.length === 0) {
      toast.error('Selecione pelo menos um canal de notificação');
      return;
    }

    setSaving(true);
    try {
      const formattedPhone = formatPhoneNumber(telefone);
      
      const data = {
        nome: nome.trim(),
        telefone: formattedPhone,
        email: email.trim() || null,
        notify_via: notifyVia,
        notification_types: notificationTypes,
        is_active: true,
      };

      if (isEditing && recipient) {
        const { error } = await supabase
          .from('daily_report_recipients')
          .update(data)
          .eq('id', recipient.id);

        if (error) throw error;
        toast.success('Destinatário atualizado!');
      } else {
        const { error } = await supabase
          .from('daily_report_recipients')
          .insert(data);

        if (error) throw error;
        toast.success('Destinatário adicionado!');
      }

      onSaved();
    } catch (error) {
      console.error('Erro ao salvar:', error);
      toast.error('Erro ao salvar destinatário');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Destinatário' : 'Adicionar Destinatário'}
          </DialogTitle>
          <DialogDescription>
            Configure quem recebe as notificações e alertas da Sofia
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Luis Gustavo"
            />
          </div>

          {/* Telefone */}
          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone WhatsApp</Label>
            <Input
              id="telefone"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="Ex: 31999999999"
            />
            <p className="text-xs text-muted-foreground">
              Será formatado automaticamente para o padrão internacional
            </p>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ex: email@empresa.com"
            />
          </div>

          {/* Canais de Notificação */}
          <div className="space-y-3">
            <Label>Canais de Notificação *</Label>
            <div className="space-y-2">
              {NOTIFY_VIA.map((channel) => (
                <div
                  key={channel.id}
                  className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleNotifyViaToggle(channel.id)}
                >
                  <Checkbox
                    checked={notifyVia.includes(channel.id)}
                    onCheckedChange={() => handleNotifyViaToggle(channel.id)}
                  />
                  <div className="flex items-center gap-2">
                    <span>{channel.icon}</span>
                    <span className="font-medium">{channel.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tipos de Notificação */}
          <div className="space-y-3">
            <Label>Tipos de Notificação *</Label>
            <div className="space-y-2">
              {NOTIFICATION_TYPES.map((type) => (
                <div
                  key={type.id}
                  className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer"
                  onClick={() => handleNotificationTypeToggle(type.id)}
                >
                  <Checkbox
                    checked={notificationTypes.includes(type.id)}
                    onCheckedChange={() => handleNotificationTypeToggle(type.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span>{type.icon}</span>
                      <span className="font-medium">{type.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {type.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
            ) : isEditing ? (
              'Salvar Alterações'
            ) : (
              'Adicionar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
