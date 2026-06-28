export default async function handler(req, res) {
    // שני הקישורים הספציפיים שרצית לבדוק
    const urlSportsMole = "https://www.sportsmole.co.uk/football/canada/world-cup-2026/preview/south-africa-vs-canada-prediction-team-news-lineups_600163.html";
    const urlSI = "https://www.si.com/soccer/south-africa-vs-canada-world-cup-preview-predictions-lineups-6-28-26";

    const results = {
        sportsMole: { status: "pending", rawText: "", extracted: "" },
        sportsIllustrated: { status: "pending", rawText: "", extracted: "" }
    };

    try {
        // 1. בדיקת שליפה מ-Sports Mole (דרך הפרוקסי שמנקה חסימות)
        const smResponse = await fetch(`https://r.jina.ai/${urlSportsMole}`);
        if (smResponse.ok) {
            const text = await smResponse.text();
            results.sportsMole.status = "Success";
            
            // Sports Mole בדרך כלל כותבים: "We say: South Africa 1-2 Canada"
            const match = text.match(/We say:[^\n]+/i);
            if (match) {
                results.sportsMole.extracted = match[0].trim();
            } else {
                // אם לא מצאנו את המשפט המדויק, ניקח חתיכת טקסט קטנה מהסוף לבדיקה
                results.sportsMole.extracted = "Prediction sentence not found, parsing text directly...";
                results.sportsMole.rawText = text.slice(-2000); // 2000 תווים אחרונים שמתארים את סוף הכתבה
            }
        } else {
            results.sportsMole.status = `Failed with status ${smResponse.status}`;
        }

        // 2. בדיקת שליפה מ-Sports Illustrated
        const siResponse = await fetch(`https://r.jina.ai/${urlSI}`);
        if (siResponse.ok) {
            const text = await siResponse.text();
            results.sportsIllustrated.status = "Success";
            
            // SI בדרך כלל כותבים "Prediction:" או משפט דומה בסוף
            const match = text.match(/Prediction:[^\n]+/i);
            if (match) {
                results.sportsIllustrated.extracted = match[0].trim();
            } else {
                results.sportsIllustrated.extracted = "Prediction sentence not found, parsing text directly...";
                results.sportsIllustrated.rawText = text.slice(-2000);
            }
        } else {
            results.sportsIllustrated.status = `Failed with status ${siResponse.status}`;
        }

        // החזרת התוצאות הגולמיות ישירות למסך הדפדפן
        res.status(200).json({
            message: "Scraping test completed",
            results: results
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}