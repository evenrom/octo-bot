// Utility to format dates
function formatDate(dateString) {
    if (!dateString) return 'Unknown Date';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

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
        renderGlobalStats({ spareRate: '--', strikeRate: '--' });
    }
}

function renderGlobalStats(data = {}) {
    if (!accuracyScoreEl) return;

    const spareRate = Number.isFinite(Number(data?.spareRate)) ? Number(data.spareRate) : '--';
    const strikeRate = Number.isFinite(Number(data?.strikeRate)) ? Number(data.strikeRate) : '--';

    accuracyScoreEl.innerHTML = `
        <div class="flex items-center gap-3 rounded-full border border-white/10 bg-black/20 px-3 py-2 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
            <div class="flex flex-col items-start">
                <span class="text-[10px] uppercase tracking-[0.25em] text-[#dae2fd]/60">Spare</span>
                <span class="text-sm font-jetbrains-mono font-semibold text-[#39ff14]">${spareRate}%</span>
            </div>
            <div class="h-7 w-px bg-white/10"></div>
            <div class="flex flex-col items-start">
                <span class="text-[10px] uppercase tracking-[0.25em] text-[#dae2fd]/60">Strike</span>
                <span class="text-sm font-jetbrains-mono font-semibold text-[#39ff14]">${strikeRate}%</span>
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
        const updatedDate = formatDate(algorithmState.updated_at);
        algorithmStatusEl.innerHTML = `Algorithm weights updated: ${updatedDate} | Odds: <span class="font-jetbrains-mono text-[#dae2fd]">${algorithmState.odds_weight}</span> | Momentum: <span class="font-jetbrains-mono text-[#dae2fd]">${algorithmState.momentum_weight}</span>`;
    } else {
        algorithmStatusEl.textContent = 'Algorithm state pending...';
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
    const renderedItems = formArray.slice(0, 3).map(match => {
        const outcome = match?.outcome || '';
        const summaryText = match?.summary || '';

        let outcomeClass = '';
        if (outcome === 'W') outcomeClass = 'form-win';
        else if (outcome === 'D') outcomeClass = 'form-draw';
        else if (outcome === 'L') outcomeClass = 'form-loss';

        return `
            <div class="form-indicator ${outcomeClass} w-auto text-[10px] font-mono px-2 py-1 rounded">${summaryText}</div>
        `;
    }).join('');

    if (!renderedItems) {
        return `<div class="text-[11px] text-[#dae2fd]/50">No recent matches</div>`;
    }

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
        sportsmole_prediction
    } = prediction;

    const clampPercent = (v) => {
        const n = Number(v);
        if (!isFinite(n)) return 0;
        const rounded = Math.round(n);
        return Math.max(0, Math.min(100, rounded));
    };

    const homePercent = clampPercent(home_prob);
    const drawPercent = clampPercent(draw_prob);
    const awayPercent = clampPercent(away_prob);

    const homeFormData = parseFormData(home_form);
    const awayFormData = parseFormData(away_form);

    const homeFormHtml = renderFormHtml(homeFormData);
    const awayFormHtml = renderFormHtml(awayFormData);

    const card = document.createElement('div');
    card.className = 'bg-white/5 backdrop-blur-[24px] border border-white/10 shadow-[inset_1px_1px_0px_rgba(255,255,255,0.05)] rounded-lg p-5 hover:border-[#39ff14]/40 transition-all flex flex-col';

    card.innerHTML = `
        <div class="text-xs text-[#dae2fd]/70 mb-3 border-b border-white/10 pb-2 font-sora flex justify-between">
            <span>${formatDate(kickoff_time)}</span>
        </div>

        <div class="mb-4">
            <h3 class="text-xl font-space-grotesk font-bold text-center text-white mb-2">${match_title || 'TBD'}</h3>
        </div>

        <div class="mb-4">
            <div class="flex justify-between text-xs mb-1 font-sora">
                <span class="text-blue-400">Home ${homePercent}%</span>
                <span class="text-gray-400">Draw ${drawPercent}%</span>
                <span class="text-red-400">Away ${awayPercent}%</span>
            </div>
            <div class="w-full bg-black/30 rounded-full h-2 flex overflow-hidden">
                <div class="bg-blue-500 h-2" style="width: ${homePercent}%"></div>
                <div class="bg-gray-500 h-2" style="width: ${drawPercent}%"></div>
                <div class="bg-red-500 h-2" style="width: ${awayPercent}%"></div>
            </div>
            ${sportsmole_prediction && sportsmole_prediction !== 'No preview found' ? `
                <div style="margin-top: 15px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 6px; border-left: 3px solid #4caf50; font-size: 0.85rem; text-align: center; color: #e0e0e0;">
                    <span style="color: #4caf50; font-weight: bold; display: block; margin-bottom: 2px; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.5px;">Sports Mole Expert Pick</span>
                    ${sportsmole_prediction}
                </div>
            ` : ''}
        </div>

        <div class="mt-auto grid grid-cols-2 gap-2">
            <div class="bg-black/20 rounded p-3 border border-white/5">
                <div class="text-[10px] text-[#dae2fd]/50 uppercase tracking-wide mb-3 font-sora">Home Team Form</div>
                ${homeFormHtml}
            </div>
            <div class="bg-black/20 rounded p-3 border border-white/5">
                <div class="text-[10px] text-[#dae2fd]/50 uppercase tracking-wide mb-3 font-sora">Away Team Form</div>
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
        updateButtonState(btnSync, false, 'FETCH PREDICTIONS');
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