import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let serviceRoleClient: SupabaseClient | null = null;

/**
 * Server-side only. Use for reads (and when anon key is acceptable).
 * Falls back to anon key if service role is not set.
 */
export function getSupabase(): SupabaseClient | null {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    client = createClient(url, key);
  }
  return client;
}

/**
 * Server-side only. Use for writes (ingest, etc.). Bypasses RLS.
 * Returns null if SUPABASE_SERVICE_ROLE_KEY is not set — do not fall back to anon key for writes.
 */
export function getSupabaseServiceRole(): SupabaseClient | null {
  if (!serviceRoleClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    serviceRoleClient = createClient(url, key);
  }
  return serviceRoleClient;
}
