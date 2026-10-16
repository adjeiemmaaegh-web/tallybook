import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync, lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto';

function loadSecretFile(filename, label) {
  if (typeof filename !== 'string' || !isAbsolute(filename)) throw new Error(`${label} must use an absolute path`);
  const stat = lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
  if (process.platform !== 'win32' && (stat.mode & 0o022) !== 0) throw new Error(`${label} is writable by group or others`);
  return readFileSync(filename);
}

export function selectServerTransport(config, app) {
  const mode = config.mode ?? 'http';
  if (mode !== 'http' && mode !== 'https') throw new Error('Invalid server transport mode');
  if (mode === 'http') {
    if (config.production) throw new Error('Production requires directly configured HTTPS');
    if (config.accessEnabled || config.backupUploadEnabled || config.encryptedRelayEnabled) throw new Error('Sensitive routes require HTTPS');
    return { server: createHttpServer(app), scheme: 'http' };
  }
  const cert = loadSecretFile(config.certFile, 'TLS certificate');
  const key = loadSecretFile(config.keyFile, 'TLS private key');
  const certificate = new X509Certificate(cert);
  const privateKey = createPrivateKey(key);
  const certificatePublicKey = certificate.publicKey.export({ type: 'spki', format: 'der' });
  const keyPublicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  if (!certificatePublicKey.equals(keyPublicKey)) throw new Error('TLS certificate and key mismatch');
  const now = Date.now();
  if (now < Date.parse(certificate.validFrom) || now >= Date.parse(certificate.validTo)) throw new Error('TLS certificate is not currently valid');
  return {
    server: createHttpsServer({ cert, key, minVersion: 'TLSv1.2', honorCipherOrder: true }, app),
    scheme: 'https',
  };
}
