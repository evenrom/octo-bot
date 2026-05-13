import { db } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    const predictionsResult = await db.execute(`
      SELECT id, match_title, home_prob, draw_prob, away_prob, exact_score_1, exact_score_2, kickoff_time
      FROM Predictions
      ORDER BY kickoff_time
    `);

    const stateResult = await db.execute(`
      SELECT *
      FROM AlgorithmState
      ORDER BY state_id DESC LIMIT 1
    `);

    const resultsResult = await db.execute(`
      SELECT AVG(accuracy_points) as avg_accuracy 
      FROM Results 
      WHERE accuracy_points IS NOT NULL
    `);
    
    const avgAccuracy = resultsResult.rows[0]?.avg_accuracy;
    const accuracyScore = avgAccuracy !== null && avgAccuracy !== undefined ? parseFloat(avgAccuracy) : 0;

    res.status(200).json({
        predictions: predictionsResult.rows || [],
        algorithmState: stateResult.rows[0] || null,
        accuracyScore: accuracyScore
    });

  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
}
