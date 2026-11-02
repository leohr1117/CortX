const STRIDE_PASSWORT_PFAD = '/mehr/profil/passwort';

export function stridePasswortZiel(zugangUrl: string): string {
  const basis = new URL(zugangUrl);
  return new URL(STRIDE_PASSWORT_PFAD, basis.origin).href;
}
