import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your local environment."
    );
  }

  return createClient(supabaseUrl, supabasePublishableKey);
}

export const supabaseConfigStatus = {
  configured: isSupabaseConfigured,
  hasUrl: Boolean(supabaseUrl),
  hasPublishableKey: Boolean(supabasePublishableKey),
} as const;
