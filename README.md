# Kölner Junghaie – Spiele, Ergebnisse & Tabellen

Eine automatisch aktualisierte Website für die Mannschaften der **Kölner Junghaie**.

Die Website zeigt aktuelle **Spielpläne, Ergebnisse und Tabellen** verschiedener Junghaie-Mannschaften. Die Daten werden automatisch von der offiziellen Junghaie-Website abgerufen und in JSON-Dateien gespeichert.

## 🏒 Mannschaften

Aktuell werden folgende Mannschaften berücksichtigt:

* U20
* U17
* U15 A
* U15 B
* U13 A
* U13 B
* Frauen 1
* Frauen 2
* Frauen 3

Die Zuordnung der Mannschaften erfolgt anhand der jeweiligen Spielplan- bzw. Tabellenblöcke der offiziellen Junghaie-Seiten.

Bei Mannschaften mit zwei Blöcken gilt:

* **1. Block → A**
* **2. Block → B**

Das betrifft insbesondere U15 und U13.

## 📡 Datenquelle

Die Daten werden von den offiziellen Seiten der Kölner Junghaie abgerufen.

Beispiel für den U15-Spielplan:

https://www.junghaie.de/spielplan.menuid31.html

Die Junghaie-Seiten verwenden dynamische Hockeydata-Inhalte. Deshalb wird zum Abrufen der Daten ein echter Chromium-Browser über Playwright verwendet.

## 🔄 Automatische Aktualisierung

GitHub Actions aktualisiert die Daten automatisch.

Der Workflow wird standardmäßig einmal täglich ausgeführt. Er kann zusätzlich jederzeit manuell gestartet werden.

Bei einer Aktualisierung passiert Folgendes:

1. Das Repository wird ausgecheckt.
2. Node.js wird eingerichtet.
3. Die benötigten Abhängigkeiten werden installiert.
4. Chromium für Playwright wird installiert.
5. Der Scraper `scripts/scrape-data.js` wird gestartet.
6. Die dynamischen Junghaie-Seiten werden mit Chromium geladen.
7. Spielpläne, Ergebnisse und Tabellen werden ausgelesen.
8. Die Daten werden den richtigen Mannschaften zugeordnet.
9. Duplikate werden entfernt.
10. Die Daten werden sortiert.
11. Die JSON-Dateien in `data/` werden aktualisiert.
12. Änderungen werden automatisch in das Repository zurückgeschrieben.

Die Website selbst benötigt **keinen eigenen Server**.

## ▶️ Manuell aktualisieren

Die Aktualisierung kann jederzeit manuell über GitHub gestartet werden:

**Actions → Update Junghaie Spiele, Ergebnisse und Tabelle → Run workflow**

Nach dem Start führt GitHub Actions den kompletten Scraper aus und aktualisiert die Daten im Repository.

## 📁 Projektstruktur

```text
junghaie-games/
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
```

## 📄 Dateien

| Datei                               | Beschreibung                                                |
| ----------------------------------- | ----------------------------------------------------------- |
| `index.html`                        | Website und Darstellung der Daten                           |
| `data/games.json`                   | Kommende und geplante Spiele                                |
| `data/results.json`                 | Bereits ausgetragene Spiele mit Ergebnissen                 |
| `data/standings.json`               | Aktuelle Tabellen                                           |
| `scripts/scrape-data.js`            | Scraper für Spiele, Ergebnisse und Tabellen                 |
| `.github/workflows/update-data.yml` | GitHub-Actions-Workflow für die automatische Aktualisierung |
| `package.json`                      | Node.js- und Playwright-Abhängigkeiten                      |
| `README.md`                         | Projektdokumentation                                        |

## 🧩 Zuordnung der Mannschaften

Die Mannschaft wird **nicht anhand des Namens eines Gegners oder anhand einer automatischen Namenssuche bestimmt**.

Stattdessen kennt der Scraper die Struktur der jeweiligen Seite.

### U20

Alle relevanten Datenblöcke gehören zur:

**U20**

### U17

Alle relevanten Datenblöcke gehören zur:

**U17**

### U15

Die beiden Blöcke werden anhand ihrer Reihenfolge zugeordnet:

| Block    | Mannschaft |
| -------- | ---------- |
| 1. Block | U15 A      |
| 2. Block | U15 B      |

Das gilt sowohl für Spielplandaten als auch für Tabellen und Ergebnisse.

### U13

Auch bei der U13 erfolgt die Zuordnung anhand der Reihenfolge:

| Block    | Mannschaft |
| -------- | ---------- |
| 1. Block | U13 A      |
| 2. Block | U13 B      |

### Frauen

Die drei Frauenmannschaften werden direkt anhand ihrer jeweiligen Seitenkonfiguration zugeordnet:

* Frauen 1
* Frauen 2
* Frauen 3

Dass eine Frauenmannschaft aktuell noch keine Spiele absolviert hat, ist dabei ein gültiger Zustand. Eine Tabelle mit **0 Spielen und 0 Punkten** bedeutet daher nicht automatisch, dass beim Abrufen der Daten ein Fehler vorliegt.

## 🗂️ JSON-Daten

Die Website verwendet die erzeugten JSON-Dateien als Datenquelle.

### `games.json`

Enthält die geplanten bzw. kommenden Spiele mit Informationen wie:

* Datum
* Uhrzeit
* Heimteam
* Auswärtsteam
* Mannschaft
* Heim-/Auswärtsspiel
* Datum/Zeit für die Sortierung

### `results.json`

Enthält bereits ausgetragene Spiele mit:

* Datum
* Uhrzeit
* Heimteam
* Auswärtsteam
* Heimtore
* Auswärtstore
* Mannschaft
* Heim-/Auswärtskennzeichnung

### `standings.json`

Enthält die Tabelleninformationen der jeweiligen Wettbewerbe, unter anderem:

* Platz
* Mannschaft
* Spiele
* Tordifferenz
* Punkte
* zugehörige Junghaie-Mannschaft

Alle drei Dateien enthalten außerdem einen Zeitstempel der letzten Datengenerierung.

## ⚙️ Technologie

Das Projekt verwendet:

* **HTML / CSS / JavaScript** – Website
* **Node.js** – Scraper
* **Playwright** – Laden der dynamischen Hockeydata-Seiten
* **Chromium** – Browser für den Scraper
* **JSON** – Speicherung der Daten
* **GitHub Actions** – automatische Datenaktualisierung
* **GitHub Pages** – Hosting der Website

## 🌐 Hosting

Die Website ist als statische Website aufgebaut und kann über **GitHub Pages** veröffentlicht werden.

Da die Daten bereits durch GitHub Actions erzeugt werden, benötigt die fertige Website keinen eigenen Backend-Server.

## 🔧 Lokale Ausführung

Der Scraper kann auch lokal ausgeführt werden.

Abhängigkeiten installieren:

```bash
npm install
```

Playwright Chromium installieren:

```bash
npx playwright install chromium
```

Scraper starten:

```bash
npm run scrape
```

Danach befinden sich die aktualisierten Daten in:

```text
data/games.json
data/results.json
data/standings.json
```

## ℹ️ Hinweis

Die Spielplan-, Ergebnis- und Tabellendaten werden automatisiert von den öffentlich zugänglichen Seiten der Kölner Junghaie abgerufen.

Die Website dient ausschließlich der übersichtlichen Darstellung dieser Daten.
