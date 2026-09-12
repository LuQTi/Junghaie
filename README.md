# Kölner Junghaie – Spielplan

Der Scraper lädt die U15-Spielpläne über den AJAX-Endpunkt der Junghaie,
parst die Hockeydata-HTML-Antwort und schreibt `data/games.json`.

## Lokal

```bash
npm install
npm run scrape
```

Danach kann `index.html` über einen kleinen lokalen Webserver geöffnet werden,
z. B.:

```bash
npx serve .
```

## GitHub Pages

Repository auf GitHub pushen und unter **Settings → Pages** die gewünschte
GitHub-Pages-Quelle konfigurieren.

Die GitHub Action aktualisiert die Spieldaten automatisch alle 6 Stunden.
