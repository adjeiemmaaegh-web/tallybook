export const MAX_BACKUP_JSON_BYTES: number;
export const MAX_ENCRYPTED_BACKUP_BYTES: number;
export const MAX_ENCRYPTED_BACKUP_DATA_CHARS: number;
export function utf8ExceedsLimit(text: string, limit: number): boolean;
export function assertPlainBackupSize(text: string): string;
export function assertEncryptedBackupSize(text: string): string;
export function assertBackupImportFileSize(size: number): void;
