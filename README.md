# CortX

CortX ist eine Notiz-App: Du schreibst eine Notiz auf, und sie landet über ein `#thema` im passenden Thema oder sonst in der Inbox.

Live: [cortx.leohr.de](https://cortx.leohr.de)

## Funktionen

- **Erfassen:** Notiz schreiben und mit „File“ oder Strg/Cmd+Enter ablegen. Das Thema lässt sich direkt danach noch ändern.
- **Bibliothek:** Alle Themen auf einen Blick. Themen umbenennen, zusammenführen oder löschen, mit Rückgängig.
- **Notizen:** Jede Notiz hat eine eigene Seite zum Lesen und Bearbeiten. Änderungen werden automatisch gespeichert. Löschen lässt sich rückgängig machen.
- **Formatierung:** Zeilen mit `- ` werden zur Liste, `[]` und `[x]` zu Kästchen, `**Text**` wird fett, `= ` macht eine Überschrift. Gespeichert wird reiner Text.
- **Termine:** Datums- und Zeitangaben im Text („morgen 15 Uhr“, „next Monday“, „03.11.“) werden unter der Notiz als Datum angezeigt.
- **Suche:** Durchsucht alle Themen und die Inbox.
- **Offline:** Entwürfe bleiben auf dem Gerät, offline abgelegte Notizen werden nach der Anmeldung abgeglichen. Installierbar als PWA.
- **Anmeldung:** Mit einem Konto aus [Stride](https://github.com/leohr1117/Stride).
- **Neuigkeiten:** Das Menü der Bibliothek zeigt die aktuelle Version, unter "What's new" stehen die Änderungen jeder Version. Nach einem Update erscheint einmal ein Hinweis.

Die Oberfläche ist englisch. Änderungen je Version stehen in [CHANGELOG.md](CHANGELOG.md).

## Technik

- TypeScript, React 19, React Router, Tailwind CSS 4, Vite
- Server: Node.js (ab 23.6, führt TypeScript direkt aus), Fastify 5, SQLite über `node:sqlite`, Zod
- Tests: Vitest und Playwright

## Lokal starten

Voraussetzung: Node.js 23.6 oder neuer. Für die Anmeldung muss eine Stride-Instanz laufen, standardmäßig unter `http://127.0.0.1:3000`.

```bash
npm install
npm run dev
```

`npm run dev` startet den Server auf `127.0.0.1:3100` und den Vite-Entwicklungsserver, der `/api` an den Server weiterleitet.

Weitere Befehle:

```bash
npm test               # Unit-Tests (Vitest)
npm run typecheck      # Typprüfung
npm run e2e:browsers   # Chromium für Playwright installieren
npm run e2e            # Browser-Tests
npm run build          # Produktions-Build nach client/dist
npm start              # Server mit fertigem Build
```

### Umgebungsvariablen

| Variable | Zweck |
|---|---|
| `PORT` | Port des Servers, Standard 3100 |
| `CORTEX_DB` | Pfad der Datenbank, Standard `data/cortex.db` |
| `CORTEX_STRIDE_URL` | Anmeldeadresse von Stride, Standard `http://127.0.0.1:3000/api/zugang` |
| `CORTX_STRIDE_PUBLIC_URL` | Öffentliche Stride-Adresse für „Passwort ändern“, Standard `https://stride.leohr.de` |
| `LOG_LEVEL` | Log-Stufe, Standard `warn` |

## Lizenz

GNU Affero General Public License v3.0, siehe [LICENSE](LICENSE).

## Autor

Leonardo Hramzow, [leohr.de](https://leohr.de), [GitHub](https://github.com/leohr1117)
