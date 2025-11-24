// utils/supabase/server.ts

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Server-side Supabase client for RPCs and database operations
 * that do NOT depend on Supabase Auth sessions.
 *
 * We intentionally do NOT pass a `cookies` option here because
 * `@supabase/supabase-js`'s `createClient` does not accept it.
 */
export function createClient() {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
