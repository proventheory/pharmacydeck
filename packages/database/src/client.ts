import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Server-side only. Use in apps/web (API routes, server components) and apps/packbuilder.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error("Supabase URL and key must be set (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_*)");
    }
    client = createClient(url, key);
  }
  return client;
}
