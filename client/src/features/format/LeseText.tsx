import type { CSSProperties, ReactNode } from 'react';
import {
  STIL_VAR,
  kombiniereStil,
  sicherZiel,
  leseBaum,
  vorschauTag,
  type LeseBlock,
  type LeseHakenPunkt,
  type LeseLinkTeil,
  type LeseTeil,
  type VorschauTag,
} from '../../../../shared/features/format/index.ts';
import { HakenIcon } from '../../ui/icons.tsx';

function Markierung({ children }: { children: ReactNode }) {
  const hintergrund = kombiniereStil(['wichtig']).hintergrund;
  const style = hintergrund ? ({ [STIL_VAR]: hintergrund } as CSSProperties) : undefined;
  const Tag = vorschauTag('wichtig') as VorschauTag;
  return (
    <Tag style={style}>
      <span className="sr-nur">Wichtig</span>
      {children}
    </Tag>
  );
}

function Schrift({ teil, verlinken }: { teil: LeseTeil; verlinken: boolean }) {
  if (teil.art === 'text') return teil.text;
  if (teil.art === 'code') {
    const Tag = vorschauTag('code') as VorschauTag;
    return <Tag>{teil.text}</Tag>;
  }
  if (teil.art === 'link') return <LinkTeil teil={teil} verlinken={verlinken} />;
  if (teil.art === 'wichtig') {
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

function Kasten({ abgehakt }: { abgehakt: boolean }) {
  return (
    <span className={abgehakt ? 'haken zu' : 'haken'} aria-hidden="true">
      {abgehakt ? <HakenIcon /> : null}
    </span>
  );
}

function Haken({ punkte, verlinken }: { punkte: readonly LeseHakenPunkt[]; verlinken: boolean }) {
  return punkte.map((punkt, index) => (
    <div className="hakenzeile" key={index}>
      <Kasten abgehakt={punkt.abgehakt} />
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
}: {
  block: LeseBlock;
  verlinken: boolean;
  abschnitt: number | null;
}) {
  if (block.art === 'ueberschrift') {
    const inhalt = <Teile teile={block.teile} verlinken={verlinken} />;
    if (block.stufe === 1) return <h2 className="titel">{inhalt}</h2>;
    if (block.stufe === 2) {
      return (
        <h2 className="abschnitt" id={abschnitt === null ? undefined : `abschnitt-${abschnitt}`}>
          {inhalt}
        </h2>
      );
    }
    return <h3>{inhalt}</h3>;
  }
  if (block.art === 'liste') {
    const Tag = block.geordnet ? 'ol' : 'ul';
    return (
      <Tag>
        {block.punkte.map((teile, index) => (
          <li key={index}>
            <Teile teile={teile} verlinken={verlinken} />
          </li>
        ))}
      </Tag>
    );
  }
  if (block.art === 'wichtig') {
    return (
      <div className="wichtigzeile">
        <Markierung>
          <Teile teile={block.teile} verlinken={verlinken} />
        </Markierung>
      </div>
    );
  }
  if (block.art === 'haken') return <Haken punkte={block.punkte} verlinken={verlinken} />;
  if (block.art === 'codeblock') {
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

export function LeseText({ text, verlinken = false }: { text: string; verlinken?: boolean }) {
  const baum = leseBaum(text);
  let nummer = 0;
  return (
    <div className="lesetext">
      {baum.map((block, index) => {
        const abschnitt = block.art === 'ueberschrift' && block.stufe === 2 ? nummer++ : null;
        return <Block key={index} block={block} verlinken={verlinken} abschnitt={abschnitt} />;
      })}
    </div>
  );
}
