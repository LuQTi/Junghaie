import fs from "node:fs/promises";
import * as cheerio from "cheerio";

const BASE_URL = "https://www.junghaie.de";
const SCHEDULE_URL = `${BASE_URL}/spielplan.menuid31.html`;
const AJAX_URL = `${BASE_URL}/ajax-hockeydata-filter.php`;

const leagues = [
  {
    name: "U15 Regionalliga A",
    menu: "index.php?menuid=32",
  },
  {
    name: "U15 Regionalliga B",
    menu: "index.php?menuid=32",
  },
];

function parseDateTime(date, time) {
  if (!date) return null;

  const match = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match;
  const cleanTime = /^\d{2}:\d{2}$/.test(time || "") ? time : "00:00";

  return `${year}-${month}-${day}T${cleanTime}:00`;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\+/g, " ")
    .trim();
}

function parseGames(html, leagueName) {
  const $ = cheerio.load(html);
  const games = [];

  // Hockeydata liefert je nach Anfrage entweder die
  // "nextgames"-Tabelle oder den vollständigen Spielplan.
  $("table tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .map((_, cell) => cleanText($(cell).text()))
      .get();

    if (cells.length < 10) return;

    const date = cells[0];
    const time = cells[1];
    const home = cells[2];
    const homeScore = cells[4];
    const awayScore = cells[6];
    const away = cells[9];

    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(date)) return;
    if (!home || !away) return;

    games.push({
      date,
      time: time || null,
      datetime: parseDateTime(date, time),
      home,
      away,
      homeScore:
        homeScore && homeScore !== "-"
          ? Number(homeScore)
          : null,
      awayScore:
        awayScore && awayScore !== "-"
          ? Number(awayScore)
          : null,
      league: leagueName,
    });
  });

  return games;
}

async function createSession() {
  const response = await fetch(SCHEDULE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Junghaie-Seite konnte nicht geladen werden: ${response.status}`);
  }

  let cookie = "";

  if (typeof response.headers.getSetCookie === "function") {
    const cookies = response.headers.getSetCookie();
    cookie = cookies
      .map((value) => value.split(";")[0])
      .join("; ");
  } else {
    const value = response.headers.get("set-cookie");
    if (value) {
      cookie = value.split(";")[0];
    }
  }

  console.log(`PHP-Session aufgebaut: ${cookie ? "ja" : "nein"}`);

  return cookie;
}

async function requestLeague(cookie, league) {
  /*
   * Dieser var0 entspricht dem Container, den die Junghaie-Seite
   * an Hockeydata übergibt.
   *
   * Wichtig: kein PHPSESSID fest eintragen.
   */
  const var0 =
    '<div class="-hd-los -hd-los-schedule" style=""></div>';

  const body = new URLSearchParams({
    var0,
    var1: "nextgames",
    var2: league.name,
    var3: league.menu,
  });

  const response = await fetch(AJAX_URL, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: BASE_URL,
      Referer: SCHEDULE_URL,
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest",
      Cookie: cookie,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(
      `${league.name}: HTTP ${response.status}`
    );
  }

  const html = await response.text();

  console.log(
    `${league.name}: Serverantwort:`,
    html.substring(0, 200).replace(/\s+/g, " ")
  );

  return html;
}

async function main() {
  const cookie = await createSession();

  const allGames = [];

  for (const league of leagues) {
    try {
      const html = await requestLeague(cookie, league);
      const games = parseGames(html, league.name);

      console.log(
        `${league.name}: ${games.length} Spiele gefunden`
      );

      allGames.push(...games);
    } catch (error) {
      console.error(
        `${league.name}: ${error.message}`
      );
    }
  }

  // Doppelte Spiele entfernen
  const uniqueGames = Array.from(
    new Map(
      allGames.map((game) => [
        `${game.league}|${game.datetime}|${game.home}|${game.away}`,
        game,
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
    `Fertig: ${uniqueGames.length} Spiele insgesamt gespeichert.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
