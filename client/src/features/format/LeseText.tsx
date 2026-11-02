import { leseBaum, type LeseBlock, type LeseHakenPunkt, type LeseTeil } from '../../../../shared/features/format/index.ts';
import { HakenIcon } from '../../ui/icons.tsx';

function Teile({ teile }: { teile: LeseTeil[] }) {
  return teile.map((teil, index) =>
    teil.art === 'fett' ? <strong key={index}>{teil.text}</strong> : <span key={index}>{teil.text}</span>,
  );
}

function Kasten({ abgehakt }: { abgehakt: boolean }) {
  return (
    <span className={abgehakt ? 'haken zu' : 'haken'} aria-hidden="true">
      {abgehakt ? <HakenIcon /> : null}
    </span>
  );
}

function Haken({ punkte }: { punkte: LeseHakenPunkt[] }) {
  return punkte.map((punkt, index) => (
    <div className="hakenzeile" key={index}>
      <Kasten abgehakt={punkt.abgehakt} />
      <span className="hakenlabel">
        <Teile teile={punkt.teile} />
      </span>
    </div>
  ));
}

function Ueberschrift({ teile }: { teile: LeseTeil[] }) {
  return (
    <h3>
      <Teile teile={teile} />
    </h3>
  );
}

function Block({ block }: { block: LeseBlock }) {
  if (block.art === 'ueberschrift') return <Ueberschrift teile={block.teile} />;
  if (block.art === 'liste') {
    return (
      <ul>
        {block.punkte.map((teile, index) => (
          <li key={index}>
            <Teile teile={teile} />
          </li>
        ))}
      </ul>
    );
  }
  if (block.art === 'haken') return <Haken punkte={block.punkte} />;
  return (
    <p>
      {block.zeilen.map((teile, index) => (
        <span className="lauf" key={index}>
          <Teile teile={teile} />
        </span>
      ))}
    </p>
  );
}

export function LeseText({ text }: { text: string }) {
  const baum = leseBaum(text);
  return (
    <div className="lesetext">
      {baum.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}
