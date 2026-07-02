# API Contracts Specification (Five-Analyst Update)

## 1. GET /api/global-stats
Fetches computed performance metrics (Spare/Strike) for all 5 active predictive models.

### Response Payload (200 OK)
```json
{
  "smStats": { "spareRate": 64, "strikeRate": 13 },
  "siStats": { "spareRate": 60, "strikeRate": 12 },
  "gpt55Stats": { "spareRate": 0, "strikeRate": 0 },
  "opusStats": { "spareRate": 0, "strikeRate": 0 },
  "fableStats": { "spareRate": 0, "strikeRate": 0 }
}

2. GET /api/get-data
Returns the compiled upcoming match array including the new AI agent predictions.

Response Payload (200 OK)
JSON
[
  {
    "match_title": "Spain vs Austria",
    "home_prob": 72,
    "draw_prob": 19,
    "away_prob": 9,
    "kickoff_time": "2026-07-02T20:00:00Z",
    "home_form": "[...]",
    "away_form": "[...]",
    "sportsmole_prediction": "We say: Spain 2-0 Austria",
    "si_prediction": "Pending",
    "gpt55_prediction": "2-1",
    "opus_prediction": "3-1",
    "fable_prediction": "2-0"
  }
]