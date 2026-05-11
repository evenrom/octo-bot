# PRD.md

## Project Overview
"octo-bot" is a single-user, private Web Application (PWA) designed to predict World Cup match outcomes. The goal is to provide the user with a distinct mathematical advantage in a friendly betting pool. The system operates on a zero-cost architecture, utilizing external free-tier APIs for fixtures and odds, and a self-correcting deterministic algorithm to generate predictions.

## User Flows
1. **Daily Initialization:** The user opens the app and triggers "Telemetry Sync" (manually or via automated daily CRON). The app fetches today's World Cup fixtures and corresponding betting odds.
2. **Prediction Generation:** The engine processes the data through the Adaptive Weighting Engine (AWE), assigns a Confidence Score, and displays the matches with probability percentages on the main dashboard.
3. **Resolution & Calibration:** After match days, the user triggers "Neural Calibration". The app fetches actual results, compares them to predictions (scoring direction vs. exact outcome), updates the global Accuracy Score, and automatically adjusts the algorithm's weights for future matches.

## Feature Breakdown
**Must Have:**
* On-demand data fetching from API-Football (fixtures/results) and The Odds API.
* Separation of data fetching and client rendering (Client reads strictly from Turso DB).
* Self-correcting deterministic algorithm calculating win/draw probabilities.
* Visual interactive mascot (octo-bot) reacting to system states via CSS/Canvas sprite animation (`rolling` for success, `failed` for error, etc.).
* Manual trigger buttons for Sync and Calibration operations.

**Nice to Have:**
* Automated background CRON jobs for Sync/Calibration via Vercel.
* Historical performance charts detailing the shift in algorithm weights over time.

## Data Models
* **MatchData:** `match_id`, `home_team`, `away_team`, `kickoff_time`, `status`.
* **OddsData:** `match_id`, `home_win`, `draw`, `away_win`, `timestamp`.
* **Predictions:** `match_id`, `predicted_outcome`, `home_prob`, `away_prob`, `draw_prob`, `confidence_level`.
* **Results:** `match_id`, `home_score`, `away_score`, `accuracy_score` (direction vs. exact).
* **AlgorithmState:** `timestamp`, `momentum_weight`, `odds_weight`, `h2h_weight`, `global_accuracy`.