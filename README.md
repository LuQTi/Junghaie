# Kölner Junghaie U15 Spiele

Die Website zeigt die Spiele der U15 der Kölner Junghaie.

Die Spielplandaten werden automatisch von

https://www.junghaie.de/spielplan.menuid31.html

abgerufen.

## Automatische Aktualisierung

GitHub Actions führt den Scraper jede Nacht aus.

Der Scraper:

1. startet Chromium
2. öffnet die Junghaie-Spielplanseite
3. wartet auf das Laden von Hockeydata
4. liest die Spielplandaten
5. entfernt Duplikate
6. sortiert die Spiele
7. schreibt `data/games.json`

Die Website selbst benötigt keinen Server.

## Manuell starten

In GitHub:

Actions → Update Junghaie games → Run workflow

## Dateien

- `index.html` – Website
- `data/games.json` – aktuelle Spieldaten
- `scripts/scrape-u15.js` – Scraper
- `.github/workflows/update-games.yml` – nächtliche Aktualisierung
- `package.json` – Node-/Playwright-Abhängigkeiten
