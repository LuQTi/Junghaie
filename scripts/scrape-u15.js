import * as cheerio from 'cheerio';
import { mkdir, writeFile } from 'node:fs/promises';

const ENDPOINT =
  'https://www.junghaie.de/ajax-hockeydata-filter.php';

const REFERER =
  'https://www.junghaie.de/spielplan.menuid31.html';

const leagues = [
  {
    name: 'U15 Regionalliga A',
    menuId: 32
  },
  {
    name: 'U15 Regionalliga B',
    menuId: 32
  }
];

function value($, row, selector) {
  return $(row)
    .find(selector)
    .attr('value')
    ?.trim() ?? '';
}

function parseDateTime(date, time) {
  const [day, month, year] = date.split('.');

  if (!day || !month || !year) {
    return null;
  }

  return `${year}-${month}-${day}${
    time ? `T${time}:00` : ''
  }`;
}

function parseGames(html, leagueName) {
  const $ = cheerio.load(html);
  const games = [];

  $('table.hockeydata_nextgames tbody tr').each((_, row) => {
    const cells = $(row)
      .find('td')
      .map((_, cell) => $(cell).text().trim())
      .get();

    // Erwartet:
    // 0 = Datum
    // 1 = Uhrzeit
    // 2 = Heim
    // 3 = Heimlogo
    // 4 = Heim-Tore
    // 5 = :
    // 6 = Gast-Tore
    // 7 = leer
    // 8 = Gastlogo
    // 9 = Gast

    if (cells.length < 10) {
      return;
    }

    const date = cells[0];
    const time = cells[1];
    const home = cells[2];
    const homeScore = cells[4];
    const awayScore = cells[6];
    const away = cells[9];

    if (!date || !home || !away) {
      return;
    }

    games.push({
      date,
      time: time || null,
      datetime: parseDateTime(date, time),
      home,
      away,
      homeScore:
        homeScore === '-' || homeScore === ''
          ? null
          : Number(homeScore),
      awayScore:
        awayScore === '-' || awayScore === ''
          ? null
          : Number(awayScore),
      league: leagueName
    });
  });

  return games;
}

// ---------------------------------------------------------
// 1. Session bei junghaie.de aufbauen
// ---------------------------------------------------------

async function createSession() {
  const response = await fetch(REFERER, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; JunghaieGamesBot/1.0)'
    }
  });

  if (!response.ok) {
    throw new Error(
      `Junghaie-Seite konnte nicht geladen werden: HTTP ${response.status}`
    );
  }

  let cookies = [];

  if (typeof response.headers.getSetCookie === 'function') {
    cookies = response.headers.getSetCookie();
  } else {
    const cookie = response.headers.get('set-cookie');

    if (cookie) {
      cookies = [cookie];
    }
  }

  const sessionCookies = cookies
    .map(cookie => cookie.split(';')[0])
    .filter(Boolean);

  return sessionCookies.join('; ');
}


// ---------------------------------------------------------
// 2. AJAX-Request ausführen
// ---------------------------------------------------------

async function fetchLeague(league, cookie) {
  const body = new URLSearchParams({
    // EXAKT wie aus deinem Chrome-cURL:
    var0:
      '<div class="-hd-los -hd-los-schedule -hd-loading" style=""></div>',

    var1: 'nextgames',

    var2: league.name,

    var3: `index.php?menuid=${league.menuId}`
  });

  const response = await fetch(ENDPOINT, {
    method: 'POST',

    headers: {
      'Accept': '*/*',

      'Accept-Language':
        'de,de-DE;q=0.9,en;q=0.8',

      'Content-Type':
        'application/x-www-form-urlencoded',

      'Origin':
        'https://www.junghaie.de',

      'Referer':
        REFERER,

      'X-Requested-With':
        'XMLHttpRequest',

      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36',

      ...(cookie
        ? { 'Cookie': cookie }
        : {})
    },

    body
  });

  if (!response.ok) {
    throw new Error(
      `${league.name}: HTTP ${response.status}`
    );
  }

  const html = await response.text();

  console.log(
    `${league.name}: Serverantwort:`,
    html.slice(0, 200)
  );

  const games = parseGames(
    html,
    league.name
  );

  if (games.length === 0) {
    throw new Error(
      `${league.name}: Keine Spiele gefunden.`
    );
  }

  return games;
}


// ---------------------------------------------------------
// 3. Hauptprogramm
// ---------------------------------------------------------

const cookie = await createSession();

console.log(
  'PHP-Session aufgebaut:',
  cookie ? 'ja' : 'nein'
);

const allGames = (
  await Promise.all(
    leagues.map(league =>
      fetchLeague(league, cookie)
    )
  )
).flat();


// ---------------------------------------------------------
// 4. Duplikate entfernen
// ---------------------------------------------------------

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


// ---------------------------------------------------------
// 5. Sortieren
// ---------------------------------------------------------

const games = [...unique.values()]
  .sort((a, b) =>
    (a.datetime ?? '')
      .localeCompare(b.datetime ?? '')
  );


// ---------------------------------------------------------
// 6. JSON schreiben
// ---------------------------------------------------------

await mkdir('data', {
  recursive: true
});

await writeFile(
  'data/games.json',
  JSON.stringify(
    {
      generatedAt:
        new Date().toISOString(),

      source:
        REFERER,

      games
    },
    null,
    2
  ) + '\n',

  'utf8'
);

console.log(
  `Gespeichert: ${games.length} Spiele`
);
