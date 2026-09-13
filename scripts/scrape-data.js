import fs from "fs/promises";
import { chromium } from "playwright";

const PAGES = [
  {
    url: "https://www.junghaie.de/spielplan.menuid23.html",
    teams: ["U20"],
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid27.html",
    teams: ["U17"],
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid31.html",
    teams: ["U15 A", "U15 B"],
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid35.html",
    teams: ["U13 A", "U13 B"],
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid51.html",
    teams: ["Frauen 1"],
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid47.html",
    teams: ["Frauen 2"],
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid55.html",
    teams: ["Frauen 3"],
  },
  {
    url: "https://www.junghaie.de/tabelle-spielergebnisse.menuid24.html",
    teams: ["U20"],
    type: "table-results",
  },
];

const OUTPUT_DIR = "data";

function clean(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateTime(dateText, timeText = "") {
  const m = clean(dateText).match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
  );

  if (!m) return null;

  const time = clean(timeText);
  const t = time.match(/^(\d{1,2}):(\d{2})$/);

  const hour = t ? Number(t[1]) : 0;
  const minute = t ? Number(t[2]) : 0;

  const d = new Date(
    Number(m[3]),
    Number(m[2]) - 1,
    Number(m[1]),
    hour,
    minute
  );

  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString();
}

function score(value) {
  const m = clean(value).match(/\d+/);
  return m ? Number(m[0]) : null;
}

function uniqueGames(games) {
  const map = new Map();

  for (const game of games) {
    const key = [
      game.datetime || "",
      clean(game.date),
      clean(game.time),
      clean(game.home),
      clean(game.away),
    ].join("|");

    if (!map.has(key)) {
      map.set(key, game);
    }
  }

  return [...map.values()];
}

function sortGames(games) {
  return [...games].sort((a, b) => {
    const da = a.datetime
      ? new Date(a.datetime).getTime()
      : Number.MAX_SAFE_INTEGER;

    const db = b.datetime
      ? new Date(b.datetime).getTime()
      : Number.MAX_SAFE_INTEGER;

    return da - db;
  });
}

function findJunghaieTeam(home, away) {
  const h = clean(home).toLowerCase();
  const a = clean(away).toLowerCase();

  if (h.includes("junghaie")) return "home";
  if (a.includes("junghaie")) return "away";

  return null;
}

function addLocation(game) {
  const location = findJunghaieTeam(game.home, game.away);

  if (location === "home") {
    return {
      ...game,
      location: "home",
    };
  }

  if (location === "away") {
    return {
      ...game,
      location: "away",
    };
  }

  return {
    ...game,
    location: null,
  };
}

async function waitForHockeydata(page) {
  console.log("Warte auf Hockeydata...");

  await page.waitForTimeout(5000);

  try {
    await page.waitForFunction(
      () => {
        const text = document.body?.innerText || "";

        return (
          text.includes("Datum") ||
          text.includes("Heim") ||
          text.includes("Gast") ||
          document.querySelectorAll("table").length > 0
        );
      },
      { timeout: 20000 }
    );
  } catch {
    // Seite kann trotzdem bereits Daten enthalten.
  }

  await page.waitForTimeout(3000);
}

async function scrapeSchedulePage(browser, config) {
  console.log("========================================");
  console.log(`Seite: ${config.url}`);
  console.log(`Teams: ${config.teams.join(", ")}`);
  console.log("Typ: Spielplan");
  console.log("========================================");

  const page = await browser.newPage();

  try {
    await page.goto(config.url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await waitForHockeydata(page);

    const games = await page.evaluate(() => {
      function clean(value) {
        return String(value ?? "")
          .replace(/\s+/g, " ")
          .trim();
      }

      function parseDateTime(dateText, timeText = "") {
        const m = clean(dateText).match(
          /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
        );

        if (!m) return null;

        const t = clean(timeText).match(
          /^(\d{1,2}):(\d{2})$/
        );

        const hour = t ? Number(t[1]) : 0;
        const minute = t ? Number(t[2]) : 0;

        const d = new Date(
          Number(m[3]),
          Number(m[2]) - 1,
          Number(m[1]),
          hour,
          minute
        );

        return Number.isNaN(d.getTime())
          ? null
          : d.toISOString();
      }

      function score(value) {
        const m = clean(value).match(/\d+/);
        return m ? Number(m[0]) : null;
      }

      const tables = [
        ...document.querySelectorAll("table"),
      ];

      const games = [];

      for (const table of tables) {
        const rows = [
          ...table.querySelectorAll("tr"),
        ];

        for (const row of rows) {
          const cells = [
            ...row.querySelectorAll("th, td"),
          ]
            .map(cell => clean(cell.innerText))
            .filter(Boolean);

          if (cells.length < 5) continue;

          const dateIndex = cells.findIndex(v =>
            /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(v)
          );

          if (dateIndex === -1) continue;

          const date = cells[dateIndex];
          const time = cells[dateIndex + 1] || "";

          let home = "";
          let away = "";
          let homeScore = null;
          let awayScore = null;

          const colonIndex = cells.findIndex(
            (v, i) => i > dateIndex && v === ":"
          );

          if (colonIndex !== -1) {
            homeScore = score(
              cells[colonIndex - 1]
            );

            awayScore = score(
              cells[colonIndex + 1]
            );

            home =
              cells[dateIndex + 2] || "";

            away =
              cells[colonIndex + 2] || "";
          } else {
            continue;
          }

          if (!home || !away) continue;

          if (
            home.toLowerCase() === "heim" ||
            away.toLowerCase() === "gast"
          ) {
            continue;
          }

          games.push({
            date,
            time,
            datetime: parseDateTime(date, time),
            home,
            away,
            homeScore,
            awayScore,
          });
        }
      }

      return games;
    });

    console.log(`Gefundene Spiele: ${games.length}`);

    return games.map(game => ({
      ...game,
      location: findJunghaieTeam(
        game.home,
        game.away
      ),
    }));
  } finally {
    await page.close();
  }
}

async function scrapeTableResultsPage(browser, config) {
  console.log("========================================");
  console.log(`Seite: ${config.url}`);
  console.log(`Teams: ${config.teams.join(", ")}`);
  console.log("Typ: Tabelle + Spielergebnisse");
  console.log("========================================");
  console.log(
    "Warte auf gerenderte Tabelle und Ergebnisse..."
  );

  const page = await browser.newPage();

  try {
    await page.goto(config.url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    /*
     * Hockeydata braucht etwas Zeit, um die Tabelle
     * und die Ergebnisse in den DOM einzubauen.
     */
    await page.waitForTimeout(7000);

    try {
      await page.waitForFunction(
        () => {
          const text = document.body?.innerText || "";

          return (
            text.includes("Spielergebnisse") ||
            text.includes("Tabelle U20") ||
            document.querySelectorAll("table").length >= 1
          );
        },
        { timeout: 30000 }
      );
    } catch {
      // Danach trotzdem auslesen.
    }

    await page.waitForTimeout(3000);

    const extracted = await page.evaluate(() => {
      function clean(value) {
        return String(value ?? "")
          .replace(/\s+/g, " ")
          .trim();
      }

      function score(value) {
        const m = clean(value).match(/\d+/);
        return m ? Number(m[0]) : null;
      }

      /*
       * WICHTIG:
       * Diese Funktion befindet sich innerhalb von
       * page.evaluate(), damit sie im Browser-Kontext
       * verfügbar ist.
       */
      function parseDateTime(dateText, timeText = "") {
        const m = clean(dateText).match(
          /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
        );

        if (!m) return null;

        const t = clean(timeText).match(
          /^(\d{1,2}):(\d{2})$/
        );

        const hour = t ? Number(t[1]) : 0;
        const minute = t ? Number(t[2]) : 0;

        const d = new Date(
          Number(m[3]),
          Number(m[2]) - 1,
          Number(m[1]),
          hour,
          minute
        );

        return Number.isNaN(d.getTime())
          ? null
          : d.toISOString();
      }

      const tables = [
        ...document.querySelectorAll("table"),
      ];

      const results = [];
      const standings = [];

      for (const table of tables) {
        const text = clean(table.innerText);

        const rows = [
          ...table.querySelectorAll("tr"),
        ];

        if (!rows.length) continue;

        /*
         * ========================================
         * SPIELERGEBNISSE
         * ========================================
         */

        if (
          text.includes("Datum") &&
          text.includes("Zeit") &&
          text.includes("Heim") &&
          text.includes("Gast")
        ) {
          for (const row of rows) {
            const cells = [
              ...row.querySelectorAll("th, td"),
            ]
              .map(cell => clean(cell.innerText))
              .filter(Boolean);

            if (cells.length < 5) continue;

            const dateIndex = cells.findIndex(v =>
              /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(v)
            );

            if (dateIndex === -1) continue;

            const date = cells[dateIndex];
            const time =
              cells[dateIndex + 1] || "";

            const colonIndex = cells.findIndex(
              (v, i) =>
                i > dateIndex && v === ":"
            );

            if (colonIndex === -1) continue;

            const home =
              cells[dateIndex + 2] || "";

            const homeScore =
              score(cells[colonIndex - 1]);

            const awayScore =
              score(cells[colonIndex + 1]);

            const away =
              cells[colonIndex + 2] || "";

            if (!home || !away) continue;

            /*
             * Tabellen-Kopf nicht als Spiel übernehmen.
             */
            if (
              home.toLowerCase() === "heim" ||
              away.toLowerCase() === "gast"
            ) {
              continue;
            }

            results.push({
              date,
              time,
              datetime: parseDateTime(
                date,
                time
              ),
              home,
              away,
              homeScore,
              awayScore,
            });
          }

          continue;
        }

        /*
         * ========================================
         * U20 TABELLE
         * ========================================
         */

        if (
          text.includes("Team") &&
          text.includes("SP") &&
          text.includes("TD") &&
          text.includes("P")
        ) {
          for (const row of rows) {
            const cells = [
              ...row.querySelectorAll("th, td"),
            ]
              .map(cell => clean(cell.innerText))
              .filter(Boolean);

            if (cells.length < 4) continue;

            /*
             * Typischer Aufbau:
             *
             * 1
             * Eisbären Juniors Berlin
             * 5
             * +7
             * 10
             */

            const rank = score(cells[0]);

            if (
              rank === null ||
              rank < 1 ||
              rank > 50
            ) {
              continue;
            }

            const team = cells[1];

            if (!team) continue;

            const sp = score(cells[2]);
            const td = cells[3];
            const points =
              score(cells[4]);

            /*
             * Nur echte Tabellenzeilen.
             */
            if (sp === null) continue;

            standings.push({
              rank,
              team,
              games: sp,
              goalDifference: td,
              points:
                points !== null
                  ? points
                  : null,
            });
          }
        }
      }

      return {
        results,
        standings,
      };
    });

    console.log(
      `Gefundene Spielergebnisse: ${extracted.results.length}`
    );

    console.log(
      `Gefundene Tabellenplätze: ${extracted.standings.length}`
    );

    /*
     * Debug-Ausgabe, falls Hockeydata später
     * seine Struktur verändert.
     */
    if (
      extracted.results.length === 0 ||
      extracted.standings.length === 0
    ) {
      const bodyText = await page.locator("body").innerText();

      console.log(
        "----------------------------------------"
      );
      console.log(
        "WARNUNG: Tabelle oder Ergebnisse konnten"
      );
      console.log(
        "nicht vollständig erkannt werden."
      );
      console.log(
        "Erste 3000 Zeichen des gerenderten DOM:"
      );
      console.log(
        bodyText.substring(0, 3000)
      );
      console.log(
        "----------------------------------------"
      );
    }

    return extracted;
  } finally {
    await page.close();
  }
}

async function writeJsonIfValid(
  filename,
  data,
  minimumItems = 1
) {
  const count = Array.isArray(data)
    ? data.length
    : Array.isArray(data?.games)
      ? data.games.length
      : Array.isArray(data?.results)
        ? data.results.length
        : Array.isArray(data?.standings)
          ? data.standings.length
          : 0;

  if (count < minimumItems) {
    console.log(
      `WARNUNG: ${filename} enthält keine ausreichenden Daten – Datei wird nicht überschrieben.`
    );

    return;
  }

  await fs.writeFile(
    `${OUTPUT_DIR}/${filename}`,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  console.log(
    `Geschrieben: ${OUTPUT_DIR}/${filename}`
  );
}

async function main() {
  console.log("");
  console.log("========================================");
  console.log(
    "KÖLNER JUNGHÄIE – SPIELPLAN + ERGEBNISSE + TABELLE"
  );
  console.log("========================================");
  console.log("");

  await fs.mkdir(OUTPUT_DIR, {
    recursive: true,
  });

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const allGames = [];
    let tableResults = {
      results: [],
      standings: [],
    };

    for (const config of PAGES) {
      if (config.type === "table-results") {
        tableResults =
          await scrapeTableResultsPage(
            browser,
            config
          );
      } else {
        const games =
          await scrapeSchedulePage(
            browser,
            config
          );

        for (const game of games) {
          /*
           * Team-Zuordnung:
           *
           * Bei Seiten mit nur einer Mannschaft
           * ist die Zuordnung eindeutig.
           */
          let team = config.teams[0];

          /*
           * U15/U13 haben zwei Mannschaften.
           * Falls Hockeydata den Namen in der
           * Heim-/Gast-Mannschaft erkennen lässt,
           * versuchen wir ihn zuzuordnen.
           */
          const combined =
            `${game.home} ${game.away}`
              .toLowerCase();

          if (
            config.teams.includes("U15 A") &&
            config.teams.includes("U15 B")
          ) {
            if (combined.includes("u15 b")) {
              team = "U15 B";
            } else {
              team = "U15 A";
            }
          }

          if (
            config.teams.includes("U13 A") &&
            config.teams.includes("U13 B")
          ) {
            if (combined.includes("u13 b")) {
              team = "U13 B";
            } else {
              team = "U13 A";
            }
          }

          allGames.push({
            ...game,
            team,
          });
        }
      }
    }

    /*
     * ========================================
     * SPIELPLAN
     * ========================================
     */

    let games = uniqueGames(allGames)
      .map(addLocation)
      .map(game => ({
        ...game,
        team: game.team || null,
      }));

    games = sortGames(games);

    console.log("");
    console.log("========================================");
    console.log(
      `Gesamt gefundene Spiele: ${games.length}`
    );
    console.log("========================================");

    if (games.length === 0) {
      throw new Error(
        "Keine Spiele gefunden. games.json wird nicht überschrieben."
      );
    }

    const generatedAt =
      new Date().toISOString();

    /*
     * ========================================
     * games.json
     * ========================================
     */

    await writeJsonIfValid(
      "games.json",
      {
        generatedAt,
        source:
          "https://www.junghaie.de/",
        games,
      },
      1
    );

    /*
     * ========================================
     * results.json
     * ========================================
     */

    const results = uniqueGames(
      tableResults.results
    );

    const resultsWithLocation = results
      .map(addLocation)
      .sort((a, b) => {
        const da = a.datetime
          ? new Date(a.datetime).getTime()
          : 0;

        const db = b.datetime
          ? new Date(b.datetime).getTime()
          : 0;

        /*
         * Neueste Ergebnisse zuerst.
         */
        return db - da;
      });

    await writeJsonIfValid(
      "results.json",
      {
        generatedAt,
        source:
          "https://www.junghaie.de/tabelle-spielergebnisse.menuid24.html",
        results: resultsWithLocation,
      },
      1
    );

    /*
     * ========================================
     * standings.json
     * ========================================
     */

    const standings =
      tableResults.standings
        .filter(row => row.team)
        .sort(
          (a, b) =>
            Number(a.rank) -
            Number(b.rank)
        );

    await writeJsonIfValid(
      "standings.json",
      {
        generatedAt,
        source:
          "https://www.junghaie.de/tabelle-spielergebnisse.menuid24.html",
        league: "U20 DNL",
        standings,
      },
      1
    );

    /*
     * ========================================
     * ABSCHLUSS
     * ========================================
     */

    console.log("");
    console.log("========================================");
    console.log("SCRAPER ERFOLGREICH");
    console.log("========================================");
    console.log(
      `Spiele:        ${games.length}`
    );
    console.log(
      `Ergebnisse:    ${resultsWithLocation.length}`
    );
    console.log(
      `Tabelle:       ${standings.length} Teams`
    );
    console.log("========================================");
    console.log("");
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error("");
  console.error("SCRAPER FEHLER:");
  console.error(error);
  process.exit(1);
});
