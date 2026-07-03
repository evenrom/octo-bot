# API Contracts Specification (Hotfix v1.1)

## 1. GET /api/global-stats
Fetches computed performance metrics (Spare/Strike) for all 5 active predictive models. Skips NULL/Missing values cleanly.

### Response Payload (200 OK)
```json
{
  "smStats": { "spareRate": 64, "strikeRate": 13 },
  "siStats": { "spareRate": 60, "strikeRate": 12 },
  "gpt55Stats": { "spareRate": 61, "strikeRate": 9 },
  "opusStats": { "spareRate": 63, "strikeRate": 14 },
  "fableStats": { "spareRate": 62, "strikeRate": 12 }
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
    "sportsmole_prediction": "Spain 2-0 Austria",
    "si_prediction": "Spain 2-0 Austria",
    "gpt55_prediction": "2-1",
    "opus_prediction": "3-1",
    "fable_prediction": "2-0"
  }
]
3. POST /api/sync
Executes full logic processing, regex team name resolution (supporting multi-word names), validation against multi-match Sports Mole previews, and writes clean data states to Turso.

Response Payload (200 OK)
JSON
{
  "success": true,
  "message": "Synced 5 analysts successfully with multi-word and compiled page protections."
}