import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Server-side only. Use in apps/web (API routes, server components) and apps/packbuilder.
 * Returns null when env is not set so the app can build (e.g. on Vercel) without Supabase env.
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
