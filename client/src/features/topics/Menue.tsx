import { useEffect, useRef } from 'react';
import { PapierkorbIcon, PunkteIcon, StiftIcon, ZusammenIcon } from '../../ui/icons.tsx';

export function ThemenKnopf({
  offen,
  gesperrt,
  onOeffnen,
  onSchliessen,
  onRename,
  onMerge,
  onDelete,
}: {
  offen: boolean;
  gesperrt: boolean;
  onOeffnen: () => void;
  onSchliessen: () => void;
  onRename: () => void;
  onMerge: () => void;
  onDelete: () => void;
}) {
  const kasten = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!offen) return;
    const zu = (event: MouseEvent) => {
      if (!kasten.current?.contains(event.target as Node)) onSchliessen();
    };
    const taste = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onSchliessen();
    };
    document.addEventListener('mousedown', zu);
    document.addEventListener('keydown', taste);
    return () => {
      document.removeEventListener('mousedown', zu);
      document.removeEventListener('keydown', taste);
    };
  }, [offen, onSchliessen]);

  return (
    <div className="menue-anker" ref={kasten}>
      <button
        type="button"
        className={offen ? 'ib on' : 'ib'}
        aria-label="Topic actions"
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-controls={offen ? 'thema-menue' : undefined}
        onClick={() => (offen ? onSchliessen() : onOeffnen())}
      >
        <PunkteIcon />
      </button>
      {offen ? (
        <div className="menue" id="thema-menue" role="menu" aria-label="Topic actions">
          <button type="button" className="m" role="menuitem" onClick={onRename} disabled={gesperrt}>
            <StiftIcon />
            <span>Rename</span>
          </button>
          <button type="button" className="m" role="menuitem" onClick={onMerge} disabled={gesperrt}>
            <ZusammenIcon />
            <span>Merge into…</span>
          </button>
          <div className="tr" role="separator" />
          <button type="button" className="m gef" role="menuitem" onClick={onDelete} disabled={gesperrt}>
            <PapierkorbIcon />
            <span className="mt">
              <span>Delete topic</span>
              <span className="ne">Its notes move to Inbox</span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
