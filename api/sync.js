import { db } from '../lib/db.js';

const THE_ODDS_API_KEY = process.env.THE_ODDS_API_KEY;
const ODDS_API_HOST = 'api.the-odds-api.com';
const SPORT = 'soccer_fifa_world_cup';

// מילון קיצורי המדינות הרשמי והמורחב - מונע התנגשויות ותומך בכולן
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
    // תוספות קריטיות למניעת באגים והתנגשויות:
    'Austria': 'AUT', // מונע התנגשות עם אוסטרליה!
    'Jordan': 'JOR',
    'Algeria': 'ALG',
    'Iraq': 'IRQ',
    'New Zealand': 'NZL',
    'Cape Verde': 'CPV',
    'Ivory Coast': 'CIV',
    'Curaçao': 'CUW', 'Curacao': 'CUW',
    'Turkey': 'TUR',
    'Scotland': 'SCO',
    'Paraguay': 'PAR',
    'DR Congo': 'COD',
    'Panama': 'PAN',
    'Uzbekistan': 'UZB'
};

const toThreeLetter = (name) => {
    if (!name) return 'TBD';
    if (commonNameToCode[name]) return commonNameToCode[name];
    const cleaned = name.replace(/[^A-Za-z ]/g, '').trim();
    if (commonNameToCode[cleaned]) return commonNameToCode[cleaned];
    return cleaned.slice(0, 3).toUpperCase();
};

// בוטסטראפ: משחקי תחילת הטורניר (11.6 עד 14.6) כדי שהטבלה לא תהיה ריקה אף פעם
const bootstrapMatches = [
    { home: "Switzerland", away: "Bosnia & Herzegovina", homeScore: 4, awayScore: 1 },
    { home: "Czech Republic", away: "South Africa", homeScore: 1, awayScore: 1 },
    { home: "Mexico", away: "South Korea", homeScore: 1, awayScore: 0 },
    { home: "Canada", away: "Qatar", homeScore: 6, awayScore: 0 },
    { home: "United States", away: "Australia", homeScore: 2, away_score: 0 },
    { home: "Scotland", away: "Morocco", homeScore: 0, awayScore: 1 },
    { home: "Brazil", away: "Haiti", homeScore: 3, awayScore: 0 },
    { home: "Switzerland", away: "Qatar", homeScore: 1, awayScore: 1 },
    { home: "Canada", away: "Bosnia & Herzegovina", homeScore: 1, awayScore: 1 }
];

// משיכת תוצאות מ-3 הימים האחרונים בלבד (המקסימום המותר בחינם!)
const fetchAllowedHistoricalMatches = async () => {
    const url = `https://${ODDS_API_HOST}/v4/sports/${SPORT}/scores/?apiKey=${THE_ODDS_API_KEY}&daysFrom=3`;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data.filter(m => m.completed === true && Array.isArray(m.scores)) : [];
    } catch (error) {
        return [];
    }
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

        // 1. הגנת ריקון והזרקת נתוני ההתחלה לטבלת Results במידה והיא ריקה
        const checkResults = await db.execute("SELECT COUNT(*) as count FROM Results");
        if ((checkResults.rows[0]?.count || 0) === 0) {
            const seedStatements = bootstrapMatches.map(m => ({
                sql: `INSERT INTO Results (match_id, home_score, away_score, accuracy_points) VALUES (?, ?, ?, 1)`,
                args: [`${m.home}_vs_${m.away}`, m.homeScore, m.awayScore]
            }));
            await db.batch(seedStatements);
        }

        // 2. הקלטת משחקים חדשים מה-API (3 ימים אחרונים) ישירות לתוך טבלת Results
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

        // 3. משיכת 6 המשחקים הבאים (Upcoming)
        const oddsResponse = await fetch(`https://${ODDS_API_HOST}/v4/sports/${SPORT}/odds/?apiKey=${THE_ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=decimal`);
        const allMatches = await oddsResponse.json();
        const upcomingMatches = allMatches.slice(0, 6);

        // 4. שליפת כל היסטוריית הטורניר שנצברה מקומית ב-DB
        const localHistory = await db.execute("SELECT match_id, home_score, away_score FROM Results");
        const dbRows = localHistory.rows || [];

        const predictions = [];

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

            // פונקציית סינון מקומית שבונה את ה-Form מתוך ה-DB המצטבר
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

            predictions.push({
                match_title: `${match.home_team} vs ${match.away_team}`,
                home_prob, draw_prob, away_prob,
                kickoff_time: match.commence_time,
                home_form: JSON.stringify(buildForm(match.home_team)),
                away_form: JSON.stringify(buildForm(match.away_team))
            });
        }

        // 5. עדכון טבלת התחזיות למסך
        await db.execute('DELETE FROM Predictions');
        const insertStatements = predictions.map(p => ({
            sql: `INSERT INTO Predictions (match_title, home_prob, draw_prob, away_prob, kickoff_time, home_form, away_form) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [p.match_title, p.home_prob, p.draw_prob, p.away_prob, p.kickoff_time, p.home_form, p.away_form]
        }));
        await db.batch(insertStatements);

        res.status(200).json({ success: true, message: "Successfully synced via safe 3-day window & DB recorder." });
    } catch (error) {
        console.error("Sync error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}