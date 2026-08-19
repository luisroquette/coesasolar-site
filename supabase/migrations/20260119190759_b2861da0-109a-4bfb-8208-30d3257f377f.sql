-- STEP 1: Merge duplicate conversations - keep the one with more messages
-- For each duplicate pair, end the conversation with fewer messages (or older one if tie)

-- Create a temp function to help with merge
CREATE OR REPLACE FUNCTION merge_duplicate_conversations() RETURNS void AS $$
DECLARE
    dup_record RECORD;
    keep_id UUID;
    delete_ids UUID[];
BEGIN
    -- Find all duplicates
    FOR dup_record IN
        SELECT 
            cliente_telefone,
            whatsapp_provider,
            array_agg(id ORDER BY total_messages DESC NULLS LAST, created_at DESC) as ids
        FROM chatbot_conversas
        WHERE ended_at IS NULL
        GROUP BY cliente_telefone, whatsapp_provider
        HAVING COUNT(*) > 1
    LOOP
        -- Keep the first one (most messages or newest), end the rest
        keep_id := dup_record.ids[1];
        delete_ids := dup_record.ids[2:];
        
        -- End the duplicate conversations (don't delete, preserve history)
        UPDATE chatbot_conversas
        SET ended_at = now(),
            sofia_mode = 'merged_duplicate'
        WHERE id = ANY(delete_ids);
        
        RAISE NOTICE 'Keeping % and ending % duplicates for phone %', keep_id, array_length(delete_ids, 1), dup_record.cliente_telefone;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Execute the merge
SELECT merge_duplicate_conversations();

-- Drop the helper function
DROP FUNCTION merge_duplicate_conversations();

-- STEP 2: Now create the unique partial index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_conversation_per_phone 
ON public.chatbot_conversas (cliente_telefone, whatsapp_provider)
WHERE ended_at IS NULL;