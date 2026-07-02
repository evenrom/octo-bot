import { db } from '../lib/db.js';

const calculateRates = (rows, predictionField) => {
    let total = 0, spares = 0, strikes = 0;
    
    for (const row of rows) {
        const predText = row[predictionField];
        if (!predText || ['No preview found', 'No input found', 'No data', 'Pending'].includes(predText)) continue;

        const scoreMatch = predText.match(/(\d+)\s*[-–]\s*(\d+)/);
        if (!scoreMatch) continue;

        const predHome = Number(scoreMatch[1]);
        const predAway = Number(scoreMatch[2]);
        const actHome = Number(row.home_score);
        const actAway = Number(row.away_score);

        total++;
        
        if (actHome === predHome && actAway === predAway) {
            strikes++;
        }

        const actOutcome = actHome > actAway ? 'H' : (actHome < actAway ? 'A' : 'D');
        const predOutcome = predHome > predAway ? 'H' : (predHome < predAway ? 'A' : 'D');
        if (actOutcome === predOutcome) {
            spares++;
        }
    }
    
    return {
        spareRate: total > 0 ? Math.round((spares / total) * 100) : 0,
        strikeRate: total > 0 ? Math.round((strikes / total) * 100) : 0
    };
};

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const result = await db.execute("SELECT home_score, away_score, sportsmole_prediction, si_prediction, gpt55_prediction, opus_prediction, fable_prediction FROM Results");
        const rows = result.rows || [];

        res.status(200).json({
            smStats: calculateRates(rows, 'sportsmole_prediction'),
            siStats: calculateRates(rows, 'si_prediction'),
            gpt55Stats: calculateRates(rows, 'gpt55_prediction'),
            opusStats: calculateRates(rows, 'opus_prediction'),
            fableStats: calculateRates(rows, 'fable_prediction')
        });
    } catch (error) {
        console.error("Global stats error:", error);
        res.status(500).json({ error: error.message });
    }
}