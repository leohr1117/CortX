import { TEXTE } from './texte.ts';

export type RechtSchluessel = 'impressum' | 'datenschutz';

export type RechtStueck =
  | { readonly art: 'text'; readonly text: string }
  | { readonly art: 'link'; readonly text: string; readonly href: string };

export interface RechtAbsatz {
  readonly stuecke: readonly RechtStueck[];
}

export interface RechtBlock {
  readonly ueberschrift: string;
  readonly absaetze: readonly RechtAbsatz[];
}

export interface RechtSeiteDaten {
  readonly schluessel: RechtSchluessel;
  readonly pfad: '/impressum' | '/datenschutz';
  readonly titel: string;
  readonly bloecke: readonly RechtBlock[];
}

const CLOUDFLARE_AV = 'https://www.cloudflare.com/cloudflare-customer-dpa/';
const CLOUDFLARE_DATENSCHUTZ = 'https://www.cloudflare.com/privacypolicy/';
const APP_ADRESSE = 'https://getstyra.app';
const ALTE_ADRESSE = 'https://cortx.leohr.de';

function text(inhalt: string): RechtAbsatz {
  return { stuecke: [{ art: 'text', text: inhalt }] };
}

function stuecke(teile: readonly RechtStueck[]): RechtAbsatz {
  return { stuecke: teile };
}

export const RECHT: Record<RechtSchluessel, RechtSeiteDaten> = {
  impressum: {
    schluessel: 'impressum',
    pfad: '/impressum',
    titel: TEXTE.impressum,
    bloecke: [
      {
        ueberschrift: 'Publisher',
        absaetze: [
          text('Styra is published by leohr.'),
          stuecke([
            { art: 'link', text: TEXTE.absenderUrl, href: TEXTE.absenderUrl },
          ]),
        ],
      },
      {
        ueberschrift: 'App address',
        absaetze: [
          stuecke([
            { art: 'text', text: 'The app address is ' },
            { art: 'link', text: APP_ADRESSE, href: APP_ADRESSE },
            { art: 'text', text: '.' },
          ]),
          stuecke([
            { art: 'text', text: 'The earlier address ' },
            { art: 'link', text: ALTE_ADRESSE, href: ALTE_ADRESSE },
            { art: 'text', text: ' redirects there.' },
          ]),
        ],
      },
      {
        ueberschrift: 'Hosting',
        absaetze: [
          text(
            'Hetzner Online GmbH hosts Styra on a CAX11 server in Falkenstein, Germany. This server replaces the previous Windows server.',
          ),
          text(
            'A data processing agreement with Hetzner Online GmbH was concluded electronically on 20 November 2026 at 09:35.',
          ),
        ],
      },
    ],
  },
  datenschutz: {
    schluessel: 'datenschutz',
    pfad: '/datenschutz',
    titel: TEXTE.datenschutz,
    bloecke: [
      {
        ueberschrift: 'People',
        absaetze: [text('This notice covers the people who use Styra.')],
      },
      {
        ueberschrift: 'Data',
        absaetze: [
          text('Styra processes account data, communication data, log data and the notes you write.'),
        ],
      },
      {
        ueberschrift: 'Hosting',
        absaetze: [
          text(
            'Hetzner Online GmbH hosts the app on a CAX11 server in Falkenstein, Germany. A data processing agreement was concluded electronically on 20 November 2026 at 09:35. Hetzner processes account data, communication data, log data and user content.',
          ),
        ],
      },
      {
        ueberschrift: 'Connection',
        absaetze: [
          stuecke([
            { art: 'text', text: 'Traffic to Styra, including ' },
            { art: 'link', text: APP_ADRESSE, href: APP_ADRESSE },
            {
              art: 'text',
              text: ', goes through a Cloudflare Tunnel. TLS ends at Cloudflare. Cloudflare processes visitor IP addresses. How long Cloudflare stores those addresses cannot be determined from this server.',
            },
          ]),
          stuecke([
            { art: 'text', text: 'Cloudflare describes that storage in its ' },
            { art: 'link', text: 'data processing addendum', href: CLOUDFLARE_AV },
            { art: 'text', text: ' and its ' },
            { art: 'link', text: 'privacy policy', href: CLOUDFLARE_DATENSCHUTZ },
            { art: 'text', text: '.' },
          ]),
        ],
      },
      {
        ueberschrift: 'Logs',
        absaetze: [
          text(
            "Styra's own logs contain no visitor IP addresses. Behind the tunnel the app sees only 127.0.0.1.",
          ),
          text(
            'IP addresses are kept only in server-operation logs for sign-in, the firewall and blocking (auth.log, fail2ban and ufw). Those logs rotate weekly and are kept for four weeks.',
          ),
          text(
            'Other system logs use the standard journald setup. They are limited by size and have no time limit.',
          ),
        ],
      },
      {
        ueberschrift: 'Backups',
        absaetze: [
          text('A backup runs every night at 03:25 on the same server and is deleted after 29 days.'),
          text(
            "Hetzner also keeps a backup of the whole disk in the same data center. Hetzner's documentation describes up to seven rolling copies.",
          ),
          text(
            'Two one-time copies have no expiry date: one on the Hetzner server from before the move to this host, and the previous Styra database on the Windows server as of 20 November 2026, 08:47. They are deleted only after an explicit decision. No other copy outside the server is kept.',
          ),
        ],
      },
      {
        ueberschrift: 'Earlier address',
        absaetze: [
          stuecke([
            { art: 'text', text: 'The earlier address ' },
            { art: 'link', text: ALTE_ADRESSE, href: ALTE_ADRESSE },
            { art: 'text', text: ' redirects to ' },
            { art: 'link', text: APP_ADRESSE, href: APP_ADRESSE },
            { art: 'text', text: '.' },
          ]),
        ],
      },
      {
        ueberschrift: 'Questions',
        absaetze: [
          stuecke([
            { art: 'text', text: 'Questions about these notices go through ' },
            { art: 'link', text: TEXTE.absenderUrl, href: TEXTE.absenderUrl },
            { art: 'text', text: '.' },
          ]),
        ],
      },
    ],
  },
};

export const RECHT_LISTE: readonly RechtSeiteDaten[] = [RECHT.impressum, RECHT.datenschutz];
