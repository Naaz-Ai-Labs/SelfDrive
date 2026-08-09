import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const adminKey = supabaseSecretKey || supabaseAnonKey;

/**
 * Server-side admin client using the Secret/Service key (or Anon key fallback)
 * for administrative & background tasks.
 */
export const supabaseAdmin = supabaseUrl && adminKey
  ? createClient(supabaseUrl, adminKey, {
      auth: { persistSession: false },
    })
  : null;

/**
 * Standard client using Anon/Publishable key.
 */
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
