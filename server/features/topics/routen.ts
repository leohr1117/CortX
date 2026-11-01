import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { listeThemen } from './themen.ts';

export function themenRouten(api: FastifyInstance, db: DatabaseSync): void {
  api.get('/topics', async () => ({ topics: listeThemen(db) }));
}
