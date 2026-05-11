# Implementation_Brief.md

## Important Framing
* **Project Scope:** Single-user application. No authentication or multi-user state required.
* **Constraint Checklist & Confidence Score:** Strict adherence to zero-cost architecture.
* **Prohibitions:** Do not use Google Sheets as a database. Do not render placeholders or mock APIs in the final output. Do not utilize opaque/black-box AI models for predictions.

## Selected Stack
* **Environment:** Node.js backend logic connected to VS Code Web (deployed via Vercel).
* **Frontend:** Vanilla HTML/JS with Tailwind CSS (via CDN).
* **Database:** Turso (Managed SQLite) using `@libsql/client`.

## Tech Constraints
* **API Rate Limits:** Free-tier limits apply to API-Football (RapidAPI) and The Odds API. All external API calls must be wrapped in a throttle/delay utility function (minimum `1500ms` between sequential requests) to prevent HTTP 429 Too Many Requests errors.
* **Serverless Constraints:** Vercel functions have strict timeout limits. Data fetching and DB writing must be optimized to execute within the standard 10-second limit.

## Component Architecture
1.  **TopAppBar / Control Panel:** Houses the global Accuracy Score and manual trigger buttons (`FETCH FIXTURES`, `RESOLVE RESULTS`).
2.  **Mascot Display (Hero):** A container rendering the `spritesheet.jpg` using a JS/CSS steps animation module. Driven by application state (`idle`, `running`, `rolling`, `failed`).
3.  **Data Grid:** Iterates over the Turso `Predictions` table to render Glassmorphism cards displaying home/away odds, deterministic prediction, and a visual confidence progress bar.

## Core Logic
* **Algorithm Processing:** Prediction is calculated by a weighted matrix: `(Odds_Weight * Implied_Probability) + (Momentum_Weight * Form)`.
* **Self-Correction (AWE):** On `Resolve Results`, the system calculates the variance between predicted probability and actual outcome. If variance > threshold, weights are adjusted by a small step factor (e.g., `Delta 0.05`) and saved to the `AlgorithmState` table.
* **Scoring:** * Exact Score Match: 100 points.
    * Correct Direction (e.g., predicted Win, actual Win but different score): 50 points.
    * Incorrect: 0 points.

## Deliverables Instructions
Provide fully functional, production-ready code. All database connections, fetch requests, and state management logic must be fully implemented. Do not use `// TODO` comments for core logic. Provide SQL initialization scripts for the database.

## Database Schema (By Raymond)
```sql
-- Turso SQLite Schema

CREATE TABLE Matches (
    match_id TEXT PRIMARY KEY,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    kickoff_time DATETIME NOT NULL,
    home_odds REAL,
    draw_odds REAL,
    away_odds REAL,
    api_last_updated DATETIME
);

CREATE TABLE Predictions (
    match_id TEXT PRIMARY KEY,
    predicted_winner TEXT,
    home_win_prob REAL,
    draw_prob REAL,
    away_win_prob REAL,
    confidence_level TEXT,
    FOREIGN KEY (match_id) REFERENCES Matches(match_id)
);

CREATE TABLE Results (
    match_id TEXT PRIMARY KEY,
    home_score INTEGER,
    away_score INTEGER,
    accuracy_points INTEGER,
    FOREIGN KEY (match_id) REFERENCES Matches(match_id)
);

CREATE TABLE AlgorithmState (
    state_id INTEGER PRIMARY KEY AUTOINCREMENT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    odds_weight REAL NOT NULL,
    momentum_weight REAL NOT NULL,
    h2h_weight REAL NOT NULL,
    global_accuracy_score REAL NOT NULL
);