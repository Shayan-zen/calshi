// Generates seed/seed.sql: events, markets, ~30 days of synthetic price history, bot users,
// initial market-maker ladders and a few recent bot trades. Idempotent: deletes previous seed rows first.
// Usage: node scripts/gen-seed.mjs && wrangler d1 execute DB --local --file=./seed/seed.sql
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOW = Date.now();
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const BOT_MM = "bot-mm";
const BOT_FLOW = "bot-flow";
const BOT_BALANCE = 1_000_000_000; // $10M in cents

const t = (iso) => Date.parse(iso + "T18:29:00Z"); // 23:59 IST

// [slug, tickerPrefix, title, category, icon, close, description, rules, markets: [code, title, fair]] (single market => code "")
const EVENTS = [
  // ---------- Campus (BITS Pilani) ----------
  ["apogee-2027-headliner", "APOGEE27-HEADLINER", "Who will headline APOGEE 2027?", "Campus", "🎤", "2027-03-15",
    "APOGEE, BITS Pilani's annual technical fest, usually closes with a pronite. Who gets top billing in 2027?",
    "Resolves to the artist officially announced as the headlining act of APOGEE 2027 by the fest organisers. If no headliner performs, all markets resolve NO.",
    [["ARIJIT", "Arijit Singh", 22], ["DILJIT", "Diljit Dosanjh", 14], ["KUHAD", "Prateek Kuhad", 26], ["ANUV", "Anuv Jain", 21], ["LOCALTRAIN", "The Local Train", 11], ["OTHER", "Someone else", 6]]],
  ["inter-bhawan-cricket-2027", "BHAWANCRICKET27", "Which bhawan wins Inter-Bhawan Cricket 2027?", "Campus", "🏏", "2027-02-28",
    "The annual inter-hostel cricket championship at BITS Pilani.",
    "Resolves to the bhawan declared champion by the Sports Union. Joint winners resolve both YES.",
    [["KRISHNA", "Krishna", 24], ["RAM", "Ram", 20], ["SHANKAR", "Shankar", 18], ["BUDH", "Budh", 15], ["VYAS", "Vyas", 13], ["OTHER", "Other bhawan", 10]]],
  ["bosm-2027-dates-before-feb", "BOSM27-DATES", "Will BOSM 2027 dates be announced before Feb 1?", "Campus", "🏆", "2027-02-01",
    "BOSM (BITS Open Sports Meet) dates are typically announced months ahead. Will the official dates be out before February 1, 2027?",
    "Resolves YES if the BOSM organising committee publicly announces the dates of BOSM 2027 (website, official social media, or email to students) before 00:00 IST Feb 1, 2027.",
    [["", "Will BOSM 2027 dates be announced before Feb 1?", 58]]],
  ["mess-fee-hike-next-semester", "MESSFEE-HIKE", "Mess fee hike next semester?", "Campus", "🍛", "2027-01-10",
    "Will the per-semester mess advance for BITS Pilani hostels go up for the Jan 2027 semester?",
    "Resolves YES if the official mess advance / mess fee for the second semester 2026-27 is higher than for the first semester 2026-27, per SWD or Mess Council communication.",
    [["", "Mess fee hike next semester?", 67]]],
  ["bits-nirf-top-20-2027", "NIRF27-TOP20", "Will BITS Pilani rank in the NIRF Engineering top 20 in 2027?", "Campus", "🎓", "2027-08-31",
    "The NIRF 2027 Engineering rankings are expected mid-2027.",
    "Resolves YES if BITS Pilani (Pilani campus / institute entry) is ranked 20 or better in the NIRF 2027 Engineering category.",
    [["", "Will BITS Pilani rank in the NIRF Engineering top 20 in 2027?", 71]]],
  ["library-24x7-compres", "LIB24X7-DEC26", "Will the library stay open 24x7 during December compres?", "Campus", "📚", "2026-12-05",
    "Students have requested round-the-clock library access during the comprehensive exam period.",
    "Resolves YES if the central library is officially announced to stay open 24 hours a day for at least 5 consecutive days of the December 2026 comprehensive exams.",
    [["", "Will the library stay open 24x7 during December compres?", 38]]],

  // ---------- Politics ----------
  ["democratic-nominee-2028", "DEMNOM28", "Who will be the 2028 Democratic presidential nominee?", "Politics", "🗳️", "2028-05-20",
    "The Democratic Party's nominee for the 2028 US presidential election.",
    "Resolves to the candidate formally nominated at the 2028 Democratic National Convention. If the convention occurs after market close, resolves to the presumptive nominee per major outlets.",
    [["NEWSOM", "Gavin Newsom", 31], ["SHAPIRO", "Josh Shapiro", 14], ["AOC", "Alexandria Ocasio-Cortez", 16], ["BUTTIGIEG", "Pete Buttigieg", 11], ["HARRIS", "Kamala Harris", 8], ["OTHER", "Someone else", 20]]],
  ["republican-nominee-2028", "GOPNOM28", "Who will be the 2028 Republican presidential nominee?", "Politics", "🐘", "2028-05-20",
    "The Republican Party's nominee for the 2028 US presidential election.",
    "Resolves to the candidate formally nominated at the 2028 Republican National Convention, or the presumptive nominee per major outlets at close.",
    [["VANCE", "JD Vance", 52], ["RUBIO", "Marco Rubio", 13], ["TRUMPJR", "Donald Trump Jr.", 9], ["DESANTIS", "Ron DeSantis", 7], ["OTHER", "Someone else", 19]]],
  ["modi-pm-through-2027", "MODI-PM27", "Will Narendra Modi remain Prime Minister through 2027?", "Politics", "🇮🇳", "2027-12-31",
    "Will Narendra Modi continuously hold the office of Prime Minister of India until December 31, 2027?",
    "Resolves YES if Narendra Modi is Prime Minister of India at 23:59 IST on Dec 31, 2027 without having left office in between.",
    [["", "Will Narendra Modi remain Prime Minister through 2027?", 91]]],

  // ---------- Economics ----------
  ["fed-decision-march-2027", "FED-MAR27", "Fed decision at the March 2027 FOMC meeting?", "Economics", "🏦", "2027-03-17",
    "What will the Federal Reserve do with the federal funds target range at its March 2027 meeting?",
    "Resolves based on the FOMC statement released at the conclusion of the March 2027 meeting. 'Cut' / 'Hike' means any change of 25bp or more.",
    [["CUT", "Cut", 34], ["HOLD", "Hold", 59], ["HIKE", "Hike", 7]]],
  ["india-gdp-fy27-above-7", "INDGDP-FY27", "Will India's FY2026-27 GDP growth exceed 7%?", "Economics", "📈", "2027-05-31",
    "Real GDP growth for fiscal year 2026-27 as per the provisional estimates released by MoSPI.",
    "Resolves YES if the first provisional estimate of real GDP growth for FY2026-27 published by MoSPI is strictly above 7.0%.",
    [["", "Will India's FY2026-27 GDP growth exceed 7%?", 44]]],
  ["rbi-cut-feb-2027", "RBI-FEB27", "Will the RBI cut the repo rate in February 2027?", "Economics", "💹", "2027-02-08",
    "The RBI Monetary Policy Committee meets in early February 2027.",
    "Resolves YES if the repo rate announced after the February 2027 MPC meeting is lower than before the meeting.",
    [["", "Will the RBI cut the repo rate in February 2027?", 29]]],
  ["usd-inr-above-92-jun-2027", "USDINR-JUN27", "Will USD/INR be above 92 on June 30, 2027?", "Economics", "💱", "2027-06-30",
    "The rupee-dollar reference rate at the end of June 2027.",
    "Resolves YES if the RBI/FBIL reference rate for USD/INR on June 30, 2027 (or the last business day before) is above 92.00.",
    [["", "Will USD/INR be above 92 on June 30, 2027?", 41]]],

  // ---------- Crypto ----------
  ["btc-150k-2027", "BTC-150K-27", "Will Bitcoin trade above $150k before the end of 2027?", "Crypto", "₿", "2027-12-31",
    "Will BTC touch $150,000 at any point before 2028?",
    "Resolves YES if the Coinbase BTC-USD price trades at or above $150,000.00 at any time before 23:59 UTC Dec 31, 2027.",
    [["", "Will Bitcoin trade above $150k before the end of 2027?", 37]]],
  ["eth-10k-2027", "ETH-10K-27", "Will Ethereum hit $10,000 in 2027?", "Crypto", "Ξ", "2027-12-31",
    "Will ETH reach a five-figure price during calendar year 2027?",
    "Resolves YES if Coinbase ETH-USD trades at or above $10,000 at any time during 2027 (UTC).",
    [["", "Will Ethereum hit $10,000 in 2027?", 18]]],

  // ---------- Tech ----------
  ["largest-company-end-2027", "MCAP-END27", "Which company will be the largest by market cap at the end of 2027?", "Tech", "🏢", "2027-12-31",
    "The world's most valuable publicly traded company at the close of 2027.",
    "Resolves to the company with the highest market capitalization at the close of the final US trading session of 2027, per companiesmarketcap.com or equivalent.",
    [["NVDA", "Nvidia", 46], ["MSFT", "Microsoft", 19], ["AAPL", "Apple", 15], ["GOOGL", "Alphabet", 13], ["AMZN", "Amazon", 4], ["OTHER", "Other", 3]]],
  ["gpt-6-before-july-2027", "GPT6-JUL27", "Will OpenAI release GPT-6 before July 2027?", "Tech", "🤖", "2027-07-01",
    "Will a model officially named GPT-6 be publicly available before July 1, 2027?",
    "Resolves YES if OpenAI makes a model explicitly branded 'GPT-6' generally available (API or ChatGPT) before July 1, 2027. Previews limited to select testers do not count.",
    [["", "Will OpenAI release GPT-6 before July 2027?", 33]]],
  ["foldable-iphone-2027", "IPHONEFOLD-27", "Will Apple ship a foldable iPhone in 2027?", "Tech", "📱", "2027-12-31",
    "Rumours of a foldable iPhone have circulated for years.",
    "Resolves YES if Apple begins retail sales of a foldable-display iPhone anywhere in the world during 2027.",
    [["", "Will Apple ship a foldable iPhone in 2027?", 47]]],

  // ---------- Sports ----------
  ["ipl-2027-winner", "IPL27", "Who will win IPL 2027?", "Sports", "🏏", "2027-05-31",
    "The 2027 edition of the Indian Premier League.",
    "Resolves to the team that wins the IPL 2027 final. If the season is abandoned with no champion, all markets resolve NO.",
    [["CSK", "Chennai Super Kings", 15], ["MI", "Mumbai Indians", 17], ["RCB", "Royal Challengers Bengaluru", 18], ["KKR", "Kolkata Knight Riders", 12], ["GT", "Gujarat Titans", 11], ["OTHER", "Another team", 27]]],
  ["india-odi-world-cup-2027", "ODIWC27-IND", "Will India win the 2027 ICC ODI World Cup?", "Sports", "🏆", "2027-11-30",
    "The 2027 Men's Cricket World Cup is hosted in South Africa, Zimbabwe and Namibia.",
    "Resolves YES if India wins the final of the 2027 ICC Men's Cricket World Cup.",
    [["", "Will India win the 2027 ICC ODI World Cup?", 27]]],
  ["neeraj-90m-2027", "NEERAJ90-27", "Will Neeraj Chopra throw 90m+ in 2027?", "Sports", "🥇", "2027-12-31",
    "Will India's javelin star record a 90-metre-plus throw in an official competition during 2027?",
    "Resolves YES if World Athletics records a legal throw of 90.00m or more by Neeraj Chopra in any sanctioned competition in 2027.",
    [["", "Will Neeraj Chopra throw 90m+ in 2027?", 52]]],

  // ---------- Culture ----------
  ["best-picture-2027-studio", "OSCARS27-BP", "Which studio's film will win Best Picture at the 2027 Oscars?", "Culture", "🎬", "2027-03-14",
    "The 99th Academy Awards ceremony is expected in March 2027.",
    "Resolves to the studio/distributor credited with the US release of the Best Picture winner at the 99th Academy Awards.",
    [["A24", "A24", 19], ["NEON", "Neon", 16], ["WB", "Warner Bros.", 18], ["UNI", "Universal / Focus", 17], ["NFLX", "Netflix", 12], ["OTHER", "Other", 18]]],
  ["avengers-secret-wars-2b", "SECRETWARS-2B", "Will Avengers: Secret Wars gross $2B worldwide?", "Culture", "🦸", "2028-03-31",
    "Marvel's Avengers: Secret Wars is slated for a late-2027 release.",
    "Resolves YES if Box Office Mojo reports a worldwide gross of at least $2,000,000,000 before market close. Resolves NO if the film is not released before close.",
    [["", "Will Avengers: Secret Wars gross $2B worldwide?", 35]]],

  // ---------- Climate ----------
  ["pilani-48c-may-2027", "PILANI48-MAY27", "Will Pilani hit 48°C in May 2027?", "Climate", "🔥", "2027-05-31",
    "Pilani summers are brutal. Will the mercury touch 48°C in May 2027?",
    "Resolves YES if IMD records a maximum temperature of 48.0°C or higher at the Pilani station on any day in May 2027.",
    [["", "Will Pilani hit 48°C in May 2027?", 34]]],
  ["hottest-year-2027", "HOTTEST-2027", "Will 2027 be the hottest year on record?", "Climate", "🌡️", "2028-01-31",
    "Global mean surface temperature for calendar year 2027.",
    "Resolves YES if NASA GISTEMP ranks 2027 as the warmest year in its record in its annual release.",
    [["", "Will 2027 be the hottest year on record?", 31]]],
  ["monsoon-2027-above-normal", "MONSOON27", "Will the 2027 monsoon be above normal?", "Climate", "🌧️", "2027-09-30",
    "India's southwest monsoon season, June to September 2027.",
    "Resolves YES if IMD's end-of-season statement classifies 2027 all-India monsoon rainfall as 'above normal' or 'excess' (≥105% of LPA).",
    [["", "Will the 2027 monsoon be above normal?", 39]]],
];

// ---------- helpers ----------
const q = (s) => (s === null || s === undefined ? "NULL" : typeof s === "number" ? String(s) : `'${String(s).replace(/'/g, "''")}'`);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function gauss() {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}
const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const uuid = () => crypto.randomUUID();

const out = [];
function insertChunked(table, cols, rows, size = 100) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    out.push(`INSERT INTO ${table} (${cols.join(", ")}) VALUES\n${chunk.map((r) => `(${r.map(q).join(", ")})`).join(",\n")};`);
  }
}

// ---------- cleanup ----------
const slugList = EVENTS.map((e) => q(e[0])).join(", ");
const tickersOf = `(SELECT ticker FROM markets WHERE event_slug IN (${slugList}))`;
out.push(`-- Generated by scripts/gen-seed.mjs at ${new Date(NOW).toISOString()}`);
out.push(`DELETE FROM comments WHERE event_slug IN (${slugList});`);
out.push(`DELETE FROM settlements WHERE ticker IN ${tickersOf};`);
out.push(`DELETE FROM positions WHERE ticker IN ${tickersOf};`);
out.push(`DELETE FROM orders WHERE ticker IN ${tickersOf};`);
out.push(`DELETE FROM trades WHERE ticker IN ${tickersOf};`);
out.push(`DELETE FROM price_history WHERE ticker IN ${tickersOf};`);
out.push(`DELETE FROM markets WHERE event_slug IN (${slugList});`);
out.push(`DELETE FROM events WHERE slug IN (${slugList});`);

// ---------- bot users ----------
out.push(
  `INSERT INTO users (id, email, name, avatar_url, balance, volume, is_bot, is_admin, created_at) VALUES
(${q(BOT_MM)}, 'bot@system', 'Market Maker', NULL, ${BOT_BALANCE}, 0, 1, 0, ${NOW - 40 * DAY}),
(${q(BOT_FLOW)}, 'flow@system', 'Flow Trader', NULL, ${BOT_BALANCE}, 0, 1, 0, ${NOW - 40 * DAY})
ON CONFLICT(id) DO UPDATE SET is_bot = 1, name = excluded.name;`,
);
out.push(`INSERT OR IGNORE INTO meta (key, value) VALUES ('bot_last_run', '0');`);

// ---------- events / markets / history / ladders / trades ----------
const eventRows = [];
const marketRows = [];
const historyRows = [];
const orderRows = [];
const tradeRows = [];

EVENTS.forEach(([slug, prefix, title, category, icon, close, description, rules, markets], ei) => {
  const closeTime = t(close);
  if (closeTime < NOW + 6 * DAY) console.warn(`warning: ${slug} closes in < 6 days`);
  const createdAt = NOW - (31 + ei) * DAY;
  const me = markets.length > 1 ? 1 : 0;
  eventRows.push([slug, title, category, description, rules, icon, null, closeTime, me, createdAt]);

  markets.forEach(([code, mtitle, fair], mi) => {
    const ticker = code ? `${prefix}-${code}` : prefix;
    const f = clamp(fair + gauss() * 1.5, 2, 98);
    const last = Math.round(f);

    // Brownian bridge from a start value to the current fair over 30 days, a point every 2h.
    const N = 360;
    const start = clamp(f + (Math.random() - 0.5) * 30, 3, 97);
    const w = [0];
    for (let i = 1; i <= N; i++) w.push(w[i - 1] + gauss() * 1.3);
    for (let i = 0; i <= N; i++) {
      const x = start + ((f - start) * i) / N + (w[i] - (w[N] * i) / N);
      historyRows.push([ticker, NOW - 30 * DAY + i * 2 * HOUR, clamp(Math.round(x), 1, 99)]);
    }

    const volume = randInt(20, 400) * (me ? 120 : 300) + randInt(0, 999);
    const oi = Math.round(volume * (0.25 + Math.random() * 0.35));
    marketRows.push([ticker, slug, mtitle, null, mi, "open", last, f, volume, oi, closeTime, createdAt, NOW - 4 * HOUR, NOW]);

    // Recent synthetic bot-vs-bot trades (so volume24h is non-zero). Excluded from /api/activity.
    const nT = randInt(3, 9);
    for (let k = 0; k < nT; k++) {
      const yes = clamp(Math.round(f + gauss() * 1.2), 1, 99);
      tradeRows.push([uuid(), ticker, yes, randInt(1, 40), Math.random() < 0.5 ? "yes" : "no", "mint", BOT_FLOW, BOT_MM, null, null, 1, NOW - Math.floor(Math.random() * 23 * HOUR)]);
    }

    // Initial market-maker ladder (same shape as the live bot): buy YES below fair, buy NO above.
    const spread = 1 + (hash(ticker) % 3);
    const bid0 = Math.floor(f - spread / 2);
    const ask0 = Math.max(bid0 + 1, Math.ceil(f + spread / 2));
    for (let i = 0; i < 4; i++) {
      const b = bid0 - i;
      const a = ask0 + i;
      if (b >= 1 && b <= 98) {
        const size = Math.min(400, randInt(20, 60) * (i + 1) + randInt(0, 40));
        orderRows.push([uuid(), BOT_MM, ticker, "yes", "buy", "limit", b, b, "bid", size, size, 0, "open", NOW - 60_000]);
      }
      if (a >= 2 && a <= 99) {
        const size = Math.min(400, randInt(20, 60) * (i + 1) + randInt(0, 40));
        orderRows.push([uuid(), BOT_MM, ticker, "no", "buy", "limit", 100 - a, a, "ask", size, size, 0, "open", NOW - 60_000]);
      }
    }
  });
});

insertChunked("events", ["slug", "title", "category", "description", "rules", "icon", "image_url", "close_time", "mutually_exclusive", "created_at"], eventRows, 20);
insertChunked("markets", ["ticker", "event_slug", "title", "subtitle", "sort_order", "status", "last_price", "fair_price", "volume", "open_interest", "close_time", "created_at", "bot_at", "last_point_at"], marketRows, 50);
insertChunked("price_history", ["ticker", "t", "p"], historyRows, 100);
insertChunked("orders", ["id", "user_id", "ticker", "side", "action", "type", "price", "yes_price", "book_side", "count", "remaining", "filled", "status", "created_at"], orderRows, 50);
insertChunked("trades", ["id", "ticker", "yes_price", "qty", "taker_side", "kind", "taker_user_id", "maker_user_id", "taker_order_id", "maker_order_id", "both_bots", "created_at"], tradeRows, 50);

// Bot cash = starting pot minus everything reserved in its open buy orders (keeps cash conservation sane).
out.push(
  `UPDATE users SET balance = ${BOT_BALANCE} - (SELECT COALESCE(SUM(remaining * price), 0) FROM orders WHERE user_id = ${q(BOT_MM)} AND status = 'open' AND action = 'buy') WHERE id = ${q(BOT_MM)};`,
);

mkdirSync(join(root, "seed"), { recursive: true });
writeFileSync(join(root, "seed", "seed.sql"), out.join("\n") + "\n", "utf8");
const nMarkets = marketRows.length;
console.log(`seed/seed.sql: ${eventRows.length} events, ${nMarkets} markets, ${historyRows.length} price points, ${orderRows.length} bot orders, ${tradeRows.length} trades`);
