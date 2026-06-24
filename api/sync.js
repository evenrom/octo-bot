
import { db } from '../lib/db.js';

const THE_ODDS_API_KEY = process.env.THE_ODDS_API_KEY;
const ODDS_API_HOST = 'api.the-odds-api.com';
const SPORT = 'soccer_fifa_world_cup';

// Team name to 3-letter code mapping
const commonNameToCode = {
    'Brazil': 'BRA',
    'Argentina': 'ARG',
    'Morocco': 'MAR',
    'Haiti': 'HTI',
    'France': 'FRA',
    'Germany': 'GER',
    'Netherlands': 'NED',
    'Portugal': 'POR',
    'Spain': 'ESP',
    'England': 'ENG',
    'United States': 'USA',
    'USA': 'USA',
    'Belgium': 'BEL',
    'Croatia': 'CRO',
    'Denmark': 'DEN',
    'Switzerland': 'SUI',
    'Sweden': 'SWE',
    'Norway': 'NOR',
    'Italy': 'ITA',
    'Poland': 'POL',
    'Mexico': 'MEX',
    'Canada': 'CAN',
    'Japan': 'JPN',
    'South Korea': 'KOR',
    'Korea': 'KOR',
    'Australia': 'AUS',
    'Saudi Arabia': 'KSA',
    'Iran': 'IRN',
    'Ecuador': 'ECU',
    'Peru': 'PER',
    'Uruguay': 'URU',
    'Colombia': 'COL',
    'Senegal': 'SEN',
    'Tunisia': 'TUN',
    'Egypt': 'EGY',
    'Ghana': 'GHA',
    'Nigeria': 'NGA',
    'Cameroon': 'CMR',
    'Serbia': 'SRB',
    'Qatar': 'QAT'
};

// Convert team name to 3-letter code
const toThreeLetter = (name) => {
    if (!name) return 'TBD';
    if (commonNameToCode[name]) return commonNameToCode[name];
    const cleaned = name.replace(/[^A-Za-z ]/g, '').trim();
    if (commonNameToCode[cleaned]) return commonNameToCode[cleaned];
    const parts = cleaned.split(' ');
    if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
    // e.g., United States -> USA
    const initials = parts.map(p => p.charAt(0)).join('').slice(0, 3).toUpperCase();
    return initials.padEnd(3, 'X').slice(0, 3);
};

// Fetch historical match results from The Odds API
const fetchHistoricalMatches = async () => {
    const url = `https://${ODDS_API_HOST}/v4/sports/${SPORT}/scores/?apiKey=${THE_ODDS_API_KEY}&daysFrom=3`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`Failed to fetch historical matches: ${response.status}`);
            return [];
        }
        const data = await response.json();
        return data || [];
    } catch (error) {
        console.warn(`Error fetching historical matches: ${error.message}`);
        return [];
    }
};

// Generate real form from historical matches (last 3 completed matches)
const generateRealForm = (teamName, historicalMatches) => {
    const teamCode = toThreeLetter(teamName);
    const teamMatches = [];

    for (const match of historicalMatches) {
        const homeTeam = match.home_team;
        const awayTeam = match.away_team;
        const homeCode = toThreeLetter(homeTeam);
        const awayCode = toThreeLetter(awayTeam);

        // Check if our team is in this match
        if (homeCode === teamCode) {
            // Team is home team
            const homeScore = match.scores?.find(s => s.name === homeTeam)?.score || 0;
            const awayScore = match.scores?.find(s => s.name === awayTeam)?.score || 0;
            const summary = `${homeCode} ${homeScore}-${awayScore} ${awayCode}`;

            // Determine outcome from our team's perspective (home team)
            let outcome;
            if (homeScore > awayScore) outcome = 'W';
            else if (homeScore < awayScore) outcome = 'L';
            else outcome = 'D';

            teamMatches.push({ summary, outcome });
        } else if (awayCode === teamCode) {
            // Team is away team
            const homeScore = match.scores?.find(s => s.name === homeTeam)?.score || 0;
            const awayScore = match.scores?.find(s => s.name === awayTeam)?.score || 0;
            const summary = `${homeCode} ${homeScore}-${awayScore} ${awayCode}`;

            // Determine outcome from our team's perspective (away team)
            let outcome;
            if (awayScore > homeScore) outcome = 'W';
            else if (awayScore < homeScore) outcome = 'L';
            else outcome = 'D';

            teamMatches.push({ summary, outcome });
        }
    }

    // Return the last 3 matches (or fewer if not available), filter out empty strings
    return teamMatches.slice(-3).filter(m => m.summary);
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        if (!THE_ODDS_API_KEY) {
            throw new Error("The Odds API key is missing.");
        }

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
            return res.status(200).json({ success: true, message: "No upcoming matches with h2h odds found." });
        }

        // 2. Fetch historical match results for form data
        const historicalMatches = await fetchHistoricalMatches();

        const predictions = [];

        for (const match of upcomingMatches) {
            // 3. Extract odds from the first bookmaker with an h2h market
            const bookmaker = match.bookmakers.find(b => b.markets?.some(m => m.key === 'h2h'));
            const h2hMarket = bookmaker?.markets.find(m => m.key === 'h2h');
            const outcomes = h2hMarket?.outcomes || [];

            const homeOdds = Number(outcomes.find(o => o.name === match.home_team)?.price) || 3.0;
            const awayOdds = Number(outcomes.find(o => o.name === match.away_team)?.price) || 3.0;
            const drawOdds = Number(outcomes.find(o => o.name === 'Draw')?.price) || 3.0;

            let rawHome = 1 / homeOdds;
            let rawAway = 1 / awayOdds;
            let rawDraw = 1 / drawOdds;

            if (!isFinite(rawHome) || !isFinite(rawAway) || !isFinite(rawDraw)) {
                rawHome = rawAway = rawDraw = 1 / 3;
            }

            const sumRaw = rawHome + rawAway + rawDraw;
            let floatHome = rawHome / sumRaw;
            let floatAway = rawAway / sumRaw;
            let floatDraw = rawDraw / sumRaw;

            // Convert to integer percentages (0-100) and ensure they sum to 100 and none are zero
            const floats = [floatHome * 100, floatAway * 100, floatDraw * 100];
            let rounded = floats.map(f => Math.round(f));
            let diff = 100 - rounded.reduce((a, b) => a + b, 0);

            // If rounding caused difference, adjust using fractional parts
            if (diff !== 0) {
                const fracs = floats.map((f, i) => ({ idx: i, frac: f - Math.floor(f) }));
                fracs.sort((a, b) => b.frac - a.frac);
                let i = 0;
                while (diff > 0) {
                    rounded[fracs[i % fracs.length].idx] += 1;
                    diff -= 1;
                    i++;
                }
                while (diff < 0) {
                    // remove from the largest rounded value that's >1
                    const maxIdx = rounded.reduce((acc, val, idx) => (val > rounded[acc] ? idx : acc), 0);
                    if (rounded[maxIdx] > 1) {
                        rounded[maxIdx] -= 1;
                        diff += 1;
                    } else break;
                }
            }

            // Ensure none are zero; if any zero, set to 1 and reduce the largest accordingly
            for (let i = 0; i < rounded.length; i++) {
                if (rounded[i] === 0) {
                    // find index of largest value
                    const largest = rounded.reduce((acc, val, idx) => (val > rounded[acc] ? idx : acc), 0);
                    if (rounded[largest] > 1) {
                        rounded[largest] -= 1;
                        rounded[i] = 1;
                    } else {
                        rounded[i] = 1;
                    }
                }
            }

            // Final safety: if sum !== 100 adjust largest
            const finalSum = rounded.reduce((a, b) => a + b, 0);
            if (finalSum !== 100) {
                const diff2 = 100 - finalSum;
                const largest = rounded.reduce((acc, val, idx) => (val > rounded[acc] ? idx : acc), 0);
                rounded[largest] += diff2;
            }

            const [home_prob, away_prob, draw_prob] = rounded;

            // 4. Generate real forms for teams using historical matches
            const homeTeamName = match.home_team;
            const awayTeamName = match.away_team;

            const home_form = generateRealForm(homeTeamName, historicalMatches);
            const away_form = generateRealForm(awayTeamName, historicalMatches);

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

        // 5. Clear old data and batch insert new records
        await db.execute('DELETE FROM Predictions');
        
        const insertStatements = predictions.map(p => ({
            sql: `INSERT INTO Predictions (match_title, home_prob, draw_prob, away_prob, kickoff_time, home_form, away_form) 
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [p.match_title, p.home_prob, p.draw_prob, p.away_prob, p.kickoff_time, p.home_form, p.away_form]
        }));
        
        if (insertStatements.length > 0) {
            await db.batch(insertStatements);
        }

        res.status(200).json({ success: true, message: `Synced ${predictions.length} matches.` });

    } catch (error) {
        console.error("Sync error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
}
