import { db } from '../lib/db.js';

const THE_ODDS_API_KEY = process.env.THE_ODDS_API_KEY;
const ODDS_API_HOST = 'api.the-odds-api.com';
const SPORT = 'soccer_fifa_world_cup';

// מילון קיצורי המדינות הרשמי
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

// פונקציה חכמה שמושכת את תוצאות האמת של הטורניר שבועיים אחורה
const fetchRealHistoricalMatches = async () => {
    // daysFrom=15 הולך שבועיים אחורה ותופס את כל הטורניר שהתחיל ב-11.6 בקשה חופשית מה-API
    const url = `https://${ODDS_API_HOST}/v4/sports/${SPORT}/scores/?apiKey=${THE_ODDS_API_KEY}&daysFrom=15`;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        if (!Array.isArray(data)) return [];
        
        // סינון משחקים שהסתיימו ויש להם תוצאה
        return data.filter(m => m.completed === true && Array.isArray(m.scores));
    } catch (error) {
        console.error("Error fetching history:", error);
        return [];
    }
};

// חילוץ תוצאות מובנה מה-API
const extractScores = (match) => {
    if (!match.scores || match.scores.length < 2) return null;
    const home = match.scores.find(s => s.name === match.home_team);
    const away = match.scores.find(s => s.name === match.away_team);
    if (home && away) {
        return { homeScore: Number(home.score), awayScore: Number(away.score) };
    }
    return null;
};

// ייצור פורם דינמי לחלוטין מנתוני האמת של ה-API
const generateFormFromResults = (teamName, historicalMatches) => {
    const teamCode = toThreeLetter(teamName);
    const teamMatches = [];

    for (const match of historicalMatches) {
        const homeCode = toThreeLetter(match.home_team);
        const awayCode = toThreeLetter(match.away_team);

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

    return teamMatches.length > 0 ? teamMatches.slice(-3) : [{ summary: 'No matches', outcome: '' }];
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        if (!THE_ODDS_API_KEY) throw new Error("API key missing.");

        // 1. משיכת 6 המשחקים הבאים
        const oddsResponse = await fetch(`https://${ODDS_API_HOST}/v4/sports/${SPORT}/odds/?apiKey=${THE_ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=decimal`);
        const allMatches = await oddsResponse.json();
        const upcomingMatches = allMatches.slice(0, 6);

        // 2. משיכת תוצאות אמת דינמיות מהשבועיים האחרונים (מה-11.6)
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

            // יצירת פורם אוטומטי - סורק את ההיסטוריה האמיתית שחזרה מה-API
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

        // 3. עדכון בסיס הנתונים
        await db.execute('DELETE FROM Predictions');
        const insertStatements = predictions.map(p => ({
            sql: `INSERT INTO Predictions (match_title, home_prob, draw_prob, away_prob, kickoff_time, home_form, away_form) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [p.match_title, p.home_prob, p.draw_prob, p.away_prob, p.kickoff_time, p.home_form, p.away_form]
        }));
        await db.batch(insertStatements);

        res.status(200).json({ success: true, message: "Synced completely using dynamic API data." });
    } catch (error) {
        console.error("Sync error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}