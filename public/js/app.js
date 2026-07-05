// Utility to format dates
function formatDate(dateString) {
    if (!dateString) return 'Unknown Date';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const cleanToScoreOnly = (text) => {
    if (!text || text === 'No data' || text === 'Pending') return text;
    const match = String(text).match(/(\d+)\s*[-–]\s*(\d+)/);
    return match ? `${match[1]}-${match[2]}` : text;
};

const codeToFullName = {
    'BRA': 'Brazil', 'ARG': 'Argentina', 'MAR': 'Morocco', 'HTI': 'Haiti',
    'FRA': 'France', 'GER': 'Germany', 'NED': 'Netherlands', 'POR': 'Portugal',
    'ESP': 'Spain', 'ENG': 'England', 'USA': 'United States', 'BEL': 'Belgium',
    'CRO': 'Croatia', 'DEN': 'Denmark', 'SUI': 'Switzerland', 'SWE': 'Sweden',
    'NOR': 'Norway', 'ITA': 'Italy', 'POL': 'Poland', 'MEX': 'Mexico',
    'CAN': 'Canada', 'JPN': 'Japan', 'KOR': 'South Korea', 'AUS': 'Australia',
    'KSA': 'Saudi Arabia', 'IRN': 'Iran', 'ECU': 'Ecuador', 'PER': 'Peru',
    'URU': 'Uruguay', 'COL': 'Colombia', 'SEN': 'Senegal', 'TUN': 'Tunisia',
    'EGY': 'Egypt', 'GHA': 'Ghana', 'NGA': 'Nigeria', 'CMR': 'Cameroon',
    'SRB': 'Serbia', 'QAT': 'Qatar', 'BIH': 'Bosnia & Herzegovina', 'CZE': 'Czech Republic',
    'RSA': 'South Africa', 'AUT': 'Austria', 'JOR': 'Jordan', 'ALG': 'Algeria',
    'IRQ': 'Iraq', 'NZL': 'New Zealand', 'CPV': 'Cape Verde', 'CIV': 'Ivory Coast',
    'CUW': 'Curaçao', 'TUR': 'Turkey', 'SCO': 'Scotland', 'PAR': 'Paraguay',
    'COD': 'DR Congo', 'PAN': 'Panama', 'UZB': 'Uzbekistan'
};

const shortCodes = {
    'brazil': 'BRA', 'norway': 'NOR', 'mexico': 'MEX', 'england': 'ENG',
    'france': 'FRA', 'paraguay': 'PAR', 'canada': 'CAN', 'morocco': 'MAR',
    'usa': 'USA', 'belgium': 'BEL', 'switzerland': 'SUI', 'colombia': 'COL',
    'egypt': 'EGY', 'argentina': 'ARG', 'japan': 'JPN', 'ivory coast': 'CIV',
    'south africa': 'RSA', 'sweden': 'SWE', 'netherlands': 'NED', 'haiti': 'HTI',
    'bosnia': 'BIH', 'senegal': 'SEN', 'iraq': 'IRQ', 'jordan': 'JOR', 'scotland': 'SCO',
    'uruguay': 'URU', 'saudi arabia': 'KSA', 'germany': 'GER', 'austria': 'AUT', 'croatia': 'CRO', 'algeria': 'ALG'
};

const teamCodeLookup = {
    'Brazil': 'BRA', 'Argentina': 'ARG', 'Morocco': 'MAR', 'Haiti': 'HTI',
    'France': 'FRA', 'Germany': 'GER', 'Netherlands': 'NED', 'Portugal': 'POR',
    'Spain': 'ESP', 'England': 'ENG', 'United States': 'USA', 'USA': 'USA',
    'Belgium': 'BEL', 'Croatia': 'CRO', 'Denmark': 'DEN', 'Switzerland': 'SUI',
    'Sweden': 'SWE', 'Norway': 'NOR', 'Italy': 'ITA', 'Poland': 'POL',
    'Mexico': 'MEX', 'Canada': 'CAN', 'Japan': 'JPN', 'South Korea': 'KOR',
    'Australia': 'AUS', 'Saudi Arabia': 'KSA', 'Iran': 'IRN', 'Ecuador': 'ECU',
    'Uruguay': 'URU', 'Colombia': 'COL', 'Senegal': 'SEN', 'Tunisia': 'TUN',
    'Egypt': 'EGY', 'Ghana': 'GHA', 'Qatar': 'QAT', 'Bosnia & Herzegovina': 'BIH',
    'Czech Republic': 'CZE', 'South Africa': 'RSA', 'Austria': 'AUT', 'Jordan': 'JOR',
    'Algeria': 'ALG', 'Iraq': 'IRQ', 'New Zealand': 'NZL', 'Cape Verde': 'CPV',
    'Ivory Coast': 'CIV', 'Ivory_Coast': 'CIV', 'South_Africa': 'RSA', 'Curaçao': 'CUW',
    'Turkey': 'TUR', 'Scotland': 'SCO', 'Paraguay': 'PAR', 'DR Congo': 'COD',
    'Panama': 'PAN', 'Uzbekistan': 'UZB'
};

const normalizeLookupKey = (value) => String(value || '').replace(/_/g, ' ').trim().toLowerCase();

const resolveTeamCode = (value) => {
    if (!value && value !== 0) return '';

    const rawValue = String(value).trim();
    if (!rawValue) return '';

    const normalizedKey = normalizeLookupKey(rawValue);
    if (shortCodes[normalizedKey]) return shortCodes[normalizedKey];

    const variants = [rawValue, rawValue.replace(/\s+/g, '_'), rawValue.replace(/_/g, ' '), normalizedKey];
    for (const variant of variants) {
        if (teamCodeLookup[variant]) return teamCodeLookup[variant];
    }

    const compact = rawValue.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return compact.length === 3 ? compact : '';
};

// Elements
const accuracyScoreEl = document.getElementById('accuracy-score');
const dataGridEl = document.getElementById('data-grid');
const mainLoaderEl = document.getElementById('main-loader');
const errorMessageEl = document.getElementById('error-message');
const algorithmStatusEl = document.getElementById('algorithm-status');

const btnSync = document.getElementById('btn-sync');

// State
let isSyncing = false;

// ==========================================
// --- HTML5 Canvas Mascot Engine ---
// ==========================================
const MASCOT_CONFIG = {
    width: 192,
    height: 208,
    imageSrc: '/spritesheet.png',
    fps: 10 
};

// הגדרת המצבים: איזה שורה (0-based) וכמה פריימים יש לה כדי למנוע "פריים ריק"
const mascotStates = {
    'idle':         { row: 0, frames: 8 }, // תוקן ל-8
    'running':      { row: 1, frames: 8 }, // תוקן ל-8
    'runningRight': { row: 2, frames: 8 }, // תוקן ל-8
    'runningLeft':  { row: 3, frames: 8 }, // תוקן ל-8
    'correct':      { row: 4, frames: 7 }, // שורה 5 - הימור נכון (קפיצה)
    'waving':       { row: 5, frames: 8 }, // תוקן ל-8 (זה מה שתיקן את הנפנוף!)
    'loading':      { row: 6, frames: 6 }, // שורה 7 - טעינה (סחרור)
    'failed':       { row: 7, frames: 8 }, // תוקן ל-8 
    'sleeping':     { row: 8, frames: 8 }  // תוקן ל-8
};

// המצבים ביניהם התמנון עובר אוטומטית (לא כולל 5, 7, 8)
const autoStatesPool = ['waving', 'idle', 'running', 'runningRight', 'runningLeft', 'sleeping'];

let currentState = 'waving'; // מתחיל בנפנוף
let currentFrame = 0;
let lastFrameTime = 0;
let mascotAnimationId = null;

let loopsCompleted = 0;
let targetLoops = getRandomLoops(); // הגרלה בין 3 ל-5

function getRandomLoops() {
    return Math.floor(Math.random() * 3) + 3; // 3, 4, 5
}

const spriteImage = new Image();
spriteImage.src = MASCOT_CONFIG.imageSrc;

function drawMascot(timestamp) {
    const canvas = document.getElementById('mascot-canvas');
    if (!canvas) return;

    if (!spriteImage.complete) {
        mascotAnimationId = requestAnimationFrame(drawMascot);
        return;
    }

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    if (timestamp - lastFrameTime > (1000 / MASCOT_CONFIG.fps)) {
        currentFrame++;
        
        // בדיקה האם סיימנו הרצה של האנימציה הנוכחית
        if (currentFrame >= mascotStates[currentState].frames) {
            currentFrame = 0;
            loopsCompleted++;

            // אם סיימנו מספיק הרצות ואנחנו במצב אוטומטי, נעבור למצב הבא
            if (autoStatesPool.includes(currentState) && loopsCompleted >= targetLoops) {
                switchToNextAutoState();
            }
        }
        
        lastFrameTime = timestamp;
        
        ctx.clearRect(0, 0, MASCOT_CONFIG.width, MASCOT_CONFIG.height);
        
        const sourceX = currentFrame * MASCOT_CONFIG.width;
        const sourceY = mascotStates[currentState].row * MASCOT_CONFIG.height;
        
        ctx.drawImage(
            spriteImage,
            sourceX, sourceY, MASCOT_CONFIG.width, MASCOT_CONFIG.height,
            0, 0, MASCOT_CONFIG.width, MASCOT_CONFIG.height
        );
    }

    mascotAnimationId = requestAnimationFrame(drawMascot);
}

function switchToNextAutoState() {
    const currentIndex = autoStatesPool.indexOf(currentState);
    let nextIndex = currentIndex + 1;
    if (nextIndex >= autoStatesPool.length) nextIndex = 0;
    
    window.setMascotState(autoStatesPool[nextIndex]);
}

function setDynamicFavicon() {
    const canvas = document.createElement('canvas');
    canvas.width = MASCOT_CONFIG.width;
    canvas.height = MASCOT_CONFIG.height;
    const ctx = canvas.getContext('2d');
    
    // Draw first frame (row 0, frame 0)
    ctx.drawImage(
        spriteImage,
        0, 0, MASCOT_CONFIG.width, MASCOT_CONFIG.height,
        0, 0, MASCOT_CONFIG.width, MASCOT_CONFIG.height
    );
    
    const dataURL = canvas.toDataURL('image/png');
    const favicon = document.getElementById('favicon');
    if (favicon) {
        favicon.href = dataURL;
    }
}

spriteImage.onload = () => {
    setDynamicFavicon();
    mascotAnimationId = requestAnimationFrame(drawMascot);
};

// פונקציית החלפת המצבים. מקבלת מצב, ואופציה לזמן חזרה אוטומטית למצב קבוע
let revertTimeout = null;
window.setMascotState = function(state, revertDelayMs = null) {
    if (mascotStates[state] !== undefined) {
        currentState = state;
        currentFrame = 0; // תמיד להתחיל מפריים ראשון באנימציה החדשה
        
        // איפוס טיימר חזרה למצב קבוע (אם היה כזה)
        if (revertTimeout) {
            clearTimeout(revertTimeout);
            revertTimeout = null;
        }
        
        // אם עברנו לאחד מהמצבים האוטומטיים, נאתחל את ספירת הלופים
        if (autoStatesPool.includes(state)) {
            loopsCompleted = 0;
            targetLoops = getRandomLoops();
        }

        // אם הוגדר זמן חזרה (למשל אחרי הימור נכון או כישלון), נחזיר אותו לנפנוף
        if (revertDelayMs) {
            revertTimeout = setTimeout(() => {
                window.setMascotState('waving');
            }, revertDelayMs);
        }
    }
};
// ==========================================

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.setMascotState('waving');
    fetchGlobalStats();
    fetchData();
    setupEventListeners();
});

function setupEventListeners() {
    btnSync.addEventListener('click', handleSync);

    const mascotCanvas = document.getElementById('mascot-canvas');
    if (mascotCanvas) {
        mascotCanvas.addEventListener('click', () => {
            if (isSyncing) return; // לא להפריע לו אם הוא טוען
            switchToNextAutoState(); // כל לחיצה מעבירה לאנימציה הבאה במאגר האוטומטי
        });
    }
}

async function fetchGlobalStats() {
    if (!accuracyScoreEl) return;

    try {
        const response = await fetch('/api/global-stats');
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        renderGlobalStats(data);
    } catch (error) {
        console.error('Failed to fetch global stats:', error);
        renderGlobalStats({
            smStats: { spareRate: '--', strikeRate: '--' },
            siStats: { spareRate: '--', strikeRate: '--' },
            gpt55Stats: { spareRate: '--', strikeRate: '--' },
            opusStats: { spareRate: '--', strikeRate: '--' },
            fableStats: { spareRate: '--', strikeRate: '--' }
        });
    }
}

function renderGlobalStats(data = {}) {
    if (!accuracyScoreEl) return;

    const smStats = data?.smStats || {};
    const siStats = data?.siStats || {};
    const gpt55Stats = data?.gpt55Stats || {};
    const opusStats = data?.opusStats || {};
    const fableStats = data?.fableStats || {};

    const formatStatValue = (stats, key) => {
        const value = Number(stats?.[key]);
        return Number.isFinite(value) ? `${value}%` : '--';
    };

    accuracyScoreEl.innerHTML = `
        <div class="stats-shell">
            <div class="stats-title">Analyst Accuracy</div>
            <div class="stats-grid">
                <div class="stats-pill"><span class="stats-label">SM</span><span class="stats-values">Sp ${formatStatValue(smStats, 'spareRate')} · St ${formatStatValue(smStats, 'strikeRate')}</span></div>
                <div class="stats-pill"><span class="stats-label">SI</span><span class="stats-values">Sp ${formatStatValue(siStats, 'spareRate')} · St ${formatStatValue(siStats, 'strikeRate')}</span></div>
                <div class="stats-pill"><span class="stats-label">GPT</span><span class="stats-values">Sp ${formatStatValue(gpt55Stats, 'spareRate')} · St ${formatStatValue(gpt55Stats, 'strikeRate')}</span></div>
                <div class="stats-pill"><span class="stats-label">OPUS</span><span class="stats-values">Sp ${formatStatValue(opusStats, 'spareRate')} · St ${formatStatValue(opusStats, 'strikeRate')}</span></div>
                <div class="stats-pill"><span class="stats-label">FABLE</span><span class="stats-values">Sp ${formatStatValue(fableStats, 'spareRate')} · St ${formatStatValue(fableStats, 'strikeRate')}</span></div>
            </div>
        </div>
    `;
}

// Fetch initial data
async function fetchData() {
    showLoader(true);
    window.setMascotState('loading'); // שורה 7 - טעינה
    hideError();

    try {
        const response = await fetch('/api/get-data');
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        renderData(data);
        window.setMascotState('waving'); // סיים לטעון, חוזר לנפנוף
    } catch (error) {
        console.error("Failed to fetch data:", error);
        showError(`Failed to load predictions: ${error.message}`);
        window.setMascotState('failed', 4000); // שורה 8 - נכשל (יבכה ל-4 שניות ויחזור)
    } finally {
        showLoader(false);
    }
}

// Render data to the UI
function renderData(data) {
    const { predictions, algorithmState, accuracyScore, totalResolvedMatches } = data;

    // 1. Update Algorithm Status
    if (algorithmState) {
        algorithmStatusEl.textContent = '';
    } else {
        algorithmStatusEl.textContent = '';
    }

    // 3. Render Data Grid
    dataGridEl.innerHTML = ''; // Clear existing

    if (!predictions || predictions.length === 0) {
        dataGridEl.innerHTML = `<div class="col-span-full text-center text-gray-500 py-8">No predictions found in the database.</div>`;
        return;
    }

    predictions.forEach(p => {
        const card = createPredictionCard(p);
        dataGridEl.appendChild(card);
    });
}

// Create individual prediction card
function parseFormData(formData) {
    if (!formData) return [];

    if (typeof formData === 'string') {
        try {
            const parsed = JSON.parse(formData);
            if (Array.isArray(parsed)) return parsed;
            if (parsed && typeof parsed === 'object') return Object.values(parsed);
            return [];
        } catch (error) {
            return [];
        }
    }

    if (Array.isArray(formData)) return formData;
    if (typeof formData === 'object') return Object.values(formData);
    return [];
}

function renderFormHtml(formArray) {
    const safeFormArray = Array.isArray(formArray) ? formArray : [];
    if (!safeFormArray.length) {
        return `<div class="text-[11px] text-[#dae2fd]/50">No matches</div>`;
    }

    const renderedItems = safeFormArray.slice(0, 3).map(match => {
        const outcome = match?.outcome || '';
        const summaryText = match?.summary || '';
        const parts = String(summaryText).trim().split(/\s+/).filter(Boolean);
        const homeCode = resolveTeamCode(parts[0]) || '';
        const awayCode = resolveTeamCode(parts[2]) || '';
        const homeFullName = codeToFullName[homeCode] || homeCode;
        const awayFullName = codeToFullName[awayCode] || awayCode;
        const tooltipText = homeFullName && awayFullName ? `${homeFullName} vs ${awayFullName}` : '';
        const tooltipAttr = tooltipText ? ` data-tooltip="${tooltipText.replace(/"/g, '&quot;')}"` : '';

        let outcomeClass = '';
        if (outcome === 'W') outcomeClass = 'form-win';
        else if (outcome === 'D') outcomeClass = 'form-draw';
        else if (outcome === 'L') outcomeClass = 'form-loss';

        return `
            <div class="custom-tooltip-wrapper form-indicator ${outcomeClass} w-auto text-[10px] font-mono px-2 py-1 rounded"${tooltipAttr}>${summaryText}</div>
        `;
    }).join('');

    return `<div class="form-container">${renderedItems}</div>`;
}

function createPredictionCard(prediction) {
    const {
        match_title,
        kickoff_time,
        home_prob,
        draw_prob,
        away_prob,
        home_form,
        away_form,
        sportsmole_prediction,
        si_prediction,
        gpt55_prediction,
        opus_prediction,
        fable_prediction
    } = prediction;

    const clampPercent = (v) => {
        const n = Number(v);
        if (!isFinite(n)) return 0;
        const rounded = Math.round(n);
        return Math.max(0, Math.min(100, rounded));
    };

    const renderPredictionRow = (label, value) => {
        const normalizedValue = typeof value === 'string' ? value.trim() : '';
        const isPlaceholder = !normalizedValue || ['No preview found', 'No input found', 'No data', 'Pending'].includes(normalizedValue);
        const displayValue = isPlaceholder ? 'No data' : normalizedValue;

        return `
            <div class="expert-prediction-row">
                <span class="expert-prediction-label">${label}</span>
                <span class="expert-prediction-value ${isPlaceholder ? 'text-[#dae2fd]/50' : 'text-[#dae2fd]'}">${displayValue}</span>
            </div>
        `;
    };

    const sanitizedSportsMolePrediction = typeof sportsmole_prediction === 'string'
        ? sportsmole_prediction.replace(/^We say:\s*/i, '').trim()
        : '';

    const homePercent = clampPercent(home_prob);
    const drawPercent = clampPercent(draw_prob);
    const awayPercent = clampPercent(away_prob);

    const homeFormData = parseFormData(home_form);
    const awayFormData = parseFormData(away_form);

    const homeFormHtml = renderFormHtml(homeFormData);
    const awayFormHtml = renderFormHtml(awayFormData);

    const card = document.createElement('div');
    card.className = 'match-card bg-white/5 backdrop-blur-[24px] border border-white/10 shadow-[inset_1px_1px_0px_rgba(255,255,255,0.05)] rounded-lg p-4 hover:border-[#39ff14]/40 transition-all flex flex-col';

    card.innerHTML = `
        <div class="text-[11px] text-[#dae2fd]/70 mb-2 border-b border-white/10 pb-2 font-sora flex justify-between">
            <span>${formatDate(kickoff_time)}</span>
        </div>

        <div class="mb-2">
            <h3 class="text-lg font-space-grotesk font-bold text-center text-white">${match_title || 'TBD'}</h3>
        </div>

        <div class="mb-2">
            <div class="flex justify-between text-[11px] mb-1 font-sora">
                <span class="text-blue-400">Home ${homePercent}%</span>
                <span class="text-gray-400">Draw ${drawPercent}%</span>
                <span class="text-red-400">Away ${awayPercent}%</span>
            </div>
            <div class="w-full bg-black/30 rounded-full h-2 flex overflow-hidden">
                <div class="bg-blue-500 h-2" style="width: ${homePercent}%"></div>
                <div class="bg-gray-500 h-2" style="width: ${drawPercent}%"></div>
                <div class="bg-red-500 h-2" style="width: ${awayPercent}%"></div>
            </div>
        </div>

        <div class="expert-predictions">
            <div class="expert-predictions__header">Expert predictions</div>
            <div class="expert-predictions__rows">
                ${renderPredictionRow('Sports Mole', cleanToScoreOnly(sanitizedSportsMolePrediction))}
                ${renderPredictionRow('Sports Illustrated', cleanToScoreOnly(si_prediction))}
                ${renderPredictionRow('GPT-5.5', gpt55_prediction)}
                ${renderPredictionRow('Opus', opus_prediction)}
                ${renderPredictionRow('Fable', fable_prediction)}
            </div>
        </div>

        <div class="mt-2 grid grid-cols-2 gap-2">
            <div class="bg-black/20 rounded p-2 border border-white/5">
                <div class="text-[10px] text-[#dae2fd]/50 uppercase tracking-wide mb-2 font-sora">Home Team Form</div>
                ${homeFormHtml}
            </div>
            <div class="bg-black/20 rounded p-2 border border-white/5">
                <div class="text-[10px] text-[#dae2fd]/50 uppercase tracking-wide mb-2 font-sora">Away Team Form</div>
                ${awayFormHtml}
            </div>
        </div>
    `;

    return card;
}

// Handle Sync Button Click
async function handleSync() {
    if (isSyncing) return;

    isSyncing = true;
    updateButtonState(btnSync, true, 'CALCULATING...');
    window.setMascotState('loading'); // שורה 7 - טעינה
    hideError();

    try {
        const res = await fetch('/api/sync', { method: 'POST' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to sync fixtures.');
        }
        await fetchData();
        await fetchGlobalStats();
        window.setMascotState('correct', 4000); // Call on success
    } catch (error) {
        showError(`Sync Error: ${error.message}`);
        window.setMascotState('failed', 4000); // שורה 8 - נכשל (יבכה ל-4 שניות ויחזור)
    } finally {
        isSyncing = false;
        updateButtonState(btnSync, false, 'SYNC');
    }
}

// UI Helpers
function showLoader(show) {
    if (show) {
        mainLoaderEl.classList.remove('hidden');
        dataGridEl.classList.add('hidden');
    } else {
        mainLoaderEl.classList.add('hidden');
        dataGridEl.classList.remove('hidden');
    }
}

function showError(msg) {
    errorMessageEl.textContent = msg;
    errorMessageEl.classList.remove('hidden');
}

function hideError() {
    errorMessageEl.classList.add('hidden');
    errorMessageEl.textContent = '';
}

function updateButtonState(btn, isLoading, text) {
    const span = btn.querySelector('span');
    span.textContent = text;

    if (isLoading) {
        btn.disabled = true;
        btn.classList.add('opacity-70', 'cursor-not-allowed');
        if (!btn.querySelector('.loader')) {
            const loader = document.createElement('div');
            loader.className = 'loader border-t-white border-white/30';
            btn.insertBefore(loader, span);
        }
    } else {
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
        const loader = btn.querySelector('.loader');
        if (loader) {
            loader.remove();
        }
    }
}

// Global click handler for custom tooltips (mobile tap toggle + desktop hover fallback)
document.addEventListener('click', (e) => {
    const wrapper = e.target.closest('.custom-tooltip-wrapper');
    if (!wrapper) {
        document.querySelectorAll('.custom-tooltip-wrapper.active').forEach(el => el.classList.remove('active'));
        return;
    }
    const wasActive = wrapper.classList.contains('active');
    document.querySelectorAll('.custom-tooltip-wrapper.active').forEach(el => el.classList.remove('active'));
    if (!wasActive) wrapper.classList.add('active');
});