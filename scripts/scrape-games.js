import fs from "node:fs/promises";
import { chromium } from "playwright";

const OUTPUT_GAMES = "data/games.json";
const OUTPUT_RESULTS = "data/results.json";
const OUTPUT_STANDINGS = "data/standings.json";

const PAGES = [
  {
    url: "https://www.junghaie.de/spielplan.menuid23.html",
    teams: ["U20"],
    type: "schedule"
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid27.html",
    teams: ["U17"],
    type: "schedule"
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid31.html",
    teams: ["U15 A", "U15 B"],
    type: "schedule"
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid35.html",
    teams: ["U13 A", "U13 B"],
    type: "schedule"
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid51.html",
    teams: ["Frauen 1"],
    type: "schedule"
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid47.html",
    teams: ["Frauen 2"],
    type: "schedule"
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid55.html",
    teams: ["Frauen 3"],
    type: "schedule"
  },

  // U20 Tabelle + Spielergebnisse
  {
    url: "https://www.junghaie.de/tabelle-spielergebnisse.menuid24.html",
    teams: ["U20"],
    type: "table-results"
  }
];

function clean(value) {
  return String(value ?? "")
    .replace(/\+/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function score(value) {
  const valueClean = clean(value);

  if (!valueClean || valueClean === "-") {
    return null;
  }

  const number = Number(valueClean);

  return Number.isFinite(number) ? number : null;
}

function parseDateTime(date, time) {
  const d = clean(date);
  const t = clean(time);

  const match = d.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
  );

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;

  const datePart =
    `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

  if (!t) {
    return `${datePart}T00:00:00`;
  }

  const timeMatch = t.match(
    /^(\d{1,2}):(\d{2})$/
  );

  if (!timeMatch) {
    return `${datePart}T00:00:00`;
  }

  const [, hour, minute] = timeMatch;

  return `${datePart}T${hour.padStart(2, "0")}:${minute}:00`;
}

function getText(element) {
  if (!element) {
    return "";
  }

  return clean(
    element.getAttribute("value") ||
      element.textContent ||
      ""
  );
}

/* =========================================================
   SPIELPLAN
   ========================================================= */

function parseScheduleHtml(html, team) {
  const games = [];

  const parser = new DOMParser();

  const doc = parser.parseFromString(
    html,
    "text/html"
  );

  function get(selector, root) {
    const element = root.querySelector(selector);

    if (!element) {
      return "";
    }

    return clean(
      element.getAttribute("value") ||
        element.textContent ||
        ""
    );
  }

  /*
   * Hockeydata Schedule Rows
   */
  const rows = [
    ...doc.querySelectorAll(
      ".-hd-los-schedule-row"
    )
  ];

  for (const row of rows) {
    const date = get(
      ".-hd-los-schedule-scheduled-date",
      row
    );

    const time = get(
      ".-hd-los-schedule-scheduled-time",
      row
    );

    const home = get(
      ".-hd-los-schedule-home-team-name",
      row
    );

    const away = get(
      ".-hd-los-schedule-away-team-name",
      row
    );

    const homeScore = get(
      ".-hd-los-schedule-home-team-score",
      row
    );

    const awayScore = get(
      ".-hd-los-schedule-away-team-score",
      row
    );

    if (!date || !home || !away) {
      continue;
    }

    games.push({
      date,
      time: time || null,
      datetime: parseDateTime(date, time),
      home,
      away,
      homeScore: score(homeScore),
      awayScore: score(awayScore),
      team
    });
  }

  /*
   * Hockeydata nextgames Tabelle
   */
  const tables = [
    ...doc.querySelectorAll(
      "table.hockeydata_nextgames"
    )
  ];

  for (const table of tables) {
    const rows = [
      ...table.querySelectorAll("tr")
    ];

    for (const row of rows) {
      const cells = [
        ...row.querySelectorAll("td")
      ].map((cell) => clean(cell.innerText));

      if (cells.length < 6) {
        continue;
      }

      const date = cells[0];

      if (
        !/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(date)
      ) {
        continue;
      }

      const time = cells[1] || null;

      const home = cells[2] || "";

      const homeScore = score(
        cells[4] || ""
      );

      const awayScore = score(
        cells[6] || ""
      );

      const away = cells[9] || "";

      if (!home || !away) {
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
        team
      });
    }
  }

  return games;
}

/* =========================================================
   SPIELPLAN-SEITE SCRAPEN
   ========================================================= */

async function scrapeSchedulePage(browser, config) {
  console.log("");
  console.log("========================================");
  console.log(`Seite: ${config.url}`);
  console.log(`Teams: ${config.teams.join(", ")}`);
  console.log("Typ: Spielplan");
  console.log("========================================");

  const page = await browser.newPage({
    locale: "de-DE",
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) " +
      "AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
  });

  const responses = [];

  page.on("response", async (response) => {
    try {
      const url = response.url();

      if (
        url.includes("ajax-hockeydata-filter.php") ||
        url.includes("hockeydata")
      ) {
        const body = await response.text();

        if (body && body.length > 100) {
          responses.push({
            url,
            body
          });
        }
      }
    } catch {
      // Response konnte nicht gelesen werden.
    }
  });

  try {
    await page.goto(config.url, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    console.log("Warte auf Hockeydata...");

    await page.waitForTimeout(15000);
    await page.waitForTimeout(3000);

    const renderedHtml =
      await page.locator("body").innerHTML();

    const renderedGames =
      await page.evaluate(
        () => {
          function clean(value) {
            return String(value ?? "")
              .replace(/\+/g, " ")
              .replace(/\u00a0/g, " ")
              .replace(/\s+/g, " ")
              .trim();
          }

          function get(selector, root) {
            const element =
              root.querySelector(selector);

            if (!element) {
              return "";
            }

            return clean(
              element.getAttribute("value") ||
                element.textContent ||
                ""
            );
          }

          const result = [];

          const rows = [
            ...document.querySelectorAll(
              ".-hd-los-schedule-row"
            )
          ];

          for (const row of rows) {
            const date = get(
              ".-hd-los-schedule-scheduled-date",
              row
            );

            const time = get(
              ".-hd-los-schedule-scheduled-time",
              row
            );

            const home = get(
              ".-hd-los-schedule-home-team-name",
              row
            );

            const away = get(
              ".-hd-los-schedule-away-team-name",
              row
            );

            if (!date || !home || !away) {
              continue;
            }

            result.push({
              date,
              time: time || null,
              home,
              away,
              homeScore: get(
                ".-hd-los-schedule-home-team-score",
                row
              ),
              awayScore: get(
                ".-hd-los-schedule-away-team-score",
                row
              )
            });
          }

          const tables = [
            ...document.querySelectorAll(
              "table.hockeydata_nextgames"
            )
          ];

          for (const table of tables) {
            const rows = [
              ...table.querySelectorAll("tr")
            ];

            for (const row of rows) {
              const cells = [
                ...row.querySelectorAll("td")
              ].map((cell) =>
                clean(cell.innerText)
              );

              if (cells.length < 6) {
                continue;
              }

              const date = cells[0];

              if (
                !/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(
                  date
                )
              ) {
                continue;
              }

              result.push({
                date,
                time: cells[1] || null,
                home: cells[2] || "",
                homeScore: cells[4] || "",
                awayScore: cells[6] || "",
                away: cells[9] || ""
              });
            }
          }

          return result;
        }
      );

    const result = [];

    /*
     * Gerenderte Spiele
     */
    for (const game of renderedGames) {
      if (!game.home || !game.away) {
        continue;
      }

      const team =
        config.teams.length === 1
          ? config.teams[0]
          : findTeamForGame(
              game,
              config.teams
            );

      result.push({
        date: game.date,
        time: game.time,
        datetime: parseDateTime(
          game.date,
          game.time
        ),
        home: game.home,
        away: game.away,
        homeScore: score(
          game.homeScore
        ),
        awayScore: score(
          game.awayScore
        ),
        team
      });
    }

    /*
     * AJAX Responses
     */
    for (const response of responses) {
      const responseGames =
        await page.evaluate(
          (html) => {
            const parser =
              new DOMParser();

            const doc =
              parser.parseFromString(
                html,
                "text/html"
              );

            const games = [];

            function clean(value) {
              return String(value ?? "")
                .replace(/\+/g, " ")
                .replace(/\u00a0/g, " ")
                .replace(/\s+/g, " ")
                .trim();
            }

            function get(selector, root) {
              const element =
                root.querySelector(selector);

              if (!element) {
                return "";
              }

              return clean(
                element.getAttribute("value") ||
                  element.textContent ||
                  ""
              );
            }

            const rows = [
              ...doc.querySelectorAll(
                ".-hd-los-schedule-row"
              )
            ];

            for (const row of rows) {
              const date = get(
                ".-hd-los-schedule-scheduled-date",
                row
              );

              const time = get(
                ".-hd-los-schedule-scheduled-time",
                row
              );

              const home = get(
                ".-hd-los-schedule-home-team-name",
                row
              );

              const away = get(
                ".-hd-los-schedule-away-team-name",
                row
              );

              if (!date || !home || !away) {
                continue;
              }

              games.push({
                date,
                time: time || null,
                home,
                away,
                homeScore: get(
                  ".-hd-los-schedule-home-team-score",
                  row
                ),
                awayScore: get(
                  ".-hd-los-schedule-away-team-score",
                  row
                )
              });
            }

            const tables = [
              ...doc.querySelectorAll(
                "table.hockeydata_nextgames"
              )
            ];

            for (const table of tables) {
              const rows = [
                ...table.querySelectorAll("tr")
              ];

              for (const row of rows) {
                const cells = [
                  ...row.querySelectorAll("td")
                ].map((cell) =>
                  clean(cell.innerText)
                );

                if (cells.length < 6) {
                  continue;
                }

                const date = cells[0];

                if (
                  !/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(
                    date
                  )
                ) {
                  continue;
                }

                games.push({
                  date,
                  time: cells[1] || null,
                  home: cells[2] || "",
                  homeScore: cells[4] || "",
                  awayScore: cells[6] || "",
                  away: cells[9] || ""
                });
              }
            }

            return games;
          },
          response.body
        );

      for (const game of responseGames) {
        if (!game.home || !game.away) {
          continue;
        }

        const team =
          config.teams.length === 1
            ? config.teams[0]
            : findTeamForGame(
                game,
                config.teams
              );

        result.push({
          date: game.date,
          time: game.time,
          datetime: parseDateTime(
            game.date,
            game.time
          ),
          home: game.home,
          away: game.away,
          homeScore: score(
            game.homeScore
          ),
          awayScore: score(
            game.awayScore
          ),
          team
        });
      }
    }

    /*
     * Duplikate entfernen
     */
    const unique = new Map();

    for (const game of result) {
      const key = [
        game.date,
        game.time,
        game.home,
        game.away
      ]
        .map(clean)
        .join("|");

      if (!unique.has(key)) {
        unique.set(key, game);
      }
    }

    const games = [
      ...unique.values()
    ];

    console.log(
      `Gefundene Spiele: ${games.length}`
    );

    return games;
  } finally {
    await page.close();
  }
}

/* =========================================================
   TEAM ZUORDNUNG
   ========================================================= */

function findTeamForGame(game, teams) {
  const text =
    `${game.home} ${game.away}`.toLowerCase();

  if (
    teams.includes("U15 A") &&
    /u15.*a/i.test(text)
  ) {
    return "U15 A";
  }

  if (
    teams.includes("U15 B") &&
    /u15.*b/i.test(text)
  ) {
    return "U15 B";
  }

  if (
    teams.includes("U13 A") &&
    /u13.*a/i.test(text)
  ) {
    return "U13 A";
  }

  if (
    teams.includes("U13 B") &&
    /u13.*b/i.test(text)
  ) {
    return "U13 B";
  }

  /*
   * Fallback.
   */
  return teams[0];
}

/* =========================================================
   TABELLE + ERGEBNISSE
   ========================================================= */

async function scrapeTableResultsPage(browser, config) {
  console.log("");
  console.log("========================================");
  console.log(`Seite: ${config.url}`);
  console.log(`Teams: ${config.teams.join(", ")}`);
  console.log("Typ: Tabelle + Spielergebnisse");
  console.log("========================================");

  const page = await browser.newPage({
    locale: "de-DE",
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) " +
      "AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
  });

  try {
    await page.goto(config.url, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    console.log(
      "Warte auf gerenderte Tabelle und Ergebnisse..."
    );

    /*
     * Die Daten werden nach dem Laden gerendert.
     */
    await page.waitForTimeout(15000);
    await page.waitForTimeout(3000);

    const data = await page.evaluate(
      () => {
        function clean(value) {
          return String(value ?? "")
            .replace(/\+/g, " ")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }

        function number(value) {
          const n = Number(
            clean(value)
              .replace("+", "")
          );

          return Number.isFinite(n)
            ? n
            : null;
        }

        const standings = [];
        const results = [];

        /*
         * ============================================
         * TABELLE
         * ============================================
         */

        /*
         * Wir suchen Tabellen anhand ihres sichtbaren
         * Inhalts und ihrer Spalten.
         */
        const allTables = [
          ...document.querySelectorAll("table")
        ];

        for (const table of allTables) {
          const rows = [
            ...table.querySelectorAll("tr")
          ];

          if (rows.length < 2) {
            continue;
          }

          const tableText =
            clean(table.innerText);

          /*
           * Tabelle erkennen:
           * Team + SP + TD + P
           */
          if (
            !/\bTeam\b/i.test(tableText) ||
            !/\bSP\b/i.test(tableText) ||
            !/\bTD\b/i.test(tableText) ||
            !/\bP\b/i.test(tableText)
          ) {
            continue;
          }

          for (const row of rows) {
            const cells = [
              ...row.querySelectorAll("th, td")
            ].map((cell) =>
              clean(cell.innerText)
            );

            if (cells.length < 4) {
              continue;
            }

            /*
             * Beispiel:
             * 1 | Eisbären Juniors Berlin | 5 | +7 | 10
             */
            let position = null;
            let team = "";
            let games = null;
            let goalDifference = null;
            let points = null;

            if (/^\d+$/.test(cells[0])) {
              position = Number(cells[0]);
              team = cells[1] || "";
              games = number(cells[2]);
              goalDifference = number(cells[3]);
              points = number(cells[4]);
            } else {
              /*
               * Fallback, falls keine Platz-Spalte
               * vorhanden ist.
               */
              team = cells[0] || "";
              games = number(cells[1]);
              goalDifference = number(cells[2]);
              points = number(cells[3]);
            }

            if (!team) {
              continue;
            }

            if (
              team.toLowerCase() === "team"
            ) {
              continue;
            }

            standings.push({
              position,
              team,
              games,
              goalDifference,
              points
            });
          }
        }

        /*
         * ============================================
         * SPIELERGEBNISSE
         * ============================================
         */

        for (const table of allTables) {
          const rows = [
            ...table.querySelectorAll("tr")
          ];

          if (rows.length < 2) {
            continue;
          }

          const tableText =
            clean(table.innerText);

          /*
           * Ergebnis-Tabelle erkennen.
           */
          if (
            !/\bDatum\b/i.test(tableText) ||
            !/\bZeit\b/i.test(tableText) ||
            !/\bHeim\b/i.test(tableText) ||
            !/\bGast\b/i.test(tableText)
          ) {
            continue;
          }

          for (const row of rows) {
            const cells = [
              ...row.querySelectorAll("th, td")
            ].map((cell) =>
              clean(cell.innerText)
            );

            if (cells.length < 5) {
              continue;
            }

            const dateIndex =
              cells.findIndex((value) =>
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
              cells[dateIndex + 1] || null;

            /*
             * Bei Hockeydata ist der Aufbau:
             *
             * Datum
             * Zeit
             * Heim
             * leer
             * Heimscore
             * :
             * Auswärtsscore
             * leer
             * Gast
             */

            const home =
              cells[dateIndex + 2] || "";

            let homeScore = null;
            let awayScore = null;
            let away = "";

            /*
             * Suche nach ":" und Scores.
             */
            const colonIndex =
              cells.findIndex(
                (value, index) =>
                  index > dateIndex &&
                  value === ":"
              );

            if (
              colonIndex > dateIndex
            ) {
              homeScore =
                number(
                  cells[colonIndex - 1]
                );

              awayScore =
                number(
                  cells[colonIndex + 1]
                );

              /*
               * Gast steht normalerweise
               * zwei Felder nach dem Auswärtsscore.
               */
              for (
                let i = colonIndex + 2;
                i < cells.length;
                i++
              ) {
                if (
                  cells[i] &&
                  !/^\d+$/.test(cells[i]) &&
                  cells[i] !== ":"
                ) {
                  away = cells[i];
                  break;
                }
              }
            }

            /*
             * Falls die Struktur anders ist,
             * verwenden wir die letzten sinnvollen
             * Textwerte.
             */
            if (!away) {
              const possibleTeams =
                cells.filter((value, index) => {
                  if (index <= dateIndex + 1) {
                    return false;
                  }

                  if (!value) {
                    return false;
                  }

                  if (
                    value === ":"
                  ) {
                    return false;
                  }

                  if (
                    /^\d+$/.test(value)
                  ) {
                    return false;
                  }

                  return true;
                });

              if (
                possibleTeams.length >= 2
              ) {
                /*
                 * Erster sinnvoller Wert = Heim
                 * letzter sinnvoller Wert = Gast
                 */
                if (!home) {
                  home =
                    possibleTeams[0];
                }

                away =
                  possibleTeams[
                    possibleTeams.length - 1
                  ];
              }
            }

            if (
              !date ||
              !home ||
              !away
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
              awayScore
            });
          }
        }

        return {
          standings,
          results
        };
      }
    );

    /*
     * U20 hinzufügen
     */
    const standings =
      data.standings.map((entry) => ({
        ...entry,
        team: "U20"
      }));

    const results =
      data.results.map((game) => ({
        ...game,
        team: "U20"
      }));

    console.log(
      `Gefundene Tabellenplätze: ${standings.length}`
    );

    console.log(
      `Gefundene Spielergebnisse: ${results.length}`
    );

    return {
      standings,
      results
    };
  } finally {
    await page.close();
  }
}

/* =========================================================
   JSON SPEICHERN
   ========================================================= */

async function writeJsonIfValid(
  filename,
  data,
  label
) {
  if (!Array.isArray(data) || data.length === 0) {
    console.log(
      `WARNUNG: ${label} leer – ${filename} wird NICHT überschrieben.`
    );

    return;
  }

  await fs.writeFile(
    filename,
    JSON.stringify(
      {
        generatedAt:
          new Date().toISOString(),
        source:
          "https://www.junghaie.de/",
        [label]: data
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(
    `Gespeichert: ${filename}`
  );
}

/* =========================================================
   MAIN
   ========================================================= */

async function main() {
  console.log(
    "========================================"
  );

  console.log(
    "KÖLNER JUNGHÄIE – SPIELPLAN + ERGEBNISSE + TABELLE"
  );

  console.log(
    "========================================"
  );

  const browser =
    await chromium.launch({
      headless: true
    });

  const allGames = [];
  let allResults = [];
  let allStandings = [];

  try {
    for (const config of PAGES) {
      if (
        config.type === "schedule"
      ) {
        const games =
          await scrapeSchedulePage(
            browser,
            config
          );

        allGames.push(...games);
      }

      if (
        config.type === "table-results"
      ) {
        const data =
          await scrapeTableResultsPage(
            browser,
            config
          );

        allResults.push(
          ...data.results
        );

        allStandings.push(
          ...data.standings
        );
      }
    }
  } finally {
    await browser.close();
  }

  /*
   * ============================================
   * SPIELE DUPLIKATE ENTFERNEN
   * ============================================
   */

  const uniqueGames = new Map();

  for (const game of allGames) {
    const key = [
      game.date,
      game.time,
      game.home,
      game.away,
      game.team
    ]
      .map(clean)
      .join("|");

    if (!uniqueGames.has(key)) {
      uniqueGames.set(
        key,
        game
      );
    }
  }

  const games = [
    ...uniqueGames.values()
  ];

  /*
   * Chronologisch sortieren
   */
  games.sort((a, b) =>
    String(a.datetime)
      .localeCompare(
        String(b.datetime)
      )
  );

  /*
   * ============================================
   * ERGEBNISSE DUPLIKATE
   * ============================================
   */

  const uniqueResults =
    new Map();

  for (const result of allResults) {
    const key = [
      result.date,
      result.time,
      result.home,
      result.away,
      result.team
    ]
      .map(clean)
      .join("|");

    if (
      !uniqueResults.has(key)
    ) {
      uniqueResults.set(
        key,
        result
      );
    }
  }

  const results = [
    ...uniqueResults.values()
  ];

  results.sort((a, b) =>
    String(b.datetime)
      .localeCompare(
        String(a.datetime)
      )
  );

  /*
   * ============================================
   * TABELLE DUPLIKATE
   * ============================================
   */

  const uniqueStandings =
    new Map();

  for (const entry of allStandings) {
    const key = [
      entry.team,
      entry.position,
      entry.points
    ]
      .map(clean)
      .join("|");

    if (
      !uniqueStandings.has(key)
    ) {
      uniqueStandings.set(
        key,
        entry
      );
    }
  }

  const standings = [
    ...uniqueStandings.values()
  ];

  standings.sort(
    (a, b) =>
      (a.position ?? 999) -
      (b.position ?? 999)
  );

  /*
   * ============================================
   * AUSGABE
   * ============================================
   */

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    `GESAMT: ${games.length} Spiele`
  );

  console.log(
    `ERGEBNISSE: ${results.length}`
  );

  console.log(
    `TABELLE: ${standings.length} Mannschaften`
  );

  console.log(
    "========================================"
  );

  /*
   * Spielplan ist weiterhin Pflicht.
   */
  if (games.length === 0) {
    throw new Error(
      "Es wurden überhaupt keine Spiele gefunden. games.json wird NICHT überschrieben."
    );
  }

  await fs.mkdir(
    "data",
    {
      recursive: true
    }
  );

  /*
   * games.json
   */
  await fs.writeFile(
    OUTPUT_GAMES,
    JSON.stringify(
      {
        generatedAt:
          new Date().toISOString(),
        source:
          "https://www.junghaie.de/",
        games
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  console.log(
    `Gespeichert: ${OUTPUT_GAMES}`
  );

  /*
   * results.json
   */
  await writeJsonIfValid(
    OUTPUT_RESULTS,
    results,
    "results"
  );

  /*
   * standings.json
   */
  await writeJsonIfValid(
    OUTPUT_STANDINGS,
    standings,
    "standings"
  );

  console.log("");
  console.log(
    "Scraper erfolgreich abgeschlossen."
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "SCRAPER FEHLER:"
  );
  console.error(error);

  process.exit(1);
});
