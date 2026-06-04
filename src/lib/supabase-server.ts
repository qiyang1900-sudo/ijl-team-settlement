import "server-only";

import { createClient } from "@supabase/supabase-js";

export function createSupabaseServerClient(
  supabaseUrl: string,
  fallbackAnonKey?: string | null,
  explicitServiceRoleKey?: string | null
) {
  const localFallbackKey =
    process.env.NODE_ENV === "production"
      ? null
      : fallbackAnonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseKey =
    explicitServiceRoleKey ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    localFallbackKey;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase server environment variables are not configured.");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
