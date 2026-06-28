import { db } from '../lib/db.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const result = await db.execute("SELECT home_score, away_score, sportsmole_prediction FROM Results");
        const rows = result.rows || [];

        let totalEligible = 0;
        let spares = 0;  // כיוון נכון או תיקו
        let strikes = 0; // בול בתוצאה

        for (const row of rows) {
            if (!row.sportsmole_prediction || row.sportsmole_prediction === 'No preview found') continue;

            const actHome = Number(row.home_score);
            const actAway = Number(row.away_score);

            // חילוץ המספרים מהטקסט "We say: TeamA X-Y TeamB"
            const scoreMatch = row.sportsmole_prediction.match(/(\d+)\s*-\s*(\d+)/);
            if (!scoreMatch) continue;

            const predHome = Number(scoreMatch[1]);
            const predAway = Number(scoreMatch[2]);

            totalEligible++;

            // 1. בדיקת Strike (תוצאה מדויקת לחלוטין)
            if (actHome === predHome && actAway === predAway) {
                strikes++;
            }

            // 2. בדיקת Spare (כיוון נכון - בית/חוץ/תיקו)
            const actOutcome = actHome > actAway ? 'H' : (actHome < actAway ? 'A' : 'D');
            const predOutcome = predHome > predAway ? 'H' : (predHome < predAway ? 'A' : 'D');

            if (actOutcome === predOutcome) {
                spares++;
            }
        }

        const spareRate = totalEligible > 0 ? Math.round((spares / totalEligible) * 100) : 0;
        const strikeRate = totalEligible > 0 ? Math.round((strikes / totalEligible) * 100) : 0;

        res.status(200).json({ spareRate, strikeRate });
    } catch (error) {
        console.error("Global stats error:", error);
        res.status(500).json({ error: error.message });
    }
}