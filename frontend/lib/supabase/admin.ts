import { createClient } from "@supabase/supabase-js";

// Server-side admin client using service role key — bypasses RLS.
// Use this in API routes that don't need user context.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  );
}
