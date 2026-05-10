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
const btnCalibrate = document.getElementById('btn-calibrate');

// State
let isSyncing = false;
let isCalibrating = false;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setupEventListeners();
});

function setupEventListeners() {
    btnSync.addEventListener('click', handleSync);
    btnCalibrate.addEventListener('click', handleCalibrate);
}

// Fetch initial data
async function fetchData() {
    showLoader(true);
    hideError();

    try {
        const response = await fetch('/api/get-data');
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        renderData(data);
    } catch (error) {
        console.error("Failed to fetch data:", error);
        showError(`Failed to load predictions: ${error.message}`);
    } finally {
        showLoader(false);
    }
}

// Render data to the UI
function renderData(data) {
    const { predictions, algorithmState, accuracyScore, totalResolvedMatches } = data;

    // 1. Update Accuracy Score
    accuracyScoreEl.textContent = `${accuracyScore}%`;

    // 2. Update Algorithm Status
    if (algorithmState) {
        const updatedDate = formatDate(algorithmState.updated_at);
        algorithmStatusEl.innerHTML = `Algorithm weights updated: ${updatedDate} | Odds: <span class="font-mono text-gray-300">${algorithmState.odds_weight}</span> | Momentum: <span class="font-mono text-gray-300">${algorithmState.momentum_weight}</span>`;
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
function createPredictionCard(prediction) {
    const {
        home_team,
        away_team,
        match_date,
        predicted_outcome,
        predicted_probability,
        predicted_home_goals,
        predicted_away_goals
    } = prediction;

    const probPercent = predicted_probability ? Math.round(predicted_probability * 100) : 0;

    let predictionText = predicted_outcome || 'Pending';
    if (predicted_home_goals !== null && predicted_away_goals !== null) {
        predictionText = `${predicted_home_goals} - ${predicted_away_goals}`;
    }

    const card = document.createElement('div');
    card.className = 'bg-gray-800 rounded-lg p-5 border border-gray-700 shadow-sm hover:border-blue-500/50 transition-colors flex flex-col';

    card.innerHTML = `
        <div class="text-xs text-gray-400 mb-3 border-b border-gray-700 pb-2">${formatDate(match_date)}</div>

        <div class="flex justify-between items-center mb-4 flex-grow">
            <div class="text-lg font-display font-bold text-center w-[40%] truncate" title="${home_team}">${home_team || 'TBD'}</div>
            <div class="text-sm font-mono text-gray-500 w-[20%] text-center">VS</div>
            <div class="text-lg font-display font-bold text-center w-[40%] truncate" title="${away_team}">${away_team || 'TBD'}</div>
        </div>

        <div class="bg-gray-900 rounded p-3 mb-4 text-center border border-gray-700">
            <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Deterministic Prediction</div>
            <div class="text-xl font-bold text-blue-400">${predictionText}</div>
        </div>

        <div class="mt-auto">
            <div class="flex justify-between text-xs mb-1">
                <span class="text-gray-400">Confidence</span>
                <span class="font-mono text-blue-300">${probPercent}%</span>
            </div>
            <div class="w-full bg-gray-700 rounded-full h-2">
                <div class="bg-gradient-to-r from-blue-600 to-purple-500 h-2 rounded-full" style="width: ${probPercent}%"></div>
            </div>
        </div>
    `;

    return card;
}

// Handle Sync Button Click
async function handleSync() {
    if (isSyncing) return;

    isSyncing = true;
    updateButtonState(btnSync, true, 'FETCHING...');
    hideError();

    try {
        const res = await fetch('/api/sync', { method: 'POST' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to sync fixtures.');
        }
        // Refresh data after successful sync
        await fetchData();
    } catch (error) {
        showError(`Sync Error: ${error.message}`);
    } finally {
        isSyncing = false;
        updateButtonState(btnSync, false, 'FETCH FIXTURES');
    }
}

// Handle Calibrate Button Click
async function handleCalibrate() {
    if (isCalibrating) return;

    isCalibrating = true;
    updateButtonState(btnCalibrate, true, 'RESOLVING...');
    hideError();

    try {
        const res = await fetch('/api/calibrate', { method: 'POST' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to resolve results.');
        }
        // Refresh data after successful calibration
        await fetchData();
    } catch (error) {
        showError(`Calibrate Error: ${error.message}`);
    } finally {
        isCalibrating = false;
        updateButtonState(btnCalibrate, false, 'RESOLVE RESULTS');
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
        // Add spinner
        if (!btn.querySelector('.loader')) {
            const loader = document.createElement('div');
            loader.className = 'loader border-t-white border-white/30';
            btn.insertBefore(loader, span);
        }
    } else {
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
        // Remove spinner
        const loader = btn.querySelector('.loader');
        if (loader) {
            loader.remove();
        }
    }
}
