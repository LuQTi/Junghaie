import fs from "node:fs/promises";
import { chromium } from "playwright";

const teams = [
  {
    name: "U15 Regionalliga A",
    url: "https://www.junghaie.de/spielplan.menuid31.html",
    selector: ".-hd-los-schedule"
  },
  {
    name: "U15 Regionalliga B",
    url: "https://www.junghaie.de/spielplan.menuid31.html",
    selector: ".-hd-los-schedule"
  }
];

function parseDateTime(date, time) {
  const match = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (!match) return null;

  const [, day, month, year] = match;

  return `${year}-${month}-${day}T${time || "00:00"}:00`;
}

async function scrapeLeague(page, leagueName, index) {
  console.log(`\n=== ${leagueName} ===`);

  await page.goto(
    "https://www.junghaie.de/spielplan.menuid31.html",
    {
      waitUntil: "domcontentloaded",
      timeout: 60000
    }
  );

  // Hockeydata braucht etwas Zeit zum Nachladen.
  await page.waitForTimeout(5000);

  const schedules = page.locator(".-hd-los-schedule");

  const count = await schedules.count();

  console.log(`Gefundene Spielplan-Container: ${count}`);

  if (count === 0) {
    throw new Error(`${leagueName}: Kein Hockeydata-Spielplan gefunden.`);
  }

  /*
   * Auf der Seite gibt es zwei U15-Spielpläne:
   * 0 = Regionalliga A
   * 1 = Regionalliga B
   */
  const schedule = schedules.nth(index);

  await schedule.waitFor({ state: "visible", timeout: 30000 });

  const games = await schedule.locator("tbody tr").evaluateAll((rows) => {
    return rows.map((row) => {
      const get = (selector) => {
        const element = row.querySelector(selector);
        if (!element) return "";

        return (
          element.getAttribute("value") ||
          element.textContent ||
          ""
        )
          .replace(/\+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      };

      const date = get(".-hd-los-schedule-scheduled-date");
      const time = get(".-hd-los-schedule-scheduled-time");
      const home = get(".-hd-los-schedule-home-team-name");
      const away = get(".-hd-los-schedule-away-team-name");

      const homeScoreRaw = get(
        ".-hd-los-schedule-home-team-score"
      );

      const awayScoreRaw = get(
        ".-hd-los-schedule-away-team-score"
      );

      if (!date || !home || !away) {
        return null;
      }

      return {
        date,
        time: time || null,
        home,
        away,
        homeScore:
          homeScoreRaw && homeScoreRaw !== "-"
            ? Number(homeScoreRaw)
            : null,
        awayScore:
          awayScoreRaw && awayScoreRaw !== "-"
            ? Number(awayScoreRaw)
            : null
      };
    }).filter(Boolean);
  });

  const result = games.map((game) => ({
    ...game,
    datetime: parseDateTime(game.date, game.time),
    league: leagueName
  }));

  console.log(`${leagueName}: ${result.length} Spiele gefunden`);

  if (result.length === 0) {
    throw new Error(
      `${leagueName}: Spielplan ist leer – Hockeydata wurde möglicherweise noch nicht geladen.`
    );
  }

  return result;
}

async function main() {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage({
    locale: "de-DE",
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  });

  const allGames = [];

  try {
    const aGames = await scrapeLeague(
      page,
      "U15 Regionalliga A",
      0
    );

    allGames.push(...aGames);

    const bGames = await scrapeLeague(
      page,
      "U15 Regionalliga B",
      1
    );

    allGames.push(...bGames);
  } finally {
    await browser.close();
  }

  // Doppelte Spiele entfernen
  const uniqueGames = Array.from(
    new Map(
      allGames.map((game) => [
        `${game.league}|${game.datetime}|${game.home}|${game.away}`,
        game
      ])
    ).values()
  );

  uniqueGames.sort((a, b) =>
    String(a.datetime).localeCompare(String(b.datetime))
  );

  await fs.mkdir("data", { recursive: true });

  await fs.writeFile(
    "data/games.json",
    JSON.stringify(uniqueGames, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `\nFERTIG: ${uniqueGames.length} Spiele gespeichert.`
  );
}

main().catch((error) => {
  console.error("\nFEHLER:");
  console.error(error);
  process.exit(1);
});
