import { erkenneTermin, terminText } from '../../../../shared/features/termine/index.ts';

export function TerminZeile({ text, created }: { text: string; created: string }) {
  const bezug = new Date(created);
  if (Number.isNaN(bezug.getTime())) return null;
  const termin = erkenneTermin(text, bezug);
  if (!termin) return null;
  const label = terminText(termin, new Date());
  if (!label) return null;
  return <div className="termin">{label}</div>;
}
