import fs from "node:fs/promises";
import { chromium } from "playwright";

const URL = "https://www.junghaie.de/spielplan.menuid31.html";
const OUTPUT = "data/games.json";

const LEAGUES = [
  "U15 Regionalliga A",
  "U15 Regionalliga B"
];

function clean(value) {
  return String(value ?? "")
    .replace(/\+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDateTime(date, time) {
  const d = clean(date);
  const t = clean(time);

  const match = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;

  const hhmm = t.match(/^(\d{1,2}):(\d{2})$/);

  if (!hhmm) {
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00`;
  }

  const [, hour, minute] = hhmm;

  return `${year}-${month.padStart(2, "0")}-${day.padStart(
    2,
    "0"
  )}T${hour.padStart(2, "0")}:${minute}:00`;
}

function score(value) {
  const cleaned = clean(value);

  if (!cleaned || cleaned === "-") {
    return null;
  }

  const number = Number(cleaned);

  return Number.isFinite(number) ? number : null;
}

function extractGamesFromHtml(html, league) {
  const games = [];

  /*
   * Hockeydata kann die Spiele in unterschiedlichen HTML-Strukturen
   * zurückgeben. Wir suchen deshalb zunächst nach den bekannten
   * Hockeydata-Spielzeilen.
   */

  const rowRegex =
    /<tr[^>]*class=["'][^"']*-hd-los-schedule-row[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;

  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];

    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (match) => clean(
        match[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/gi, " ")
      )
    );

    if (cells.length < 2) {
      continue;
    }

    const text = clean(
      row
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
    );

    const dateMatch = text.match(
      /(\d{1,2}\.\d{1,2}\.\d{4})/
    );

    const timeMatch = text.match(
      /(\d{1,2}:\d{2})/
    );

    if (!dateMatch) {
      continue;
    }

    const date = dateMatch[1];
    const time = timeMatch ? timeMatch[1] : null;

    /*
     * Bekannte Hockeydata-Klassen aus den geladenen Tabellen.
     */
    const homeMatch = row.match(
      /class=["'][^"']*-hd-los-schedule-home-team-name[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
    );

    const awayMatch = row.match(
      /class=["'][^"']*-hd-los-schedule-away-team-name[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
    );

    const homeScoreMatch = row.match(
      /class=["'][^"']*-hd-los-schedule-home-team-score[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
    );

    const awayScoreMatch = row.match(
      /class=["'][^"']*-hd-los-schedule-away-team-score[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i
    );

    let home = homeMatch
      ? clean(homeMatch[1].replace(/<[^>]+>/g, " "))
      : "";

    let away = awayMatch
      ? clean(awayMatch[1].replace(/<[^>]+>/g, " "))
      : "";

    /*
     * Falls die Klassen fehlen, versuchen wir die Teamnamen
     * aus den Tabellenzellen zu erkennen.
     */
    if (!home || !away) {
      const possibleTeams = cells.filter((cell) => {
        if (!cell) return false;
        if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(cell)) return false;
        if (/^\d{1,2}:\d{2}$/.test(cell)) return false;
        if (/^\d+$/.test(cell)) return false;
        if (cell === ":") return false;
        return true;
      });

      if (!home && possibleTeams.length >= 2) {
        home = possibleTeams[0];
      }

      if (!away && possibleTeams.length >= 2) {
        away = possibleTeams[possibleTeams.length - 1];
      }
    }

    if (!home || !away) {
      continue;
    }

    const homeScore = homeScoreMatch
      ? score(homeScoreMatch[1].replace(/<[^>]+>/g, " "))
      : null;

    const awayScore = awayScoreMatch
      ? score(awayScoreMatch[1].replace(/<[^>]+>/g, " "))
      : null;

    games.push({
      date,
      time,
      datetime: parseDateTime(date, time),
      home,
      away,
      homeScore,
      awayScore,
      league
    });
  }

  return games;
}

async function main() {
  console.log("Starte Junghaie-Scraper...");

  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage({
    locale: "de-DE",
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
  });

  /*
   * Wir sammeln sämtliche Responses, die beim Laden der Seite
   * zurückkommen. Genau dort liefert Hockeydata die Spielplandaten.
   */
  const responses = [];

  page.on("response", async (response) => {
    try {
      const url = response.url();

      if (
        url.includes("hockeydata") ||
        url.includes("ajax-hockeydata-filter.php") ||
        url.includes("junghaie.de")
      ) {
        const contentType =
          response.headers()["content-type"] || "";

        if (
          contentType.includes("text/html") ||
          contentType.includes("application/json") ||
          url.includes("ajax-hockeydata-filter.php")
        ) {
          const body = await response.text();

          if (body && body.length > 100) {
            responses.push({
              url,
              body
            });

            console.log(
              `Response gesammelt: ${url} (${body.length} Zeichen)`
            );
          }
        }
      }
    } catch {
      // Einzelne Response kann nicht gelesen werden – ignorieren.
    }
  });

  console.log(`Lade ${URL} ...`);

  await page.goto(URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  /*
   * Hockeydata braucht etwas Zeit für JavaScript/AJAX.
   */
  console.log("Warte auf Hockeydata...");

  await page.waitForTimeout(15000);

  /*
   * Zusätzlich versuchen wir auf der tatsächlich gerenderten Seite
   * Tabellen zu finden.
   */
  const renderedHtml = await page.content();

  console.log(
    `Gerenderte Seite: ${renderedHtml.length} Zeichen`
  );

  let allGames = [];

  /*
   * 1. Responses durchsuchen.
   */
  for (const response of responses) {
    for (const league of LEAGUES) {
      const games = extractGamesFromHtml(
        response.body,
        league
      );

      if (games.length > 0) {
        console.log(
          `${league}: ${games.length} Spiele aus Response gefunden.`
        );

        allGames.push(...games);
      }
    }
  }

  /*
   * 2. Falls Hockeydata die Daten direkt in die Seite eingebaut hat,
   * auch die gerenderte Seite durchsuchen.
   */
  for (const league of LEAGUES) {
    const games = extractGamesFromHtml(
      renderedHtml,
      league
    );

    if (games.length > 0) {
      console.log(
        `${league}: ${games.length} Spiele aus gerenderter Seite gefunden.`
      );

      allGames.push(...games);
    }
  }

  /*
   * 3. Zusätzlich direkt Tabellen aus dem Browser-DOM auslesen.
   * Das ist der Fallback, falls Hockeydata HTML anders strukturiert.
   */
  const domGames = await page.locator("table").evaluateAll(
    (tables) => {
      const result = [];

      for (const table of tables) {
        const rows = [...table.querySelectorAll("tr")];

        for (const row of rows) {
          const cells = [...row.querySelectorAll("td")].map(
            (td) => td.innerText.trim()
          );

          if (cells.length < 5) {
            continue;
          }

          const text = cells.join(" ");

          const dateMatch = text.match(
            /(\d{1,2}\.\d{1,2}\.\d{4})/
          );

          const timeMatch = text.match(
            /(\d{1,2}:\d{2})/
          );

          if (!dateMatch) {
            continue;
          }

          result.push({
            cells,
            date: dateMatch[1],
            time: timeMatch ? timeMatch[1] : null
          });
        }
      }

      return result;
    }
  );

  console.log(
    `DOM-Tabellenzeilen gefunden: ${domGames.length}`
  );

  /*
   * DOM-Fallback.
   */
  for (const row of domGames) {
    const cells = row.cells;

    const useful = cells.filter((cell) => {
      const value = clean(cell);

      if (!value) return false;
      if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(value)) return false;
      if (/^\d{1,2}:\d{2}$/.test(value)) return false;
      if (/^\d+$/.test(value)) return false;
      if (value === ":") return false;

      return true;
    });

    if (useful.length < 2) {
      continue;
    }

    const home = clean(useful[0]);
    const away = clean(useful[useful.length - 1]);

    if (!home || !away) {
      continue;
    }

    allGames.push({
      date: row.date,
      time: row.time,
      datetime: parseDateTime(
        row.date,
        row.time
      ),
      home,
      away,
      homeScore: null,
      awayScore: null,
      league: "U15"
    });
  }

  /*
   * Duplikate entfernen.
   */
  const unique = new Map();

  for (const game of allGames) {
    const key = [
      game.datetime,
      game.home,
      game.away,
      game.league
    ]
      .map(clean)
      .join("|");

    if (!unique.has(key)) {
      unique.set(key, game);
    }
  }

  allGames = [...unique.values()];

  /*
   * Nur echte U15-Spiele behalten.
   */
  allGames = allGames.filter((game) => {
    const combined =
      `${game.home} ${game.away}`.toLowerCase();

    return (
      combined.includes("junghaie") ||
      combined.includes("kölner")
    );
  });

  /*
   * Nach Datum sortieren.
   */
  allGames.sort((a, b) => {
    return String(a.datetime).localeCompare(
      String(b.datetime)
    );
  });

  console.log(
    `Insgesamt gefundene U15-Spiele: ${allGames.length}`
  );

  /*
   * WICHTIG:
   * Wenn Hockeydata plötzlich nichts liefert, wird die vorhandene
   * games.json NICHT durch [] ersetzt.
   */
  if (allGames.length === 0) {
    console.error(
      "FEHLER: Keine Spiele gefunden."
    );

    console.error(
      "Die vorhandene games.json bleibt unverändert."
    );

    await browser.close();

    process.exit(1);
  }

  /*
   * Sicherstellen, dass data existiert.
   */
  await fs.mkdir("data", {
    recursive: true
  });

  await fs.writeFile(
    OUTPUT,
    JSON.stringify(allGames, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `Gespeichert: ${OUTPUT}`
  );

  console.log(
    `Anzahl Spiele: ${allGames.length}`
  );

  await browser.close();
}

main().catch((error) => {
  console.error("FEHLER:");
  console.error(error);

  process.exit(1);
});
