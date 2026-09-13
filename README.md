# 🏒 Kölner Junghaie – Spielplan, Ergebnisse & Tabellen

Eine einfache Website zur Übersicht der Spiele der Kölner Junghaie.

Die Website zeigt Spielpläne, Ergebnisse und Tabellen der Nachwuchs- und Frauenmannschaften.

Die Daten werden automatisch von den offiziellen Seiten der Kölner Junghaie abgerufen und in JSON-Dateien gespeichert. Die Website liest diese JSON-Dateien aus und stellt die Informationen übersichtlich dar.

---

## 🏒 Mannschaften

### Nachwuchs

- U20
- U17
- U15 A
- U15 B
- U13 A
- U13 B

### Frauen

- Frauen 1
- Frauen 2
- Frauen 3

---

## 📊 Angezeigte Informationen

Die Website stellt folgende Informationen zur Verfügung:

- 📅 kommende Spiele
- 🏒 bereits gespielte Spiele
- 🏆 Ergebnisse
- 📈 Tabellen
- 🏠 Heim- und Auswärtsspiele
- 📍 Spielorte
- 🕐 Datum und Uhrzeit der Spiele

Welche Informationen vorhanden sind, hängt davon ab, welche Daten die offiziellen Junghaie-Seiten für die jeweilige Mannschaft bereitstellen.

---

## 🔄 Automatische Aktualisierung

Die Daten werden über **GitHub Actions automatisch aktualisiert**.

Der Workflow befindet sich unter:

`.github/workflows/update-data.yml`

Die automatische Aktualisierung läuft derzeit **einmal täglich**.

Zusätzlich kann der Workflow jederzeit manuell über GitHub Actions gestartet werden.

### Ablauf der automatischen Aktualisierung

1. Das Repository wird ausgecheckt.
2. Node.js 20 wird eingerichtet.
3. Die benötigten npm-Abhängigkeiten werden installiert.
4. Playwright wird installiert.
5. Chromium wird für Playwright installiert.
6. Das Skript `scripts/scrape-data.js` wird ausgeführt.
7. Die aktuellen Spielpläne werden abgerufen.
8. Die aktuellen Ergebnisse werden abgerufen.
9. Die aktuellen Tabellen werden abgerufen.
10. Die JSON-Dateien werden aktualisiert.
11. GitHub Actions prüft, ob sich die Daten geändert haben.
12. Bei Änderungen werden die neuen Daten automatisch ins Repository geschrieben.
13. Wenn sich keine Daten geändert haben, wird kein neuer Commit erstellt.

---

## ⏰ Automatischer Zeitplan

Der GitHub-Actions-Workflow wird automatisch einmal täglich ausgeführt.

Zusätzlich kann er jederzeit manuell gestartet werden:

**GitHub → Actions → Junghaie Spiele, Ergebnisse und Tabelle aktualisieren → Run workflow**

---

## 📁 Projektstruktur

    junghaie-games/
    │
    ├── .github/
    │   └── workflows/
    │       └── update-data.yml
    │
    ├── data/
    │   ├── games.json
    │   ├── results.json
    │   └── standings.json
    │
    ├── scripts/
    │   └── scrape-data.js
    │
    ├── index.html
    ├── package.json
    └── README.md

---

## 📄 Dateien

### `index.html`

Die eigentliche Website.

Sie liest die JSON-Dateien aus dem Ordner `data/` und zeigt die Spielpläne, Ergebnisse und Tabellen an.

### `data/games.json`

Enthält die aus den Spielplanseiten abgerufenen Spiele.

### `data/results.json`

Enthält bereits gespielte Spiele und deren Ergebnisse.

### `data/standings.json`

Enthält die abgerufenen Tabellenstände.

### `scripts/scrape-data.js`

Das Hauptskript für den Datenabruf.

Es verwendet Playwright und ruft die dynamischen Seiten der Kölner Junghaie auf.

Das Skript verarbeitet Spielpläne, Ergebnisse und Tabellen und schreibt die Daten anschließend in die JSON-Dateien.

### `.github/workflows/update-data.yml`

Enthält den GitHub-Actions-Workflow für die automatische Aktualisierung der Daten.

### `package.json`

Enthält die Node.js-Projektinformationen und die benötigten Abhängigkeiten.

Der Scraper wird über folgenden Befehl gestartet:

    npm run scrape

---

## 🕷️ Datenabruf

Der Datenabruf erfolgt über die offiziellen Webseiten der Kölner Junghaie.

Berücksichtigt werden:

- U20
- U17
- U15 A
- U15 B
- U13 A
- U13 B
- Frauen 1
- Frauen 2
- Frauen 3

Die Seiten werden mit Playwright geladen, da die Spielpläne, Ergebnisse und Tabellen teilweise dynamisch auf der Webseite geladen werden.

---

## 🧩 Zuordnung U15 und U13

Bei U15 und U13 gibt es jeweils eine A- und eine B-Mannschaft.

Die Zuordnung der Spiele erfolgt nicht einfach anhand der Reihenfolge der Tabellen.

Stattdessen wird die jeweilige Mannschaftsüberschrift auf der Seite berücksichtigt.

Dadurch funktioniert die Zuordnung auch dann korrekt, wenn beispielsweise:

    U15 A
    → aktuell keine Spiele

    U15 B
    → mehrere Spiele

Die Spiele werden dann trotzdem korrekt als **U15 B** gespeichert.

Das gleiche Prinzip wird bei U13 A und U13 B verwendet.

---

## 🏆 Zuordnung von Tabellen und Ergebnissen

Auch bei den Tabellen- und Ergebnisseiten wird die Mannschaft anhand des jeweiligen Bereichs zugeordnet.

Die Reihenfolge der vorhandenen Ergebnisse wird deshalb nicht einfach als A oder B interpretiert.

Das ist wichtig, wenn beispielsweise nur die B-Mannschaft bereits Ergebnisse hat.

Dann werden diese Ergebnisse korrekt der B-Mannschaft zugeordnet.

Auch wenn eine Mannschaft aktuell keine Ergebnisse besitzt, bleibt die Zuordnung der vorhandenen Daten korrekt.

---

## 🧹 Datenverarbeitung

Beim Einlesen der Daten werden unter anderem:

- doppelte Spiele entfernt
- doppelte Ergebnisse entfernt
- Datumsangaben vereinheitlicht
- Uhrzeiten verarbeitet
- Mannschaften erkannt
- Heim- und Auswärtsspiele unterschieden
- Spielorte ergänzt
- Daten sortiert

Dadurch werden die JSON-Dateien möglichst übersichtlich und einheitlich gehalten.

---

## ▶️ Scraper lokal ausführen

Der Datenabruf kann auch manuell auf einem Rechner ausgeführt werden.

### 1. Abhängigkeiten installieren

    npm install

### 2. Chromium für Playwright installieren

    npx playwright install chromium

### 3. Scraper starten

    npm run scrape

Danach werden die Dateien im Ordner `data/` aktualisiert:

    data/games.json
    data/results.json
    data/standings.json

---

## 🌐 GitHub Pages

Die Website kann über **GitHub Pages** veröffentlicht werden.

Die Website benötigt keinen eigenen Server.

Der Ablauf ist:

    Offizielle Junghaie-Webseite
              │
              ▼
       Playwright / Scraper
              │
              ▼
          JSON-Dateien
              │
              ▼
           index.html
              │
              ▼
         GitHub Pages

---

## 🔁 Gesamter automatischer Ablauf

    Offizielle Junghaie-Seiten
              │
              │ Daten abrufen
              ▼
         GitHub Actions
              │
              │ startet
              ▼
    scripts/scrape-data.js
              │
              │ verarbeitet
              ▼
          data/*.json
              │
              │ Git Commit
              ▼
         GitHub Repository
              │
              ▼
         GitHub Pages
              │
              ▼
            Website

---

## 💾 Speicherung der Daten

Die automatisch abgerufenen Daten werden direkt im Repository gespeichert.

Verwendet werden:

- `data/games.json`
- `data/results.json`
- `data/standings.json`

Dadurch kann die statische Website die Daten direkt aus dem Repository laden.

---

## 🔐 GitHub-Berechtigungen

GitHub Actions besitzt die benötigte Berechtigung, um die aktualisierten Dateien wieder in das Repository zu schreiben.

Dafür wird im Workflow folgende Berechtigung verwendet:

    permissions:
      contents: write

Der Commit wird automatisch mit dem GitHub-Actions-Bot erstellt.

---

## 🛠️ GitHub Actions manuell starten

Die automatische Aktualisierung kann jederzeit manuell gestartet werden.

Dazu auf GitHub:

**Actions → Junghaie Spiele, Ergebnisse und Tabelle aktualisieren → Run workflow → Run workflow**

Danach startet der Datenabruf sofort.

---

## ⚠️ Hinweise

Die Website und der Scraper sind von der Struktur der offiziellen Junghaie-Webseiten abhängig.

Wenn sich die Struktur der Webseiten wesentlich ändert, kann es notwendig sein, das Skript anzupassen.

Der entsprechende Code befindet sich unter:

`scripts/scrape-data.js`

Auch leere Tabellen oder Ergebnisse können normal sein, wenn eine Mannschaft aktuell noch keine Spiele absolviert hat.

Das bedeutet nicht automatisch, dass beim Scraper ein Fehler vorliegt.

---

## 🛠️ Fehlerbehebung

Wenn die automatische Aktualisierung nicht funktioniert, kann auf GitHub unter **Actions** der entsprechende Workflow geöffnet werden.

Dort kann der letzte Lauf kontrolliert werden.

Bei einem Fehler sollte insbesondere geprüft werden:

- ob die Junghaie-Webseite erreichbar ist
- ob sich die Webseitenstruktur geändert hat
- ob Playwright korrekt installiert wurde
- ob Chromium installiert werden konnte
- ob die JSON-Dateien geschrieben werden konnten
- ob GitHub Actions die benötigten Repository-Berechtigungen besitzt

---

## 📌 Ziel des Projekts

Ziel des Projekts ist es, die Spielpläne, Ergebnisse und Tabellen der Kölner Junghaie möglichst einfach und übersichtlich an einer zentralen Stelle darzustellen.

Die Datenpflege erfolgt automatisch, sodass die Website nicht bei jedem neuen Spiel manuell aktualisiert werden muss.

---

## 📄 Datenquelle

Die Spielplan-, Ergebnis- und Tabellendaten stammen von den offiziellen Webseiten der Kölner Junghaie.

Dieses Projekt dient der übersichtlichen Darstellung dieser öffentlich verfügbaren Informationen.

---

## 🏒 Kölner Junghaie

Offizielle Website:

https://www.junghaie.de/
