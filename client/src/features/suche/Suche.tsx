import { Link } from 'react-router';
import { SUCH_MAX, type SuchTreffer } from '../../../../shared/features/suche/index.ts';
import { gleicherName } from '../../../../shared/features/tags/index.ts';
import { INBOX_NAME } from '../../../../shared/kern/grenzen.ts';
import { LeseText } from '../format/index.ts';
import { notizPfad } from '../library/api.ts';
import { TerminZeile } from '../termine/index.ts';
import { HashIcon, LupeIcon, PosteingangIcon, WeiterIcon } from '../../ui/icons.tsx';

export function Suchleiste({ wert, onChange }: { wert: string; onChange: (wert: string) => void }) {
  return (
    <label className="suche fund">
      <LupeIcon />
      <input
        value={wert}
        placeholder="Search notes"
        aria-label="Search notes"
        maxLength={SUCH_MAX}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function Trefferliste({ treffer }: { treffer: SuchTreffer[] }) {
  if (treffer.length === 0) return <p className="leer1">No matches.</p>;
  return (
    <div className="liste">
      {treffer.map((zeile) => {
        const inbox = gleicherName(zeile.topic, INBOX_NAME);
        return (
          <Link className="zeile voll" key={zeile.id} to={notizPfad(zeile.id)}>
            <span className="sym">{inbox ? <PosteingangIcon /> : <HashIcon />}</span>
            <span className="tx">
              <LeseText text={zeile.text} />
              <div className="ne">{zeile.topic}</div>
              <TerminZeile text={zeile.text} created={zeile.created} />
            </span>
            <WeiterIcon />
          </Link>
        );
      })}
    </div>
  );
}
