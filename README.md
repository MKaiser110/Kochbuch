# Kochbuch

Eine schlanke, offlinefähige Rezept-Web-App als installierbare PWA. Es gibt keinen Build-Schritt und keinen eigenen Server für den Betrieb.

## Veröffentlichung über GitHub Pages

1. Lege den Inhalt dieses Projektordners im Stammverzeichnis des GitHub-Repositorys ab und pushe die Änderungen.
2. Öffne im Repository **Settings → Pages**.
3. Wähle unter **Build and deployment** die Option **Deploy from a branch**, danach den gewünschten Branch und **/(root)**.
4. Öffne die angezeigte GitHub-Pages-Adresse. GitHub stellt die Seite über HTTPS bereit.

Die App verwendet relative Pfade und funktioniert daher auch unter einer Repository-Unteradresse wie `https://name.github.io/kochbuch/`. Es gibt keinen Build- oder Installationsschritt.

## Auf dem iPhone installieren

Öffne die veröffentlichte HTTPS-Adresse in Safari, tippe auf **Teilen** und wähle **Zum Home-Bildschirm**. Starte die Web-App danach über das neue Symbol. Nach Änderungen an der App die Web-App einmal schließen und erneut öffnen, damit der aktualisierte Offline-Cache geladen wird.

## Daten und Import

- Rezepte liegen lokal im Browser in IndexedDB. Sie werden nicht automatisch zwischen Geräten synchronisiert.
- **Rezepte sichern** exportiert das Kochbuch als JSON-Datei. Bewahre diese Datei als Backup auf und importiere sie bei Bedarf wieder.
- Der URL-Import liest strukturierte Rezeptdaten oder nutzt einen Text-Reader als bestmöglichen Fallback. CORS, Website-Schutz und Änderungen an Rezeptseiten können den Import verhindern oder eine manuelle Prüfung nötig machen.
- Beim URL- und Bildimport wird nur die Gesamtzeit in das Feld **Zubereitungszeit** übernommen. Andere Zusatzangaben wie Beschreibung, Küche, Schwierigkeit und Nährwerte werden nicht gespeichert.
- Beim Bildimport erfolgt die Texterkennung im Browser mit Tesseract.js. Der erkannte Entwurf sollte vor dem Speichern geprüft werden.

## Lokal starten

Mit Python:

```sh
python -m http.server 8000
```

Öffne anschließend `http://localhost:8000`. `localhost` unterstützt den Service Worker auch ohne HTTPS.

## Entwicklung

- Oberfläche und Logik: `index.html`, `css/` und `js/` (ES-Module, ohne Framework)
- App-Initialisierung und globale UI-Verknüpfungen: `js/app.js` und `js/app/`
- Navigation: `js/router.js` und `js/app/navigation.js`
- Lokale Speicherung und Modell: `js/core/` (einschließlich Einkaufsliste)
- Ansichten und Formular: `js/views/`
- Import-, Export- und PDF-Funktionen: `js/services/`; Einkaufslisten-Styles: `css/shopping.css`
- Offline-Cache: `sw.js`

Mit Node.js kannst du die automatisierten Tests über `npm test` starten.
