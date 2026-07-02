# Database Schema Specification (With Multi-Agent Predictions)

## Table: Results
Tracks definitive match outcomes and historical performance scores for all predictive agents.
- `match_id` (TEXT, PRIMARY KEY): Format `${Home_Team}_vs_${Away_Team}` (English)
- `home_score` (INTEGER, NOT NULL)
- `away_score` (INTEGER, NOT NULL)
- `accuracy_points` (INTEGER, DEFAULT 1)
- `sportsmole_prediction` (TEXT, DEFAULT NULL)
- `si_prediction` (TEXT, DEFAULT NULL)
- `gpt55_prediction` (TEXT, DEFAULT NULL)
- `opus_prediction` (TEXT, DEFAULT NULL)
- `fable_prediction` (TEXT, DEFAULT NULL)

## Table: Predictions
Stores the active 4 upcoming tournament matches with high-level statistics and compiled predictions.
- `match_title` (TEXT, PRIMARY KEY): Format `${Home_Team} vs ${Away_Team}` (English)
- `home_prob` (INTEGER, NOT NULL)
- `draw_prob` (INTEGER, NOT NULL)
- `away_prob` (INTEGER, NOT NULL)
- `kickoff_time` (TEXT, NOT NULL)
- `home_form` (TEXT, NOT NULL): JSON Array string
- `away_form` (TEXT, NOT NULL): JSON Array string
- `sportsmole_prediction` (TEXT, DEFAULT NULL)
- `si_prediction` (TEXT, DEFAULT NULL)
- `gpt55_prediction` (TEXT, DEFAULT NULL)
- `opus_prediction` (TEXT, DEFAULT NULL)
- `fable_prediction` (TEXT, DEFAULT NULL)

## Table: SI_Manual_Inputs
Remains as the secure local bypass for manual morning inputs.
- `match_title` (TEXT, PRIMARY KEY)
- `si_prediction` (TEXT, NOT NULL)