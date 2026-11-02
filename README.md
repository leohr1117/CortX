# CortX

CortX ist eine Notiz-App: Du schreibst eine Notiz auf, und sie landet über ein `#thema` im passenden Thema oder sonst in der Inbox.

Live: [cortx.leohr.de](https://cortx.leohr.de)

## Funktionen

- **Erfassen:** Notiz schreiben und mit „File“ oder Strg/Cmd+Enter ablegen. Dieselbe Formatleiste und dieselben Kürzel wie beim Bearbeiten: auf dem Handy sitzt sie immer am unteren Rand, bei offener Tastatur direkt auf der Tastatur, und der File-Knopf steht darüber. Auf einem großen Bildschirm erscheint sie bei einer Markierung. Lange Zielvorschläge lassen sich in der Liste scrollen. Der Eintrag zum Neu-Anlegen bleibt dabei unten stehen. Eine Zeile, die mit `#thema`, `#thema/seite` oder `#thema/seite/abschnitt` beginnt, ist eine Zielzeile (höchstens drei Ebenen). Der Text dahinter gehört zu diesem Teil, bis zur nächsten Zielzeile, und eine Notiz kann so auf mehrere Seiten gehen. Text vor der ersten Zielzeile landet in der Inbox. Ein `#` mitten in der Zeile bleibt ein Tag im Text. Die Pfade selbst stehen nicht im abgelegten Text. Der Seitenname steht als erste Zeile im Text, ohne Überschriftzeichen. Ein Abschnitt wird eine Überschrift der zweiten Ebene. Unten stehen alle Ziele. Enter legt auf dem Handy nicht ab. Nach dem Ablegen stellt Rückgängig den eingegebenen Text wieder ins Feld und nimmt die ganze Ablage zurück. Das Thema einer Seite ändert man im Menü der Notiz; auch dort bleibt der Eintrag für ein neues Thema unten stehen.
- **Bibliothek:** Alle Themen auf einen Blick, auch leere. Lange Themen- und Seitenlisten lassen sich scrollen. Ein leeres Thema zeigt „0 pages“ und bleibt, bis man das Thema selbst löscht. Ein Thema listet seine Seiten. Die letzte Seite lässt sich ohne Rückfrage löschen; dann erscheint „Page deleted“ mit Rückgängig. Themen umbenennen, zusammenführen oder löschen, mit Rückgängig.
- **Notizen:** Jede Notiz ist eine Seite. Der Titel ist die erste Zeile mit Text, auch wenn sie ein normaler Absatz ist. Beginnt diese Zeile mit `# `, bleibt sie eine Überschrift. Eine neue Seite bekommt keine Überschrift von selbst. Abschnitte sind die Überschriften der zweiten Ebene; oben steht ein kleines Inhaltsverzeichnis. Die Kopfzeile zeigt den Pfad, Zurück geht eine Ebene höher. Änderungen werden automatisch gespeichert. Löschen lässt sich rückgängig machen.
- **Formatierung:** Gespeichert wird reiner Text. Fett, kursiv, durchgestrichen, Wichtig, Code, Listen, Kästchen, Links und Überschriften werden beim Lesen gezeigt, auch gemeinsam. Wichtig hebt Wörter mit `!!Text!!` hervor und eine ganze Zeile, die mit `!!!! ` beginnt. Beim Erfassen und beim Bearbeiten bleibt derselbe Text, mit einer Formatleiste: auf dem Handy immer am unteren Rand und bei offener Tastatur direkt darauf, auf einem großen Bildschirm bei einer Markierung. Ein Leerzeichen am Ende der Notiz bleibt beim Speichern erhalten. `**`, `- ` und `[ ]` können beim Tippen umgewandelt werden. `# Titel` am Zeilenanfang ist eine Überschrift. `#thema` ohne Leerzeichen bleibt ein Tag und wird nicht umgewandelt. In der Bibliothek gibt es den Schalter „Convert shortcuts while typing“. Er gilt für die Startseite und die Notiz.
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
| `CORTX_DB` | Pfad der Datenbank, Standard `data/cortex.db` |
| `CORTX_CLIENT_DIST` | Ordner der ausgelieferten Oberfläche, Standard `client/dist` |
| `CORTX_STRIDE_URL` | Anmeldeadresse von Stride, Standard `http://127.0.0.1:3000/api/zugang` |
| `CORTX_STRIDE_PUBLIC_URL` | Öffentliche Stride-Adresse für „Passwort ändern“, Standard `https://stride.leohr.de` |
| `LOG_LEVEL` | Log-Stufe, Standard `warn` |

Fehlt ein neuer Name, liest der Server weiter `CORTEX_DB`, `CORTEX_STRIDE_URL` und `CORTEX_TEST`. Platzhalter stehen in [.env.example](.env.example).

## Lizenz

GNU Affero General Public License v3.0, siehe [LICENSE](LICENSE).

## Autor

Leonardo Hramzow, [leohr.de](https://leohr.de), [GitHub](https://github.com/leohr1117)
