import { SERVER_HOST } from '../shared/kern/grenzen.ts';
import { clientDist, datenbankPfad, lesePort, logLevel } from './kern/config.ts';
import { oeffneDatenbank } from './kern/db.ts';
import { erstelleApp } from './kern/app.ts';

const db = oeffneDatenbank(datenbankPfad());
const stufe = logLevel();
const app = await erstelleApp(db, clientDist(), stufe === 'silent' ? false : stufe);

function beende(): void {
  void app.close().then(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', beende);
process.on('SIGTERM', beende);

try {
  const port = lesePort(process.env.PORT);
  await app.listen({ host: SERVER_HOST, port });
} catch (fehler) {
  app.log.error({ err: fehler }, 'server failed');
  db.close();
  process.exit(1);
}
