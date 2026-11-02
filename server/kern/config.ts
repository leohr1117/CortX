import path from 'node:path';
import { SERVER_HOST, SERVER_PORT, STRIDE_PORT, STRIDE_PUBLIC_URL } from '../../shared/kern/grenzen.ts';
import { istTestlauf, verweigereEchteDatenbank, WURZEL } from './testpfad.ts';

export function datenbankPfad(): string {
  const gesetzt = process.env.CORTEX_DB;
  if (istTestlauf()) {
    if (!gesetzt) {
      throw new Error('Tests need CORTEX_DB pointing outside data/.');
    }
    return verweigereEchteDatenbank(gesetzt);
  }
  return gesetzt ?? path.join(WURZEL, 'data', 'cortex.db');
}

export function lesePort(wert: string | undefined): number {
  if (wert === undefined || wert === '') return SERVER_PORT;
  const port = Number(wert);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${wert}".`);
  }
  if (port === STRIDE_PORT) {
    throw new Error('Port 3000 belongs to Stride.');
  }
  return port;
}

export function logLevel(): string {
  return process.env.LOG_LEVEL ?? 'warn';
}

export function clientDist(): string {
  return path.join(WURZEL, 'client', 'dist');
}

export function strideUrl(): string {
  const gesetzt = process.env.CORTEX_STRIDE_URL;
  if (!gesetzt) return `http://${SERVER_HOST}:${STRIDE_PORT}/api/zugang`;
  return new URL(gesetzt).toString();
}

export function stridePublicUrl(): string {
  const gesetzt = process.env.CORTX_STRIDE_PUBLIC_URL;
  if (!gesetzt) return STRIDE_PUBLIC_URL;
  return new URL(gesetzt).origin;
}
