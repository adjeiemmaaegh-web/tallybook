/** Resend email adapter for the alert router. DISABLED until the owner activates it: nothing here reads an API key from the
 *  environment, imports fetch, or sends anything by itself. The caller must inject `apiKey` and `fetchImpl` explicitly, and the
 *  sender domain must be confirmed company-owned and verified (domainVerified === true) before the adapter can even be built. */
const FREE_MAIL = new Set(["gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "mail.com", "gmx.com", "yandex.com", "zoho.com"]);
const FQDN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const EMAIL = /^[^\s@<>",;]{1,64}@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
export class EmailError extends Error { constructor(m, {retryable = false, code = "email"} = {}) { super(m); this.retryable = retryable; this.code = code; } }
const oneLine = s => String(s).replace(/[\r\n\u2028\u2029]+/g, " ").slice(0, 150);

export function createResendAdapter({apiKey, senderDomain, domainVerified, fetchImpl, endpoint = "https://api.resend.com/emails", timeoutMs = 10_000}) {
  if (typeof apiKey !== "string" || apiKey.length < 16) throw new EmailError("An API key must be injected by the caller.", {code: "config"});
  if (typeof fetchImpl !== "function") throw new EmailError("A fetch implementation must be injected by the caller.", {code: "config"});
  const domain = String(senderDomain ?? "").toLowerCase();
  if (!FQDN.test(domain)) throw new EmailError("The sender domain is not a valid domain name.", {code: "config"});
  if (FREE_MAIL.has(domain)) throw new EmailError("The sender domain must be company-owned, not a free-mail provider.", {code: "config"});
  if (domainVerified !== true) throw new EmailError("The sender domain is not verified with the email provider.", {code: "config"});
  if (!/^https:\/\/api\.resend\.com\//.test(endpoint)) throw new EmailError("Only the Resend API endpoint is allowed.", {code: "config"});
  const from = `Tallybook Alerts <alerts@${domain}>`;
  return Object.freeze({
    id: "email", external: true,
    async send(alert, recipient) {
      if (!recipient?.verified || typeof recipient.address !== "string" || !EMAIL.test(recipient.address)) throw new EmailError("Recipient is not a verified email address.", {code: "recipient"});
      const detail = JSON.stringify(alert.detail ?? {}, null, 2).slice(0, 2000); // already redacted by the router
      const payload = {from, to: [recipient.address], subject: `[Tallybook] ${String(alert.severity).toUpperCase()}: ${oneLine(alert.title)}`,
        text: `${oneLine(alert.title)}\n\nSeverity: ${alert.severity}\nScope: ${alert.scope}\nTime: ${alert.at}\n\nDetails (sensitive fields removed):\n${detail}\n\nThis is an automated Tallybook alert. Do not reply with passwords or codes.`,
        tags: [{name: "category", value: String(alert.category ?? "operations").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40)}]};
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(endpoint, {method: "POST", signal: ctl.signal, headers: {"content-type": "application/json", authorization: `Bearer ${apiKey}`, "idempotency-key": `${alert.scope}:${alert.businessId ?? "-"}:${alert.key}:${alert.at}`.slice(0, 256)}, body: JSON.stringify(payload)});
      } catch { throw new EmailError("Email provider unreachable.", {retryable: true, code: "network"}); }
      finally { clearTimeout(timer); }
      if (res.status >= 200 && res.status < 300) return;
      throw new EmailError(`Email provider refused (HTTP ${res.status}).`, {retryable: res.status === 429 || res.status >= 500, code: "provider"}); // never includes the key or the response body
    },
  });
}

/** Pre-check of the sender domain's DNS authentication. `resolveTxt(name) -> Promise<string[]>` is injected (no network here).
 *  This is NOT a substitute for the provider's own domain verification, which must be confirmed in its dashboard. */
export async function checkSenderDnsAuth({domain, resolveTxt, dkimSelector = "resend"}) {
  const d = String(domain ?? "").toLowerCase();
  if (!FQDN.test(d) || FREE_MAIL.has(d)) return {ok: false, checks: [{name: "domain", ok: false, detail: "not a company-owned domain"}]};
  const txt = async n => { try { return (await resolveTxt(n)).map(x => Array.isArray(x) ? x.join("") : String(x)); } catch { return []; } };
  const [root, dkim, dmarc] = await Promise.all([txt(d), txt(`${dkimSelector}._domainkey.${d}`), txt(`_dmarc.${d}`)]);
  const spf = root.find(r => /^v=spf1\b/i.test(r)), dm = dmarc.find(r => /^v=DMARC1\b/i.test(r));
  const policy = dm && /;\s*p=(none|quarantine|reject)\b/i.exec(dm)?.[1]?.toLowerCase();
  const checks = [
    {name: "spf", ok: !!spf && /[~-]all\s*$/.test(spf.trim()), detail: spf ? "SPF record present" : "no SPF record"},
    {name: "dkim", ok: dkim.some(r => /\bp=[A-Za-z0-9+/=]{20,}/.test(r)), detail: dkim.length ? "DKIM key present" : `no DKIM key at ${dkimSelector}._domainkey`},
    {name: "dmarc", ok: policy === "quarantine" || policy === "reject", detail: !dm ? "no DMARC record" : policy === "none" ? "DMARC policy is p=none (monitor only): use quarantine or reject" : "DMARC enforcing"},
  ];
  return {ok: checks.every(c => c.ok), checks};
}

/** Everything that must be true before external alert delivery may be switched on. Returns the missing items. */
export function alertActivationChecklist({config, securityAdministrator, senderDomain, dnsAuth, providerDomainVerified, apiKeyProvisioned, ownerEmailVerificationSource}) {
  const missing = [];
  if (config?.externalApproved !== true) missing.push("Owner has not approved external notifications (externalApproved).");
  const a = securityAdministrator;
  if (!a || typeof a.name !== "string" || !a.name.trim()) missing.push("The responsible security administrator's name is not recorded.");
  if (!a || !EMAIL.test(String(a.email ?? ""))) missing.push("The security administrator's email address is not recorded.");
  if (!a || a.verified !== true) missing.push("The security administrator's email address is not verified.");
  if (a?.interim === true && a.confirmedPerson !== true) missing.push("The security administrator is still the interim platform owner: record the actual responsible person (name and contact) and set confirmedPerson.");
  const d = String(senderDomain?.domain ?? "").toLowerCase();
  if (!FQDN.test(d) || FREE_MAIL.has(d)) missing.push("No company-owned sender domain is recorded.");
  else if (senderDomain.ownershipConfirmed !== true) missing.push("Ownership of the sender domain is not confirmed by the company.");
  if (dnsAuth?.ok !== true) missing.push("SPF, DKIM and an enforcing DMARC policy are not all confirmed for the sender domain.");
  if (providerDomainVerified !== true) missing.push("The sender domain is not verified in the email provider's dashboard.");
  if (apiKeyProvisioned !== true) missing.push("The email provider API key is not provisioned as a server-side secret.");
  if (ownerEmailVerificationSource !== "auth-provider-confirmed-email") missing.push("Business-owner addresses are not sourced from the auth provider's confirmed-email flag.");
  return {ready: missing.length === 0, missing};
}
