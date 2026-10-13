/** Opt-in review-only mode; disabled for existing Windows/local builds. */
export const isSupabaseAuthPreviewEnabled = import.meta.env.VITE_TALLYBOOK_SUPABASE_AUTH_PREVIEW === "true";
