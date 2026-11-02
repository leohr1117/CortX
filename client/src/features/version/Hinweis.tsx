import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  entscheideUpdateHinweis,
  type VersionsAenderung,
} from '../../../../shared/features/version/index.ts';
import { AKTUELLE_VERSION } from '../../../../shared/versionen.ts';
import { ladeStand, merkeStand } from './api.ts';

const DAUER_MS = 10_000;
const NEU_PFAD = '/library/whats-new';
const WURZEL = 'update-hinweis';

function schreibe(teil: { benachrichtigt?: string; gesehen?: string }): VersionsAenderung {
  const koerper: VersionsAenderung = {};
  if (teil.benachrichtigt) koerper.notified = teil.benachrichtigt;
  if (teil.gesehen) koerper.seen = teil.gesehen;
  return koerper;
}

function Snackbar({ onAktion, onEnde }: { onAktion: () => void; onEnde: () => void }) {
  const ende = useRef(onEnde);
  ende.current = onEnde;

  useEffect(() => {
    let timer = 0;
    let pause = false;
    let fokus = false;
    let zeiger = false;
    let rest = DAUER_MS;
    let start = 0;
    const plan = () => {
      start = performance.now();
      timer = window.setTimeout(() => ende.current(), rest);
    };
    const halte = () => {
      const aktiv = fokus || zeiger;
      if (aktiv && !pause) {
        pause = true;
        window.clearTimeout(timer);
        rest = Math.max(0, rest - (performance.now() - start));
        return;
      }
      if (!aktiv && pause) {
        pause = false;
        plan();
      }
    };
    const wurzelVon = () => document.getElementById(WURZEL);
    const beiFokus = (ereignis: FocusEvent) => {
      const wurzel = wurzelVon();
      if (!wurzel?.contains(ereignis.target as Node)) return;
      fokus = true;
      halte();
    };
    const beiBlur = (ereignis: FocusEvent) => {
      const wurzel = wurzelVon();
      const neu = ereignis.relatedTarget;
      if (neu instanceof Node && wurzel?.contains(neu)) return;
      if (!fokus) return;
      fokus = false;
      halte();
    };
    const beiEnter = () => {
      zeiger = true;
      halte();
    };
    const beiLeave = () => {
      zeiger = false;
      halte();
    };
    plan();
    document.addEventListener('focusin', beiFokus);
    document.addEventListener('focusout', beiBlur);
    const wurzel = wurzelVon();
    wurzel?.addEventListener('mouseenter', beiEnter);
    wurzel?.addEventListener('mouseleave', beiLeave);
    wurzel?.addEventListener('pointerenter', beiEnter);
    wurzel?.addEventListener('pointerleave', beiLeave);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', beiFokus);
      document.removeEventListener('focusout', beiBlur);
      wurzel?.removeEventListener('mouseenter', beiEnter);
      wurzel?.removeEventListener('mouseleave', beiLeave);
      wurzel?.removeEventListener('pointerenter', beiEnter);
      wurzel?.removeEventListener('pointerleave', beiLeave);
    };
  }, []);

  return (
    <div className="toast hinweis" id={WURZEL} role="status" data-update-hinweis="" data-dauer={DAUER_MS}>
      <span className="t">CortX was updated</span>
      <span className="dot" aria-hidden="true">
        ·
      </span>
      <button type="button" className="a" onClick={onAktion}>
        What's new
      </button>
    </div>
  );
}

export function UpdateHinweis() {
  const navigiere = useNavigate();
  const { pathname } = useLocation();
  const [zeigen, setZeigen] = useState(false);

  useEffect(() => {
    let aktiv = true;
    void ladeStand()
      .then((stand) => {
        if (!aktiv) return;
        const entscheid = entscheideUpdateHinweis(
          { benachrichtigt: stand.notified, gesehen: stand.seen },
          AKTUELLE_VERSION,
          stand.fresh,
        );
        if (entscheid.schreiben) void merkeStand(schreibe(entscheid.schreiben));
        if (aktiv) setZeigen(entscheid.snackbar);
      })
      .catch(() => undefined);
    return () => {
      aktiv = false;
    };
  }, []);

  useEffect(() => {
    if (pathname === NEU_PFAD) setZeigen(false);
  }, [pathname]);

  if (!zeigen || pathname === NEU_PFAD) return null;
  return (
    <Snackbar
      onEnde={() => setZeigen(false)}
      onAktion={() => {
        setZeigen(false);
        void navigiere(NEU_PFAD);
      }}
    />
  );
}
