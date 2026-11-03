import type { AblagePlan } from '../../../../shared/features/seiten/index.ts';
import { TEXTE } from '../../../../shared/kern/texte.ts';

export function leeresAnhaengen(plan: AblagePlan): boolean {
  return plan.ziele.some((ziel) => ziel.seite !== null && !ziel.neuSeite && ziel.text.trim().length === 0);
}

export function ZielText({ plan }: { plan: AblagePlan }) {
  if (plan.ungueltig) return plan.hinweis;
  return (
    <>
      {TEXTE.gehtNach}
      {plan.ziele.map((ziel, index) => (
        <span key={`${index}-${ziel.topicName}-${ziel.seite ?? ''}`}>
          {index > 0 ? TEXTE.punktMitte : null}
          {ziel.teile.map((teil, teilIndex) => (
            <span key={`${teilIndex}-${teil.name}`}>
              {teilIndex > 0 ? TEXTE.pfeil : null}
              <b>{teil.name}</b>
              {teil.neu ? TEXTE.neuKlammer : null}
            </span>
          ))}
          {ziel.hinweis ? `${TEXTE.punktMitte}${ziel.hinweis}` : null}
        </span>
      ))}
    </>
  );
}
