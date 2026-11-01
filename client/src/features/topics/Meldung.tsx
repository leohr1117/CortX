import { zitier } from '../../../../shared/features/topics/index.ts';

export interface PflegeMeldung {
  art: 'deleted' | 'merged';
  name: string;
  token: string;
  into?: string;
}

function text(wert: unknown): wert is string {
  return typeof wert === 'string' && wert.length > 0;
}

export function liesPflegeMeldung(state: unknown): PflegeMeldung | null {
  if (!state || typeof state !== 'object' || !('pflege' in state)) return null;
  const roh = (state as { pflege?: unknown }).pflege;
  if (!roh || typeof roh !== 'object') return null;
  const wert = roh as { art?: unknown; name?: unknown; token?: unknown; into?: unknown };
  if (!text(wert.token) || !text(wert.name)) return null;
  if (wert.art === 'deleted') return { art: 'deleted', name: wert.name, token: wert.token };
  if (wert.art === 'merged' && text(wert.into)) {
    return { art: 'merged', name: wert.name, into: wert.into, token: wert.token };
  }
  return null;
}

const MERKER = 'cortex.topic-undo';

export function merkePflege(meldung: PflegeMeldung): void {
  try {
    sessionStorage.setItem(MERKER, JSON.stringify(meldung));
  } catch {
    return;
  }
}

export function liesGemerktePflege(): PflegeMeldung | null {
  try {
    const roh = sessionStorage.getItem(MERKER);
    if (!roh) return null;
    return liesPflegeMeldung({ pflege: JSON.parse(roh) as unknown });
  } catch {
    return null;
  }
}

export function vergissPflege(): void {
  try {
    sessionStorage.removeItem(MERKER);
  } catch {
    return;
  }
}

export function PflegeToast({
  meldung,
  fehler,
  gesperrt,
  onUndo,
}: {
  meldung: PflegeMeldung;
  fehler: string | null;
  gesperrt: boolean;
  onUndo: () => void;
}) {
  return (
    <div className="toast ruhe" role="status">
      <span className="t">
        {fehler ? (
          fehler
        ) : meldung.art === 'deleted' ? (
          <>{zitier(meldung.name)} deleted</>
        ) : (
          <>
            {zitier(meldung.name)} merged into <b>{meldung.into}</b>
          </>
        )}
      </span>
      <span className="dot">·</span>
      <button type="button" className="a" onClick={onUndo} disabled={gesperrt}>
        Undo
      </button>
    </div>
  );
}
