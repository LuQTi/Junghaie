import * as cheerio from 'cheerio';
import { mkdir, writeFile } from 'node:fs/promises';

const ENDPOINT = 'https://www.junghaie.de/ajax-hockeydata-filter.php';
const REFERER = 'https://www.junghaie.de/spielplan.menuid31.html';

const leagues = [
  { name: 'U15 Regionalliga A', menuId: 32 },
  { name: 'U15 Regionalliga B', menuId: 32 }
];

function value($, row, selector) {
  return $(row).find(selector).attr('value')?.trim() ?? '';
}

function parseDateTime(date, time) {
  // Hockeydata liefert DD.MM.YYYY und HH:MM.
  const [day, month, year] = date.split('.');
  if (!day || !month || !year) return null;
  return `${year}-${month}-${day}${time ? `T${time}:00` : ''}`;
}

function parseGames(html, leagueName) {
  const $ = cheerio.load(html);
  const games = [];

  $('.-hd-los-schedule-row').each((_, row) => {
    const date = value($, row, '.-hd-los-schedule-scheduled-date');
    const time = value($, row, '.-hd-los-schedule-scheduled-time');
    const home = value($, row, '.-hd-los-schedule-home-team-name');
    const away = value($, row, '.-hd-los-schedule-away-team-name');

    if (!date || !home || !away) return;

    const homeScoreRaw = value($, row, '.-hd-los-schedule-home-team-score');
    const awayScoreRaw = value($, row, '.-hd-los-schedule-away-team-score');

    games.push({
      date,
      time: time || null,
      datetime: parseDateTime(date, time),
      home,
      away,
      homeScore: homeScoreRaw === '' ? null : Number(homeScoreRaw),
      awayScore: awayScoreRaw === '' ? null : Number(awayScoreRaw),
      league: leagueName
    });
  });

  return games;
}

async function fetchLeague(league) {
  const body = new URLSearchParams({
    var0: '<div class="-hd-los -hd-los-schedule -hd-loading"></div>',
    var1: 'nextgames',
    var2: league.name,
    var3: `index.php?menuid=${league.menuId}`
  });

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Accept': '*/*',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://www.junghaie.de',
      'Referer': REFERER,
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (compatible; JunghaieGamesBot/1.0)'
    },
    body
  });

  if (!response.ok) {
    throw new Error(`${league.name}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const games = parseGames(html, league.name);

  if (games.length === 0) {
    throw new Error(
      `${league.name}: Keine Spiele gefunden. Response-Anfang: ${html.slice(0, 300)}`
    );
  }

  return games;
}

const allGames = (await Promise.all(leagues.map(fetchLeague))).flat();

// Doppelte Einträge entfernen und chronologisch sortieren.
const unique = new Map();
for (const game of allGames) {
  const key = [
    game.datetime,
    game.home,
    game.away,
    game.league
  ].join('|');
  unique.set(key, game);
}

const games = [...unique.values()].sort((a, b) =>
  (a.datetime ?? '').localeCompare(b.datetime ?? '')
);

await mkdir('data', { recursive: true });
await writeFile(
  'data/games.json',
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: 'https://www.junghaie.de/spielplan.menuid31.html',
      games
    },
    null,
    2
  ) + '\n',
  'utf8'
);

console.log(`Gespeichert: ${games.length} Spiele`);
