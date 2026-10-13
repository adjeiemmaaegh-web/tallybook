/** Local payment contract simulator. Never connected to a ledger or an HTTP route. */
export function createPaymentGateway(config = {}) {
  const mode = config.mode ?? 'disabled';
  if (mode === 'disabled') return Object.freeze({ mode, createIntent() { throw new Error('Online payments are disabled: no provider is approved.'); } });
  if (mode !== 'mock' || !['local-test', 'local-development'].includes(config.environment))
    throw new Error('Only explicitly configured local mock payments are available. No provider is approved.');
  const intents = new Map(), events = new Map();
  const identity = value => { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('Invalid mock payment identity.'); return value; };
  const key = (companyId, id) => JSON.stringify([identity(companyId), identity(id)]);
  const money = value => { if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid payment amount.'); return value; };
  return Object.freeze({
    mode: 'mock',
    createIntent({companyId, submissionKey, amountMinor, currency, method}) {
      const id = key(companyId, submissionKey); money(amountMinor);
      if (!/^[A-Z]{3}$/.test(currency) || !['mobile', 'card'].includes(method)) throw new Error('Invalid payment currency or method.');
      const existing = intents.get(id);
      if (existing) {
        if (existing.amountMinor !== amountMinor || existing.currency !== currency || existing.method !== method) throw new Error('Payment idempotency key reused with different details.');
        return structuredClone(existing);
      }
      const intent = {companyId, submissionKey, amountMinor, currency, method, status:'pending', refundedMinor:0, simulated:true, provider:'mock'};
      intents.set(id,intent); return structuredClone(intent);
    },
    inspect(companyId, submissionKey) {
      const intent = intents.get(key(companyId, submissionKey));
      if (!intent) throw new Error('Mock payment not found for this company.');
      return structuredClone(intent);
    },
    simulate({companyId, submissionKey, eventId, action, refundMinor}) {
      const id = key(companyId, submissionKey), eventKey = key(companyId, eventId);
      const fingerprint = JSON.stringify([submissionKey,action,refundMinor ?? null]);
      if (events.has(eventKey)) {
        const previous = events.get(eventKey);
        if (previous.fingerprint !== fingerprint) throw new Error('Conflicting duplicate mock event.');
        return structuredClone(previous.result);
      }
      const intent = intents.get(id);
      if (!intent) throw new Error('Mock payment not found for this company.');
      const next = {...intent};
      if (action === 'timeout' && next.status === 'pending') { /* Remains pending: outcome is unknown. */ }
      else if (action === 'succeed' && next.status === 'pending') next.status = 'succeeded';
      else if (action === 'fail' && next.status === 'pending') next.status = 'failed';
      else if (action === 'refund' && next.status === 'succeeded') {
        money(refundMinor);
        if (refundMinor > next.amountMinor - next.refundedMinor) throw new Error('Refund exceeds captured amount.');
        next.refundedMinor += refundMinor;
        if (next.refundedMinor === next.amountMinor) next.status = 'refunded';
      } else if (action === 'chargeback' && next.status === 'succeeded' && next.refundedMinor === 0) next.status = 'charged-back';
      else throw new Error('Invalid mock payment transition.');
      intents.set(id,next); events.set(eventKey,{fingerprint,result:next}); return structuredClone(next);
    },
  });
}
