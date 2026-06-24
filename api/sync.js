
import { db } from '../lib/db.js';

const THE_ODDS_API_KEY = process.env.THE_ODDS_API_KEY;
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const ODDS_API_HOST = 'api.the-odds-api.com';
const API_FOOTBALL_HOST = 'v3.football.api-sports.io';
const SPORT = 'soccer_fifa_world_cup';

// Helper to find team ID from API-Football
const getTeamId = async (teamName) => {
    const url = `https://${API_FOOTBALL_HOST}/teams?name=${encodeURIComponent(teamName)}`;
    const response = await fetch(url, {
        headers: { 'x-apisports-key': API_FOOTBALL_KEY }
    });
    if (!response.ok) {
        console.error(`API-Football team search failed for ${teamName}:`, await response.text());
        return null;
    }
    const data = await response.json();
    // Assuming the first result is the correct one
    return data.response[0]?.team.id;
};

// Helper to get team form
const getTeamForm = async (teamId) => {
    if (!teamId) return [];
    const url = `https://${API_FOOTBALL_HOST}/fixtures?team=${teamId}&last=3`;
    const response = await fetch(url, {
        headers: { 'x-apisports-key': API_FOOTBALL_KEY }
    });
    if (!response.ok) {
        console.error(`API-Football fixtures fetch failed for team ${teamId}:`, await response.text());
        return [];
    }
    const data = await response.json();

    return data.response.map(fixture => {
        const teams = fixture.teams;
        const goals = fixture.goals;
        const isHomeTeam = teams.home.id === teamId;
        const opponent = isHomeTeam ? teams.away : teams.home;

        let outcome = 'D';
        if (isHomeTeam) {
            if (goals.home > goals.away) outcome = 'W';
            if (goals.home < goals.away) outcome = 'L';
        } else { // is away team
            if (goals.away > goals.home) outcome = 'W';
            if (goals.away < goals.home) outcome = 'L';
        }

        return {
            logo: opponent.logo,
            outcome: outcome
        };
    });
};


export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        if (!THE_ODDS_API_KEY || !API_FOOTBALL_KEY) {
            throw new Error("API key(s) are missing.");
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

        const predictions = [];

        for (const match of upcomingMatches) {
            // 2. Calculate true probabilities
            const bookmaker = match.bookmakers[0];
            const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
            const outcomes = h2hMarket.outcomes;

            const homeOdds = outcomes.find(o => o.name === match.home_team)?.price || 3.0;
            const awayOdds = outcomes.find(o => o.name === match.away_team)?.price || 3.0;
            const drawOdds = outcomes.find(o => o.name === 'Draw')?.price || 3.0;

            const rawHome = 1 / homeOdds;
            const rawAway = 1 / awayOdds;
            const rawDraw = 1 / drawOdds;
            const totalMargin = rawHome + rawAway + rawDraw;

            const home_prob = (rawHome / totalMargin);
            const away_prob = (rawAway / totalMargin);
            const draw_prob = (rawDraw / totalMargin);
            
            // 3. Fetch Team Form (API-Football)
            const homeTeamName = match.home_team;
            const awayTeamName = match.away_team;
            
            const homeTeamId = await getTeamId(homeTeamName);
            const awayTeamId = await getTeamId(awayTeamName);

            const home_form = await getTeamForm(homeTeamId);
            const away_form = await getTeamForm(awayTeamId);

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

        // 4. Clear old data and batch insert new records
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
