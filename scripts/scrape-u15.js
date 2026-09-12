import fs from "node:fs";
import * as cheerio from "cheerio";

const AJAX_URL = "https://www.junghaie.de/ajax-hockeydata-filter.php";

const leagues = [
  {
    name: "U15 Regionalliga A",
    page: "https://www.junghaie.de/spielplan.menuid31.html",
  },
  {
    name: "U15 Regionalliga B",
    page: "https://www.junghaie.de/spielplan.menuid31.html",
  },
];

function parseDateTime(date, time) {
  if (!date) return null;

  const [day, month, year] = date.split(".");
  const [hour = "00", minute = "00"] = (time || "00:00").split(":");

  return `${year}-${month}-${day}T${hour}:${minute}:00+02:00`;
}

function parseGames(html, leagueName) {
  const $ = cheerio.load(html);
  const games = [];

  $("table tbody tr").each((_, row) => {
    const date = $(row)
      .find(".-hd-los-schedule-scheduled-date")
      .attr("value") ||
      $(row)
        .find(".-hd-los-schedule-scheduled-date")
        .text()
        .trim();

    const time = $(row)
      .find(".-hd-los-schedule-scheduled-time")
      .attr("value") ||
      $(row)
        .find(".-hd-los-schedule-scheduled-time")
        .text()
        .trim();

    const home = $(row)
      .find(".-hd-los-schedule-home-team-name")
      .attr("value") ||
      $(row)
        .find(".-hd-los-schedule-home-team-name")
        .text()
        .trim();

    const away = $(row)
      .find(".-hd-los-schedule-away-team-name")
      .attr("value") ||
      $(row)
        .find(".-hd-los-schedule-away-team-name")
        .text()
        .trim();

    const homeScore = $(row)
      .find(".-hd-los-schedule-home-team-score")
      .attr("value");

    const awayScore = $(row)
      .find(".-hd-los-schedule-away-team-score")
      .attr("value");

    if (!date || !home || !away) return;

    games.push({
      date,
      time: time || null,
      datetime: parseDateTime(date, time),
      home,
      away,
      homeScore:
        !homeScore || homeScore === "-"
          ? null
          : Number(homeScore),
      awayScore:
        !awayScore || awayScore === "-"
          ? null
          : Number(awayScore),
      league: leagueName,
    });
  });

  return games;
}

async function getSessionCookie() {
  const response = await fetch(leagues[0].page);

  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

  if (cookies.length > 0) {
    return cookies
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
  }

  const cookie = response.headers.get("set-cookie");

  if (cookie) {
    return cookie.split(";")[0];
  }

  return "";
}

async function fetchLeague(league, cookie) {
  const var0 =
    '<div class="-hd-los -hd-los-schedule" style=""></div>';

  const body = new URLSearchParams({
    var0,
    var1: "nextgames",
    var2: league.name,
    var3: "index.php?menuid=32",
  });

  const response = await fetch(AJAX_URL, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: "https://www.junghaie.de",
      Referer: league.page,
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body,
  });

  const html = await response.text();

  console.log(`${league.name}: HTTP ${response.status}`);
  console.log(`${league.name}: Antwort:`, html.slice(0, 250));

  return parseGames(html, league.name);
}

async function main() {
  const cookie = await getSessionCookie();

  console.log("PHP-Session aufgebaut:", cookie ? "ja" : "nein");

  let allGames = [];

  for (const league of leagues) {
    const games = await fetchLeague(league, cookie);

    console.log(
      `${league.name}: ${games.length} Spiele gefunden`
    );

    allGames.push(...games);
  }

  allGames.sort((a, b) =>
    (a.datetime || "").localeCompare(b.datetime || "")
  );

  fs.mkdirSync("data", { recursive: true });

  fs.writeFileSync(
    "data/games.json",
    JSON.stringify(allGames, null, 2),
    "utf8"
  );

  console.log(
    `Gesamt: ${allGames.length} Spiele gespeichert.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
