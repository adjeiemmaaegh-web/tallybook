/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** https endpoint that receives scrubbed client error reports. Unset: nothing leaves the device. */
  readonly VITE_TALLYBOOK_ERROR_REPORT_URL?: string;
  /** Release label attached to error reports (for example a commit short SHA). */
  readonly VITE_TALLYBOOK_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
