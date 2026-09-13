# 🏒 Kölner Junghaie – Spielplan

Eine einfache Website zur Übersicht der Spiele der **Kölner Junghaie**.

Die Website zeigt Spielpläne, Ergebnisse und Tabellen der verschiedenen Nachwuchs- und Frauenmannschaften.

Die Daten werden automatisch von der offiziellen Junghaie-Website abgerufen und regelmäßig aktualisiert.

---

## 📋 Enthaltene Mannschaften

Aktuell werden folgende Mannschaften berücksichtigt:

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

## 📊 Angezeigte Daten

Für die Mannschaften werden – soweit auf der Junghaie-Website vorhanden – folgende Informationen abgerufen:

- 📅 Spielplan
- 🏒 bereits gespielte Spiele
- 🏆 Ergebnisse
- 📈 Tabelle
- 🏠 Heim- und Auswärtsspiele
- 📍 Spielort

Die Daten werden in drei JSON-Dateien gespeichert:

```text
data/
├── games.json
├── results.json
└── standings.json
