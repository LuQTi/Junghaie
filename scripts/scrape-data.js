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

  // Tabellen + Spielergebnisse
  {
    url: "https://www.junghaie.de/tabelle-spielergebnisse.menuid24.html",
    teams: ["U20"],
    type: "table-results",
  },
  {
    url: "https://www.junghaie.de/tabelle-spielergebnisse.menuid28.html",
    teams: ["U17"],
    type: "table-results",
  },
  {
    url: "https://www.junghaie.de/tabelle-spielergebnisse.menuid32.html",
    teams: ["U15 A", "U15 B"],
    type: "table-results",
  },
  {
    url: "https://www.junghaie.de/tabelle-spielergebnisse.menuid36.html",
    teams: ["U13 A", "U13 B"],
    type: "table-results",
  },
  {
    url: "https://www.junghaie.de/tabelle-spielergebnisse.menuid52.html",
    teams: ["Frauen 1"],
    type: "table-results",
  },
  {
    url: "https://www.junghaie.de/tabelle-spielergebnisse.menuid48.html",
    teams: ["Frauen 2"],
    type: "table-results",
  },
  {
    url: "https://www.junghaie.de/tabelle-spielergebnisse.menuid56.html",
    teams: ["Frauen 3"],
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

  const t = time.match(
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

  if (Number.isNaN(d.getTime())) {
    return null;
  }

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
      game.team || "",
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

  if (
    h.includes("junghaie") ||
    h.includes("köln") ||
    h.includes("koeln")
  ) {
    return "home";
  }

  if (
    a.includes("junghaie") ||
    a.includes("köln") ||
    a.includes("koeln")
  ) {
    return "away";
  }

  return null;
}

function addLocation(game) {
  return {
    ...game,
    location: findJunghaieTeam(
      game.home,
      game.away
    ),
  };
}

async function waitForHockeydata(page) {
  console.log("Warte auf Hockeydata...");

  await page.waitForTimeout(5000);

  try {
    await page.waitForFunction(
      () => {
        const text =
          document.body?.innerText || "";

        return (
          text.includes("Datum") ||
          text.includes("Heim") ||
          text.includes("Gast") ||
          text.includes("Team") ||
          document.querySelectorAll("table").length > 0
        );
      },
      { timeout: 20000 }
    );
  } catch {
    // Seite kann trotzdem Daten enthalten.
  }

  await page.waitForTimeout(3000);
}

/*
 * Gibt für eine Seite die Mannschaft zum jeweiligen Block zurück.
 *
 * Bei nur einer Mannschaft:
 *   alle Blöcke = diese Mannschaft
 *
 * Bei zwei Mannschaften:
 *   erster Block  = teams[0]
 *   zweiter Block = teams[1]
 */
function getBlockTeam(config, blockIndex) {
  if (config.teams.length === 1) {
    return config.teams[0];
  }

  return config.teams[blockIndex] || null;
}

/*
 * Ermittelt aus den Tabellen auf einer Seite die relevanten
 * Spielblöcke.
 *
 * Wichtig:
 * U15:
 *   Block 0 = U15 A
 *   Block 1 = U15 B
 *
 * U13:
 *   Block 0 = U13 A
 *   Block 1 = U13 B
 */
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

    const blocks = await page.evaluate(() => {
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

        const hour = t
          ? Number(t[1])
          : 0;

        const minute = t
          ? Number(t[2])
          : 0;

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

        return m
          ? Number(m[0])
          : null;
      }

      const tables = [
        ...document.querySelectorAll("table"),
      ];

      const blocks = [];

      /*
       * Jede Tabelle, die echte Spieldaten enthält,
       * wird als Spielblock betrachtet.
       */
      for (const table of tables) {
        const rows = [
          ...table.querySelectorAll("tr"),
        ];

        const games = [];

        for (const row of rows) {
          const cells = [
            ...row.querySelectorAll("th, td"),
          ]
            .map(cell =>
              clean(cell.innerText)
            )
            .filter(Boolean);

          if (cells.length < 5) {
            continue;
          }

          const dateIndex =
            cells.findIndex(value =>
              /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(
                value
              )
            );

          if (dateIndex === -1) {
            continue;
          }

          const date =
            cells[dateIndex];

          const time =
            cells[dateIndex + 1] || "";

          const colonIndex =
            cells.findIndex(
              (value, index) =>
                index > dateIndex &&
                value === ":"
            );

          if (colonIndex === -1) {
            continue;
          }

          const home =
            cells[dateIndex + 2] || "";

          const homeScore =
            score(
              cells[colonIndex - 1]
            );

          const awayScore =
            score(
              cells[colonIndex + 1]
            );

          const away =
            cells[colonIndex + 2] || "";

          if (!home || !away) {
            continue;
          }

          if (
            home.toLowerCase() === "heim" ||
            away.toLowerCase() === "gast"
          ) {
            continue;
          }

          games.push({
            date,
            time,
            datetime:
              parseDateTime(
                date,
                time
              ),
            home,
            away,
            homeScore,
            awayScore,
          });
        }

        if (games.length > 0) {
          blocks.push({
            games,
          });
        }
      }

      return blocks;
    });

    console.log(
      `Gefundene Spielblöcke: ${blocks.length}`
    );

    const games = [];

    for (
      let blockIndex = 0;
      blockIndex < blocks.length;
      blockIndex++
    ) {
      const team =
        getBlockTeam(
          config,
          blockIndex
        );

      const block =
        blocks[blockIndex];

      console.log(
        `  Block ${blockIndex + 1}: ${
          team || "UNBEKANNT"
        } → ${block.games.length} Spiele`
      );

      for (const game of block.games) {
        games.push({
          ...game,
          team,
        });
      }
    }

    /*
     * Falls die Seite unerwartet mehr Blöcke liefert,
     * weisen wir sie nicht falsch zu.
     */
    if (
      config.teams.length > 1 &&
      blocks.length !== config.teams.length
    ) {
      console.log(
        `WARNUNG: Erwartet wurden ${config.teams.length} Blöcke, gefunden wurden ${blocks.length}.`
      );
    }

    console.log(
      `Gefundene Spiele: ${games.length}`
    );

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

async function scrapeTableResultsPage(
  browser,
  config
) {
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

    await page.waitForTimeout(7000);

    try {
      await page.waitForFunction(
        () => {
          const text =
            document.body?.innerText || "";

          return (
            text.includes("Spielergebnisse") ||
            text.includes("Tabelle") ||
            document.querySelectorAll("table").length >= 1
          );
        },
        { timeout: 30000 }
      );
    } catch {
      // Trotzdem auslesen.
    }

    await page.waitForTimeout(3000);

    /*
     * Wir lesen die Tabellen jetzt NICHT mehr anhand
     * einer geratenen Mannschaft aus.
     *
     * Stattdessen sammeln wir die Tabellen in der
     * Reihenfolge, in der sie auf der Seite erscheinen.
     *
     * Für U15/U13 gilt:
     *
     * Tabelle Block 1 = A
     * Ergebnis Block 1 = A
     * Tabelle Block 2 = B
     * Ergebnis Block 2 = B
     */
    const extracted = await page.evaluate(() => {
      function clean(value) {
        return String(value ?? "")
          .replace(/\s+/g, " ")
          .trim();
      }

      function score(value) {
        const m =
          clean(value).match(/\d+/);

        return m
          ? Number(m[0])
          : null;
      }

      function parseDateTime(
        dateText,
        timeText = ""
      ) {
        const m =
          clean(dateText).match(
            /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
          );

        if (!m) return null;

        const t =
          clean(timeText).match(
            /^(\d{1,2}):(\d{2})$/
          );

        const hour = t
          ? Number(t[1])
          : 0;

        const minute = t
          ? Number(t[2])
          : 0;

        const d = new Date(
          Number(m[3]),
          Number(m[2]) - 1,
          Number(m[1]),
          hour,
          minute
        );

        return Number.isNaN(
          d.getTime()
        )
          ? null
          : d.toISOString();
      }

      const tables = [
        ...document.querySelectorAll("table"),
      ];

      const tableBlocks = [];

      /*
       * Jede Tabelle wird zuerst klassifiziert:
       *
       * - results
       * - standings
       * - irrelevant
       */
      for (const table of tables) {
        const text =
          clean(table.innerText);

        const rows = [
          ...table.querySelectorAll("tr"),
        ];

        if (!rows.length) {
          continue;
        }

        /*
         * ========================================
         * SPIELERGEBNISSE
         * ========================================
         */

        const isResultsTable =
          text.includes("Datum") &&
          text.includes("Zeit") &&
          text.includes("Heim") &&
          text.includes("Gast");

        if (isResultsTable) {
          const results = [];

          for (const row of rows) {
            const cells = [
              ...row.querySelectorAll(
                "th, td"
              ),
            ]
              .map(cell =>
                clean(cell.innerText)
              )
              .filter(Boolean);

            if (cells.length < 5) {
              continue;
            }

            const dateIndex =
              cells.findIndex(value =>
                /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(
                  value
                )
              );

            if (dateIndex === -1) {
              continue;
            }

            const date =
              cells[dateIndex];

            const time =
              cells[dateIndex + 1] || "";

            const colonIndex =
              cells.findIndex(
                (value, index) =>
                  index > dateIndex &&
                  value === ":"
              );

            if (
              colonIndex === -1
            ) {
              continue;
            }

            const home =
              cells[dateIndex + 2] ||
              "";

            const homeScore =
              score(
                cells[
                  colonIndex - 1
                ]
              );

            const awayScore =
              score(
                cells[
                  colonIndex + 1
                ]
              );

            const away =
              cells[
                colonIndex + 2
              ] || "";

            if (!home || !away) {
              continue;
            }

            if (
              home.toLowerCase() ===
                "heim" ||
              away.toLowerCase() ===
                "gast"
            ) {
              continue;
            }

            /*
             * Nur echte Ergebnisse.
             *
             * Ein zukünftiges Spiel ohne Ergebnis
             * gehört nicht in results.json.
             */
            if (
              homeScore === null ||
              awayScore === null
            ) {
              continue;
            }

            results.push({
              date,
              time,
              datetime:
                parseDateTime(
                  date,
                  time
                ),
              home,
              away,
              homeScore,
              awayScore,
            });
          }

          if (results.length > 0) {
            tableBlocks.push({
              type: "results",
              items: results,
            });
          }

          continue;
        }

        /*
         * ========================================
         * TABELLE
         * ========================================
         */

        const isStandingsTable =
          text.includes("Team") &&
          text.includes("SP") &&
          text.includes("TD") &&
          text.includes("P");

        if (isStandingsTable) {
          const standings = [];

          for (const row of rows) {
            const cells = [
              ...row.querySelectorAll(
                "th, td"
              ),
            ]
              .map(cell =>
                clean(cell.innerText)
              )
              .filter(Boolean);

            if (cells.length < 4) {
              continue;
            }

            const rank =
              score(cells[0]);

            if (
              rank === null ||
              rank < 1 ||
              rank > 50
            ) {
              continue;
            }

            const teamName =
              cells[1];

            if (!teamName) {
              continue;
            }

            const sp =
              score(cells[2]);

            const td =
              cells[3];

            const points =
              score(cells[4]);

            if (sp === null) {
              continue;
            }

            standings.push({
              rank,
              teamName,
              games: sp,
              goalDifference: td,
              points:
                points !== null
                  ? points
                  : null,
            });
          }

          if (
            standings.length > 0
          ) {
            tableBlocks.push({
              type: "standings",
              items: standings,
            });
          }
        }
      }

      return {
        tableBlocks,
      };
    });

    console.log(
      `Gefundene Datenblöcke: ${extracted.tableBlocks.length}`
    );

    const results = [];
    const standings = [];

    /*
     * Jetzt kommt die wichtige Zuordnung.
     *
     * Bei einer Mannschaft:
     *   alle Blöcke gehören dieser Mannschaft.
     *
     * Bei U15/U13:
     *   Block 1 = A
     *   Block 2 = B
     *
     * Dabei behandeln wir Tabellen und Ergebnisse
     * gemeinsam nach ihrem Auftreten.
     */
    if (config.teams.length === 1) {
      const team =
        config.teams[0];

      for (const block of extracted.tableBlocks) {
        if (block.type === "results") {
          for (const result of block.items) {
            results.push({
              ...result,
              team,
            });
          }
        }

        if (
          block.type === "standings"
        ) {
          for (const row of block.items) {
            standings.push({
              rank: row.rank,
              team: team,
              teamName: row.teamName,
              games: row.games,
              goalDifference:
                row.goalDifference,
              points: row.points,
            });
          }
        }
      }
    } else {
      /*
       * U15 / U13:
       *
       * Wir zählen getrennt, wie viele
       * Tabellen- und Ergebnisblöcke wir
       * gesehen haben.
       */
      let standingsBlockIndex = 0;
      let resultsBlockIndex = 0;

      for (const block of extracted.tableBlocks) {
        if (block.type === "results") {
          const team =
            config.teams[
              resultsBlockIndex
            ] || null;

          console.log(
            `  Ergebnisblock ${
              resultsBlockIndex + 1
            } → ${
              team || "UNBEKANNT"
            }`
          );

          for (const result of block.items) {
            results.push({
              ...result,
              team,
            });
          }

          resultsBlockIndex++;
        }

        if (
          block.type === "standings"
        ) {
          const team =
            config.teams[
              standingsBlockIndex
            ] || null;

          console.log(
            `  Tabellenblock ${
              standingsBlockIndex + 1
            } → ${
              team || "UNBEKANNT"
            }`
          );

          for (const row of block.items) {
            standings.push({
              rank: row.rank,
              team,
              teamName: row.teamName,
              games: row.games,
              goalDifference:
                row.goalDifference,
              points: row.points,
            });
          }

          standingsBlockIndex++;
        }
      }

      if (
        resultsBlockIndex !==
        config.teams.length
      ) {
        console.log(
          `WARNUNG: ${resultsBlockIndex} Ergebnisblöcke gefunden, erwartet ${config.teams.length}.`
        );
      }

      if (
        standingsBlockIndex !==
        config.teams.length
      ) {
        console.log(
          `WARNUNG: ${standingsBlockIndex} Tabellenblöcke gefunden, erwartet ${config.teams.length}.`
        );
      }
    }

    console.log(
      `Gefundene Spielergebnisse: ${results.length}`
    );

    console.log(
      `Gefundene Tabellenplätze: ${standings.length}`
    );

    /*
     * Debug-Ausgabe, falls Daten fehlen.
     */
    if (
      results.length === 0 ||
      standings.length === 0
    ) {
      const bodyText =
        await page
          .locator("body")
          .innerText();

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

    return {
      results,
      standings,
    };
  } finally {
    await page.close();
  }
}

async function writeJsonIfValid(
  filename,
  data,
  minimumItems = 1
) {
  const count =
    Array.isArray(data)
      ? data.length
      : Array.isArray(data?.games)
        ? data.games.length
        : Array.isArray(data?.results)
          ? data.results.length
          : Array.isArray(
              data?.standings
            )
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
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
  );

  console.log(
    `Geschrieben: ${OUTPUT_DIR}/${filename}`
  );
}

async function main() {
  console.log("");
  console.log(
    "========================================"
  );
  console.log(
    "KÖLNER JUNGHÄIE – SPIELPLAN + ERGEBNISSE + TABELLE"
  );
  console.log(
    "========================================"
  );
  console.log("");

  await fs.mkdir(
    OUTPUT_DIR,
    {
      recursive: true,
    }
  );

  const browser =
    await chromium.launch({
      headless: true,
    });

  try {
    const allGames = [];
    const allResults = [];
    const allStandings = [];

    /*
     * ========================================
     * ALLE SEITEN DURCHLAUFEN
     * ========================================
     */

    for (const config of PAGES) {
      if (
        config.type ===
        "table-results"
      ) {
        const extracted =
          await scrapeTableResultsPage(
            browser,
            config
          );

        allResults.push(
          ...extracted.results
        );

        allStandings.push(
          ...extracted.standings
        );
      } else {
        const games =
          await scrapeSchedulePage(
            browser,
            config
          );

        allGames.push(
          ...games
        );
      }
    }

    /*
     * ========================================
     * SPIELPLAN
     * ========================================
     */

    let games =
      uniqueGames(allGames)
        .map(addLocation)
        .map(game => ({
          ...game,
          team:
            game.team || null,
        }));

    games =
      sortGames(games);

    console.log("");
    console.log(
      "========================================"
    );
    console.log(
      `Gesamt gefundene Spiele: ${games.length}`
    );
    console.log(
      "========================================"
    );

    /*
     * ========================================
     * ERGEBNISSE
     * ========================================
     */

    let results =
      uniqueGames(allResults)
        .map(addLocation)
        .map(result => ({
          ...result,
          team:
            result.team || null,
        }));

    results.sort((a, b) => {
      const da =
        a.datetime
          ? new Date(
              a.datetime
            ).getTime()
          : 0;

      const db =
        b.datetime
          ? new Date(
              b.datetime
            ).getTime()
          : 0;

      /*
       * Neueste Ergebnisse zuerst.
       */
      return db - da;
    });

    console.log(
      `Gesamt gefundene Ergebnisse: ${results.length}`
    );

    /*
     * ========================================
     * TABELLEN
     * ========================================
     */

    const standings =
      allStandings
        .filter(row => row.team)
        .sort((a, b) => {
          if (
            a.team !== b.team
          ) {
            return a.team.localeCompare(
              b.team,
              "de"
            );
          }

          return (
            Number(a.rank) -
            Number(b.rank)
          );
        });

    console.log(
      `Gesamt gefundene Tabellenplätze: ${standings.length}`
    );

    /*
     * ========================================
     * ZUSAMMENFASSUNG PRO MANNSCHAFT
     * ========================================
     */

    const allTeams = [
      "U20",
      "U17",
      "U15 A",
      "U15 B",
      "U13 A",
      "U13 B",
      "Frauen 1",
      "Frauen 2",
      "Frauen 3",
    ];

    console.log("");
    console.log(
      "========================================"
    );
    console.log(
      "DATEN PRO MANNSCHAFT"
    );
    console.log(
      "========================================"
    );

    for (const team of allTeams) {
      const gameCount =
        games.filter(
          game =>
            game.team === team
        ).length;

      const resultCount =
        results.filter(
          result =>
            result.team === team
        ).length;

      const standingsCount =
        standings.filter(
          row =>
            row.team === team
        ).length;

      console.log(
        `${team.padEnd(10)} Spiele: ${String(
          gameCount
        ).padStart(3)} | Ergebnisse: ${String(
          resultCount
        ).padStart(3)} | Tabelle: ${String(
          standingsCount
        ).padStart(3)}`
      );
    }

    /*
     * ========================================
     * GENERATED AT
     * ========================================
     */

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

    await writeJsonIfValid(
      "results.json",
      {
        generatedAt,
        source:
          "https://www.junghaie.de/",
        results,
      },
      1
    );

    /*
     * ========================================
     * standings.json
     * ========================================
     */

    await writeJsonIfValid(
      "standings.json",
      {
        generatedAt,
        source:
          "https://www.junghaie.de/",
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
    console.log(
      "========================================"
    );
    console.log(
      "SCRAPER ERFOLGREICH"
    );
    console.log(
      "========================================"
    );
    console.log(
      `Spiele:        ${games.length}`
    );
    console.log(
      `Ergebnisse:    ${results.length}`
    );
    console.log(
      `Tabelle:       ${standings.length} Teams/Plätze`
    );
    console.log(
      "========================================"
    );
    console.log("");
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error("");
  console.error(
    "SCRAPER FEHLER:"
  );
  console.error(error);
  process.exit(1);
});
