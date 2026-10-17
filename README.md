# Kochbuch — PWA

## Installation auf dem iPhone
Service Worker und „Zum Home-Bildschirm hinzufügen“ funktionieren auf iOS nur
über **HTTPS** (oder `localhost`), nicht über eine lokale Datei. Die App muss
also irgendwo statisch gehostet werden — kein eigener Server nötig, reicht
z.B.:

1. **GitHub Pages** (kostenlos): Repo erstellen, diesen Ordnerinhalt pushen,
   in den Repo-Settings „Pages“ auf den Branch zeigen lassen.
2. **Netlify Drop** (schnellster Weg): auf https://app.netlify.com/drop den
   Ordner per Drag&Drop hochladen — sofort eine HTTPS-URL.
3. **Vercel**, **Cloudflare Pages**: gleiches Prinzip.

Danach auf dem iPhone die URL in Safari öffnen → Teilen-Symbol →
„Zum Home-Bildschirm“. Ab dann startet die App wie eine native App
(eigenes Icon, kein Browser-UI, Service Worker cached die App-Shell für
Offline-Start).

### Lokal testen (Desktop)
```
cd kochbuch
python3 -m http.server 8000
```
Dann `http://localhost:8000` öffnen. Service Worker funktioniert unter
`localhost` auch ohne HTTPS.

## Architektur
- **Kein Build-Schritt**: reines HTML/CSS/JS mit ES-Modulen, direkt statisch
  hostbar.
- **`js/db.js`**: einziger Zugriffspunkt auf IndexedDB. Jeder Schreibzugriff
  läuft zusätzlich durch `js/sync-adapter.js`.
- **`js/sync-adapter.js`**: aktuell ein No-Op („local-only“). Für iCloud-Sync
  später eine Klasse mit derselben Schnittstelle (`push`, `delete`, `pull`,
  `onRemoteChange`) implementieren und per `setSyncAdapter()` aktivieren —
  UI und `db.js` müssen dafür nicht angefasst werden.
- **`js/recipe-import.js`**: liest `schema.org/Recipe`-JSON-LD, das die
  meisten Rezeptseiten einbetten und verwirft unvollständige Treffer. Direkter
  `fetch()` scheitert bei vielen Seiten an CORS (browserseitig ohne eigenen
  Server nicht lösbar); der Reader-Fallback übernimmt nur Inhalte aus
  erkannten Zutaten- und Zubereitungsabschnitten. Andere Abschnitte wie
  Hinweise, Nährwerte und Werbung werden dabei verworfen; erkannte Rezepte
  können vor dem Speichern geprüft und angepasst werden.
- **`js/ocr-import.js`**: Tesseract.js für Texterkennung aus Fotos. Bilder
  werden für bessere Lesbarkeit skaliert und kontrastverstärkt; erkannt wird
  mit dem genaueren deutschen Sprachmodell. Tesseract.js und das Sprachmodell
  werden beim ersten OCR-Aufruf aus dem CDN geladen. Das Ergebnis bleibt ein
  Entwurf und sollte vor dem Speichern im Formular geprüft werden.
- **`js/scaling.js`**: skaliert Mengen linear zur Portionenzahl, rundet auf
  küchentaugliche Werte.
- **Backup-Link**: Der teilbare Link wird, wenn vom Browser unterstützt,
  komprimiert und lässt eingebettete Bilddaten aus, damit er kürzer bleibt.
  Für eine vollständige Sicherung inklusive Bildern den Datei-Export nutzen.
  Ältere, unkomprimierte Backup-Links bleiben importierbar.

## Getroffene Annahmen
- Einheitensystem: metrisch.
- Kategorien: frei vom Nutzer vergeben (Textfeld mit Autocomplete aus
  bisherigen Kategorien), keine feste Vorgabeliste.
- OCR-Sprache: Deutsch (`deu`-Traineddata von Tesseract.js).
- Rezeptbilder werden als Base64-DataURL in IndexedDB gespeichert (einfach,
  kein zusätzlicher Blob-Store nötig; für sehr viele/große Bilder wäre ein
  eigener Object Store mit Blobs die skalierbarere Variante).

## Weitere Module
- **Tags**: Rezepte haben mehrere Tags (`recipe.tags`). Ältere Rezepte mit der
  früheren Einzel-Kategorie werden beim Lesen/Import automatisch migriert.
- **Duplikat-Warnung** (`findDuplicate` in `js/db.js`): gleicher Titel oder
  gleiche Quell-URL; greift beim Speichern im Formular (auch nach URL-/Scan-
  Import) und beim Datei-Import.
- **PDF-Export** (`js/pdf-export.js`): jsPDF liegt lokal in `js/vendor/`
  (offline nutzbar). Mobil über das Share-Sheet, am Desktop als Download.
  Exportiert wird mit der auf der Detailseite gewählten Portionenzahl.
- **Kochmodus** (Route `#cook/<id>?s=<portionen>`): ein Schritt pro Seite,
  Wischen/Pfeiltasten, Bildschirm bleibt wach, Zutatenliste jederzeit abrufbar.
