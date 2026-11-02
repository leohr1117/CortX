import type { AblagePlan } from '../../../../shared/features/seiten/index.ts';

export function leeresAnhaengen(plan: AblagePlan): boolean {
  return plan.ziele.some((ziel) => ziel.seite !== null && !ziel.neuSeite && ziel.text.trim().length === 0);
}

export function ZielText({ plan }: { plan: AblagePlan }) {
  if (plan.ungueltig) return plan.hinweis;
  return (
    <>
      {'Goes to '}
      {plan.ziele.map((ziel, index) => (
        <span key={`${index}-${ziel.topicName}-${ziel.seite ?? ''}`}>
          {index > 0 ? ' · ' : null}
          {ziel.teile.map((teil, teilIndex) => (
            <span key={`${teilIndex}-${teil.name}`}>
              {teilIndex > 0 ? ' > ' : null}
              <b>{teil.name}</b>
              {teil.neu ? ' (new)' : null}
            </span>
          ))}
          {ziel.hinweis ? ` · ${ziel.hinweis}` : null}
        </span>
      ))}
    </>
  );
}
