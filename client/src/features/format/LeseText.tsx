import { Fragment, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, type TouchEvent } from 'react';
import type { Node } from 'prosemirror-model';
import {
  ART,
  EBENE,
  STIL_VAR,
  kombiniereStil,
  sicherZiel,
  vorschauTag,
  type VorschauTag,
} from '../../../../shared/features/format/index.ts';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import { HakenIcon } from '../../ui/icons.tsx';
import { leseKnoten, leseStuecke, type KnotenBlock, type LeseHaken, type LeseStueck } from './leseKnoten.ts';

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

function markeArt(name: string): string {
  return name === 'strich' ? ART.streich : name;
}

function Stueck({ stueck, verlinken }: { stueck: LeseStueck; verlinken: boolean }) {
  if ('text' in stueck) return stueck.text;
  const art = markeArt(stueck.marke.type.name);
  if (art === ART.link) return <LinkTeil stueck={stueck} verlinken={verlinken} />;
  const inhalt = <Stuecke stuecke={stueck.teile} verlinken={verlinken} />;
  if (art === ART.wichtig) return <Markierung>{inhalt}</Markierung>;
  const Tag = (vorschauTag(art) ?? 's') as VorschauTag;
  return <Tag>{inhalt}</Tag>;
}

function Stuecke({ stuecke, verlinken }: { stuecke: readonly LeseStueck[]; verlinken: boolean }) {
  return stuecke.map((stueck, index) => <Stueck key={index} stueck={stueck} verlinken={verlinken} />);
}

function LinkTeil({ stueck, verlinken }: { stueck: Extract<LeseStueck, { marke: unknown }>; verlinken: boolean }) {
  const ziel = verlinken ? sicherZiel(String(stueck.marke.attrs.ziel ?? '')) : null;
  if (!ziel) return <Stuecke stuecke={stueck.teile} verlinken={verlinken} />;
  return (
    <a href={ziel} target="_blank" rel="noreferrer noopener">
      <Stuecke stuecke={stueck.teile} verlinken={false} />
    </a>
  );
}

function Zeilen({ zeilen, verlinken }: { zeilen: readonly Node[]; verlinken: boolean }) {
  return zeilen.map((zeile, index) => (
    <Fragment key={index}>
      {index > 0 ? '\n' : null}
      <Stuecke stuecke={leseStuecke(zeile)} verlinken={verlinken} />
    </Fragment>
  ));
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
  onKasten,
}: {
  punkte: readonly LeseHaken[];
  verlinken: boolean;
  onKasten?: (stelle: number) => void;
}) {
  return punkte.map((punkt, index) => (
    <div className="hakenzeile" key={index}>
      <Kasten abgehakt={punkt.abgehakt} stelle={onKasten ? punkt.pos : null} onKasten={onKasten} />
      <span className="hakenlabel">
        <Zeilen zeilen={punkt.zeilen} verlinken={verlinken} />
      </span>
    </div>
  ));
}

function Block({
  block,
  verlinken,
  abschnitt,
  onKasten,
}: {
  block: KnotenBlock;
  verlinken: boolean;
  abschnitt: number | null;
  onKasten?: (stelle: number) => void;
}) {
  if (block.art === ART.ueberschrift) {
    const inhalt = <Zeilen zeilen={[block.knoten]} verlinken={verlinken} />;
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
        {block.punkte.map((zeilen, index) => (
          <li key={index}>
            <Zeilen zeilen={zeilen} verlinken={verlinken} />
          </li>
        ))}
      </Tag>
    );
  }
  if (block.art === ART.wichtig) {
    return (
      <div className="wichtigzeile">
        <Markierung>
          <Zeilen zeilen={[block.knoten]} verlinken={verlinken} />
        </Markierung>
      </div>
    );
  }
  if (block.art === ART.haken) {
    return <Haken punkte={block.punkte} verlinken={verlinken} onKasten={onKasten} />;
  }
  if (block.art === 'trennlinie') return <hr />;
  if (block.art === ART.codeblock) {
    return (
      <pre>
        <code>{block.text}</code>
      </pre>
    );
  }
  return (
    <p>
      {block.zeilen.map((zeile, index) => (
        <span className="lauf" key={index}>
          {zeile ? <Zeilen zeilen={[zeile]} verlinken={verlinken} /> : null}
        </span>
      ))}
    </p>
  );
}

export function LeseText({
  doc,
  verlinken = false,
  onKasten,
}: {
  doc: Node;
  verlinken?: boolean;
  onKasten?: (stelle: number) => void;
}) {
  let nummer = 0;
  return (
    <div className="lesetext">
      {leseKnoten(doc).map((block, index) => {
        const abschnitt = block.art === ART.ueberschrift && block.stufe === EBENE.abschnitt ? nummer++ : null;
        return <Block key={index} block={block} verlinken={verlinken} abschnitt={abschnitt} onKasten={onKasten} />;
      })}
    </div>
  );
}
