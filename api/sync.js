import { db } from '../lib/db.js';

const THE_ODDS_API_KEY = process.env.THE_ODDS_API_KEY;
const ODDS_API_HOST = 'api.the-odds-api.com';
const SPORT = 'soccer_fifa_world_cup';

// מילון מקיף לתרגום שמות המדינות מהאתר בעברית לבסיס הנתונים באנגלית
const hebrewToEnglish = {
    'ספרד': 'Spain', 'אוסטריה': 'Austria', 'פורטוגל': 'Portugal', 'קרואטיה': 'Croatia',
    'שווייץ': 'Switzerland', 'אלג\'יריה': 'Algeria', 'אלגריה': 'Algeria', 'אוסטרליה': 'Australia', 
    'מצרים': 'Egypt', 'ארגנטינה': 'Argentina', 'כף ורדה': 'Cape Verde', 'קולומביה': 'Colombia', 
    'גאנה': 'Ghana', 'ברזיל': 'Brazil', 'מרוקו': 'Morocco', 'האיטי': 'Haiti', 'סקוטלנד': 'Scotland',
    'גרמניה': 'Germany', 'קוראסאו': 'Curaçao', 'קורסאו': 'Curaçao', 'יפן': 'Japan',
    'הולנד': 'Netherlands', 'חוף השנהב': 'Ivory Coast', 'טוניסיה': 'Tunisia', 'בלגיה': 'Belgium',
    'איראן': 'Iran', 'ניו זילנד': 'New Zealand', 'סנגל': 'Senegal', 'עיראק': 'Iraq',
    'ירדן': 'Jordan', 'סעודיה': 'Saudi Arabia', 'אורוגוואי': 'Uruguay', 'אנגליה': 'England',
    'דרום קוריאה': 'South Korea', 'קוריאה': 'South Korea', 'קנדה': 'Canada', 'צ\'כיה': 'Czech Republic', 
    'דרום אפריקה': 'South Africa', 'ארצות הברית': 'United States', 'ארה"ב': 'USA', 'פרו': 'Peru', 
    'פנמה': 'Panama', 'אוזבקיסטן': 'Uzbekistan', 'בוסניה': 'Bosnia & Herzegovina', 
    'בוסניה והרצגובינה': 'Bosnia & Herzegovina', 'קטאר': 'Qatar'
};

const commonNameToCode = {
    'Brazil': 'BRA', 'Argentina': 'ARG', 'Morocco': 'MAR', 'Haiti': 'HTI',
    'France': 'FRA', 'Germany': 'GER', 'Netherlands': 'NED', 'Portugal': 'POR',
    'Spain': 'ESP', 'England': 'ENG', 'United States': 'USA', 'USA': 'USA',
    'Belgium': 'BEL', 'Croatia': 'CRO', 'Denmark': 'DEN', 'Switzerland': 'SUI',
    'Sweden': 'SWE', 'Norway': 'NOR', 'Italy': 'ITALY', 'Poland': 'POL',
    'Mexico': 'MEX', 'Canada': 'CAN', 'Japan': 'JPN', 'South Korea': 'KOR',
    'Australia': 'AUS', 'Saudi Arabia': 'KSA', 'Iran': 'IRN', 'Ecuador': 'ECU',
    'Uruguay': 'URU', 'Colombia': 'COL', 'Senegal': 'SEN', 'Tunisia': 'TUN',
    'Egypt': 'EGY', 'Ghana': 'GHA', 'Qatar': 'QAT', 'Bosnia & Herzegovina': 'BIH',
    'Czech Republic': 'CZE', 'South Africa': 'RSA', 'Austria': 'AUT', 'Jordan': 'JOR',
    'Algeria': 'ALG', 'Iraq': 'IRQ', 'New Zealand': 'NZL', 'Cape Verde': 'CPV',
    'Ivory Coast': 'CIV', 'Curaçao': 'CUW', 'Turkey': 'TUR', 'Scotland': 'SCO',
    'Paraguay': 'PAR', 'DR Congo': 'COD', 'Panama': 'PAN', 'Uzbekistan': 'UZB'
};

const toThreeLetter = (name) => {
    if (!name) return 'TBD';
    if (commonNameToCode[name]) return commonNameToCode[name];
    return name.replace(/[^A-Za-z ]/g, '').trim().slice(0, 3).toUpperCase();
};

const scrapeNetlifyAgents = async () => {
    const agentsPredictions = {};
    try {
        const response = await fetch("https://r.jina.ai/https://worldcup-betting-agents.netlify.app/");
        if (!response.ok) return agentsPredictions;
        
        const text = await response.text();
        const lines = text.split('\n');
        
        for (const line of lines) {
            if (!line.includes('|') || line.includes('---') || line.includes('משחק')) continue;
            
            const parts = line.split('|').map(p => p.trim());
            if (parts.length < 5) continue;
            
            const matchNameHebrew = parts[1]; // למשל "ספרד–אוסטריה 32 האחרונות"
            const gptPred = parts[2];         // GPT-5.5
            const opusPred = parts[3];        // Opus
            const fablePred = parts[4];       // Fable
            
            // חילוץ שתי המדינות בעברית מתוך מבנה של "קבוצהא–קבוצהב"
            const teamsMatch = matchNameHebrew.match(/^([^\s–]+)–([^\s–\s]+)/);
            if (!teamsMatch) continue;
            
            const homeEng = hebrewToEnglish[teamsMatch[1]];
            const awayEng = hebrewToEnglish[teamsMatch[2]];
            
            if (homeEng && awayEng) {
                const key = `${homeEng}_vs_${awayEng}`;
                agentsPredictions[key] = { gptPred, opusPred, fablePred };
            }
        }
    } catch (e) {
        console.error("Failed scraping Netlify AI agents:", e);
    }
    return agentsPredictions;
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

const scrapeSportsMolePrediction = async (homeTeam, awayTeam) => {
    try {
        const searchQuery = `${homeTeam} vs ${awayTeam} World Cup 2026 Sports Mole preview prediction`;
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
        const searchResponse = await fetch(`https://r.jina.ai/${searchUrl}`);
        if (!searchResponse.ok) return null;
        const searchText = await searchResponse.text();
        const targetUrl = extractTargetUrl(searchText, "sportsmole.co.uk");
        if (targetUrl) {
            const pageResponse = await fetch(`https://r.jina.ai/${targetUrl}`);
            if (pageResponse.ok) {
                const pageText = await pageResponse.text();
                const matchPrediction = pageText.match(/We say:[^\n]+/i);
                return matchPrediction ? matchPrediction[0].trim() : null;
            }
        }
    } catch (e) { console.error(e); }
    return null;
};

const fetchAllowedHistoricalMatches = async () => {
    const url = `https://${ODDS_API_HOST}/v4/sports/${SPORT}/scores/?apiKey=${THE_ODDS_API_KEY}&daysFrom=3`;
    try {
        const response = await fetch(url);
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data.filter(m => m.completed === true) : [];
    } catch { return []; }
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        if (!THE_ODDS_API_KEY) throw new Error("API key missing.");

        // משיכת התחזיות של סוכני ה-AI מ-Netlify
        const netlifyPredictions = await scrapeNetlifyAgents();

        // 1. שמירת משחקי עבר לתוך Results בלי לדרוס נתוני ניבוי קיימים
        const recentMatches = await fetchAllowedHistoricalMatches();
        for (const match of recentMatches) {
            if (!match.scores || match.scores.length < 2) continue;
            const home = match.scores.find(s => s.name === match.home_team);
            const away = match.scores.find(s => s.name === match.away_team);
            
            if (home && away && home.score !== null && away.score !== null) {
                const matchId = `${match.home_team}_vs_${match.away_team}`;
                const revMatchId = `${match.away_team}_vs_${match.home_team}`;
                
                const predCheck = await db.execute({
                    sql: `SELECT sportsmole_prediction, si_prediction, gpt55_prediction, opus_prediction, fable_prediction FROM Predictions WHERE match_title = ?`,
                    args: [`${match.home_team} vs ${match.away_team}`]
                });
                
                const existingSm = predCheck.rows[0]?.sportsmole_prediction || null;
                const existingSi = predCheck.rows[0]?.si_prediction || null;
                
                // שליפת נתוני האייג'נטס הנוכחיים או מהמטמון הקיים
                const aiData = netlifyPredictions[matchId] || netlifyPredictions[revMatchId] || {};
                const existingGpt = aiData.gptPred || predCheck.rows[0]?.gpt55_prediction || null;
                const existingOpus = aiData.opusPred || predCheck.rows[0]?.opus_prediction || null;
                const existingFable = aiData.fablePred || predCheck.rows[0]?.fable_prediction || null;

                await db.execute({
                    sql: `INSERT OR REPLACE INTO Results (match_id, home_score, away_score, accuracy_points, sportsmole_prediction, si_prediction, gpt55_prediction, opus_prediction, fable_prediction) 
                          VALUES (?, ?, ?, 1, 
                            COALESCE(?, (SELECT sportsmole_prediction FROM Results WHERE match_id = ?)), 
                            COALESCE(?, (SELECT si_prediction FROM Results WHERE match_id = ?)),
                            COALESCE(?, (SELECT gpt55_prediction FROM Results WHERE match_id = ?)),
                            COALESCE(?, (SELECT opus_prediction FROM Results WHERE match_id = ?)),
                            COALESCE(?, (SELECT fable_prediction FROM Results WHERE match_id = ?))
                          )`,
                    args: [
                        matchId, Number(home.score), Number(away.score), 
                        existingSm, matchId, existingSi, matchId,
                        existingGpt, matchId, existingOpus, matchId, existingFable, matchId
                    ]
                });
            }
        }

        // 2. משיכת 4 המשחקים הבאים
        const oddsResponse = await fetch(`https://${ODDS_API_HOST}/v4/sports/${SPORT}/odds/?apiKey=${THE_ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=decimal`);
        const allMatches = await oddsResponse.json();
        const upcomingMatches = allMatches.slice(0, 4);

        const localHistory = await db.execute("SELECT match_id, home_score, away_score FROM Results");
        const dbRows = localHistory.rows || [];
        const predictions = [];

        for (const match of upcomingMatches) {
            const bookmaker = match.bookmakers?.find(b => b.markets?.some(m => m.key === 'h2h'));
            const outcomes = bookmaker?.markets.find(m => m.key === 'h2h')?.outcomes || [];

            const homeOdds = Number(outcomes.find(o => o.name === match.home_team)?.price) || 2.0;
            const awayOdds = Number(outcomes.find(o => o.name === match.away_team)?.price) || 2.0;
            const drawOdds = Number(outcomes.find(o => o.name === 'Draw')?.price) || 2.0;

            const sumRaw = (1/homeOdds) + (1/awayOdds) + (1/drawOdds);
            const home_prob = Math.round(((1/homeOdds) / sumRaw) * 100);
            const away_prob = Math.round(((1/awayOdds) / sumRaw) * 100);
            const draw_prob = 100 - home_prob - away_prob;

            const buildForm = (teamName) => {
                const teamCode = toThreeLetter(teamName);
                const list = [];
                for (const row of dbRows) {
                    const parts = row.match_id.split('_vs_');
                    if (parts.length !== 2) continue;
                    const hCode = toThreeLetter(parts[0]);
                    const aCode = toThreeLetter(parts[1]);
                    if (hCode !== teamCode && aCode !== teamCode) continue;

                    const hS = Number(row.home_score);
                    const aS = Number(row.away_score);
                    const summary = `${hCode} ${hS}-${aS} ${aCode}`;
                    if (hCode === teamCode) {
                        list.push({ summary, outcome: hS > aS ? 'W' : (hS < aS ? 'L' : 'D') });
                    } else {
                        list.push({ summary, outcome: aS > hS ? 'W' : (aS < hS ? 'L' : 'D') });
                    }
                }
                return list.length > 0 ? list.slice(-3) : [{ summary: 'No matches', outcome: '' }];
            };

            const matchId = `${match.home_team}_vs_${match.away_team}`;
            const revMatchId = `${match.away_team}_vs_${match.home_team}`;
            const aiData = netlifyPredictions[matchId] || netlifyPredictions[revMatchId] || {};

            // משיכת הנתונים מכל המקורות במקביל
            const smPrediction = await scrapeSportsMolePrediction(match.home_team, match.away_team);
            
            const siCheck = await db.execute({
                sql: `SELECT si_prediction FROM SI_Manual_Inputs WHERE match_title = ? OR match_title = ?`,
                args: [`${match.home_team} vs ${match.away_team}`, `${match.away_team} vs ${match.home_team}`]
            });
            const siPrediction = siCheck.rows[0]?.si_prediction || "No input found";

            // הזרקה אוטומטית של פלייסהולדר לטבלת ההזנה הידנית של SI כדי לחסוך הקלדה
            await db.execute({
                sql: `INSERT OR IGNORE INTO SI_Manual_Inputs (match_title, si_prediction) VALUES (?, 'Pending')`,
                args: [`${match.home_team} vs ${match.away_team}`]
            });

            predictions.push({
                match_title: `${match.home_team} vs ${match.away_team}`,
                home_prob, draw_prob, away_prob,
                kickoff_time: match.commence_time,
                home_form: JSON.stringify(buildForm(match.home_team)),
                away_form: JSON.stringify(buildForm(match.away_team)),
                sportsmole_prediction: smPrediction || "No preview found",
                si_prediction: siPrediction,
                gpt55_prediction: aiData.gptPred || "No data",
                opus_prediction: aiData.opusPred || "No data",
                fable_prediction: aiData.fablePred || "No data"
            });
        }

        // 3. כתיבה מחדש של טבלת התחזיות הפעילות
        await db.execute('DELETE FROM Predictions');
        const insertStatements = predictions.map(p => ({
            sql: `INSERT INTO Predictions (match_title, home_prob, draw_prob, away_prob, kickoff_time, home_form, away_form, sportsmole_prediction, si_prediction, gpt55_prediction, opus_prediction, fable_prediction) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [p.match_title, p.home_prob, p.draw_prob, p.away_prob, p.kickoff_time, p.home_form, p.away_form, p.sportsmole_prediction, p.si_prediction, p.gpt55_prediction, p.opus_prediction, p.fable_prediction]
        }));
        await db.batch(insertStatements);

        res.status(200).json({ success: true, message: "Synced 5 analysts successfully." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
}