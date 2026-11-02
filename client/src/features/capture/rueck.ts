export function textNachAblageRueck(erfasst: string | null, gemerkt: string | null): string | null {
  if (erfasst !== null) return erfasst;
  return gemerkt;
}

export function caretNachAblageRueck(text: string): number {
  return text.length;
}
