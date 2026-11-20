import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { browserBackend, createLocalClient } from "./localClient";

let client: SupabaseClient | null = null;

/**
 * The one client the seam talks to, made on its first use (I12). With a Supabase project
 * configured it is that project's client. With none it is the local client, which keeps the
 * same tables on the person's own device and has no accounts (I19).
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (url && key) {
      client = createClient(url, key);
    } else if (!url && !key) {
      client = createLocalClient(browserBackend(() => window.localStorage)) as unknown as SupabaseClient;
    } else {
      throw new Error(
        "Supabase is half configured: .env.local needs both VITE_SUPABASE_URL and " +
          "VITE_SUPABASE_ANON_KEY (copy .env.example), or neither, which keeps the data on " +
          "this device. Then restart the dev server.",
      );
    }
  }
  return client;
}
