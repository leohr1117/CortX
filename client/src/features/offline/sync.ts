import type { Notiz } from '../../../../shared/kern/modell.ts';

type DateiNotiz = Notiz & { ziel?: string; undo?: string };
import {
  entferneQueueOffen,
  exklusiv,
  liesQueueOffen,
  putEntwurfOffen,
  putQueueOffen,
} from './speicher.ts';
import {
  baueEintrag,
  istDauerhaft,
  naechsteSeq,
  reihenfolge,
  type WarteschlangeEintrag,
} from './warteschlange.ts';

interface SyncTreffer {
  clientId: string;
  notiz: DateiNotiz;
  text: string;
}

interface SyncStand {
  erledigt: SyncTreffer[];
  rest: WarteschlangeEintrag[];
  dauerhaft: boolean;
  grund: string | null;
}

type LokalErgebnis =
  | { art: 'abgelegt'; clientId: string; notiz: DateiNotiz }
  | { art: 'offline'; clientId: string }
  | { art: 'abgelehnt'; clientId: string; grund: string | null };

type Senden = (eintrag: WarteschlangeEintrag) => Promise<DateiNotiz>;

function httpStatus(fehler: unknown): number | null {
  if (typeof fehler !== 'object' || fehler === null || !('status' in fehler)) return null;
  const status = (fehler as { status: unknown }).status;
  if (status === null) return null;
  return typeof status === 'number' ? status : null;
}

async function spueleOffen(sende: Senden): Promise<SyncStand> {
  const erledigt: SyncTreffer[] = [];
  let dauerhaft = false;
  let grund: string | null = null;
  const liste = reihenfolge(await liesQueueOffen());
  for (const eintrag of liste) {
    try {
      const notiz = await sende(eintrag);
      await entferneQueueOffen(eintrag.clientId);
      erledigt.push({ clientId: eintrag.clientId, notiz, text: eintrag.text });
    } catch (fehler) {
      dauerhaft = istDauerhaft(httpStatus(fehler));
      grund = fehler instanceof Error ? fehler.message : null;
      break;
    }
  }
  return { erledigt, rest: reihenfolge(await liesQueueOffen()), dauerhaft, grund };
}

export function spuele(sende: Senden): Promise<SyncStand> {
  return exklusiv(() => spueleOffen(sende));
}

export function legeInWarteschlange(text: string, online: boolean, sende: Senden): Promise<LokalErgebnis> {
  return exklusiv(async () => {
    const liste = await liesQueueOffen();
    const eintrag = baueEintrag(text, crypto.randomUUID(), naechsteSeq(liste), new Date().toISOString());
    try {
      await putQueueOffen(eintrag);
      await putEntwurfOffen('');
    } catch (fehler) {
      await entferneQueueOffen(eintrag.clientId).catch(() => undefined);
      throw fehler;
    }
    if (!online) return { art: 'offline', clientId: eintrag.clientId };
    const stand = await spueleOffen(sende);
    const treffer = stand.erledigt.find((item) => item.clientId === eintrag.clientId);
    if (treffer) return { art: 'abgelegt', clientId: eintrag.clientId, notiz: treffer.notiz };
    if (stand.dauerhaft && stand.rest[0]?.clientId === eintrag.clientId) {
      await entferneQueueOffen(eintrag.clientId);
      await putEntwurfOffen(text);
      return { art: 'abgelehnt', clientId: eintrag.clientId, grund: stand.grund };
    }
    return { art: 'offline', clientId: eintrag.clientId };
  });
}
