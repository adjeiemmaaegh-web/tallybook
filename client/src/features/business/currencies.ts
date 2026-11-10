/**
 * The currencies Tallybook can be set up with. Kept in its own tiny module so
 * the shared shop's setup screen can list them without loading the business
 * profile module (form validation, tax rules and the local database).
 * businessProfile re-exports it, so existing imports keep working.
 */
export const currencies = ["GHS", "KES", "NGN", "RWF", "TZS", "UGX", "USD", "ZAR", "ZMW"] as const;
