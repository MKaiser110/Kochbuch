# Rezeptimport: Änderungen und Testprotokoll

Stand: 31.10.2026

## Zusätzliche Live-Importtests

Zehn unterschiedliche Rezept-URLs von neun Anbietern wurden im lokalen Kochbuch tatsächlich durch den URL-Import geführt. Die Entwürfe wurden geprüft und nicht gespeichert. Bildscan wurde in dieser Runde nicht erneut getestet.

| Anbieter | Rezept | Ergebnis im Importdialog |
|---|---|---|
| Chefkoch | [Aromatisches Chili con Carne](https://www.chefkoch.de/rezepte/4370791744365774/Aromatisches-Chili-con-Carne.html) | Titel, 10 Zutaten und 3 Schritte korrekt; Werbetext entfernt. |
| Chefkoch | [Omas Kohlrouladen](https://www.chefkoch.de/rezepte/426431133556910/Omas-Kohlrouladen.html) | 12 Zutaten und 4 Schritte korrekt; Titel wurde als „Omas Kohlrouladen von äüöp“ importiert und sollte vor dem Speichern geprüft werden. |
| LECKER | [Wraps mit Hackfleisch](https://www.lecker.de/wraps-mit-hackfleisch-80904.html) | Titel, 12 Zutaten, 3 Schritte und 35 Minuten erkannt. Portionen fehlen auf der Quelle und werden als unbekannt markiert. |
| BBC Good Food | [Easy roast chicken](https://www.bbcgoodfood.com/recipes/easy-roast-chicken) | Titel, 4 Zutateneinträge, 4 Schritte, 10 Portionen sowie 10/90/100 Minuten erkannt. |
| Food Network | [Fettuccine Alfredo](https://www.foodnetwork.com/recipes/food-network-kitchen/fettuccine-alfredo-3622509) | Beim ersten Lauf wurden Navigationslinks und Werbereste als Rezeptdaten übernommen. Filterung korrigiert und erneut geprüft: 7 Zutaten und 3 saubere Schritte; heuristischer Entwurf wird zur Kontrolle markiert. |
| Delish | [Best chicken soup](https://www.delish.com/cooking/recipe-ideas/a44475588/best-chicken-soup-recipe/) | Erster Lauf hatte Clickbait-Titel, Mengenformatierung und redaktionelle Texte in den Daten. Bereinigt und erneut geprüft: Titel aus URL, 11 Zutaten und 6 Schritte plus ein „Make Ahead“-Hinweis; kein Kommentar-/Foto-/„I made it“-Text mehr. |
| Allrecipes | [Alysia’s Basic Meat Lasagna](https://www.allrecipes.com/recipe/24074/alysias-basic-meat-lasagna/) | Kein vollständiger automatischer Import; manueller Einfüge-Fallback angezeigt. |
| Simply Recipes | [Chicken Piccata](https://www.simplyrecipes.com/recipes/chicken_piccata/) | Kein vollständiger automatischer Import; manueller Einfüge-Fallback angezeigt. |
| Budget Bytes | [One Pot Creamy Cajun Chicken Pasta](https://www.budgetbytes.com/one-pot-creamy-cajun-chicken-pasta/) | Quelle antwortete mit HTTP 403/„Enable JavaScript and cookies“; automatischer Import nicht möglich. |
| Fitalian Cook | [Gnocchi Pfanne](https://fitaliancook.com/gnocchi-pfanne-schnell/) | Kein vollständiger automatischer Import; manueller Einfüge-Fallback angezeigt. |

## Weitere Seitenprüfung

Diese Seiten wurden nur inhaltlich geprüft, nicht durch den Kochbuch-Importdialog geführt:

- Chefkoch: [Coq au vin rouge à la maison](https://www.chefkoch.de/rezepte/2931331445451440/Coq-au-vin-rouge-a-la-maison.html)
- GEFU: [Hamburger Wraps](https://www.gefu.com/hamburger-wraps-mit-selbst-gemachtem-hackfleisch); die URL landete bei einer Weiterleitung/Partnerauswahl statt beim Rezept
- BBC Good Food: [Chicken parmigiana](https://www.bbcgoodfood.com/recipes/chicken-parmigiana)
- Food Network: [Classic shrimp scampi](https://www.foodnetwork.com/recipes/food-network-kitchen/classic-shrimp-scampi-8849846)
- Delish: [Jambalaya](https://www.delish.com/cooking/recipe-ideas/a53820/easy-homemade-cajun-jambalaya-recipe/)

## Änderungen nach den Live-Tests

- Heuristische Auslese verwirft Food Network Navigationslinks, Zutatenkategorien, Auswahl-Steuerelemente, Werbebilder und Seitenelemente wie „Get Ingredients“.
- Checkbox-Markierungen, Markdown-Fettdruck und Werbe-/Bildlinks werden aus importierten Zutaten und Schritten bereinigt.
- Delish-ähnliche Clickbait-Überschriften werden aus dem Rezept-URL-Slug benannt, Mengen mit Markdown-Fettdruck werden wieder geparst, und Bewertungs-/Fototexte werden verworfen.
- Cache-Version auf `v36` erhöht.

## Automatisierte Prüfung

`node --test`: 12 Tests bestanden, 0 fehlgeschlagen. Enthalten sind neue Regressionen für verlinkte Navigationszutaten, Checkbox-/Bild-Markup, redaktionelle Rezeptseiten und Clickbait-Titel.

## Grenzen

Nicht alle unterstützten Anbieter liefern automatisch importierbare Daten. Je nach CORS, Anti-Bot-Schutz und Seitenauszeichnung bleibt der manuelle Einfüge-Fallback erforderlich. Die Ergebnisse sind Entwürfe und müssen bei heuristischer Auslese anhand der Quelle kontrolliert werden. Export/Import, Datenbank-Regressionsabläufe sowie Handschrift, Schräglage und mehrspaltige OCR wurden nicht erneut geprüft.

Der Import nutzt weiterhin Drittanbieter-Proxys als Best-Effort-Fallback. Eingabevalidierung blockiert offensichtliche lokale Ziele und IP-Literale, ist aber kein serverseitiger Schutz gegen DNS-Rebinding oder Proxy-Weiterleitungen zu internen Zielen.
