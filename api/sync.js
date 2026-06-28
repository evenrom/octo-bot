import { db } from '../lib/db.js';

const THE_ODDS_API_KEY = process.env.THE_ODDS_API_KEY;
const ODDS_API_HOST = 'api.the-odds-api.com';
const SPORT = 'soccer_fifa_world_cup';

const commonNameToCode = {
    'Brazil': 'BRA', 'Argentina': 'ARG', 'Morocco': 'MAR', 'Haiti': 'HTI',
    'France': 'FRA', 'Germany': 'GER', 'Netherlands': 'NED', 'Portugal': 'POR',
    'Spain': 'ESP', 'England': 'ENG', 'United States': 'USA', 'USA': 'USA',
    'Belgium': 'BEL', 'Croatia': 'CRO', 'Denmark': 'DEN', 'Switzerland': 'SUI',
    'Sweden': 'SWE', 'Norway': 'NOR', 'Italy': 'ITA', 'Poland': 'POL',
    'Mexico': 'MEX', 'Canada': 'CAN', 'Japan': 'JPN', 'South Korea': 'KOR',
    'Korea': 'KOR', 'Australia': 'AUS', 'Saudi Arabia': 'KSA', 'Iran': 'IRN',
    'Ecuador': 'ECU', 'Peru': 'PER', 'Uruguay': 'URU', 'Colombia': 'COL',
    'Senegal': 'SEN', 'Tunisia': 'TUN', 'Egypt': 'EGY', 'Ghana': 'GHA',
    'Nigeria': 'NGA', 'Cameroon': 'CMR', 'Serbia': 'SRB', 'Qatar': 'QAT',
    'Bosnia & Herzegovina': 'BIH', 'Bosnia': 'BIH', 'Czech Republic': 'CZE', 'South Africa': 'RSA',
    'Austria': 'AUT', 'Jordan': 'JOR', 'Algeria': 'ALG', 'Iraq': 'IRQ', 'New Zealand': 'NZL',
    'Cape Verde': 'CPV', 'Ivory Coast': 'CIV', 'Curaçao': 'CUW', 'Curacao': 'CUW', 'Turkey': 'TUR',
    'Scotland': 'SCO', 'Paraguay': 'PAR', 'DR Congo': 'COD', 'Panama': 'PAN', 'Uzbekistan': 'UZB'
};

const toThreeLetter = (name) => {
    if (!name) return 'TBD';
    if (commonNameToCode[name]) return commonNameToCode[name];
    const cleaned = name.replace(/[^A-Za-z ]/g, '').trim();
    if (commonNameToCode[cleaned]) return commonNameToCode[cleaned];
    return cleaned.slice(0, 3).toUpperCase();
};

// פונקציית עזר לחילוץ הקישור מתוצאות החיפוש
const extractTargetUrl = (searchText, domainKey) => {
    const regex = new RegExp(`https?://[^\\s\\)]*${domainKey}[^\\s\\)]*`, 'i');
    const match = searchText.match(regex);
    if (match) {
        let foundUrl = match[0];
        if (foundUrl.includes('uddg=')) {
            const cleanUrl = foundUrl.split('uddg=')[1]?.split('&')[0];
            if (cleanUrl) return decodeURIComponent(cleanUrl);
        }
        return foundUrl;
    }
    return null;
};

// מנגנון פנימי לגירוד אוטומטי של התחזית מ-Sports Mole
const scrapeSportsMolePrediction = async (homeTeam, awayTeam) => {
    try {
        const searchQuery = `${homeTeam} vs ${awayTeam} World Cup 2026 Sports Mole preview prediction`;
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
        
        const searchResponse = await fetch(`https://r.jina.ai/${searchUrl}`);
        if (!searchResponse.ok) return null;
        
        const searchText = await searchResponse.text();
        const targetUrl = extractTargetUrl(searchText, "sportsmole.co.uk");
        
        if (targetUrl) {
            const pageResponse = await fetch(`https://r.jina.ai/${targetUrl}`);
            if (pageResponse.ok) {
                const pageText = await pageResponse.text();
                const matchPrediction = pageText.match(/We say:[^\n]+/i);
                return matchPrediction ? matchPrediction[0].trim() : null;
            }
        }
    } catch (e) {
        console.error(`Error scraping prediction for ${homeTeam} vs ${awayTeam}:`, e);
    }
    return null;
};

// משיכת תוצאות מ-3 הימים האחרונים (חוקי וחינמי)
const fetchAllowedHistoricalMatches = async () => {
    const url = `https://${ODDS_API_HOST}/v4/sports/${SPORT}/scores/?apiKey=${THE_ODDS_API_KEY}&daysFrom=3`;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data.filter(m => m.completed === true && Array.isArray(m.scores)) : [];
    } catch { return []; }
};

const extractScores = (match) => {
    if (!match.scores || match.scores.length < 2) return null;
    const home = match.scores.find(s => s.name === match.home_team);
    const away = match.scores.find(s => s.name === match.away_team);
    return home && away && home.score !== null && away.score !== null ? { homeScore: Number(home.score), awayScore: Number(away.score) } : null;
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        if (!THE_ODDS_API_KEY) throw new Error("API key missing.");

        // 1. הקלטת משחקים אוטומטית מ-3 הימים האחרונים לתוך Results
        const recentMatches = await fetchAllowedHistoricalMatches();
        for (const match of recentMatches) {
            const scores = extractScores(match);
            if (scores) {
                const matchId = `${match.home_team}_vs_${match.away_team}`;
                await db.execute({
                    sql: `INSERT OR REPLACE INTO Results (match_id, home_score, away_score, accuracy_points) VALUES (?, ?, ?, 1)`,
                    args: [matchId, scores.homeScore, scores.awayScore]
                });
            }
        }

        // 2. משיכת 6 המשחקים הבאים
        const oddsResponse = await fetch(`https://${ODDS_API_HOST}/v4/sports/${SPORT}/odds/?apiKey=${THE_ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=decimal`);
        const allMatches = await oddsResponse.json();
        const upcomingMatches = allMatches.slice(0, 6);

        // 3. שליפת כל היסטוריית הטורניר שנצברה מקומית ב-DB
        const localHistory = await db.execute("SELECT match_id, home_score, away_score FROM Results");
        const dbRows = localHistory.rows || [];

        const predictions = [];

        // רצים על המשחקים ומחלצים נתונים כולל גירוד הכתבות
        for (const match of upcomingMatches) {
            const bookmaker = match.bookmakers?.find(b => b.markets?.some(m => m.key === 'h2h'));
            const h2hMarket = bookmaker?.markets.find(m => m.key === 'h2h');
            const outcomes = h2hMarket?.outcomes || [];

            const homeOdds = Number(outcomes.find(o => o.name === match.home_team)?.price) || 2.0;
            const awayOdds = Number(outcomes.find(o => o.name === match.away_team)?.price) || 2.0;
            const drawOdds = Number(outcomes.find(o => o.name === 'Draw')?.price) || 2.0;

            const sumRaw = (1/homeOdds) + (1/awayOdds) + (1/drawOdds);
            const home_prob = Math.round(((1/homeOdds) / sumRaw) * 100);
            const away_prob = Math.round(((1/awayOdds) / sumRaw) * 100);
            const draw_prob = 100 - home_prob - away_prob;

            const buildForm = (teamName) => {
                const teamCode = toThreeLetter(teamName);
                const matches = [];
                for (const row of dbRows) {
                    const parts = row.match_id.split('_vs_');
                    if (parts.length !== 2) continue;
                    const hCode = toThreeLetter(parts[0]);
                    const aCode = toThreeLetter(parts[1]);

                    if (hCode !== teamCode && aCode !== teamCode) continue;

                    const hScore = Number(row.home_score);
                    const aScore = Number(row.away_score);
                    const summary = `${hCode} ${hScore}-${aScore} ${aCode}`;

                    if (hCode === teamCode) {
                        matches.push({ summary, outcome: hScore > aScore ? 'W' : (hScore < aScore ? 'L' : 'D') });
                    } else {
                        matches.push({ summary, outcome: aScore > hScore ? 'W' : (aScore < hScore ? 'L' : 'D') });
                    }
                }
                return matches.length > 0 ? matches.slice(-3) : [{ summary: 'No matches', outcome: '' }];
            };

            // גירוד דינמי מ-Sports Mole למשחק הספציפי הנוכחי בלופ
            const smPrediction = await scrapeSportsMolePrediction(match.home_team, match.away_team);

            predictions.push({
                match_title: `${match.home_team} vs ${match.away_team}`,
                home_prob, draw_prob, away_prob,
                kickoff_time: match.commence_time,
                home_form: JSON.stringify(buildForm(match.home_team)),
                away_form: JSON.stringify(buildForm(match.away_team)),
                sportsmole_prediction: smPrediction || "No preview found"
            });
        }

        // 4. עדכון טבלת התחזיות בבסיס הנתונים
        await db.execute('DELETE FROM Predictions');
        const insertStatements = predictions.map(p => ({
            sql: `INSERT INTO Predictions (match_title, home_prob, draw_prob, away_prob, kickoff_time, home_form, away_form, sportsmole_prediction) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [p.match_title, p.home_prob, p.draw_prob, p.away_prob, p.kickoff_time, p.home_form, p.away_form, p.sportsmole_prediction]
        }));
        await db.batch(insertStatements);

        res.status(200).json({ success: true, message: "Synced perfectly with dynamic Sports Mole analytics." });
    } catch (error) {
        console.error("Sync error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}