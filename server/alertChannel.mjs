/** Provider-independent alert router. DISABLED by default. No network code lives here.
 *  Channels: "in-app" (internal), "email" (primary external channel), "slack"/"telegram" (optional, disabled by default).
 *  Routing:  business + critical  -> verified business owner (email + in-app)
 *            platform + security  -> designated Tallybook security administrator (email + in-app for platform admins)
 *            everything else      -> in-app only
 *  An external channel is refused unless `externalApproved` is true, an owner-supplied adapter exists, and the recipient is verified.
 *  Message bodies carry redacted detail only (no tokens, PINs, phones, names, emails). */
const SEVERITIES = ["info", "warning", "critical"];
const SECRET_KEY = /(pass(word)?|pin|token|secret|authorization|api[-_]?key|signature|card|phone|email|name)$/i;
const EXTERNAL_OPTIONAL = new Set(["slack", "telegram"]);

export function redact(value, depth = 0) {
  if (depth > 6) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map(v => redact(v, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 30).map(([k, v]) => [k, SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1)]));
  if (typeof value === "string") return value.length > 200 ? value.slice(0, 200) + "…" : value;
  return value;
}

export const defaultAlertConfig = () => ({
  enabled: false,
  externalApproved: false,          // owner approval for ANY external delivery (email included)
  optionalChannels: {slack: false, telegram: false}, // must also be switched on individually
  minSeverity: "warning", dedupeWindowMs: 15 * 60_000, maxPerHour: 20,
  securityAdministrator: null,      // {email, verified:boolean}: designated Tallybook security administrator
});

/** In-memory test sinks. `external:false` = in-app (stored for the signed-in recipient only). */
export function createMemorySink(id = "memory", external = false) { const sent = []; return {id, external, sent, async send(a, recipient) { sent.push({...a, recipient}); }}; }

export function createAlertRouter({config = defaultAlertConfig(), adapters = [], resolveBusinessOwner = async () => null, clock = Date.now} = {}) {
  const byId = new Map(adapters.map(a => [a.id, a]));
  const lastSent = new Map(), hourly = [];
  const drop = reason => ({status: "dropped", reason});

  async function deliver(channelId, alert, recipient, notes) {
    const ad = byId.get(channelId);
    if (!ad) { notes.push(`${channelId}: no adapter`); return false; }
    if (ad.external === true) {
      if (config.externalApproved !== true) { notes.push(`${channelId}: external notifications not approved`); return false; }
      if (EXTERNAL_OPTIONAL.has(channelId) && config.optionalChannels?.[channelId] !== true) { notes.push(`${channelId}: optional channel disabled`); return false; }
      if (!recipient?.verified || typeof recipient.address !== "string" || !recipient.address) { notes.push(`${channelId}: recipient not verified`); return false; }
    }
    try { await ad.send(alert, recipient); return true; } catch { notes.push(`${channelId}: delivery failed`); return false; }
  }

  return Object.freeze({
    /** alert: {key, severity, title, detail, scope: 'business'|'platform', businessId?, category?} */
    async dispatch({key, severity, title, detail, scope = "business", businessId = null, category = "operations"}) {
      if (config.enabled !== true) return drop("alerting disabled");
      if (!SEVERITIES.includes(severity) || typeof key !== "string" || !key || typeof title !== "string" || !["business", "platform"].includes(scope)) return drop("invalid alert");
      if (scope === "business" && (typeof businessId !== "string" || !businessId)) return drop("business alert needs a business");
      if (SEVERITIES.indexOf(severity) < SEVERITIES.indexOf(config.minSeverity)) return drop("below minimum severity");
      const now = clock(), dedupe = `${scope}:${businessId ?? "-"}:${key}`;
      if (now - (lastSent.get(dedupe) ?? -Infinity) < config.dedupeWindowMs) return drop("duplicate within window");
      while (hourly.length && now - hourly[0] > 3_600_000) hourly.shift();
      if (hourly.length >= config.maxPerHour && severity !== "critical") return drop("rate limit");
      const alert = {key, severity, scope, businessId, category, title: String(title).slice(0, 120), detail: redact(detail ?? {}), at: new Date(now).toISOString()};

      // Who gets what.
      const plan = [{channel: "in-app", recipient: {scope, businessId, verified: true, address: "in-app"}}];
      const notes = [];
      if (scope === "business" && severity === "critical") {
        let owner = null; try { owner = await resolveBusinessOwner(businessId); } catch { /* unresolved */ }
        if (!owner) notes.push("email: business owner not resolved");
        else plan.push({channel: "email", recipient: {address: owner.email, verified: owner.verified === true, role: "business-owner"}});
      } else if (scope === "platform" && category === "security" && SEVERITIES.indexOf(severity) >= SEVERITIES.indexOf("warning")) {
        const a = config.securityAdministrator;
        if (!a) notes.push("email: no security administrator designated");
        else plan.push({channel: "email", recipient: {address: a.email, verified: a.verified === true, role: "security-administrator"}});
      }
      if (config.optionalChannels?.slack === true) plan.push({channel: "slack", recipient: plan.at(-1).recipient});
      if (config.optionalChannels?.telegram === true) plan.push({channel: "telegram", recipient: plan.at(-1).recipient});

      const delivered = [];
      for (const p of plan) if (await deliver(p.channel, alert, p.recipient, notes)) delivered.push(p.channel);
      if (delivered.length) { lastSent.set(dedupe, now); hourly.push(now); }
      return delivered.length ? {status: "sent", delivered, notes} : {status: "failed", reason: notes.join("; ") || "no channel delivered", notes};
    },
  });
}
