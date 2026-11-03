interface Fehlversuch {
  ip: string;
  at: number;
}

export function limitGrund(
  versuche: readonly Fehlversuch[],
  ip: string,
  jetzt: number,
  fensterMs: number,
  jeIp: number,
  global: number,
): 'ip' | 'global' | null {
  const ab = jetzt - fensterMs;
  const imFenster = versuche.filter((versuch) => versuch.at > ab && versuch.at <= jetzt);
  if (imFenster.length >= global) return 'global';
  if (imFenster.filter((versuch) => versuch.ip === ip).length >= jeIp) return 'ip';
  return null;
}
