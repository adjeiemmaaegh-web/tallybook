/** Offline-first backup resource budget (not a quota promise or a data-retention policy).
 * Reject oversized inputs explicitly; never truncate an owner's financial records.
 * A 64 MiB JSON backup becomes roughly 85.4 MiB after AES-GCM/base64 encoding;
 * the 96 MiB encrypted envelope fits under connected recovery's 100 MiB cap.
 */
export const MAX_BACKUP_JSON_BYTES = 64 * 1024 * 1024;
export const MAX_ENCRYPTED_BACKUP_BYTES = 96 * 1024 * 1024;
export const MAX_ENCRYPTED_BACKUP_DATA_CHARS = 4 * Math.ceil((MAX_BACKUP_JSON_BYTES + 16) / 3);

/** Exact TextEncoder-compatible UTF-8 length with O(1) auxiliary memory.
 * Abort as soon as the budget is exceeded; handles surrogate pairs and U+FFFD
 * replacement for unpaired surrogates without materializing a second huge buffer.
 */
export function utf8ExceedsLimit(text, limit) {
  if (typeof text !== 'string' || !Number.isSafeInteger(limit) || limit < 0)
    throw new Error('Invalid backup size check.');
  if (text.length > limit) return true;
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length &&
             text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) {
      bytes += 4;
      i++;
    } else bytes += 3;
    if (bytes > limit) return true;
  }
  return false;
}
export function assertPlainBackupSize(text) {
  if (utf8ExceedsLimit(text, MAX_BACKUP_JSON_BYTES))
    throw new Error('Local backup exceeds the 64 MiB JSON safety limit. No records were imported or truncated.');
  return text;
}
export function assertEncryptedBackupSize(text) {
  if (utf8ExceedsLimit(text, MAX_ENCRYPTED_BACKUP_BYTES))
    throw new Error('Encrypted backup exceeds the 96 MiB safety limit. No records were imported.');
  return text;
}
export function assertBackupImportFileSize(size) {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ENCRYPTED_BACKUP_BYTES)
    throw new Error('Backup file exceeds the 96 MiB import limit or has an invalid size. No records were imported.');
}
