import { db } from '../lib/db.js';
import { throttledFetch } from '../lib/api-client.js';

const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
const FOOTBALL_API_HOST = 'v3.football.api-sports.io';
const VARIANCE_THRESHOLD = 0.2; // 20% variance threshold
const WEIGHT_DELTA = 0.05;

export default async function handler(req, res) {
  try {
    // 1. Fetch pending predictions where match_date has passed
    const now = new Date().toISOString();

    // Attempting to fetch goal columns as well. If they don't exist, we fall back to predicted_outcome format.
    let pendingResult;
    try {
        pendingResult = await db.execute({
            sql: `SELECT p.id as prediction_id, p.match_id, p.predicted_outcome, p.predicted_probability, p.predicted_home_goals, p.predicted_away_goals, m.match_date
                  FROM Predictions p
                  JOIN Matches m ON p.match_id = m.id
                  LEFT JOIN Results r ON m.id = r.match_id
                  WHERE r.id IS NULL AND m.match_date < ?`,
            args: [now]
        });
    } catch (e) {
        // Fallback query if goal columns don't exist
        pendingResult = await db.execute({
            sql: `SELECT p.id as prediction_id, p.match_id, p.predicted_outcome, p.predicted_probability, m.match_date
                  FROM Predictions p
                  JOIN Matches m ON p.match_id = m.id
                  LEFT JOIN Results r ON m.id = r.match_id
                  WHERE r.id IS NULL AND m.match_date < ?`,
            args: [now]
        });
    }

    const pendingPredictions = pendingResult.rows;

    if (pendingPredictions.length === 0) {
        return res.status(200).json({ success: true, message: "No pending predictions to calibrate." });
    }

    // 2. Fetch current Algorithm Weights
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

    let weightsChanged = false;

    // 3. Score predictions and calibrate
    for (const prediction of pendingPredictions) {
        const matchId = prediction.match_id;

        // Fetch result from API-Football
        const resultRes = await throttledFetch(
            `https://${FOOTBALL_API_HOST}/fixtures?id=${matchId}`,
            { headers: { 'x-rapidapi-host': FOOTBALL_API_HOST, 'x-rapidapi-key': API_FOOTBALL_KEY } }
        );

        if (!resultRes.ok) {
            console.error(`Failed to fetch result for match ${matchId}: ${resultRes.statusText}`);
            continue;
        }

        const resultData = await resultRes.json();
        const fixture = resultData.response?.[0];

        if (!fixture || fixture.fixture.status.short !== 'FT') {
            console.log(`Match ${matchId} not finished yet.`);
            continue;
        }

        const homeGoals = fixture.goals.home;
        const awayGoals = fixture.goals.away;

        let actualOutcomeDirection = 'Draw';
        if (homeGoals > awayGoals) actualOutcomeDirection = 'Home Win';
        else if (awayGoals > homeGoals) actualOutcomeDirection = 'Away Win';

        // Extract predicted goals and direction
        let predictedHomeGoals = -1;
        let predictedAwayGoals = -1;
        let predictedDirection = prediction.predicted_outcome; // default fallback

        if (prediction.predicted_home_goals !== undefined && prediction.predicted_away_goals !== undefined) {
             predictedHomeGoals = prediction.predicted_home_goals;
             predictedAwayGoals = prediction.predicted_away_goals;

             if (predictedHomeGoals > predictedAwayGoals) predictedDirection = 'Home Win';
             else if (predictedAwayGoals > predictedHomeGoals) predictedDirection = 'Away Win';
             else predictedDirection = 'Draw';
        } else if (prediction.predicted_outcome && prediction.predicted_outcome.includes('-')) {
             // Fallback logic: "2-1" format
             const parts = prediction.predicted_outcome.split('-');
             if (parts.length === 2) {
                 predictedHomeGoals = parseInt(parts[0], 10);
                 predictedAwayGoals = parseInt(parts[1], 10);
                 if (predictedHomeGoals > predictedAwayGoals) predictedDirection = 'Home Win';
                 else if (predictedAwayGoals > predictedHomeGoals) predictedDirection = 'Away Win';
                 else predictedDirection = 'Draw';
             }
        }

        // 4. Scoring System
        // Exact Score Match = 100 points, Correct Direction = 50 points, Incorrect = 0 points.
        let score = 0;

        const isExactScore = (predictedHomeGoals === homeGoals && predictedAwayGoals === awayGoals);
        const isCorrectDirection = (predictedDirection === actualOutcomeDirection);

        if (isExactScore && predictedHomeGoals !== -1) {
            score = 100;
        } else if (isCorrectDirection) {
            score = 50;
        } else {
            score = 0;
        }

        // Insert Result
        await db.execute({
            sql: `INSERT INTO Results (match_id, actual_outcome, home_goals, away_goals, score)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(match_id) DO UPDATE SET
                  actual_outcome = excluded.actual_outcome,
                  home_goals = excluded.home_goals,
                  away_goals = excluded.away_goals,
                  score = excluded.score`,
            args: [matchId, actualOutcomeDirection, homeGoals, awayGoals, score]
        });

        // 5. Self-Correction Variance Check
        // Calculate variance between predicted probability and actual probability.
        // We consider an actual outcome to have probability 1.0 if correct direction or exact score.
        const actualProb = score >= 50 ? 1.0 : 0.0;
        const variance = Math.abs(prediction.predicted_probability - actualProb);

        if (variance > VARIANCE_THRESHOLD) {
            // Adaptive Adjustment:
            // Since we can't fully introspect which external API was "wrong" without saving
            // the individual form and odds scores in the Predictions table, we make an assumption:
            // We penalize the factor that had a higher weight, and reward the other.
            // This ensures they balance each other out over time if the model is constantly wrong.
            if (oddsWeight > momentumWeight) {
                // Odds was dominant, so reduce it
                oddsWeight = Math.max(0, oddsWeight - WEIGHT_DELTA);
                momentumWeight = Math.min(1, momentumWeight + WEIGHT_DELTA);
            } else {
                // Momentum was dominant, so reduce it
                momentumWeight = Math.max(0, momentumWeight - WEIGHT_DELTA);
                oddsWeight = Math.min(1, oddsWeight + WEIGHT_DELTA);
            }

            // Normalize just in case
            const total = oddsWeight + momentumWeight;
            oddsWeight = oddsWeight / total;
            momentumWeight = momentumWeight / total;

            weightsChanged = true;
        }
    }

    if (weightsChanged) {
        await db.execute({
            sql: `INSERT INTO AlgorithmState (odds_weight, momentum_weight, updated_at)
                  VALUES (?, ?, ?)`,
            args: [oddsWeight, momentumWeight, new Date().toISOString()]
        });
    }

    res.status(200).json({ success: true, message: `Calibrated ${pendingPredictions.length} predictions.` });

  } catch (error) {
    console.error('Calibrate Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
