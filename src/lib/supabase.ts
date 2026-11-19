import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Supabase is not configured: copy .env.example to .env.local, fill in " +
          "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.",
      );
    }
    client = createClient(url, key);
  }
  return client;
}
