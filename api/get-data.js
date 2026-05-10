import { db } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    // 1. Fetch Predictions joined with Matches
    // Ensure we fetch match_id, home_team, away_team, kickoff_time, predicted_winner, confidence_level
    const predictionsResult = await db.execute(`
      SELECT
        p.match_id as prediction_id,
        p.match_id,
        p.predicted_winner as predicted_outcome,
        p.confidence_level as predicted_probability,
        m.home_team,
        m.away_team,
        m.kickoff_time as match_date
      FROM Predictions p
      JOIN Matches m ON p.match_id = m.match_id
      ORDER BY m.kickoff_time ASC
    `);

    // 2. Fetch Latest Algorithm State
    const stateResult = await db.execute(`
      SELECT odds_weight, momentum_weight, updated_at
      FROM AlgorithmState
      ORDER BY state_id DESC LIMIT 1
    `);

    // 3. Fetch all Results to calculate the global Accuracy Score
    const resultsResult = await db.execute(`
      SELECT accuracy_points
      FROM Results
      WHERE accuracy_points IS NOT NULL
    `);

    // Calculate global accuracy score
    const totalResults = resultsResult.rows.length;
    let globalAccuracyScore = 0;
    if (totalResults > 0) {
        const totalScore = resultsResult.rows.reduce((sum, row) => sum + row.accuracy_points, 0);
        // Assuming score represents accuracy per match (e.g., 0 to 1)
        globalAccuracyScore = Math.round((totalScore / totalResults) * 100);
    }

    const payload = {
        predictions: predictionsResult.rows || [],
        algorithmState: stateResult.rows[0] || null,
        accuracyScore: globalAccuracyScore,
        totalResolvedMatches: totalResults
    };

    res.status(200).json(payload);

  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: error.message || 'An error occurred while fetching data.' });
  }
}
