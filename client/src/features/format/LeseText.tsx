import {
  sicherZiel,
  leseBaum,
  type LeseBlock,
  type LeseHakenPunkt,
  type LeseLinkTeil,
  type LeseTeil,
} from '../../../../shared/features/format/index.ts';
import { HakenIcon } from '../../ui/icons.tsx';

function Schrift({ teil, verlinken }: { teil: LeseTeil; verlinken: boolean }) {
  if (teil.art === 'text') return teil.text;
  if (teil.art === 'code') return <code>{teil.text}</code>;
  if (teil.art === 'link') return <LinkTeil teil={teil} verlinken={verlinken} />;
  const Tag = teil.art === 'fett' ? 'strong' : teil.art === 'kursiv' ? 'em' : 's';
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

function Block({ block, verlinken }: { block: LeseBlock; verlinken: boolean }) {
  if (block.art === 'ueberschrift') {
    return (
      <h3>
        <Teile teile={block.teile} verlinken={verlinken} />
      </h3>
    );
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
  return (
    <div className="lesetext">
      {baum.map((block, index) => (
        <Block key={index} block={block} verlinken={verlinken} />
      ))}
    </div>
  );
}
