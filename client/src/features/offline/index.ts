export {
  ENTWURF_ID,
  ENTWURF_STORE,
  LOKAL_DB,
  WARTESCHLANGE_STORE,
  liesEntwurf,
  schreibEntwurf,
} from './speicher.ts';
export { legeInWarteschlange, spuele, type LokalErgebnis, type SyncStand } from './sync.ts';
