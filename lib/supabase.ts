// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // This will show up in the browser console if something is wrong in Vercel
  console.error("Missing Supabase env vars", { urlPresent: !!url, anonPresent: !!anonKey });
}

export const supabase = createClient(url!, anonKey!);
