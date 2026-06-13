import { db } from '../lib/db.js';

// פנייה למשתנה כפי שהוא מוגדר אצלך ב-Vercel
const ODDS_API_KEY = process.env.THE_ODDS_API_KEY; 
const ODDS_API_HOST = 'api.the-odds-api.com';
const SPORT = 'soccer_fifa_world_cup'; // הליגה של המונדיאל!

// --- פונקציות עזר: מתמטיקה ופואסון ---
function factorial(n) {
  if (n === 0 || n === 1) return 1;
  return n * factorial(n - 1);
}

function poisson(k, lambda) {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function calculateExactScores(homeProb, awayProb) {
  // המרת אחוזים לתוחלת שערים משוערת (Lambda)
  const homeLambda = (homeProb / 100) * 2.5; 
  const awayLambda = (awayProb / 100) * 2.5;

  let scores = [];
  // סריקת תוצאות מ-0:0 ועד 4:4
  for (let h = 0; h <= 4; h++) {
    for (let a = 0; a <= 4; a++) {
      const probability = poisson(h, homeLambda) * poisson(a, awayLambda);
      scores.push({ score: `${h}-${a}`, prob: probability });
    }
  }

  // מיון ובחירת 2 התוצאות המובילות
  scores.sort((a, b) => b.prob - a.prob);
  return [scores[0].score, scores[1].score];
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        if (!ODDS_API_KEY) {
            throw new Error("Odds API key is missing. Check your Vercel settings.");
        }

        // 1. Fetch upcoming matches and odds
        const oddsResponse = await fetch(
            `https://${ODDS_API_HOST}/v4/sports/${SPORT}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h`
        );

        if (!oddsResponse.ok) {
            const errData = await oddsResponse.text();
            throw new Error(`Odds API Unauthorized or Error: ${errData}`);
        }

        const matches = await oddsResponse.json();
        
        // ניקח רק את 4 המשחקים הקרובים ביותר שיש להם יחסים
        const upcomingMatches = matches.filter(m => m.bookmakers && m.bookmakers.length > 0).slice(0, 6);

        if (upcomingMatches.length === 0) {
             throw new Error("No upcoming World Cup matches with odds found.");
        }

        // 2. ניקוי הטבלה הישנה כדי לשמור רק את המשחקים החדשים
        await db.execute('DELETE FROM Predictions');

        const dbStatements = [];

        // 3. חישוב אלגוריתמי ושמירה
        for (const match of upcomingMatches) {
            const title = `${match.home_team} vs ${match.away_team}`;
            const bookmaker = match.bookmakers[0]; 
            const h2h = bookmaker.markets.find(m => m.key === 'h2h').outcomes;

            // חילוץ יחסים
            const homeOdds = h2h.find(o => o.name === match.home_team)?.price || 3.0;
            const awayOdds = h2h.find(o => o.name === match.away_team)?.price || 3.0;
            const drawOdds = h2h.find(o => o.name === 'Draw')?.price || 3.0;

            // המרה לאחוזים אמיתיים (ניקוי עמלות סוכן)
            const rawHome = 1 / homeOdds;
            const rawAway = 1 / awayOdds;
            const rawDraw = 1 / drawOdds;
            const totalMargin = rawHome + rawAway + rawDraw;

            const homeProb = Math.round((rawHome / totalMargin) * 100);
            const awayProb = Math.round((rawAway / totalMargin) * 100);
            const drawProb = Math.round((rawDraw / totalMargin) * 100);

            // חישוב פואסון לתוצאות מדויקות
            const [exact1, exact2] = calculateExactScores(homeProb, awayProb);

            dbStatements.push({
                sql: `INSERT INTO Predictions (match_title, home_prob, draw_prob, away_prob, exact_score_1, exact_score_2, kickoff_time) 
                      VALUES (?, ?, ?, ?, ?, ?, ?)`,
                args: [title, homeProb, drawProb, awayProb, exact1, exact2, match.commence_time]
            });
        }

        // 4. ביצוע השמירה
        await db.batch(dbStatements);

        res.status(200).json({ success: true, message: `Synced ${dbStatements.length} World Cup matches with Poisson logic.` });

    } catch (error) {
        console.error("Sync error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}