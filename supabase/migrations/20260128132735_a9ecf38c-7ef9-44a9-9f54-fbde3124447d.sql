-- Atomic function to check and claim email processing
-- Returns TRUE if processing should proceed, FALSE if proposal already sent
CREATE OR REPLACE FUNCTION public.claim_email_processing_if_no_proposal(
  p_conversa_id UUID,
  p_message_id TEXT
)
RETURNS TABLE(
  should_process BOOLEAN,
  proposal_already_sent BOOLEAN,
  proposal_link TEXT,
  proposta_id UUID,
  blocked_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_proposal_sent BOOLEAN;
  v_proposta_link_sent_at TIMESTAMPTZ;
  v_proposta_id UUID;
  v_public_id TEXT;
  v_proposal_link TEXT;
BEGIN
  -- Acquire row lock to prevent concurrent modifications
  SELECT 
    cc.event_proposal_sent,
    cc.proposta_link_sent_at,
    cc.proposta_id
  INTO 
    v_event_proposal_sent,
    v_proposta_link_sent_at,
    v_proposta_id
  FROM chatbot_conversas cc
  WHERE cc.id = p_conversa_id
  FOR UPDATE; -- Exclusive lock on the row
  
  -- If proposal was already sent, block processing
  IF v_event_proposal_sent = true OR v_proposta_link_sent_at IS NOT NULL THEN
    -- Get proposal link if available
    IF v_proposta_id IS NOT NULL THEN
      SELECT pa.public_id INTO v_public_id
      FROM propostas_assinantes pa
      WHERE pa.id = v_proposta_id;
      
      IF v_public_id IS NOT NULL THEN
        v_proposal_link := 'https://coesa-propose-craft.lovable.app/proposta/' || v_public_id;
      END IF;
    END IF;
    
    RETURN QUERY SELECT 
      FALSE::BOOLEAN as should_process,
      TRUE::BOOLEAN as proposal_already_sent,
      v_proposal_link as proposal_link,
      v_proposta_id as proposta_id,
      'proposal_already_dispatched'::TEXT as blocked_reason;
    RETURN;
  END IF;
  
  -- Proposal not sent yet, allow processing
  RETURN QUERY SELECT 
    TRUE::BOOLEAN as should_process,
    FALSE::BOOLEAN as proposal_already_sent,
    NULL::TEXT as proposal_link,
    v_proposta_id as proposta_id,
    NULL::TEXT as blocked_reason;
END;
$$;

-- Also create a function to atomically set proposal sent flag
CREATE OR REPLACE FUNCTION public.mark_proposal_sent_atomic(
  p_conversa_id UUID,
  p_proposta_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_already_sent BOOLEAN;
BEGIN
  -- Check and update atomically
  UPDATE chatbot_conversas
  SET 
    event_proposal_sent = true,
    proposta_link_sent_at = COALESCE(proposta_link_sent_at, now()),
    proposta_id = COALESCE(proposta_id, p_proposta_id)
  WHERE id = p_conversa_id
    AND (event_proposal_sent = false OR event_proposal_sent IS NULL)
  RETURNING true INTO v_already_sent;
  
  -- Return true if we successfully marked it, false if already sent
  RETURN COALESCE(v_already_sent, false);
END;
$$;