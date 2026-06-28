export default async function handler(req, res) {
    // הגדרת המשחק הדינמי לבדיקה
    const matchQuery = "Brazil vs Japan World Cup 2026";
    
    // יצירת שאילתות חיפוש עבור מנוע החיפוש DuckDuckGo
    const smSearchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(matchQuery + " Sports Mole preview prediction")}`;
    const skSearchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(matchQuery + " Sportskeeda preview prediction")}`;

    const results = {
        sportsMole: { searchUrl: "", targetUrl: "", status: "pending", extracted: "" },
        sportskeeda: { searchUrl: "", targetUrl: "", status: "pending", extracted: "" }
    };

    // פונקציית עזר לחילוץ הקישור האמיתי מתוך תוצאות החיפוש של DuckDuckGo
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
        // Fallback למקרה שהקישור מקודד בצורה שונה
        const encodedRegex = new RegExp(`uddg=([^&\\s\\)]*${domainKey}[^&\\s\\)]*)`, 'i');
        const encodedMatch = searchText.match(encodedRegex);
        if (encodedMatch && encodedMatch[1]) {
            return decodeURIComponent(encodedMatch[1]);
        }
        return null;
    };

    try {
        // --- חילוץ וגירוד עבור Sports Mole ---
        const smSearchResponse = await fetch(`https://r.jina.ai/${smSearchUrl}`);
        if (smSearchResponse.ok) {
            const searchText = await smSearchResponse.text();
            const targetUrl = extractTargetUrl(searchText, "sportsmole.co.uk");
            results.sportsMole.targetUrl = targetUrl;

            if (targetUrl) {
                const pageResponse = await fetch(`https://r.jina.ai/${targetUrl}`);
                if (pageResponse.ok) {
                    const pageText = await pageResponse.text();
                    const matchPrediction = pageText.match(/We say:[^\n]+/i);
                    results.sportsMole.status = "Success";
                    results.sportsMole.extracted = matchPrediction ? matchPrediction[0].trim() : "Prediction phrase not found on page";
                } else {
                    results.sportsMole.status = `Failed fetching target page: ${pageResponse.status}`;
                }
            } else {
                results.sportsMole.status = "Could not find Sports Mole link in search results";
            }
        }

        // --- חילוץ וגירוד עבור Sportskeeda ---
        const skSearchResponse = await fetch(`https://r.jina.ai/${skSearchUrl}`);
        if (skSearchResponse.ok) {
            const searchText = await skSearchResponse.text();
            const targetUrl = extractTargetUrl(searchText, "sportskeeda.com");
            results.sportskeeda.targetUrl = targetUrl;

            if (targetUrl) {
                const pageResponse = await fetch(`https://r.jina.ai/${targetUrl}`);
                if (pageResponse.ok) {
                    const pageText = await pageResponse.text();
                    // Sportskeeda משתמשים בפורמט "Prediction:"
                    const matchPrediction = pageText.match(/Prediction:[^\n]+/i);
                    results.sportskeeda.status = "Success";
                    results.sportskeeda.extracted = matchPrediction ? matchPrediction[0].trim() : "Prediction phrase not found on page";
                } else {
                    results.sportskeeda.status = `Failed fetching target page: ${pageResponse.status}`;
                }
            } else {
                results.sportskeeda.status = "Could not find Sportskeeda link in search results";
            }
        }

        res.status(200).json({
            message: `Dynamic test for ${matchQuery} completed`,
            results: results
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}