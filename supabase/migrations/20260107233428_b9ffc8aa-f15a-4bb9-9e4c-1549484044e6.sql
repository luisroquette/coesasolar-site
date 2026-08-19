-- Tabela de logs de atividade
CREATE TABLE public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    user_nome TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    entity_name TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_entity_type ON public.activity_logs(entity_type);

-- Habilitar RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Política: Admins podem ver todos os logs
CREATE POLICY "Admins can view all logs"
ON public.activity_logs FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Política: Usuários podem ver seus próprios logs
CREATE POLICY "Users can view own logs"
ON public.activity_logs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Política: Qualquer autenticado pode inserir logs
CREATE POLICY "Authenticated can insert logs"
ON public.activity_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- Tabela de notificações
CREATE TABLE public.admin_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    entity_type TEXT,
    entity_id UUID,
    is_read BOOLEAN DEFAULT false,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_nome TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_notifications_admin ON public.admin_notifications(admin_user_id);
CREATE INDEX idx_notifications_read ON public.admin_notifications(is_read);
CREATE INDEX idx_notifications_created_at ON public.admin_notifications(created_at DESC);

-- Habilitar RLS
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Política: Admins podem ver suas notificações
CREATE POLICY "Admins can view own notifications"
ON public.admin_notifications FOR SELECT
TO authenticated
USING (admin_user_id = auth.uid() OR admin_user_id IS NULL);

-- Política: Admins podem atualizar suas notificações
CREATE POLICY "Admins can update own notifications"
ON public.admin_notifications FOR UPDATE
TO authenticated
USING (admin_user_id = auth.uid() OR admin_user_id IS NULL);

-- Política: Qualquer autenticado pode inserir notificações
CREATE POLICY "Authenticated can insert notifications"
ON public.admin_notifications FOR INSERT
TO authenticated
WITH CHECK (true);

-- Habilitar realtime para notificações
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;

-- Função para registrar atividade
CREATE OR REPLACE FUNCTION public.log_activity(
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id UUID DEFAULT NULL,
    p_entity_name TEXT DEFAULT NULL,
    p_details JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_email TEXT;
    v_user_nome TEXT;
    v_log_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
    SELECT nome INTO v_user_nome FROM public.profiles WHERE user_id = v_user_id;
    
    INSERT INTO public.activity_logs (
        user_id, user_email, user_nome, action, entity_type, entity_id, entity_name, details
    ) VALUES (
        v_user_id, v_user_email, v_user_nome, p_action, p_entity_type, p_entity_id, p_entity_name, p_details
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$;

-- Função para notificar admins
CREATE OR REPLACE FUNCTION public.notify_admins(
    p_title TEXT,
    p_message TEXT,
    p_type TEXT DEFAULT 'info',
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_creator_id UUID;
    v_creator_nome TEXT;
BEGIN
    v_creator_id := auth.uid();
    SELECT nome INTO v_creator_nome FROM public.profiles WHERE user_id = v_creator_id;
    
    -- Inserir notificação para cada admin (exceto quem criou)
    FOR v_admin_id IN 
        SELECT user_id FROM public.user_roles WHERE role = 'admin' AND user_id != v_creator_id
    LOOP
        INSERT INTO public.admin_notifications (
            admin_user_id, title, message, type, entity_type, entity_id, created_by_user_id, created_by_nome
        ) VALUES (
            v_admin_id, p_title, p_message, p_type, p_entity_type, p_entity_id, v_creator_id, v_creator_nome
        );
    END LOOP;
END;
$$;

-- Trigger para log e notificação em propostas_assinantes
CREATE OR REPLACE FUNCTION public.handle_proposta_assinante_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_action TEXT;
    v_user_nome TEXT;
    v_valor NUMERIC;
BEGIN
    SELECT nome INTO v_user_nome FROM public.profiles WHERE user_id = COALESCE(NEW.user_id, OLD.user_id);
    
    IF TG_OP = 'INSERT' THEN
        v_action := 'create';
        v_valor := NEW.economia_acumulada;
        
        PERFORM public.log_activity(
            'create', 'proposta_assinante', NEW.id, NEW.cliente_nome,
            jsonb_build_object('valor', v_valor, 'status', NEW.status)
        );
        
        -- Notificar admins sobre nova proposta
        PERFORM public.notify_admins(
            'Nova Proposta de Assinante',
            format('%s criou proposta para %s (R$ %s)', v_user_nome, NEW.cliente_nome, COALESCE(v_valor::TEXT, '0')),
            'success', 'proposta_assinante', NEW.id
        );
        
        RETURN NEW;
        
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update';
        v_valor := NEW.economia_acumulada;
        
        PERFORM public.log_activity(
            'update', 'proposta_assinante', NEW.id, NEW.cliente_nome,
            jsonb_build_object('valor', v_valor, 'status_old', OLD.status, 'status_new', NEW.status)
        );
        
        -- Notificar se status mudou para aceita
        IF NEW.status = 'aceita' AND OLD.status != 'aceita' THEN
            PERFORM public.notify_admins(
                'Proposta Aceita!',
                format('%s teve proposta aceita: %s (R$ %s)', v_user_nome, NEW.cliente_nome, COALESCE(v_valor::TEXT, '0')),
                'success', 'proposta_assinante', NEW.id
            );
        END IF;
        
        RETURN NEW;
        
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM public.log_activity(
            'delete', 'proposta_assinante', OLD.id, OLD.cliente_nome,
            jsonb_build_object('valor', OLD.economia_acumulada)
        );
        
        PERFORM public.notify_admins(
            'Proposta Excluída',
            format('%s excluiu proposta: %s', v_user_nome, OLD.cliente_nome),
            'warning', 'proposta_assinante', OLD.id
        );
        
        RETURN OLD;
    END IF;
END;
$$;

CREATE TRIGGER on_proposta_assinante_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.propostas_assinantes
    FOR EACH ROW EXECUTE FUNCTION public.handle_proposta_assinante_changes();

-- Trigger para log e notificação em propostas_usineiros
CREATE OR REPLACE FUNCTION public.handle_proposta_usineiro_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_nome TEXT;
BEGIN
    SELECT nome INTO v_user_nome FROM public.profiles WHERE user_id = COALESCE(NEW.user_id, OLD.user_id);
    
    IF TG_OP = 'INSERT' THEN
        PERFORM public.log_activity(
            'create', 'proposta_usineiro', NEW.id, NEW.nome_projeto,
            jsonb_build_object('potencia', NEW.potencia_mwp, 'status', NEW.status)
        );
        
        PERFORM public.notify_admins(
            'Nova Proposta de Usineiro',
            format('%s criou projeto %s (%s MWp)', v_user_nome, NEW.nome_projeto, COALESCE(NEW.potencia_mwp::TEXT, '0')),
            'info', 'proposta_usineiro', NEW.id
        );
        
        RETURN NEW;
        
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM public.log_activity(
            'update', 'proposta_usineiro', NEW.id, NEW.nome_projeto,
            jsonb_build_object('potencia', NEW.potencia_mwp, 'status_old', OLD.status, 'status_new', NEW.status)
        );
        
        RETURN NEW;
        
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM public.log_activity(
            'delete', 'proposta_usineiro', OLD.id, OLD.nome_projeto,
            jsonb_build_object('potencia', OLD.potencia_mwp)
        );
        
        PERFORM public.notify_admins(
            'Projeto Usineiro Excluído',
            format('%s excluiu projeto: %s', v_user_nome, OLD.nome_projeto),
            'warning', 'proposta_usineiro', OLD.id
        );
        
        RETURN OLD;
    END IF;
END;
$$;

CREATE TRIGGER on_proposta_usineiro_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.propostas_usineiros
    FOR EACH ROW EXECUTE FUNCTION public.handle_proposta_usineiro_changes();