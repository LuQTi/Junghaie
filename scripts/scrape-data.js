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
  const location = findJunghaieTeam(
    game.home,
    game.away
  );

  return {
    ...game,
    location,
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
 * Erkennt anhand des Textes, zu welcher Mannschaft
 * eine Tabelle bzw. Ergebnis-Tabelle gehört.
 */
function normalizeTeamName(value) {
  const text = clean(value).toLowerCase();

  if (
    text.includes("u20") ||
    text.includes("dnl")
  ) {
    return "U20";
  }

  if (text.includes("u17")) {
    return "U17";
  }

  if (
    text.includes("u15b") ||
    text.includes("u15 b") ||
    text.includes("u15 regionalliga b")
  ) {
    return "U15 B";
  }

  if (
    text.includes("u15a") ||
    text.includes("u15 a") ||
    text.includes("u15 regionalliga a")
  ) {
    return "U15 A";
  }

  if (
    text.includes("u13b") ||
    text.includes("u13 b") ||
    text.includes("u13 regionalliga b")
  ) {
    return "U13 B";
  }

  if (
    text.includes("u13a") ||
    text.includes("u13 a") ||
    text.includes("u13 regionalliga a")
  ) {
    return "U13 A";
  }

  if (
    text.includes("2. liga nord") ||
    text.includes("frauen 1a") ||
    text.includes("frauen 1")
  ) {
    return "Frauen 1";
  }

  if (
    text.includes("landesliga") ||
    text.includes("frauen 1b") ||
    text.includes("frauen 2")
  ) {
    return "Frauen 2";
  }

  if (
    text.includes("bezirksliga") ||
    text.includes("frauen 1c") ||
    text.includes("frauen 3")
  ) {
    return "Frauen 3";
  }

  return null;
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
            (v, i) =>
              i > dateIndex &&
              v === ":"
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
      }

      return games;
    });

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

      function parseDateTime(
        dateText,
        timeText = ""
      ) {
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

      function detectTeam(text) {
        const value = clean(text).toLowerCase();

        if (
          value.includes("u15b") ||
          value.includes("u15 b") ||
          value.includes("regionalliga b")
        ) {
          return "U15 B";
        }

        if (
          value.includes("u15a") ||
          value.includes("u15 a") ||
          value.includes("regionalliga a")
        ) {
          return "U15 A";
        }

        if (
          value.includes("u13b") ||
          value.includes("u13 b")
        ) {
          return "U13 B";
        }

        if (
          value.includes("u13a") ||
          value.includes("u13 a")
        ) {
          return "U13 A";
        }

        if (value.includes("u20")) {
          return "U20";
        }

        if (value.includes("dnl")) {
          return "U20";
        }

        if (value.includes("u17")) {
          return "U17";
        }

        if (
          value.includes("2. liga nord")
        ) {
          return "Frauen 1";
        }

        if (
          value.includes("landesliga")
        ) {
          return "Frauen 2";
        }

        if (
          value.includes("bezirksliga")
        ) {
          return "Frauen 3";
        }

        if (value.includes("frauen 1b")) {
          return "Frauen 2";
        }

        if (value.includes("frauen 1c")) {
          return "Frauen 3";
        }

        if (value.includes("frauen 1a")) {
          return "Frauen 1";
        }

        return null;
      }

      /*
       * Sucht die Überschrift bzw. den Bereich,
       * zu dem eine Hockeydata-Tabelle gehört.
       */
      function getTableContext(table) {
        const texts = [];

        let current = table;

        for (let i = 0; i < 8 && current; i++) {
          if (current.previousElementSibling) {
            const text = clean(
              current.previousElementSibling.innerText
            );

            if (text) {
              texts.push(text);
            }
          }

          current = current.parentElement;
        }

        /*
         * Zusätzlich nach Überschriften im Dokument
         * suchen, die unmittelbar vor der Tabelle liegen.
         */
        let previous = table.previousElementSibling;

        for (
          let i = 0;
          i < 10 && previous;
          i++
        ) {
          const text = clean(
            previous.innerText
          );

          if (text) {
            texts.push(text);
          }

          previous =
            previous.previousElementSibling;
        }

        return texts.join(" ");
      }

      const tables = [
        ...document.querySelectorAll("table"),
      ];

      const results = [];
      const standings = [];

      /*
       * Falls eine Seite mehrere Bereiche besitzt,
       * z.B. U15 A + U15 B oder U13 A + U13 B,
       * behalten wir die Reihenfolge der Tabellen.
       */
      let detectedSectionTeams = [];

      for (const table of tables) {
        const text = clean(table.innerText);

        const context =
          getTableContext(table);

        const fullContext =
          `${context} ${text}`;

        const detectedTeam =
          detectTeam(fullContext);

        if (
          detectedTeam &&
          !detectedSectionTeams.includes(
            detectedTeam
          )
        ) {
          detectedSectionTeams.push(
            detectedTeam
          );
        }

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
              ...row.querySelectorAll(
                "th, td"
              ),
            ]
              .map(cell =>
                clean(cell.innerText)
              )
              .filter(Boolean);

            if (cells.length < 5) continue;

            const dateIndex =
              cells.findIndex(v =>
                /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(
                  v
                )
              );

            if (dateIndex === -1) continue;

            const date =
              cells[dateIndex];

            const time =
              cells[dateIndex + 1] || "";

            const colonIndex =
              cells.findIndex(
                (v, i) =>
                  i > dateIndex &&
                  v === ":"
              );

            if (colonIndex === -1) continue;

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

            if (!home || !away) continue;

            if (
              home.toLowerCase() ===
                "heim" ||
              away.toLowerCase() ===
                "gast"
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
              detectedTeam,
            });
          }

          continue;
        }

        /*
         * ========================================
         * TABELLE
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
              ...row.querySelectorAll(
                "th, td"
              ),
            ]
              .map(cell =>
                clean(cell.innerText)
              )
              .filter(Boolean);

            if (cells.length < 4) continue;

            const rank =
              score(cells[0]);

            if (
              rank === null ||
              rank < 1 ||
              rank > 50
            ) {
              continue;
            }

            const team =
              cells[1];

            if (!team) continue;

            const sp =
              score(cells[2]);

            const td =
              cells[3];

            const points =
              score(cells[4]);

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
              detectedTeam,
            });
          }
        }
      }

      /*
       * Wenn bei U15/U13 keine Überschrift direkt
       * an der Tabelle gefunden wurde, kann die
       * Reihenfolge der erkannten Bereiche helfen.
       */
      function assignFallbackTeams(items) {
        const knownTeams =
          detectedSectionTeams;

        if (
          knownTeams.length === 0
        ) {
          return items;
        }

        return items.map(item => {
          if (item.detectedTeam) {
            return item;
          }

          /*
           * Ohne sicheren Kontext lassen wir
           * detectedTeam bewusst leer.
           */
          return item;
        });
      }

      return {
        results:
          assignFallbackTeams(results),
        standings:
          assignFallbackTeams(standings),
        detectedSectionTeams,
      };
    });

    console.log(
      `Gefundene Spielergebnisse: ${extracted.results.length}`
    );

    console.log(
      `Gefundene Tabellenplätze: ${extracted.standings.length}`
    );

    console.log(
      `Erkannte Bereiche: ${
        extracted.detectedSectionTeams.join(
          ", "
        ) || "keine"
      }`
    );

    /*
     * Debug-Ausgabe, falls Daten fehlen.
     */
    if (
      extracted.results.length === 0 ||
      extracted.standings.length === 0
    ) {
      const bodyText =
        await page.locator("body").innerText();

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

function assignConfiguredTeam(
  item,
  config
) {
  /*
   * Wenn die Seite nur eine Mannschaft enthält,
   * ist die Zuordnung eindeutig.
   */
  if (config.teams.length === 1) {
    return config.teams[0];
  }

  /*
   * Bei U15/U13 kommt die Zuordnung möglichst
   * aus dem erkannten Tabellenbereich.
   */
  if (
    item.detectedTeam &&
    config.teams.includes(
      item.detectedTeam
    )
  ) {
    return item.detectedTeam;
  }

  /*
   * Zusätzlich versuchen wir, anhand der
   * Mannschaftsnamen zu erkennen.
   */
  const combined =
    `${item.home || ""} ${item.away || ""} ${
      item.team || ""
    }`.toLowerCase();

  if (
    config.teams.includes("U15 B") &&
    (
      combined.includes("u15 b") ||
      combined.includes("u15b")
    )
  ) {
    return "U15 B";
  }

  if (
    config.teams.includes("U15 A") &&
    (
      combined.includes("u15 a") ||
      combined.includes("u15a")
    )
  ) {
    return "U15 A";
  }

  if (
    config.teams.includes("U13 B") &&
    (
      combined.includes("u13 b") ||
      combined.includes("u13b")
    )
  ) {
    return "U13 B";
  }

  if (
    config.teams.includes("U13 A") &&
    (
      combined.includes("u13 a") ||
      combined.includes("u13a")
    )
  ) {
    return "U13 A";
  }

  return null;
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

        /*
         * Ergebnisse
         */
        for (const result of
          extracted.results) {
          const team =
            assignConfiguredTeam(
              result,
              config
            );

          allResults.push({
            ...result,
            team,
          });
        }

        /*
         * Tabellen
         */
        for (const row of
          extracted.standings) {
          const team =
            assignConfiguredTeam(
              row,
              config
            );

          allStandings.push({
            ...row,
            team,
          });
        }
      } else {
        const games =
          await scrapeSchedulePage(
            browser,
            config
          );

        for (const game of games) {
          const team =
            assignConfiguredTeam(
              game,
              config
            );

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
