/** Provider-independent alert dispatcher. DISABLED by default. No network code lives here.
 *  Only the in-memory sink exists. Email/Slack/Telegram need an adapter that the owner approves and supplies; without
 *  `externalApproved: true` AND an adapter, dispatch to an external channel is refused. */
const SEVERITIES = ["info", "warning", "critical"];
const SECRET_KEY = /(pass(word)?|pin|token|secret|authorization|api[-_]?key|signature|card|phone|email|name)$/i;

export function redact(value, depth = 0) {
  if (depth > 6) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map(v => redact(v, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 30).map(([k, v]) => [k, SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1)]));
  if (typeof value === "string") return value.length > 200 ? value.slice(0, 200) + "…" : value;
  return value;
}

export const defaultAlertConfig = () => ({enabled: false, externalApproved: false, minSeverity: "warning", dedupeWindowMs: 15 * 60_000, maxPerHour: 20, channels: []});

export function createMemorySink() { const sent = []; return {id: "memory", external: false, sent, async send(a) { sent.push(a); }}; }

export function createAlertDispatcher({config = defaultAlertConfig(), adapters = [], clock = Date.now} = {}) {
  const byId = new Map(adapters.map(a => [a.id, a]));
  const lastSent = new Map(), hourly = [];
  const outcome = (status, reason) => ({status, reason});
  return Object.freeze({
    async dispatch({key, severity, title, detail}) {
      if (config.enabled !== true) return outcome("dropped", "alerting disabled");
      if (!SEVERITIES.includes(severity) || typeof key !== "string" || !key || typeof title !== "string") return outcome("dropped", "invalid alert");
      if (SEVERITIES.indexOf(severity) < SEVERITIES.indexOf(config.minSeverity)) return outcome("dropped", "below minimum severity");
      const now = clock();
      if (now - (lastSent.get(key) ?? -Infinity) < config.dedupeWindowMs) return outcome("dropped", "duplicate within window");
      while (hourly.length && now - hourly[0] > 3_600_000) hourly.shift();
      if (hourly.length >= config.maxPerHour && severity !== "critical") return outcome("dropped", "rate limit");
      const alert = {key, severity, title: String(title).slice(0, 120), detail: redact(detail ?? {}), at: new Date(now).toISOString()};
      let delivered = 0; const failures = [];
      for (const id of config.channels) {
        const ad = byId.get(id);
        if (!ad) { failures.push(`${id}: no adapter`); continue; }
        if (ad.external === true && config.externalApproved !== true) { failures.push(`${id}: external notifications not approved`); continue; }
        try { await ad.send(alert); delivered++; } catch { failures.push(`${id}: delivery failed`); }
      }
      if (delivered > 0) { lastSent.set(key, now); hourly.push(now); }
      return delivered > 0 ? {status: "sent", delivered, failures} : {status: "failed", reason: failures.join("; ") || "no channels configured", failures};
    },
  });
}
