import { db } from '../lib/db.js';

const THE_ODDS_API_KEY = process.env.THE_ODDS_API_KEY;
const ODDS_API_HOST = 'api.the-odds-api.com';
const SPORT = 'soccer_fifa_world_cup';

// Team name to 3-letter code mapping
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
    'Bosnia & Herzegovina': 'BIH', 'Bosnia Herzegovina': 'BIH',
    'Czech Republic': 'CZE', 'South Africa': 'ZAF', 'Scotland': 'SCO'
};

const toThreeLetter = (name) => {
    if (!name) return 'TBD';
    const normalizedName = name.trim();
    if (commonNameToCode[normalizedName]) return commonNameToCode[normalizedName];
    const cleaned = normalizedName.replace(/[^A-Za-z ]/g, '').trim();
    if (commonNameToCode[cleaned]) return commonNameToCode[cleaned];
    const lower = normalizedName.toLowerCase();
    const lowerCleaned = cleaned.toLowerCase();
    for (const key of Object.keys(commonNameToCode)) {
        if (key.toLowerCase() === lower || key.toLowerCase() === lowerCleaned) {
            return commonNameToCode[key];
        }
    }
    const parts = cleaned.split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
    return parts.map(p => p.charAt(0)).join('').slice(0, 3).toUpperCase().padEnd(3, 'X');
};

// Seed dataset: Real matches played on June 18, 19, and 20
const initialHistoricalMatches = [
    { id: "hist_1", home: "Switzerland", away: "Bosnia & Herzegovina", home_score: 4, away_score: 1 },
    { id: "hist_2", home: "Czech Republic", away: "South Africa", home_score: 1, away_score: 1 },
    { id: "hist_3", home: "Mexico", away: "South Korea", home_score: 1, away_score: 0 },
    { id: "hist_4", home: "Canada", away: "Qatar", home_score: 6, away_score: 0 },
    { id: "hist_5", home: "United States", away: "Australia", home_score: 2, away_score: 0 },
    { id: "hist_6", home: "Scotland", away: "Morocco", home_score: 0, away_score: 1 },
    { id: "hist_7", home: "Brazil", away: "Haiti", home_score: 3, away_score: 0 }
];

// Seed local DB if Results table is empty
async function seedHistoricalMatchesIfNeeded() {
    const check = await db.execute("SELECT COUNT(*) as count FROM Results");
    const count = check.rows[0]?.count || 0;
    
    if (count === 0) {
        console.log("Results table is empty. Seeding historical real World Cup matches...");
        const insertStatements = initialHistoricalMatches.map(m => ({
            sql: `INSERT INTO Results (match_id, home_score, away_score, accuracy_points) VALUES (?, ?, ?, ?)`,
            args: [`${m.home}_vs_${m.away}`, m.home_score, m.away_score, 1] // default 1 accuracy point for seed
        }));
        await db.batch(insertStatements);
    }
}

// Generate real team form from local DB Results table
async function generateRealFormFromDB(teamName) {
    const teamCode = toThreeLetter(teamName);
    
    // Fetch all records from local DB
    const result = await db.execute("SELECT match_id, home_score, away_score FROM Results");
    const dbRows = result.rows || [];
    const teamMatches = [];

    for (const row of dbRows) {
        // match_id standard format: "Home Team_vs_Away Team"
        const parts = row.match_id.split('_vs_');
        if (parts.length !== 2) continue;
        
        const homeTeam = parts[0];
        const awayTeam = parts[1];
        const homeCode = toThreeLetter(homeTeam);
        const awayCode = toThreeLetter(awayTeam);

        if (homeCode !== teamCode && awayCode !== teamCode) continue;

        const homeScore = Number(row.home_score);
        const awayScore = Number(row.away_score);
        const summary = `${homeCode} ${homeScore}-${awayScore} ${awayCode}`;

        if (homeCode === teamCode) {
            let outcome = 'D';
            if (homeScore > awayScore) outcome = 'W';
            else if (homeScore < awayScore) outcome = 'L';
            teamMatches.push({ summary, outcome });
        } else {
            let outcome = 'D';
            if (awayScore > homeScore) outcome = 'W';
            else if (awayScore < homeScore) outcome = 'L';
            teamMatches.push({ summary, outcome });
        }
    }

    if (teamMatches.length === 0) {
        return [{ summary: 'No matches', outcome: '' }];
    }

    // Return the last 3 matches
    return teamMatches.slice(-3);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        if (!THE_ODDS_API_KEY) {
            throw new Error("The Odds API key is missing.");
        }

        // Ensure real historical matches exist in local database
        await seedHistoricalMatchesIfNeeded();

        // 1. Fetch upcoming matches from The Odds API
        const oddsResponse = await fetch(
            `https://${ODDS_API_HOST}/v4/sports/${SPORT}/odds/?apiKey=${THE_ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=decimal`
        );

        if (!oddsResponse.ok) {
            throw new Error(`The Odds API request failed: ${await oddsResponse.text()}`);
        }

        const allMatches = await oddsResponse.json();
        const upcomingMatches = allMatches
            .filter(m => m.bookmakers?.some(b => b.markets?.some(market => market.key === 'h2h')))
            .slice(0, 6);

        if (upcomingMatches.length === 0) {
            return res.status(200).json({ success: true, message: "No upcoming matches found." });
        }

        const predictions = [];

        for (const match of upcomingMatches) {
            const bookmaker = match.bookmakers.find(b => b.markets?.some(m => m.key === 'h2h'));
            const h2hMarket = bookmaker?.markets.find(m => m.key === 'h2h');
            const outcomes = h2hMarket?.outcomes || [];

            const homeOdds = Number(outcomes.find(o => o.name === match.home_team)?.price) || 3.0;
            const awayOdds = Number(outcomes.find(o => o.name === match.away_team)?.price) || 3.0;
            const drawOdds = Number(outcomes.find(o => o.name === 'Draw')?.price) || 3.0;

            const rawHome = 1 / homeOdds;
            const rawAway = 1 / awayOdds;
            const rawDraw = 1 / drawOdds;
            const sumRaw = rawHome + rawAway + rawDraw;

            let rounded = [
                Math.round((rawHome / sumRaw) * 100),
                Math.round((rawAway / sumRaw) * 100),
                Math.round((rawDraw / sumRaw) * 100)
            ];

            let diff = 100 - rounded.reduce((a, b) => a + b, 0);
            rounded[0] += diff; // adjust minimal rounding diffs on home probability

            const [home_prob, away_prob, draw_prob] = rounded;
            const homeTeamName = match.home_team;
            const awayTeamName = match.away_team;

            // Generate real forms dynamically from the database store
            const home_form = await generateRealFormFromDB(homeTeamName);
            const away_form = await generateRealFormFromDB(awayTeamName);

            predictions.push({
                match_title: `${homeTeamName} vs ${awayTeamName}`,
                home_prob,
                draw_prob,
                away_prob,
                kickoff_time: match.commence_time,
                home_form: JSON.stringify(home_form),
                away_form: JSON.stringify(away_form)
            });
        }

        // 2. Clear old data and batch insert new records
        await db.execute('DELETE FROM Predictions');
        
        const insertStatements = predictions.map(p => ({
            sql: `INSERT INTO Predictions (match_title, home_prob, draw_prob, away_prob, kickoff_time, home_form, away_form) 
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [p.match_title, p.home_prob, p.draw_prob, p.away_prob, p.kickoff_time, p.home_form, p.away_form]
        }));
        
        if (insertStatements.length > 0) {
            await db.batch(insertStatements);
        }

        res.status(200).json({ success: true, message: `Synced ${predictions.length} matches with database records.` });

    } catch (error) {
        console.error("Sync error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}