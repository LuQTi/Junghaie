import fs from "node:fs/promises";
import { chromium } from "playwright";

const OUTPUT = "data/games.json";

const PAGES = [
  {
    url: "https://www.junghaie.de/spielplan.menuid23.html",
    teams: ["U20"]
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid27.html",
    teams: ["U17"]
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid31.html",
    teams: ["U15 A", "U15 B"]
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid35.html",
    teams: ["U13 A", "U13 B"]
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid51.html",
    teams: ["Frauen 1"]
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid47.html",
    teams: ["Frauen 2"]
  },
  {
    url: "https://www.junghaie.de/spielplan.menuid55.html",
    teams: ["Frauen 3"]
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

  if (!t) {
    return `${year}-${month.padStart(2, "0")}-${day.padStart(
      2,
      "0"
    )}T00:00:00`;
  }

  const timeMatch = t.match(
    /^(\d{1,2}):(\d{2})$/
  );

  if (!timeMatch) {
    return `${year}-${month.padStart(2, "0")}-${day.padStart(
      2,
      "0"
    )}T00:00:00`;
  }

  const [, hour, minute] = timeMatch;

  return `${year}-${month.padStart(2, "0")}-${day.padStart(
    2,
    "0"
  )}T${hour.padStart(2, "0")}:${minute}:00`;
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

/*
 * Versucht zuerst die bekannten Hockeydata-Klassen.
 */
function extractFromScheduleRows(rows, team) {
  const games = [];

  for (const row of rows) {
    const dateElement = row.querySelector(
      ".-hd-los-schedule-scheduled-date"
    );

    const timeElement = row.querySelector(
      ".-hd-los-schedule-scheduled-time"
    );

    const homeElement = row.querySelector(
      ".-hd-los-schedule-home-team-name"
    );

    const awayElement = row.querySelector(
      ".-hd-los-schedule-away-team-name"
    );

    const homeScoreElement = row.querySelector(
      ".-hd-los-schedule-home-team-score"
    );

    const awayScoreElement = row.querySelector(
      ".-hd-los-schedule-away-team-score"
    );

    const date = getText(dateElement);
    const time = getText(timeElement);
    const home = getText(homeElement);
    const away = getText(awayElement);

    if (!date || !home || !away) {
      continue;
    }

    games.push({
      date,
      time: time || null,
      datetime: parseDateTime(date, time),
      home,
      away,
      homeScore: score(getText(homeScoreElement)),
      awayScore: score(getText(awayScoreElement)),
      team
    });
  }

  return games;
}

/*
 * Fallback für normale Hockeydata-Tabellen.
 *
 * Aufbau der bekannten "nextgames"-Tabelle:
 *
 * Datum
 * Uhrzeit
 * Heim
 * Logo
 * Heimscore
 * :
 * Auswärtsscore
 * Logo
 * Auswärts
 */
function extractFromNextGamesTable(table, team) {
  const games = [];

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

    if (!/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(date)) {
      continue;
    }

    const time = cells[1] || null;

    /*
     * Das ist der bekannte Hockeydata-Aufbau:
     *
     * 0 Datum
     * 1 Uhrzeit
     * 2 Heimteam
     * 3 Heimlogo
     * 4 Heimscore
     * 5 :
     * 6 Auswärtsscore
     * 7 leer
     * 8 Auswärtslogo
     * 9 Auswärtsteam
     */
    let home = cells[2] || "";
    let homeScore = score(cells[4]);
    let awayScore = score(cells[6]);
    let away = cells[9] || "";

    /*
     * Falls die Tabelle leicht anders aufgebaut ist,
     * versuchen wir die Teams anhand der Textwerte zu finden.
     */
    if (!away) {
      const possibleTeams = cells.filter((value) => {
        if (!value) return false;
        if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(value)) return false;
        if (/^\d{1,2}:\d{2}$/.test(value)) return false;
        if (/^\d+$/.test(value)) return false;
        if (value === ":") return false;
        return true;
      });

      if (possibleTeams.length >= 2) {
        home = possibleTeams[0];
        away = possibleTeams[possibleTeams.length - 1];
      }
    }

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

  return games;
}

async function scrapePage(browser, config) {
  console.log("");
  console.log("========================================");
  console.log(`Seite: ${config.url}`);
  console.log(`Teams: ${config.teams.join(", ")}`);
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
      // Nicht jede Response kann gelesen werden.
    }
  });

  try {
    await page.goto(config.url, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    /*
     * Hockeydata wird nachträglich per JavaScript geladen.
     */
    console.log("Warte auf Hockeydata...");

    await page.waitForTimeout(15000);

    /*
     * Noch einmal kurz warten, falls gerade eine AJAX-Antwort
     * eingetroffen ist.
     */
    await page.waitForTimeout(3000);

    const result = [];

    /*
     * ---------------------------------------------------------
     * 1. Tatsächlich gerenderte Hockeydata-Spielpläne
     * ---------------------------------------------------------
     */

    const renderedGames = await page.evaluate(
      (teams) => {
        function clean(value) {
          return String(value ?? "")
            .replace(/\+/g, " ")
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }

        function text(selector, root) {
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

        const result = [];

        /*
         * Variante A: Hockeydata schedule rows
         */
        const rows = [
          ...document.querySelectorAll(
            ".-hd-los-schedule-row"
          )
        ];

        for (const row of rows) {
          const date = text(
            ".-hd-los-schedule-scheduled-date",
            row
          );

          const time = text(
            ".-hd-los-schedule-scheduled-time",
            row
          );

          const home = text(
            ".-hd-los-schedule-home-team-name",
            row
          );

          const away = text(
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
            homeScore: text(
              ".-hd-los-schedule-home-team-score",
              row
            ),
            awayScore: text(
              ".-hd-los-schedule-away-team-score",
              row
            )
          });
        }

        /*
         * Variante B: nextgames-Tabelle
         */
        const tables = [
          ...document.querySelectorAll(
            "table.hockeydata_nextgames"
          )
        ];

        for (const table of tables) {
          const tableRows = [
            ...table.querySelectorAll("tr")
          ];

          for (const row of tableRows) {
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
      },
      config.teams
    );

    /*
     * Den ersten Teamnamen zuordnen.
     *
     * Bei Seiten mit zwei Spielplänen (U15/U13) versuchen wir,
     * anhand der Reihenfolge die beiden Bereiche zu unterscheiden.
     */
    let teamIndex = 0;

    for (const game of renderedGames) {
      if (!game.home || !game.away) {
        continue;
      }

      const team =
        config.teams.length === 1
          ? config.teams[0]
          : config.teams[teamIndex % config.teams.length];

      result.push({
        date: game.date,
        time: game.time,
        datetime: parseDateTime(
          game.date,
          game.time
        ),
        home: game.home,
        away: game.away,
        homeScore: score(game.homeScore),
        awayScore: score(game.awayScore),
        team
      });

      /*
       * Nur für die Zuordnung bei mehreren Tabellen.
       */
      if (
        config.teams.length > 1 &&
        result.length > 0
      ) {
        teamIndex++;
      }
    }

    /*
     * ---------------------------------------------------------
     * 2. AJAX-Responses ebenfalls auswerten
     * ---------------------------------------------------------
     */

    /*
     * AJAX-Responses zur Browser-Seite übertragen und dort
     * mit denselben Regeln auswerten.
     */
    for (const response of responses) {
      const responseGames =
        await page.evaluate(
          ({ html }) => {
            const parser =
              new DOMParser();

            const doc =
              parser.parseFromString(
                html,
                "text/html"
              );

            const games = [];

            const rows = [
              ...doc.querySelectorAll(
                ".-hd-los-schedule-row"
              )
            ];

            function clean(value) {
              return String(value ?? "")
                .replace(/\+/g, " ")
                .replace(/\u00a0/g, " ")
                .replace(/\s+/g, " ")
                .trim();
            }

            function get(selector, row) {
              const element =
                row.querySelector(selector);

              if (!element) {
                return "";
              }

              return clean(
                element.getAttribute("value") ||
                  element.textContent ||
                  ""
              );
            }

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
          { html: response.body }
        );

      for (const game of responseGames) {
        if (!game.home || !game.away) {
          continue;
        }

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
          team:
            config.teams.length === 1
              ? config.teams[0]
              : config.teams[0]
        });
      }
    }

    /*
     * Duplikate entfernen.
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

    const games = [...unique.values()];

    console.log(
      `Gefundene Spiele: ${games.length}`
    );

    return games;
  } finally {
    await page.close();
  }
}

async function main() {
  console.log("========================================");
  console.log("KÖLNER JUNGHÄIE – SPIELPLAN SCRAPER");
  console.log("========================================");

  const browser = await chromium.launch({
    headless: true
  });

  const allGames = [];

  try {
    for (const config of PAGES) {
      const games = await scrapePage(
        browser,
        config
      );

      allGames.push(...games);
    }
  } finally {
    await browser.close();
  }

  /*
   * Gesamte Duplikate entfernen.
   */
  const unique = new Map();

  for (const game of allGames) {
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

  const games = [...unique.values()];

  /*
   * Chronologisch sortieren.
   */
  games.sort((a, b) => {
    return String(a.datetime).localeCompare(
      String(b.datetime)
    );
  });

  console.log("");
  console.log("========================================");
  console.log(`GESAMT: ${games.length} Spiele`);
  console.log("========================================");

  /*
   * Sicherheitsprüfung:
   *
   * Wenn ALLE Seiten plötzlich nichts liefern,
   * überschreiben wir niemals die bestehende JSON.
   */
  if (games.length === 0) {
    throw new Error(
      "Es wurden überhaupt keine Spiele gefunden. games.json wird NICHT überschrieben."
    );
  }

  await fs.mkdir("data", {
    recursive: true
  });

  await fs.writeFile(
    OUTPUT,
    JSON.stringify(games, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `Gespeichert: ${OUTPUT}`
  );
}

main().catch((error) => {
  console.error("");
  console.error("SCRAPER FEHLER:");
  console.error(error);
  process.exit(1);
});
