import type { ReactNode } from 'react';
import type { VorschlagListe } from '../../../../shared/features/tags/index.ts';
import { HashIcon, PlusIcon } from '../../ui/icons.tsx';

function nameMitFund(name: string, fragment: string): ReactNode {
  if (fragment.length === 0 || !name.toLocaleLowerCase().startsWith(fragment.toLocaleLowerCase())) return name;
  return (
    <>
      <b>{name.slice(0, fragment.length)}</b>
      {name.slice(fragment.length)}
    </>
  );
}

export function Vorschlag({
  liste,
  aktiv,
  fragment,
  top,
  left,
  fest = false,
  onWahl,
}: {
  liste: VorschlagListe;
  aktiv: number;
  fragment: string;
  top: number;
  left: number;
  fest?: boolean;
  onWahl: (index: number) => void;
}) {
  return (
    <div
      id="vorschlaege"
      className="vorschlag"
      role="listbox"
      style={fest ? { position: 'fixed', top, left } : { top, left }}
    >
      {liste.treffer.map((thema, index) => (
        <div
          id={`vorschlag-${index}`}
          key={thema.name}
          role="option"
          aria-selected={index === aktiv}
          className={index === aktiv ? 'z akt' : 'z'}
          onPointerDown={(event) => {
            event.preventDefault();
            onWahl(index);
          }}
        >
          <HashIcon />
          <span className="n">{nameMitFund(thema.name, fragment)}</span>
          <span className="w">{thema.count}</span>
        </div>
      ))}
      {liste.neu && liste.treffer.length > 0 ? <div className="tr" /> : null}
      {liste.neu ? (
        <div
          id={`vorschlag-${liste.treffer.length}`}
          role="option"
          aria-selected={aktiv === liste.treffer.length}
          className={aktiv === liste.treffer.length ? 'z neu akt' : 'z neu'}
          onPointerDown={(event) => {
            event.preventDefault();
            onWahl(liste.treffer.length);
          }}
        >
          <PlusIcon />
          <span className="n">{liste.neuText}</span>
        </div>
      ) : null}
    </div>
  );
}
