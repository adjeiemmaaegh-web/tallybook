import type { RequestListener } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
export function selectServerTransport(config: {
  mode?: string;
  production?: boolean;
  accessEnabled?: boolean;
  backupUploadEnabled?: boolean;
  certFile?: string;
  keyFile?: string;
}, app: RequestListener): { server: HttpServer | HttpsServer; scheme: 'http' | 'https' };
