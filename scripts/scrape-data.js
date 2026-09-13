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
 * ============================================================
 * HILFSFUNKTION:
 * Mannschaft aus Überschrift erkennen
 *
 * Beispiele:
 *   Spielplan Junghaie U15a → U15 A
 *   Spielplan Junghaie U15b → U15 B
 *   Spielplan Junghaie U13a → U13 A
 *   Spielplan Junghaie U13b → U13 B
 *
 * Dadurch ist die Zuordnung unabhängig davon,
 * ob eine Mannschaft gerade Spiele/Ergebnisse hat.
 * ============================================================
 */

function getTeamFromHeadingText(text, configuredTeams) {
  const value = clean(text).toLowerCase();

  if (
    configuredTeams.includes("U15 A") &&
    (
      value.includes("u15a") ||
      value.includes("u15 a")
    )
  ) {
    return "U15 A";
  }

  if (
    configuredTeams.includes("U15 B") &&
    (
      value.includes("u15b") ||
      value.includes("u15 b")
    )
  ) {
    return "U15 B";
  }

  if (
    configuredTeams.includes("U13 A") &&
    (
      value.includes("u13a") ||
      value.includes("u13 a")
    )
  ) {
    return "U13 A";
  }

  if (
    configuredTeams.includes("U13 B") &&
    (
      value.includes("u13b") ||
      value.includes("u13 b")
    )
  ) {
    return "U13 B";
  }

  return null;
}

/*
 * ============================================================
 * SPIELPLAN
 *
 * WICHTIG:
 *
 * Bei U15/U13 werden die Spiele nicht mehr nach
 * Block 0 / Block 1 zugeordnet.
 *
 * Stattdessen wird die letzte passende Überschrift
 * vor der jeweiligen Tabelle gesucht.
 *
 * Beispiel:
 *
 *   Spielplan U15a
 *   [Tabelle - keine Spiele]
 *
 *   Spielplan U15b
 *   [Tabelle - Spiele]
 *
 * Das Spiel wird dadurch korrekt U15 B zugeordnet.
 * ============================================================
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

    const blocks = await page.evaluate(
      (configuredTeams) => {
        function clean(value) {
          return String(value ?? "")
            .replace(/\s+/g, " ")
            .trim();
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

        function score(value) {
          const m =
            clean(value).match(/\d+/);

          return m
            ? Number(m[0])
            : null;
        }

        function getTeamFromHeading(
          text
        ) {
          const value =
            clean(text).toLowerCase();

          if (
            configuredTeams.includes(
              "U15 A"
            ) &&
            (
              value.includes("u15a") ||
              value.includes("u15 a")
            )
          ) {
            return "U15 A";
          }

          if (
            configuredTeams.includes(
              "U15 B"
            ) &&
            (
              value.includes("u15b") ||
              value.includes("u15 b")
            )
          ) {
            return "U15 B";
          }

          if (
            configuredTeams.includes(
              "U13 A"
            ) &&
            (
              value.includes("u13a") ||
              value.includes("u13 a")
            )
          ) {
            return "U13 A";
          }

          if (
            configuredTeams.includes(
              "U13 B"
            ) &&
            (
              value.includes("u13b") ||
              value.includes("u13 b")
            )
          ) {
            return "U13 B";
          }

          return null;
        }

        const headingElements = [
          ...document.querySelectorAll(
            "h1, h2, h3, h4, h5, h6"
          ),
        ];

        const headings = headingElements
          .map(element => ({
            element,
            text: clean(
              element.innerText
            ),
            team:
              getTeamFromHeading(
                element.innerText
              ),
          }))
          .filter(
            heading =>
              heading.team
          );

        const tables = [
          ...document.querySelectorAll(
            "table"
          ),
        ];

        const blocks = [];

        for (const table of tables) {
          const rows = [
            ...table.querySelectorAll("tr"),
          ];

          const games = [];

          for (const row of rows) {
            const cells = [
              ...row.querySelectorAll(
                "th, td"
              ),
            ]
              .map(cell =>
                clean(
                  cell.innerText
                )
              )
              .filter(Boolean);

            if (cells.length < 5) {
              continue;
            }

            const dateIndex =
              cells.findIndex(
                value =>
                  /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(
                    value
                  )
              );

            if (
              dateIndex === -1
            ) {
              continue;
            }

            const date =
              cells[dateIndex];

            const time =
              cells[
                dateIndex + 1
              ] || "";

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
              cells[
                dateIndex + 2
              ] || "";

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

          if (
            games.length === 0
          ) {
            continue;
          }

          /*
           * Letzte passende Überschrift vor
           * dieser Tabelle suchen.
           */
          let currentTeam =
            configuredTeams.length === 1
              ? configuredTeams[0]
              : null;

          for (
            const heading of headings
          ) {
            const position =
              heading.element.compareDocumentPosition(
                table
              );

            if (
              position &
              Node.DOCUMENT_POSITION_FOLLOWING
            ) {
              currentTeam =
                heading.team;
            }
          }

          blocks.push({
            team: currentTeam,
            games,
          });
        }

        return blocks;
      },
      config.teams
    );

    console.log(
      `Gefundene Spielblöcke: ${blocks.length}`
    );

    const games = [];

    for (
      let blockIndex = 0;
      blockIndex < blocks.length;
      blockIndex++
    ) {
      const block =
        blocks[blockIndex];

      const team =
        block.team || null;

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

    if (
      config.teams.length > 1
    ) {
      const foundTeams =
        [
          ...new Set(
            blocks
              .map(block =>
                block.team
              )
              .filter(Boolean)
          ),
        ];

      for (const team of config.teams) {
        if (
          !foundTeams.includes(team)
        ) {
          console.log(
            `INFO: Für ${team} wurden auf dieser Seite keine Spiele gefunden.`
          );
        }
      }
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

/*
 * ============================================================
 * TABELLE + SPIELERGEBNISSE
 *
 * Auch hier wird NICHT mehr:
 *
 *   Ergebnisblock 1 = A
 *   Ergebnisblock 2 = B
 *
 * angenommen.
 *
 * Stattdessen wird für jeden Datenblock die letzte
 * passende Mannschafts-Überschrift davor gesucht.
 *
 * Damit funktioniert z.B.:
 *
 *   Tabelle U15 A
 *   Ergebnisse U15 A
 *
 *   Tabelle U15 B
 *   Ergebnisse U15 B
 *
 * aber auch:
 *
 *   Tabelle U15 A
 *   keine Ergebnisse
 *
 *   Tabelle U15 B
 *   Ergebnisse U15 B
 *
 * Der vorhandene Tabellenblock von A sorgt nicht
 * dafür, dass B-Ergebnisse fälschlich A zugeordnet
 * werden.
 * ============================================================
 */

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
            text.includes(
              "Spielergebnisse"
            ) ||
            text.includes("Tabelle") ||
            document.querySelectorAll(
              "table"
            ).length >= 1
          );
        },
        { timeout: 30000 }
      );
    } catch {
      // Trotzdem auslesen.
    }

    await page.waitForTimeout(3000);

    const extracted =
      await page.evaluate(
        (configuredTeams) => {
          function clean(value) {
            return String(value ?? "")
              .replace(/\s+/g, " ")
              .trim();
          }

          function score(value) {
            const m =
              clean(value).match(
                /\d+/
              );

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

          function getTeamFromText(
            text
          ) {
            const value =
              clean(text).toLowerCase();

            if (
              configuredTeams.includes(
                "U15 A"
              ) &&
              (
                value.includes("u15a") ||
                value.includes("u15 a")
              )
            ) {
              return "U15 A";
            }

            if (
              configuredTeams.includes(
                "U15 B"
              ) &&
              (
                value.includes("u15b") ||
                value.includes("u15 b")
              )
            ) {
              return "U15 B";
            }

            if (
              configuredTeams.includes(
                "U13 A"
              ) &&
              (
                value.includes("u13a") ||
                value.includes("u13 a")
              )
            ) {
              return "U13 A";
            }

            if (
              configuredTeams.includes(
                "U13 B"
              ) &&
              (
                value.includes("u13b") ||
                value.includes("u13 b")
              )
            ) {
              return "U13 B";
            }

            return null;
          }

          /*
           * Alle Überschriften sammeln.
           *
           * Wichtig ist nicht nur der Text,
           * sondern die Position im DOM.
           */
          const headingElements = [
            ...document.querySelectorAll(
              "h1, h2, h3, h4, h5, h6"
            ),
          ];

          const headings =
            headingElements
              .map(element => ({
                element,
                text: clean(
                  element.innerText
                ),
                team:
                  getTeamFromText(
                    element.innerText
                  ),
              }))
              .filter(
                heading =>
                  heading.team
              );

          const tables = [
            ...document.querySelectorAll(
              "table"
            ),
          ];

          const tableBlocks = [];

          for (
            const table of tables
          ) {
            const text =
              clean(
                table.innerText
              );

            const rows = [
              ...table.querySelectorAll(
                "tr"
              ),
            ];

            if (!rows.length) {
              continue;
            }

            /*
             * =================================================
             * ERGEBNISSE
             * =================================================
             */

            const isResultsTable =
              text.includes("Datum") &&
              text.includes("Zeit") &&
              text.includes("Heim") &&
              text.includes("Gast");

            if (isResultsTable) {
              const results = [];

              for (
                const row of rows
              ) {
                const cells = [
                  ...row.querySelectorAll(
                    "th, td"
                  ),
                ]
                  .map(cell =>
                    clean(
                      cell.innerText
                    )
                  )
                  .filter(Boolean);

                if (
                  cells.length < 5
                ) {
                  continue;
                }

                const dateIndex =
                  cells.findIndex(
                    value =>
                      /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(
                        value
                      )
                  );

                if (
                  dateIndex === -1
                ) {
                  continue;
                }

                const date =
                  cells[
                    dateIndex
                  ];

                const time =
                  cells[
                    dateIndex + 1
                  ] || "";

                const colonIndex =
                  cells.findIndex(
                    (
                      value,
                      index
                    ) =>
                      index >
                        dateIndex &&
                      value === ":"
                  );

                if (
                  colonIndex === -1
                ) {
                  continue;
                }

                const home =
                  cells[
                    dateIndex + 2
                  ] || "";

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

                if (
                  !home ||
                  !away
                ) {
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
                 * Nur bereits gespielte
                 * Ergebnisse.
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

              if (
                results.length > 0
              ) {
                let currentTeam =
                  configuredTeams.length ===
                  1
                    ? configuredTeams[0]
                    : null;

                /*
                 * Die letzte passende
                 * Überschrift vor der
                 * Ergebnistabelle bestimmen.
                 */
                for (
                  const heading of headings
                ) {
                  const position =
                    heading.element.compareDocumentPosition(
                      table
                    );

                  if (
                    position &
                    Node.DOCUMENT_POSITION_FOLLOWING
                  ) {
                    currentTeam =
                      heading.team;
                  }
                }

                tableBlocks.push({
                  type: "results",
                  team: currentTeam,
                  items: results,
                });
              }

              continue;
            }

            /*
             * =================================================
             * TABELLE
             * =================================================
             */

            const isStandingsTable =
              text.includes("Team") &&
              text.includes("SP") &&
              text.includes("TD") &&
              text.includes("P");

            if (
              isStandingsTable
            ) {
              const standings = [];

              for (
                const row of rows
              ) {
                const cells = [
                  ...row.querySelectorAll(
                    "th, td"
                  ),
                ]
                  .map(cell =>
                    clean(
                      cell.innerText
                    )
                  )
                  .filter(Boolean);

                if (
                  cells.length < 4
                ) {
                  continue;
                }

                const rank =
                  score(
                    cells[0]
                  );

                if (
                  rank === null ||
                  rank < 1 ||
                  rank > 50
                ) {
                  continue;
                }

                const teamName =
                  cells[1];

                if (
                  !teamName
                ) {
                  continue;
                }

                const sp =
                  score(
                    cells[2]
                  );

                const td =
                  cells[3];

                const points =
                  score(
                    cells[4]
                  );

                if (
                  sp === null
                ) {
                  continue;
                }

                standings.push({
                  rank,
                  teamName,
                  games: sp,
                  goalDifference:
                    td,
                  points:
                    points !==
                    null
                      ? points
                      : null,
                });
              }

              if (
                standings.length >
                0
              ) {
                let currentTeam =
                  configuredTeams.length ===
                  1
                    ? configuredTeams[0]
                    : null;

                /*
                 * Auch bei Tabellen:
                 * Mannschaft aus der
                 * vorherigen Überschrift.
                 */
                for (
                  const heading of headings
                ) {
                  const position =
                    heading.element.compareDocumentPosition(
                      table
                    );

                  if (
                    position &
                    Node.DOCUMENT_POSITION_FOLLOWING
                  ) {
                    currentTeam =
                      heading.team;
                  }
                }

                tableBlocks.push({
                  type: "standings",
                  team: currentTeam,
                  items: standings,
                });
              }
            }
          }

          return {
            tableBlocks,
          };
        },
        config.teams
      );

    console.log(
      `Gefundene Datenblöcke: ${extracted.tableBlocks.length}`
    );

    const results = [];
    const standings = [];

    /*
     * Jetzt ist die Mannschaft bereits
     * beim Auslesen des DOM bekannt.
     */
    for (
      const block of
        extracted.tableBlocks
    ) {
      const team =
        block.team || null;

      if (
        block.type ===
        "results"
      ) {
        console.log(
          `  Ergebnisblock → ${
            team || "UNBEKANNT"
          } → ${block.items.length} Ergebnisse`
        );

        for (
          const result of block.items
        ) {
          results.push({
            ...result,
            team,
          });
        }
      }

      if (
        block.type ===
        "standings"
      ) {
        console.log(
          `  Tabellenblock → ${
            team || "UNBEKANNT"
          } → ${block.items.length} Plätze`
        );

        for (
          const row of block.items
        ) {
          standings.push({
            rank: row.rank,
            team,
            teamName:
              row.teamName,
            games:
              row.games,
            goalDifference:
              row.goalDifference,
            points:
              row.points,
          });
        }
      }
    }

    /*
     * Kontrolle für U15/U13.
     */
    if (
      config.teams.length > 1
    ) {
      const resultTeams =
        [
          ...new Set(
            results
              .map(result =>
                result.team
              )
              .filter(Boolean)
          ),
        ];

      const standingsTeams =
        [
          ...new Set(
            standings
              .map(row =>
                row.team
              )
              .filter(Boolean)
          ),
        ];

      for (
        const team of config.teams
      ) {
        if (
          !resultTeams.includes(team)
        ) {
          console.log(
            `INFO: Für ${team} wurden keine Spielergebnisse gefunden.`
          );
        }

        if (
          !standingsTeams.includes(
            team
          )
        ) {
          console.log(
            `INFO: Für ${team} wurde keine Tabelle gefunden.`
          );
        }
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
        bodyText.substring(
          0,
          3000
        )
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
      : Array.isArray(
          data?.games
        )
        ? data.games.length
        : Array.isArray(
            data?.results
          )
          ? data.results.length
          : Array.isArray(
              data?.standings
            )
            ? data.standings.length
            : 0;

  if (
    count < minimumItems
  ) {
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

    for (
      const config of PAGES
    ) {
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

    for (
      const team of allTeams
    ) {
      const gameCount =
        games.filter(
          game =>
            game.team ===
            team
        ).length;

      const resultCount =
        results.filter(
          result =>
            result.team ===
            team
        ).length;

      const standingsCount =
        standings.filter(
          row =>
            row.team ===
            team
        ).length;

      console.log(
        `${team.padEnd(
          10
        )} Spiele: ${String(
          gameCount
        ).padStart(
          3
        )} | Ergebnisse: ${String(
          resultCount
        ).padStart(
          3
        )} | Tabelle: ${String(
          standingsCount
        ).padStart(
          3
        )}`
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
