import { useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, type TouchEvent } from 'react';
import {
  ART,
  EBENE,
  STIL_VAR,
  kombiniereStil,
  leseDokument,
  sicherZiel,
  leseBaum,
  vorschauTag,
  type LeseBlock,
  type LeseHakenPunkt,
  type LeseLinkTeil,
  type LeseTeil,
  type VorschauTag,
} from '../../../../shared/features/format/index.ts';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import { HakenIcon } from '../../ui/icons.tsx';

function Markierung({ children }: { children: ReactNode }) {
  const hintergrund = kombiniereStil([ART.wichtig]).hintergrund;
  const style = hintergrund ? ({ [STIL_VAR]: hintergrund } as CSSProperties) : undefined;
  const Tag = vorschauTag(ART.wichtig) as VorschauTag;
  return (
    <Tag style={style}>
      <span className="sr-nur">{TEXTE.wichtigLesung}</span>
      {children}
    </Tag>
  );
}

function Schrift({ teil, verlinken }: { teil: LeseTeil; verlinken: boolean }) {
  if (teil.art === ART.text) return teil.text;
  if (teil.art === ART.code) {
    const Tag = vorschauTag(ART.code) as VorschauTag;
    return <Tag>{teil.text}</Tag>;
  }
  if (teil.art === ART.link) return <LinkTeil teil={teil} verlinken={verlinken} />;
  if (teil.art === ART.wichtig) {
    if ('teile' in teil) {
      return (
        <Markierung>
          <Teile teile={teil.teile} verlinken={verlinken} />
        </Markierung>
      );
    }
    return <Markierung>{teil.text}</Markierung>;
  }
  const Tag = (vorschauTag(teil.art) ?? 's') as VorschauTag;
  if ('text' in teil) return <Tag>{teil.text}</Tag>;
  return (
    <Tag>
      <Teile teile={teil.teile} verlinken={verlinken} />
    </Tag>
  );
}

function Teile({ teile, verlinken }: { teile: readonly LeseTeil[]; verlinken: boolean }) {
  return teile.map((teil, index) => <Schrift key={index} teil={teil} verlinken={verlinken} />);
}

function LinkTeil({ teil, verlinken }: { teil: LeseLinkTeil; verlinken: boolean }) {
  const ziel = verlinken ? sicherZiel(teil.ziel) : null;
  if (!ziel) return <Teile teile={teil.teile} verlinken={verlinken} />;
  return (
    <a href={ziel} target="_blank" rel="noreferrer noopener">
      <Teile teile={teil.teile} verlinken={false} />
    </a>
  );
}

function KastenSchalter({
  abgehakt,
  stelle,
  onKasten,
}: {
  abgehakt: boolean;
  stelle: number;
  onKasten: (stelle: number) => void;
}) {
  const finger = useRef(false);
  function schalten() {
    onKasten(stelle);
  }
  function beiKlick(event: MouseEvent<HTMLSpanElement>) {
    if (finger.current) {
      finger.current = false;
      event.preventDefault();
      return;
    }
    schalten();
  }
  function beiFinger(event: TouchEvent<HTMLSpanElement>) {
    finger.current = true;
    event.preventDefault();
    schalten();
  }
  function beiTaste(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.repeat || (event.key !== ' ' && event.key !== 'Spacebar')) return;
    event.preventDefault();
    schalten();
  }
  return (
    <span
      className={abgehakt ? 'haken zu' : 'haken'}
      role="checkbox"
      aria-checked={abgehakt}
      aria-label={TEXTE.kasten}
      tabIndex={0}
      onClick={beiKlick}
      onTouchEnd={beiFinger}
      onKeyDown={beiTaste}
    >
      {abgehakt ? <HakenIcon /> : null}
    </span>
  );
}

function Kasten({
  abgehakt,
  stelle,
  onKasten,
}: {
  abgehakt: boolean;
  stelle: number | null;
  onKasten?: (stelle: number) => void;
}) {
  if (stelle === null || !onKasten) {
    return (
      <span className={abgehakt ? 'haken zu' : 'haken'} aria-hidden="true">
        {abgehakt ? <HakenIcon /> : null}
      </span>
    );
  }
  return <KastenSchalter abgehakt={abgehakt} stelle={stelle} onKasten={onKasten} />;
}

function Haken({
  punkte,
  verlinken,
  stelleVon,
  onKasten,
}: {
  punkte: readonly LeseHakenPunkt[];
  verlinken: boolean;
  stelleVon: () => number | null;
  onKasten?: (stelle: number) => void;
}) {
  return punkte.map((punkt, index) => (
    <div className="hakenzeile" key={index}>
      <Kasten abgehakt={punkt.abgehakt} stelle={stelleVon()} onKasten={onKasten} />
      <span className="hakenlabel">
        <Teile teile={punkt.teile} verlinken={verlinken} />
      </span>
    </div>
  ));
}

function Block({
  block,
  verlinken,
  abschnitt,
  stelleVon,
  onKasten,
}: {
  block: LeseBlock;
  verlinken: boolean;
  abschnitt: number | null;
  stelleVon: () => number | null;
  onKasten?: (stelle: number) => void;
}) {
  if (block.art === ART.ueberschrift) {
    const inhalt = <Teile teile={block.teile} verlinken={verlinken} />;
    if (block.stufe === EBENE.titel) return <h2 className="titel">{inhalt}</h2>;
    if (block.stufe === EBENE.abschnitt) {
      return (
        <h2 className="abschnitt" id={abschnitt === null ? undefined : `abschnitt-${abschnitt}`}>
          {inhalt}
        </h2>
      );
    }
    return <h3>{inhalt}</h3>;
  }
  if (block.art === ART.liste) {
    const Tag = block.geordnet ? 'ol' : 'ul';
    const schrift = block.schrift;
    const klasse = schrift && schrift !== 'zahl' ? (schrift === 'roemischKlein' ? 'roemisch-klein' : schrift) : undefined;
    return (
      <Tag className={klasse}>
        {block.punkte.map((teile, index) => (
          <li key={index}>
            <Teile teile={teile} verlinken={verlinken} />
          </li>
        ))}
      </Tag>
    );
  }
  if (block.art === ART.wichtig) {
    return (
      <div className="wichtigzeile">
        <Markierung>
          <Teile teile={block.teile} verlinken={verlinken} />
        </Markierung>
      </div>
    );
  }
  if (block.art === ART.haken) {
    return <Haken punkte={block.punkte} verlinken={verlinken} stelleVon={stelleVon} onKasten={onKasten} />;
  }
  if (block.art === ART.codeblock) {
    return (
      <pre>
        <code>{block.text}</code>
      </pre>
    );
  }
  return (
    <p>
      {block.zeilen.map((teile, index) => (
        <span className="lauf" key={index}>
          <Teile teile={teile} verlinken={verlinken} />
        </span>
      ))}
    </p>
  );
}

function hakenStellen(text: string): number[] {
  const aus: number[] = [];
  for (const beleg of leseDokument(text).belege) {
    if (beleg.art === ART.haken) aus.push(beleg.ganzVon);
  }
  return aus;
}

export function LeseText({
  text,
  verlinken = false,
  onKasten,
}: {
  text: string;
  verlinken?: boolean;
  onKasten?: (stelle: number) => void;
}) {
  const baum = leseBaum(text, true);
  const stellen = onKasten ? hakenStellen(text) : [];
  const cursor = { n: 0 };
  const stelleVon = () => {
    if (!onKasten || cursor.n >= stellen.length) return null;
    const stelle = stellen[cursor.n] ?? null;
    cursor.n += 1;
    return stelle;
  };
  let nummer = 0;
  return (
    <div className="lesetext">
      {baum.map((block, index) => {
        const abschnitt = block.art === ART.ueberschrift && block.stufe === EBENE.abschnitt ? nummer++ : null;
        return (
          <Block
            key={index}
            block={block}
            verlinken={verlinken}
            abschnitt={abschnitt}
            stelleVon={stelleVon}
            onKasten={onKasten}
          />
        );
      })}
    </div>
  );
}
