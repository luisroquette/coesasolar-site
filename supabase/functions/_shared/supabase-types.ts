/**
 * Minimal Supabase types for edge functions
 * These match the main types.ts but are lightweight for edge function use
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
