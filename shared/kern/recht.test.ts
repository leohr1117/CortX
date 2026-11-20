import { describe, expect, it } from 'vitest';
import { RECHT, RECHT_LISTE, type RechtSeiteDaten, type RechtStueck } from './recht.ts';

function flach(seite: RechtSeiteDaten): string {
  const teile: string[] = [];
  for (const block of seite.bloecke) {
    teile.push(block.ueberschrift);
    for (const absatz of block.absaetze) {
      for (const stueck of absatz.stuecke) teile.push(stueck.text, stueck.art === 'link' ? stueck.href : '');
    }
  }
  return teile.join('\n');
}

function links(seite: RechtSeiteDaten): RechtStueck[] {
  return seite.bloecke.flatMap((block) => block.absaetze.flatMap((absatz) => absatz.stuecke.filter((stueck) => stueck.art === 'link')));
}

describe('recht', () => {
  it('offers impressum and datenschutz at the public paths', () => {
    expect(RECHT_LISTE.map((seite) => seite.pfad)).toEqual(['/impressum', '/datenschutz']);
    expect(RECHT.impressum.titel).toBe('Legal notice');
    expect(RECHT.datenschutz.titel).toBe('Privacy');
  });

  it('names the documented host, address and retention', () => {
    const impressum = flach(RECHT.impressum);
    const datenschutz = flach(RECHT.datenschutz);
    for (const text of [impressum, datenschutz]) {
      expect(text).toContain('Hetzner Online GmbH');
      expect(text).toContain('CAX11');
      expect(text).toContain('Falkenstein, Germany');
      expect(text).toContain('https://getstyra.app');
      expect(text).toContain('https://cortx.leohr.de');
      expect(text).toContain('20 November 2026 at 09:35');
      expect(text).not.toContain('/srv/');
      expect(text).not.toContain('Zoho');
      expect(text).not.toContain('Cloudflare Pages');
      expect(text).not.toContain('14 days');
      expect(text).not.toMatch(/password|secret|token/i);
    }
    expect(datenschutz).toContain('account data, communication data, log data');
    expect(datenschutz).toContain('user content');
    expect(datenschutz).toContain('Cloudflare Tunnel');
    expect(datenschutz).toContain('127.0.0.1');
    expect(datenschutz).toContain('auth.log, fail2ban and ufw');
    expect(datenschutz).toContain('four weeks');
    expect(datenschutz).toContain('no time limit');
    expect(datenschutz).toContain('03:25');
    expect(datenschutz).toContain('29 days');
    expect(datenschutz).toContain('seven rolling copies');
    expect(datenschutz).toContain('20 November 2026, 08:47');
    expect(datenschutz).toContain('https://www.cloudflare.com/cloudflare-customer-dpa/');
    expect(datenschutz).toContain('https://www.cloudflare.com/privacypolicy/');
    expect(datenschutz).not.toMatch(/Cloudflare stores those addresses for \d+/);
    expect(links(RECHT.datenschutz).some((stueck) => stueck.art === 'link' && stueck.href.includes('cloudflare.com'))).toBe(true);
  });
});
