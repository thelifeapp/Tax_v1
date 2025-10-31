// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

// These come from .env.local. The "!" says we're sure they exist.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,     // e.g. https://xxxx.supabase.co
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // long JWT-looking string
);
