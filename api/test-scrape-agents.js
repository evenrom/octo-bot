export default async function handler(req, res) {
    const targetUrl = "https://worldcup-betting-agents.netlify.app/";
    const jinaUrl = `https://r.jina.ai/${targetUrl}`;

    try {
        // פנייה למנוע הגירוד Jina AI כדי לקרוא את אתר ה-Netlify
        const response = await fetch(jinaUrl);
        
        if (!response.ok) {
            return res.status(response.status).json({ 
                success: false, 
                error: `Jina failed with status ${response.status}` 
            });
        }

        const rawText = await response.text();

        // בדיקה ראשונית: האם הטקסט מכיל את שמות האייג'נטים או מילות מפתח בעברית?
        const hasFable = rawText.includes("Fable");
        const hasOpus = rawText.includes("Opus");
        const hasGpt = rawText.includes("GPT-5.5");
        const hasThursday = rawText.includes("יום חמישי");

        // נחתוך קטע קטן מהטקסט (למשל 1500 תווים ראשונים) כדי לראות את המבנה בעיניים
        const previewSnippet = rawText.slice(0, 2000);

        res.status(200).json({
            success: true,
            message: "Scrape test completed",
            analysis: {
                foundFable: hasFable,
                foundOpus: hasOpus,
                foundGpt: hasGpt,
                foundHebrewDate: hasThursday
            },
            snippet: previewSnippet
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
}