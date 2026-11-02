import { findeTags, tagAnCaret, type TagFund } from '../../../../shared/features/tags/index.ts';

export interface TagMarke {
  start: number;
  end: number;
  hier: boolean;
}

export function markenAus(funde: readonly TagFund[], aktiv: TagFund | null, laenge: number): TagMarke[] {
  const sortiert = [...funde].sort((a, b) => a.start - b.start || a.end - b.end);
  const aus: TagMarke[] = [];
  let bis = 0;
  for (const fund of sortiert) {
    const start = Math.max(0, fund.start, bis);
    const end = Math.min(laenge, fund.end);
    if (end <= start) continue;
    aus.push({
      start,
      end,
      hier: aktiv !== null && aktiv.start === fund.start && aktiv.end === fund.end,
    });
    bis = end;
  }
  return aus;
}

export function tagMarken(text: string, caret: number): TagMarke[] {
  const aktiv = tagAnCaret(text, caret);
  const funde = findeTags(text);
  if (aktiv && !funde.some((fund) => fund.start === aktiv.start && fund.end === aktiv.end)) {
    funde.push(aktiv);
  }
  return markenAus(funde, aktiv, text.length);
}
