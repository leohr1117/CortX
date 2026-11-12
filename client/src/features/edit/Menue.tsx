import { useEffect, useRef } from 'react';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import { HashIcon, PapierkorbIcon, PunkteIcon } from '../../ui/icons.tsx';

export function NotizKnopf({
  id,
  offen,
  gesperrt,
  onOeffnen,
  onSchliessen,
  onChange,
  onExport,
  onDelete,
}: {
  id: number;
  offen: boolean;
  gesperrt: boolean;
  onOeffnen: () => void;
  onSchliessen: () => void;
  onChange: () => void;
  onExport?: () => void;
  onDelete: () => void;
}) {
  const kasten = useRef<HTMLDivElement>(null);
  const menueId = `note-menu-${id}`;

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
        aria-label={TEXTE.notizAktionen}
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-controls={offen ? menueId : undefined}
        onClick={() => (offen ? onSchliessen() : onOeffnen())}
      >
        <PunkteIcon />
      </button>
      {offen ? (
        <div className="menue" id={menueId} role="menu" aria-label={TEXTE.notizAktionen}>
          <button type="button" className="m" role="menuitem" onClick={onChange} disabled={gesperrt}>
            <HashIcon />
            <span>{TEXTE.aendern}</span>
          </button>
          {onExport ? (
            <button type="button" className="m" role="menuitem" onClick={onExport} disabled={gesperrt}>
              <span>{TEXTE.exportMarkdown}</span>
            </button>
          ) : null}
          <div className="tr" role="separator" />
          <button type="button" className="m gef" role="menuitem" onClick={onDelete} disabled={gesperrt}>
            <PapierkorbIcon />
            <span>{TEXTE.loeschen}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
