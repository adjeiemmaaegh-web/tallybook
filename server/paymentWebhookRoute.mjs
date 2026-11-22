/** Payment webhook route (provider -> Tallybook). Disabled unless explicitly enabled; no provider is approved, so only the local
 *  signed sandbox adapter exists. Authenticity is verified by the settlement service BEFORE anything is written; the company
 *  comes only from the signed body. Browsers (cookies/Origin) are refused: this is a server-to-server endpoint. */
const PROVIDER = /^[a-z0-9_-]{2,40}$/;

export function createPaymentWebhookHandler({service, enabled = false, limiter} = {}) {
  const ready = enabled === true && typeof service?.handleWebhook === 'function';
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!ready) { res.status(503).json({error: 'Payment webhooks unavailable'}); return; }
    if (req.get('cookie') || req.get('origin') || req.is('application/json') !== 'application/json') {
      res.status(403).json({error: 'Webhook rejected'}); return;
    }
    const ip = String(req.socket?.remoteAddress ?? 'unknown');
    if (limiter && (typeof limiter.allow !== 'function' || !limiter.allow(ip))) { res.status(429).json({error: 'Rate limit exceeded'}); return; }
    const provider = req.params?.provider;
    const rawBody = req.body;
    if (typeof provider !== 'string' || !PROVIDER.test(provider) || typeof rawBody !== 'string' || rawBody.length === 0 || rawBody.length > 4096) {
      res.status(400).json({error: 'Invalid webhook'}); return;
    }
    // Only x-* provider headers are forwarded (signature + timestamp); bounded in count and size.
    const headers = {};
    for (const [name, value] of Object.entries(req.headers ?? {}).slice(0, 40))
      if (/^x-[a-z0-9-]{1,60}$/.test(name) && typeof value === 'string' && value.length <= 512) headers[name] = value;
    try {
      const result = await service.handleWebhook({providerId: provider, rawBody, headers});
      res.status(200).json({received: true, outcome: result?.outcome ?? 'applied', replayed: result?.replayed === true});
    } catch (error) {
      if (error?.retryable === true) { res.setHeader('Retry-After', '30'); res.status(503).json({error: 'Temporarily unavailable; retry'}); return; }
      if (error?.code === 'unauthenticated') { res.status(401).json({error: 'Webhook rejected'}); return; }
      res.status(422).json({error: 'Webhook not applicable'}); // final: a provider must not retry this
    }
  };
}

export function mountPaymentWebhookRoute(app, rawTextParser, options) {
  if (typeof app?.post !== 'function' || typeof rawTextParser !== 'function') throw Error('Payment webhook route host invalid');
  app.post('/api/payments/webhook/:provider', rawTextParser({limit: '4kb', type: 'application/json'}), createPaymentWebhookHandler(options));
}
