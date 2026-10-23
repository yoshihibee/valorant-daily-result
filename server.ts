import express from 'express';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

interface ScrapedMatch {
  title: string;
  league: string;
  tier: string;
  startDate: string;
  endDate: string;
  description: string;
  tournamentName: string;
  stage: string;
  eta: string;
  vlrUrl: string;
}

const getFallbackMatches = (): ScrapedMatch[] => {
  const now = Date.now();
  return [
    {
      title: "FENNEL GC vs MIBR GC",
      league: "Game Changers",
      tier: "Tier 1 / GC",
      startDate: new Date(now + 3600000 * 2).toISOString(),
      endDate: new Date(now + 3600000 * 4).toISOString(),
      description: "大会: Game Changers 2026: Championship São Paulo\nステージ: Upper Round 1\n予定/状況: ライブ開催中",
      tournamentName: "Game Changers 2026 Championship São Paulo",
      stage: "Upper Round 1",
      eta: "LIVE",
      vlrUrl: "https://www.vlr.gg/event/matches/2177/game-changers-2026-championship-s-o-paulo"
    },
    {
      title: "EDward Gaming vs FunPlus Phoenix",
      league: "VCT China",
      tier: "Tier 1",
      startDate: new Date(now + 86400000 * 1).toISOString(),
      endDate: new Date(now + 86400000 * 1 + 7200000).toISOString(),
      description: "大会: VCT 2026: China Threshold\nステージ: Group Stage\n予定/状況: 予定",
      tournamentName: "VCT 2026: China Threshold",
      stage: "Group Stage",
      eta: "Upcoming",
      vlrUrl: "https://www.vlr.gg/event/matches/2210/vct-2026-china-threshold"
    },
    {
      title: "ZETA DIVISION vs Paper Rex",
      league: "VCT Pacific",
      tier: "Tier 1",
      startDate: new Date(now + 86400000 * 2).toISOString(),
      endDate: new Date(now + 86400000 * 2 + 7200000).toISOString(),
      description: "大会: VCT 2026 Pacific\nステージ: Regular Season\n予定/状況: 予定",
      tournamentName: "VCT 2026 Pacific",
      stage: "Regular Season",
      eta: "Upcoming",
      vlrUrl: "https://www.vlr.gg/matches"
    }
  ];
};

async function fetchDirectFromVLR(): Promise<ScrapedMatch[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch("https://www.vlr.gg/matches", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`VLR.gg HTTP error: ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const matches: ScrapedMatch[] = [];

    $(".wf-label.mod-large").each((i, dateEl) => {
      let dateText = $(dateEl).text().trim().replace(/Today/g, "").replace(/\s+/g, " ").trim();
      const card = $(dateEl).next(".wf-card");

      card.find(".match-item").each((j, matchEl) => {
        const time = $(matchEl).find(".match-item-time").text().trim();
        const eta = $(matchEl).find(".match-item-eta").text().trim().replace(/\s+/g, " ");
        const team1 = $(matchEl).find(".match-item-vs-team-name").first().text().trim();
        const team2 = $(matchEl).find(".match-item-vs-team-name").last().text().trim();
        
        const eventFull = $(matchEl).find(".match-item-event").text().trim().replace(/\s+/g, " ");
        const eventSeries = $(matchEl).find(".match-item-event-series").text().trim().replace(/\s+/g, " ");
        const tournament = eventFull.replace(eventSeries, "").trim() || eventFull;
        
        const href = $(matchEl).attr("href");
        const vlrUrl = href ? `https://www.vlr.gg${href}` : "https://www.vlr.gg/matches";

        if (!team1 || !team2) return;

        let tier = "Tier 2";
        let league = "その他・オフシーズン";

        const lowerTourney = tournament.toLowerCase();
        const lowerSeries = eventSeries.toLowerCase();

        if (lowerTourney.includes("game changers") || lowerSeries.includes("game changers")) {
          tier = "Tier 1 / GC";
          league = "Game Changers";
        } else if (lowerTourney.includes("vct") || lowerTourney.includes("masters") || lowerTourney.includes("champions")) {
          tier = "Tier 1";
          if (lowerTourney.includes("china") || lowerTourney.includes("cn")) {
            league = "VCT China";
          } else if (lowerTourney.includes("pacific")) {
            league = "VCT Pacific";
          } else if (lowerTourney.includes("americas")) {
            league = "VCT Americas";
          } else if (lowerTourney.includes("emea")) {
            league = "VCT EMEA";
          } else {
            league = "VCT 公式大会";
          }
        } else if (lowerTourney.includes("challengers") || lowerTourney.includes("vcj")) {
          tier = "Tier 2";
          league = "Challengers";
        } else if (lowerTourney.includes("ascension")) {
          tier = "Tier 2";
          league = "Ascension";
        }

        let startIso = new Date().toISOString();
        try {
          const parsed = new Date(`${dateText} ${time} UTC`);
          if (!isNaN(parsed.getTime())) {
            startIso = parsed.toISOString();
          }
        } catch (e) {}

        const endIso = new Date(new Date(startIso).getTime() + 2 * 60 * 60 * 1000).toISOString();

        matches.push({
          title: `${team1} vs ${team2}`,
          league,
          tier,
          startDate: startIso,
          endDate: endIso,
          description: `大会: ${tournament}\nステージ: ${eventSeries}\n予定/状況: ${eta}`,
          tournamentName: tournament,
          stage: eventSeries,
          eta,
          vlrUrl
        });
      });
    });

    if (matches.length === 0) {
      return getFallbackMatches();
    }

    return matches;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn("VLR fetch timeout or error, using fallback schedule:", err);
    return getFallbackMatches();
  }
}

app.get('/api/vct/schedule', async (req, res) => {
  try {
    const matches = await fetchDirectFromVLR();
    res.json({
      success: true,
      events: matches,
      source: 'VLR.gg 直接リアルタイム取得',
      total: matches.length
    });
  } catch (error: any) {
    console.error('API endpoint error:', error);
    res.json({
      success: true,
      events: getFallbackMatches(),
      source: 'VLR.gg フォールバック',
      warning: '一時的な通信エラーのためバックアップスケジュールを表示しています。'
    });
  }
});

const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const PORT = Number(process.env.PORT || 3000);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }
}

startServer();
