/** Isolated central-ingest security boundary. No route mounts this module. */
import { createHash, createPublicKey, verify } from 'node:crypto';

const ID = /^[A-Za-z0-9:_-]{1,128}$/;
const validId = value => typeof value === 'string' && ID.test(value);
const deny = () => { throw new Error('Central event authorization denied'); };

/** The exact signed bytes. IDs cannot contain separators and the payload is base64url. */
export function centralEventSigningBytes(envelope) {
  if (!envelope || envelope.version !== 1 ||
      !['eventId','operationId','businessId','shopId','staffId','deviceId'].every(key => validId(envelope[key])) ||
      typeof envelope.payloadBase64 !== 'string' ||
      !/^[A-Za-z0-9_-]{1,87382}$/.test(envelope.payloadBase64)) deny();
  return Buffer.from(['tallybook.central.sale.v1', envelope.eventId, envelope.operationId,
    envelope.businessId, envelope.shopId, envelope.staffId, envelope.deviceId,
    envelope.payloadBase64].join('\n'), 'utf8');
}

/** `actorId` must come from a verified server session, never from the envelope.
 * Directory reads and persistence must share one database transaction in a
 * future adapter so revocation cannot race a successful insert.
 */
export async function verifyCentralSaleEvent(envelope, actorId, directory) {
  if (!validId(actorId) || !directory ||
      !['getMembership','getDevice','getShop','getStaff','isAssigned'].every(key => typeof directory[key] === 'function')) deny();
  const bytes = centralEventSigningBytes(envelope);
  if (Object.keys(envelope).sort().join(',') !==
      'businessId,deviceId,eventId,operationId,payloadBase64,shopId,signature,staffId,version' ||
      typeof envelope.signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(envelope.signature)) deny();
  let payload, membership, device, shop, staff, assigned, publicKey;
  try {
    const encoded = Buffer.from(envelope.payloadBase64, 'base64url');
    if (encoded.length > 64 * 1024 || encoded.toString('base64url') !== envelope.payloadBase64) deny();
    payload = JSON.parse(encoded.toString('utf8'));
    // One canonical JSON representation prevents duplicate keys or parser
    // differences from changing the meaning of signed business evidence.
    if (Buffer.from(JSON.stringify(payload)).toString('base64url') !== envelope.payloadBase64) deny();
    [membership, device, shop, staff, assigned] = await Promise.all([
      directory.getMembership(envelope.businessId, actorId),
      directory.getDevice(envelope.businessId, envelope.deviceId),
      directory.getShop(envelope.businessId, envelope.shopId),
      directory.getStaff(envelope.businessId, envelope.staffId),
      directory.isAssigned(envelope.businessId, envelope.shopId, envelope.staffId),
    ]);
    publicKey = createPublicKey(device?.publicKeySpkiPem);
  } catch { deny(); }
  if (membership?.businessId !== envelope.businessId || membership?.actorId !== actorId ||
      membership?.staffId !== envelope.staffId || membership?.active !== true ||
      !['owner','manager','attendant'].includes(membership?.role) ||
      shop?.businessId !== envelope.businessId || shop?.id !== envelope.shopId || shop?.active !== true ||
      staff?.businessId !== envelope.businessId || staff?.id !== envelope.staffId || staff?.active !== true ||
      device?.businessId !== envelope.businessId || device?.id !== envelope.deviceId ||
      device?.shopId !== envelope.shopId || device?.actorId !== actorId ||
      (device?.staffId!==undefined && device.staffId!==envelope.staffId) || device?.active !== true ||
      assigned !== true || publicKey.asymmetricKeyType !== 'ed25519') deny();
  const signature = Buffer.from(envelope.signature, 'base64url');
  if (signature.length !== 64 || !verify(null, bytes, publicKey, signature)) deny();
  const sale = payload?.payload?.sale;
  const lines = payload?.payload?.lines;
  const payment = payload?.payload?.payment;
  const receipt = payload?.payload?.receipt;
  if (payload?.kind !== 'sale.completed' || payload?.payloadVersion !== 1 ||
      payload?.deliveryStatus !== 'local_only' || payload?.deviceId !== null ||
      payload?.businessProfileId !== envelope.businessId ||
      payload?.shopId !== envelope.shopId || payload?.staffId !== envelope.staffId ||
      payload?.operationId !== envelope.operationId || payload?.id !== envelope.eventId ||
      payload?.entityId !== sale?.id || sale?.businessProfileId !== envelope.businessId ||
      sale?.storeId !== envelope.shopId || sale?.staffId !== envelope.staffId ||
      envelope.operationId !== `sale:${sale?.id}` ||
      !Number.isSafeInteger(sale?.totalMinor) || sale.totalMinor < 0 ||
      !Number.isSafeInteger(sale?.amountPaidMinor) || sale.amountPaidMinor < 0 ||
      !Number.isSafeInteger(sale?.outstandingMinor) ||
      sale.totalMinor !== sale.amountPaidMinor + sale.outstandingMinor ||
      !Array.isArray(lines) || lines.length === 0 ||
      lines.some(line => line?.saleId !== sale.id || line?.businessProfileId !== envelope.businessId ||
        !Number.isSafeInteger(line?.lineTotalMinor) || line.lineTotalMinor < 0) ||
      receipt?.saleId !== sale.id || receipt?.businessProfileId !== envelope.businessId ||
      receipt?.receiptNumber !== sale.receiptNumber ||
      (payment !== null && (payment?.saleId !== sale.id || payment?.businessProfileId !== envelope.businessId ||
        !Number.isSafeInteger(payment?.amountMinor) || payment.amountMinor <= 0))) deny();
  return Object.freeze({
    businessId: envelope.businessId, shopId: envelope.shopId,
    staffId: envelope.staffId, deviceId: envelope.deviceId, actorId,
    eventId: envelope.eventId, operationId: envelope.operationId,
    payloadSha256: createHash('sha256').update(Buffer.from(envelope.payloadBase64, 'base64url')).digest('hex'),
    payload, financialPostingAllowed: false,
  });
}
