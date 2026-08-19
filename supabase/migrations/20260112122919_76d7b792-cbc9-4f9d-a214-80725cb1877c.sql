-- Function to call edge function when notification is created
CREATE OR REPLACE FUNCTION public.trigger_notification_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_payload JSONB;
BEGIN
  -- Build payload for edge function
  v_payload := jsonb_build_object(
    'notification_id', NEW.id,
    'admin_user_id', NEW.admin_user_id,
    'title', NEW.title,
    'message', NEW.message,
    'type', NEW.type,
    'entity_type', NEW.entity_type,
    'entity_id', NEW.entity_id,
    'created_by_nome', NEW.created_by_nome
  );

  -- Call edge function asynchronously using pg_net
  PERFORM net.http_post(
    url := 'https://cvcdweqybgfxywcelriq.supabase.co/functions/v1/send-notification-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2Y2R3ZXF5YmdmeHl3Y2VscmlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MDAzNDksImV4cCI6MjA4MzM3NjM0OX0.qByJBHetEv8omb6iDyghxcGkA2KRlYnwzvOVtwePo3U'
    ),
    body := v_payload
  );

  RETURN NEW;
END;
$$;

-- Create trigger on admin_notifications table
DROP TRIGGER IF EXISTS on_notification_created_send_email ON public.admin_notifications;

CREATE TRIGGER on_notification_created_send_email
AFTER INSERT ON public.admin_notifications
FOR EACH ROW
EXECUTE FUNCTION public.trigger_notification_email();