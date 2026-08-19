-- Fix message buffering: remove legacy overloaded RPC that PostgREST may select
-- This legacy function references a non-existent table (message_buffer) and causes buffer failures.
DROP FUNCTION IF EXISTS public.add_to_message_buffer(text, text, text, text, integer);
