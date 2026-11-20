import { RECHT, type RechtSchluessel, type RechtStueck } from '../../../../shared/kern/recht.ts';
import { TEXTE } from '../../../../shared/kern/texte.ts';
import { Kopf } from '../library/Kopf.tsx';
import { useSitzung } from '../zugang/Sitzung.tsx';

function Stueck({ stueck }: { stueck: RechtStueck }) {
  if (stueck.art === 'text') return stueck.text;
  return (
    <a href={stueck.href} rel="noopener noreferrer">
      {stueck.text}
    </a>
  );
}

export function RechtSeite({ schluessel }: { schluessel: RechtSchluessel }) {
  const seite = RECHT[schluessel];
  const { modus } = useSitzung();
  const angemeldet = modus === 'an';

  return (
    <div className="app">
      <Kopf
        titel={seite.titel}
        zurueck={angemeldet ? '/library' : '/'}
        zurueckLabel={angemeldet ? TEXTE.zurueckBibliothek : TEXTE.zurueck}
      />
      <main className="inhalt rolle">
        <div className="recht" data-recht={seite.schluessel}>
          {seite.bloecke.map((block) => (
            <section key={block.ueberschrift}>
              <h2>{block.ueberschrift}</h2>
              {block.absaetze.map((absatz) => (
                <p key={absatz.stuecke.map((stueck) => stueck.text).join('|')}>
                  {absatz.stuecke.map((stueck) => (
                    <Stueck key={`${stueck.art}:${stueck.text}`} stueck={stueck} />
                  ))}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
