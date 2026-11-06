export interface ShopVaultScope { userId: string; companyId: string }
export interface ShopVaultDescriptor {
  kind: "tallybook.shared-shop.vault.v1";
  iterations: number;
  salt: string;
  checkIv: string;
  check: string;
}
export interface ShopSealedPayload { version: 1; iv: string; data: string }
export function createShopVault(scope: ShopVaultScope, passphrase: string): Promise<{
  descriptor: ShopVaultDescriptor; key: CryptoKey;
}>;
export function unlockShopVault(scope: ShopVaultScope, passphrase: string, descriptor: ShopVaultDescriptor): Promise<CryptoKey>;
export function encryptQueuedSale(scope: ShopVaultScope, saleKey: string, key: CryptoKey, payload: unknown): Promise<ShopSealedPayload>;
export function decryptQueuedSale(scope: ShopVaultScope, saleKey: string, key: CryptoKey, envelope: ShopSealedPayload): Promise<unknown>;
