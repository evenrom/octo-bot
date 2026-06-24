import { db } from '../lib/db.js';

const THE_ODDS_API_KEY = process.env.THE_ODDS_API_KEY;
const ODDS_API_HOST = 'api.the-odds-api.com';
const SPORT = 'soccer_fifa_world_cup';

// מילון קיצורי המדינות הרשמי (תומך בכל 32 הנבחרות)
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
    'Bosnia & Herzegovina': 'BIH', 'Bosnia': 'BIH', 'Czech Republic': 'CZE', 'South Africa': 'RSA'
};

const toThreeLetter = (name) => {
    if (!name) return 'TBD';
    if (commonNameToCode[name]) return commonNameToCode[name];
    const cleaned = name.replace(/[^A-Za-z ]/g, '').trim();
    if (commonNameToCode[cleaned]) return commonNameToCode[cleaned];
    return cleaned.slice(0, 3).toUpperCase();
};

// פונקציה חכמה שמושכת את המשחקים שהסתיימו מה-API (עד 14 ימים אחורה)
const fetchRealHistoricalMatches = async () => {
    // שימוש ב-endpoint של ה-scores שמחזיר תוצאות אמת בחינם
    const url = `https://${ODDS_API_HOST}/v4/sports/${SPORT}/scores/?apiKey=${THE_ODDS_API_KEY}&daysFrom=14`;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        if (!Array.isArray(data)) return [];
        
        // מסננים רק משחקים שהסתיימו ויש להם מערך תוצאות רשמי
        return data.filter(m => m.completed === true && Array.isArray(m.scores) && m.scores.length >= 2);
    } catch (error) {
        console.error("Error fetching tournament history:", error);
        return [];
    }
};

// חילוץ תוצאות בטוח לפי שמות הקבוצות
const extractScores = (match) => {
    try {
        if (!match.scores || match.scores.length < 2) return null;
        const home = match.scores.find(s => s.name === match.home_team);
        const away = match.scores.find(s => s.name === match.away_team);
        if (home && away && home.score !== null && away.score !== null) {
            return { homeScore: Number(home.score), awayScore: Number(away.score) };
        }
    } catch (e) {
        console.error("Error parsing scores", e);
    }
    return null;
};

// ייצור פורם דינמי לחלוטין מתוך מערך ההיסטוריה הגלובלי של הטורניר
const generateFormFromResults = (teamName, historicalMatches) => {
    const teamCode = toThreeLetter(teamName);
    const teamMatches = [];

    for (const match of historicalMatches) {
        const homeCode = toThreeLetter(match.home_team);
        const awayCode = toThreeLetter(match.away_team);

        // בודקים אם הנבחרת הנוכחית השתתפה במשחק ההיסטורי הזה
        if (homeCode !== teamCode && awayCode !== teamCode) continue;

        const scores = extractScores(match);
        if (!scores) continue;

        const { homeScore, awayScore } = scores;
        const summary = `${homeCode} ${homeScore}-${awayScore} ${awayCode}`;

        if (homeCode === teamCode) {
            let outcome = homeScore > awayScore ? 'W' : (homeScore < awayScore ? 'L' : 'D');
            teamMatches.push({ summary, outcome });
        } else {
            let outcome = awayScore > homeScore ? 'W' : (awayScore < homeScore ? 'L' : 'D');
            teamMatches.push({ summary, outcome });
        }
    }

    // מחזיר את 3 המשחקים האחרונים של אותה נבחרת מתחילת הטורניר
    return teamMatches.length > 0 ? teamMatches.slice(-3) : [{ summary: 'No matches', outcome: '' }];
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        if (!THE_ODDS_API_KEY) throw new Error("API key missing.");

        // 1. משיכת 6 המשחקים הבאים (Upcoming) מ-The Odds API
        const oddsResponse = await fetch(`https://${ODDS_API_HOST}/v4/sports/${SPORT}/odds/?apiKey=${THE_ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=decimal`);
        const allMatches = await oddsResponse.json();
        const upcomingMatches = allMatches.slice(0, 6);

        // 2. משיכת כל תוצאות האמת של הטורניר בשבועיים האחרונים (דינמי ואוטומטי!)
        const historicalMatches = await fetchRealHistoricalMatches();

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

            // יצירת פורם אוטומטי מלא ללא שום הזנה ידנית
            const home_form = generateFormFromResults(match.home_team, historicalMatches);
            const away_form = generateFormFromResults(match.away_team, historicalMatches);

            predictions.push({
                match_title: `${match.home_team} vs ${match.away_team}`,
                home_prob, draw_prob, away_prob,
                kickoff_time: match.commence_time,
                home_form: JSON.stringify(home_form),
                away_form: JSON.stringify(away_form)
            });
        }

        // 3. מחיקת המידע הישן והכנסת התחזיות החדשות והפורם האמיתי ל-DB
        await db.execute('DELETE FROM Predictions');
        const insertStatements = predictions.map(p => ({
            sql: `INSERT INTO Predictions (match_title, home_prob, draw_prob, away_prob, kickoff_time, home_form, away_form) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [p.match_title, p.home_prob, p.draw_prob, p.away_prob, p.kickoff_time, p.home_form, p.away_form]
        }));
        await db.batch(insertStatements);

        res.status(200).json({ success: true, message: "Successfully synced using 100% automated real-time data." });
    } catch (error) {
        console.error("Sync error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}