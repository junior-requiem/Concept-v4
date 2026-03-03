# Public Sector Oracle Fusion Lead Funnel

A lightweight lead generation platform that ingests opportunities from multiple lead sources (including GovWin), automatically stack-ranks each lead from **1 (Not likely)** to **5 (Strong lead)** based on configurable criteria, and visualizes the funnel by rank.

## Features

- REST API intake for one or many leads in a single POST.
- Source-aware ranking (GovWin boost is built in by default).
- Configurable ranking criteria via API and UI.
- Funnel view to quickly inspect rank distribution and drill into each level.
- Detailed per-lead scoring notes that explain why a lead got its rank.

## Run

```bash
npm start
```

Open: `http://localhost:3000`

## API

### Add leads

```bash
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d '[
    {
      "source":"GovWin",
      "title":"Oracle Fusion ERP Support",
      "agency":"Department of Defense",
      "state":"VA",
      "contractValue":900000,
      "description":"Oracle Fusion financials and HR rollout"
    }
  ]'
```

### List leads

```bash
curl http://localhost:3000/api/leads
curl http://localhost:3000/api/leads?rank=5
```

### View funnel summary

```bash
curl http://localhost:3000/api/funnel
```

### Update ranking criteria

```bash
curl -X PUT http://localhost:3000/api/criteria \
  -H "Content-Type: application/json" \
  -d '{
    "targetStates":["VA","MD","DC"],
    "minContractValue":400000,
    "oracleFusionKeywords":["oracle fusion","erp modernization"],
    "targetAgencies":["Department of Defense","HHS"]
  }'
```
