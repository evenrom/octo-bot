export default async function handler(req, res) {
    const matchQuery = "Brazil vs Japan World Cup 2026";
    
    // שאילתות חיפוש ל-DuckDuckGo
    const fpSearchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(matchQuery + " footballpredictions.net preview")}`;
    const fstSearchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(matchQuery + " freesupertips match preview prediction")}`;

    const results = {
        footballPredictions: { targetUrl: "", status: "pending", extracted: "" },
        freeSuperTips: { targetUrl: "", status: "pending", extracted: "" }
    };

    const extractTargetUrl = (searchText, domainKey) => {
        const regex = new RegExp(`https?://[^\\s\\)]*${domainKey}[^\\s\\)]*`, 'i');
        const match = searchText.match(regex);
        if (match) {
            let foundUrl = match[0];
            if (foundUrl.includes('uddg=')) {
                const cleanUrl = foundUrl.split('uddg=')[1]?.split('&')[0];
                if (cleanUrl) return decodeURIComponent(cleanUrl);
            }
            return foundUrl;
        }
        return null;
    };

    try {
        // --- 1. בדיקה עבור FootballPredictions.net ---
        const fpSearchResponse = await fetch(`https://r.jina.ai/${fpSearchUrl}`);
        if (fpSearchResponse.ok) {
            const searchText = await fpSearchResponse.text();
            const targetUrl = extractTargetUrl(searchText, "footballpredictions.net");
            results.footballPredictions.targetUrl = targetUrl;

            if (targetUrl) {
                const pageResponse = await fetch(`https://r.jina.ai/${targetUrl}`);
                if (pageResponse.ok) {
                    const pageText = await pageResponse.text();
                    // מחפש ביטויים כמו "Our prediction" או "prediction is a"
                    const matchPrediction = pageText.match(/(?:Our prediction|prediction is a)[^\n.]+/i);
                    results.footballPredictions.status = "Success";
                    results.footballPredictions.extracted = matchPrediction ? matchPrediction[0].trim() : "Prediction phrase not found";
                } else {
                    results.footballPredictions.status = `Failed page fetch: ${pageResponse.status}`;
                }
            } else {
                results.footballPredictions.status = "Link not found in search";
            }
        }

        // --- 2. בדיקה עבור Free Super Tips ---
        const fstSearchResponse = await fetch(`https://r.jina.ai/${fstSearchUrl}`);
        if (fstSearchResponse.ok) {
            const searchText = await fstSearchResponse.text();
            const targetUrl = extractTargetUrl(searchText, "freesupertips.com");
            results.freeSuperTips.targetUrl = targetUrl;

            if (targetUrl) {
                const pageResponse = await fetch(`https://r.jina.ai/${targetUrl}`);
                if (pageResponse.ok) {
                    const pageText = await pageResponse.text();
                    // מחפש כותרות או פסקאות של "Correct score prediction"
                    const matchPrediction = pageText.match(/(?:Correct score prediction|We predict)[^\n]+/i);
                    results.freeSuperTips.status = "Success";
                    results.freeSuperTips.extracted = matchPrediction ? matchPrediction[0].trim() : "Prediction phrase not found";
                } else {
                    results.freeSuperTips.status = `Failed page fetch: ${pageResponse.status}`;
                }
            } else {
                results.freeSuperTips.status = "Link not found in search";
            }
        }

        res.status(200).json({
            message: `New sources test for ${matchQuery} completed`,
            results: results
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}