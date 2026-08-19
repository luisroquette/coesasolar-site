import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Mail, Bell, Trophy, FileText, Trash2, UserPlus, Loader2 } from 'lucide-react';

interface EmailPreferencesData {
  email_enabled: boolean;
  notify_proposta_aceita: boolean;
  notify_proposta_criada: boolean;
  notify_meta_atingida: boolean;
  notify_proposta_excluida: boolean;
  notify_novo_usuario: boolean;
}

export function EmailPreferences() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<EmailPreferencesData>({
    email_enabled: true,
    notify_proposta_aceita: true,
    notify_proposta_criada: true,
    notify_meta_atingida: true,
    notify_proposta_excluida: false,
    notify_novo_usuario: true,
  });

  useEffect(() => {
    if (user) {
      fetchPreferences();
    }
  }, [user]);

  async function fetchPreferences() {
    try {
      const { data, error } = await supabase
        .from('email_preferences')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No preferences found, create default
          await createDefaultPreferences();
        } else {
          throw error;
        }
      } else if (data) {
        setPreferences({
          email_enabled: data.email_enabled ?? true,
          notify_proposta_aceita: data.notify_proposta_aceita ?? true,
          notify_proposta_criada: data.notify_proposta_criada ?? true,
          notify_meta_atingida: data.notify_meta_atingida ?? true,
          notify_proposta_excluida: data.notify_proposta_excluida ?? false,
          notify_novo_usuario: data.notify_novo_usuario ?? true,
        });
      }
    } catch (err) {
      console.error('Error fetching email preferences:', err);
      toast.error('Erro ao carregar preferências de e-mail');
    } finally {
      setLoading(false);
    }
  }

  async function createDefaultPreferences() {
    try {
      const { error } = await supabase
        .from('email_preferences')
        .insert({ user_id: user?.id });

      if (error) throw error;
    } catch (err) {
      console.error('Error creating default preferences:', err);
    }
  }

  async function savePreferences() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('email_preferences')
        .update(preferences)
        .eq('user_id', user?.id);

      if (error) throw error;
      toast.success('Preferências de e-mail salvas!');
    } catch (err) {
      console.error('Error saving preferences:', err);
      toast.error('Erro ao salvar preferências');
    } finally {
      setSaving(false);
    }
  }

  function handleToggle(key: keyof EmailPreferencesData) {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

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
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Preferências de E-mail
        </CardTitle>
        <CardDescription>
          Configure quais notificações você deseja receber por e-mail
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-primary" />
            <div>
              <Label htmlFor="email_enabled" className="text-base font-medium">
                Notificações por E-mail
              </Label>
              <p className="text-sm text-muted-foreground">
                Ativar ou desativar todas as notificações por e-mail
              </p>
            </div>
          </div>
          <Switch
            id="email_enabled"
            checked={preferences.email_enabled}
            onCheckedChange={() => handleToggle('email_enabled')}
          />
        </div>

        {/* Individual toggles */}
        <div className={`space-y-4 ${!preferences.email_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <h4 className="text-sm font-medium text-muted-foreground">Tipos de Notificação</h4>
          
          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-green-100 dark:bg-green-900/30">
                <FileText className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <Label htmlFor="notify_proposta_aceita">Proposta Aceita</Label>
                <p className="text-sm text-muted-foreground">
                  Quando um cliente aceita uma proposta
                </p>
              </div>
            </div>
            <Switch
              id="notify_proposta_aceita"
              checked={preferences.notify_proposta_aceita}
              onCheckedChange={() => handleToggle('notify_proposta_aceita')}
            />
          </div>

          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-blue-100 dark:bg-blue-900/30">
                <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <Label htmlFor="notify_proposta_criada">Nova Proposta</Label>
                <p className="text-sm text-muted-foreground">
                  Quando um funcionário cria uma nova proposta
                </p>
              </div>
            </div>
            <Switch
              id="notify_proposta_criada"
              checked={preferences.notify_proposta_criada}
              onCheckedChange={() => handleToggle('notify_proposta_criada')}
            />
          </div>

          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-purple-100 dark:bg-purple-900/30">
                <Trophy className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <Label htmlFor="notify_meta_atingida">Meta Atingida</Label>
                <p className="text-sm text-muted-foreground">
                  Quando um funcionário atinge uma meta
                </p>
              </div>
            </div>
            <Switch
              id="notify_meta_atingida"
              checked={preferences.notify_meta_atingida}
              onCheckedChange={() => handleToggle('notify_meta_atingida')}
            />
          </div>

          <div className="flex items-center justify-between py-3 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-amber-100 dark:bg-amber-900/30">
                <Trash2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <Label htmlFor="notify_proposta_excluida">Proposta Excluída</Label>
                <p className="text-sm text-muted-foreground">
                  Quando uma proposta é excluída
                </p>
              </div>
            </div>
            <Switch
              id="notify_proposta_excluida"
              checked={preferences.notify_proposta_excluida}
              onCheckedChange={() => handleToggle('notify_proposta_excluida')}
            />
          </div>

          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-teal-100 dark:bg-teal-900/30">
                <UserPlus className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <Label htmlFor="notify_novo_usuario">Novo Usuário</Label>
                <p className="text-sm text-muted-foreground">
                  Quando um novo usuário é adicionado ao sistema
                </p>
              </div>
            </div>
            <Switch
              id="notify_novo_usuario"
              checked={preferences.notify_novo_usuario}
              onCheckedChange={() => handleToggle('notify_novo_usuario')}
            />
          </div>
        </div>

        <Button onClick={savePreferences} disabled={saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar Preferências'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}