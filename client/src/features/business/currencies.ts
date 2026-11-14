/**
 * The currencies Tallybook can be set up with. Kept in its own tiny module so
 * the shared shop's setup screen can list them without loading the business
 * profile module (form validation, tax rules and the local database).
 * businessProfile re-exports it, so existing imports keep working.
 */
export const currencies = ["GHS", "KES", "NGN", "RWF", "TZS", "UGX", "USD", "EUR", "ZAR", "ZMW"] as const;

/** Labels for presentation; saved ledger values remain ISO currency codes. */
export const currencyLabels:Record<(typeof currencies)[number],string>={
 GHS:"Ghana cedi",KES:"Kenyan shilling",NGN:"Nigerian naira",RWF:"Rwandan franc",
 TZS:"Tanzanian shilling",UGX:"Ugandan shilling",USD:"US dollar",EUR:"Euro",
 ZAR:"South African rand",ZMW:"Zambian kwacha"
};
