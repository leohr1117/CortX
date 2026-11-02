import type { ReactNode } from 'react';
import type { VorschlagListe } from '../../../../shared/features/tags/index.ts';
import { HashIcon, PlusIcon } from '../../ui/icons.tsx';
import { klickTipp, losTipp, merkTipp } from '../../ui/tipp.ts';

function nameMitFund(name: string, fragment: string): ReactNode {
  const nadel = fragment.toLocaleLowerCase();
  if (fragment.length === 0 || !name.toLocaleLowerCase().startsWith(nadel)) return name;
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
  maxHeight,
  fest = false,
  onWahl,
}: {
  liste: VorschlagListe;
  aktiv: number;
  fragment: string;
  top: number;
  left: number;
  maxHeight: number;
  fest?: boolean;
  onWahl: (index: number) => void;
}) {
  return (
    <div
      id="vorschlaege"
      className="vorschlag rolle"
      role="listbox"
      style={fest ? { position: 'fixed', top, left, maxHeight } : { top, left, maxHeight }}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse') event.preventDefault();
      }}
    >
      {liste.treffer.map((eintrag, index) => (
        <div
          id={`vorschlag-${index}`}
          key={`${index}-${eintrag.einsetzen}`}
          role="option"
          aria-selected={index === aktiv}
          className={index === aktiv ? 'z akt' : 'z'}
          onPointerDown={merkTipp}
          onPointerUp={losTipp}
          onClick={(event) => {
            if (klickTipp(event)) return;
            onWahl(index);
          }}
        >
          <HashIcon />
          <span className="n">{nameMitFund(eintrag.name, fragment)}</span>
          {eintrag.zahl !== null ? <span className="w">{eintrag.zahl}</span> : null}
        </div>
      ))}
      {liste.neu && liste.treffer.length > 0 ? <div className="tr" /> : null}
      {liste.neu ? (
        <div
          id={`vorschlag-${liste.treffer.length}`}
          role="option"
          aria-selected={aktiv === liste.treffer.length}
          className={aktiv === liste.treffer.length ? 'z neu akt' : 'z neu'}
          onPointerDown={merkTipp}
          onPointerUp={losTipp}
          onClick={(event) => {
            if (klickTipp(event)) return;
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
