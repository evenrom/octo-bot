import { db } from '../lib/db.js';
import { throttledFetch } from '../lib/api-client.js';

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const ODDS_API_KEY = process.env.ODDS_API_KEY;

// API Constants
const FOOTBALL_API_HOST = 'v3.football.api-sports.io';
const LEAGUE_ID = 39; // English Premier League
const SEASON = parseInt(process.env.FOOTBALL_SEASON || '2025');

// Helper to convert form string (e.g. "WDLDW") to a score between 0 and 1
function calculateFormScore(formStr) {
  if (!formStr || formStr.length === 0) return 0.5;
  let score = 0;
  for (const char of formStr) {
    if (char === 'W') score += 1;
    else if (char === 'D') score += 0.5;
  }
  return score / formStr.length;
}

// Convert decimal odds to implied probability
function oddsToProbability(decimalOdds) {
    if (!decimalOdds || decimalOdds <= 0) return 0;
    return 1 / decimalOdds;
}

export default async function handler(req, res) {
  try {
    // 1. Get Algorithm Weights
    let oddsWeight = 0.5;
    let momentumWeight = 0.5;

    try {
      const stateResult = await db.execute(`
        SELECT odds_weight, momentum_weight
        FROM AlgorithmState
        ORDER BY id DESC LIMIT 1
      `);
      if (stateResult.rows.length > 0) {
        oddsWeight = stateResult.rows[0].odds_weight;
        momentumWeight = stateResult.rows[0].momentum_weight;
      }
    } catch (dbError) {
        console.warn("Could not fetch AlgorithmState, using defaults:", dbError);
    }

    // 2. Fetch External Data ONCE to avoid timeouts
    const today = new Date().toISOString().split('T')[0];

    // Fetch Fixtures
    const fixturesResponse = await throttledFetch(
      `https://${FOOTBALL_API_HOST}/fixtures?date=${today}&league=${LEAGUE_ID}&season=${SEASON}`,
      { headers: { 'x-rapidapi-host': FOOTBALL_API_HOST, 'x-rapidapi-key': API_FOOTBALL_KEY } }
    );
    if (!fixturesResponse.ok) throw new Error(`API-Football fixtures error: ${fixturesResponse.statusText}`);
    const fixturesData = await fixturesResponse.json();
    const fixtures = fixturesData.response || [];

    // Fetch Standings (for form)
    const standingsResponse = await throttledFetch(
      `https://${FOOTBALL_API_HOST}/standings?league=${LEAGUE_ID}&season=${SEASON}`,
      { headers: { 'x-rapidapi-host': FOOTBALL_API_HOST, 'x-rapidapi-key': API_FOOTBALL_KEY } }
    );
    const standingsData = await standingsResponse.json();
    const forms = {}; // team_id -> form score
    if (standingsData.response && standingsData.response.length > 0) {
        const leagueStandings = standingsData.response[0].league.standings;
        for (const group of leagueStandings) {
            for (const team of group) {
                forms[team.team.id] = calculateFormScore(team.form);
            }
        }
    }

    // Fetch Odds
    const oddsRes = await throttledFetch(
        `https://api.the-odds-api.com/v4/sports/soccer_epl/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h`
    );
    if (!oddsRes.ok) throw new Error(`Odds API error: ${oddsRes.statusText}`);
    const oddsData = await oddsRes.json();

    // 3. Process each fixture
    const dbStatements = [];
    for (const fixture of fixtures) {
        const matchId = fixture.fixture.id.toString();
        const homeTeamId = fixture.teams.home.id;
        const awayTeamId = fixture.teams.away.id;
        const homeTeamName = fixture.teams.home.name;
        const awayTeamName = fixture.teams.away.name;
        const matchDate = fixture.fixture.date;

        const homeFormScore = forms[homeTeamId] !== undefined ? forms[homeTeamId] : 0.5;
        const awayFormScore = forms[awayTeamId] !== undefined ? forms[awayTeamId] : 0.5;

        let homeOdds = 2.0;
        let awayOdds = 2.0;
        let drawOdds = 3.0; // Default draw odds

        // Find matching match in Odds API
        if (Array.isArray(oddsData)) {
            const matchOdds = oddsData.find(m =>
                (m.home_team.includes(homeTeamName) || homeTeamName.includes(m.home_team)) &&
                (m.away_team.includes(awayTeamName) || awayTeamName.includes(m.away_team))
            );

            if (matchOdds && matchOdds.bookmakers && matchOdds.bookmakers.length > 0) {
                const bookmaker = matchOdds.bookmakers[0];
                const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
                if (h2hMarket) {
                    const homeOutcome = h2hMarket.outcomes.find(o => o.name === matchOdds.home_team);
                    const awayOutcome = h2hMarket.outcomes.find(o => o.name === matchOdds.away_team);
                    const drawOutcome = h2hMarket.outcomes.find(o => o.name.toLowerCase() === 'draw');

                    if (homeOutcome) homeOdds = homeOutcome.price;
                    if (awayOutcome) awayOdds = awayOutcome.price;
                    if (drawOutcome) drawOdds = drawOutcome.price;
                }
            }
        }

        const homeProb = oddsToProbability(homeOdds);
        const awayProb = oddsToProbability(awayOdds);
        const drawProb = oddsToProbability(drawOdds);

        // Calculate AWE Scores
        const homeScore = (oddsWeight * homeProb) + (momentumWeight * homeFormScore);
        const awayScore = (oddsWeight * awayProb) + (momentumWeight * awayFormScore);

        // Derive prediction
        // A simple heuristic for scores: scale AWE score to expected goals.
        // Assuming max AWE is around 1.0 (if odds are high and form is 1.0)
        // Average goals per game is around 1-3.
        const predictedHomeGoals = Math.round(homeScore * 2.5);
        const predictedAwayGoals = Math.round(awayScore * 2.5);

        let prediction = 'Draw';
        if (predictedHomeGoals > predictedAwayGoals) {
            prediction = 'Home Win';
        } else if (predictedAwayGoals > predictedHomeGoals) {
            prediction = 'Away Win';
        }

        // Predicted probability is based on the dominant team's AWE
        const predictedProb = Math.max(homeScore, awayScore);

        const apiLastUpdated = new Date().toISOString();

        // Collect Match statement
        dbStatements.push({
            sql: `INSERT INTO Matches (match_id, home_team, away_team, kickoff_time, home_odds, draw_odds, away_odds, api_last_updated)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(match_id) DO UPDATE SET
                  home_team = excluded.home_team,
                  away_team = excluded.away_team,
                  kickoff_time = excluded.kickoff_time,
                  home_odds = excluded.home_odds,
                  draw_odds = excluded.draw_odds,
                  away_odds = excluded.away_odds,
                  api_last_updated = excluded.api_last_updated`,
            args: [matchId, homeTeamName, awayTeamName, matchDate, homeOdds, drawOdds, awayOdds, apiLastUpdated]
        });

        // Collect Prediction statement
        dbStatements.push({
            sql: `INSERT INTO Predictions (match_id, predicted_winner, confidence_level, home_win_prob, draw_prob, away_win_prob)
                  VALUES (?, ?, ?, ?, ?, ?)
                  ON CONFLICT(match_id) DO UPDATE SET
                  predicted_winner = excluded.predicted_winner,
                  confidence_level = excluded.confidence_level,
                  home_win_prob = excluded.home_win_prob,
                  draw_prob = excluded.draw_prob,
                  away_win_prob = excluded.away_win_prob`,
            args: [matchId, prediction, predictedProb, homeProb, drawProb, awayProb]
        });
    }

    if (dbStatements.length > 0) {
        try {
            await db.batch(dbStatements);
        } catch (dbErr) {
             console.error("Database batch error:", dbErr.message);
        }
    }

    res.status(200).json({ success: true, message: `Synced ${fixtures.length} matches.` });

  } catch (error) {
    console.error('Sync Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
