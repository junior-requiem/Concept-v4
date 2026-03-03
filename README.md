# Public Sector Oracle Fusion Lead Funnel

A lightweight lead generation platform that ingests opportunities from multiple lead sources (including GovWin), automatically stack-ranks each lead from **1 (Not likely)** to **5 (Strong lead)** based on configurable criteria, and visualizes the funnel by rank.

## Features

- REST API intake for one or many leads in a single POST.
- Source-aware ranking (GovWin boost is built in by default).
- Configurable ranking criteria via API and UI.
- Sleek, Apple-inspired funnel dashboard using a blue palette anchored on `#1169be`, `#2099f1`, and `#18b4ff`.
- Funnel view to quickly inspect rank distribution and drill into each level.
- Detailed per-lead scoring notes that explain why a lead got its rank.


## Company-fit scoring method

Leads are scored with a weighted fit model (0-100) across these technical dimensions:

- Contract value fit (minimum + ideal contract value alignment)
- Geography fit (target state match)
- Agency fit (target agency match)
- Oracle intent fit (keyword intent signal in title/description)
- Source quality fit (normalized source boost)
- Timing fit (due date urgency inside configurable window)

Each lead returns:

- `score` and `rank` (1-5)
- `confidence` and `confidenceScore` based on completeness + signal strength
- `fitBreakdown` percentages by scoring dimension
- explainable `notes`

Optional policy: `mustHaveOracleFusionSignal` can cap non-Oracle-intent opportunities to lower ranks.

## Run

```bash
npm start
```

Open: `http://localhost:3000`

## GitHub Pages deployment (main branch)

This repository supports deploying directly from the `main` branch with GitHub Pages.

1. Go to **Settings → Pages**.
2. Set **Source** to **Deploy from a branch**.
3. Choose **Branch: `main`** and **Folder: `/(root)`**.
4. Save, then open your site at:
   - `https://<username>.github.io/<repo>/`

An `index.html` redirect is provided at the repo root so the site entry URL forwards to `public/` automatically.

### Important behavior on GitHub Pages

GitHub Pages only serves static files, so the Node API (`/api/*`) is not available there.
The front-end automatically falls back to a client-side demo data mode when API requests fail,
so the funnel UI remains usable when hosted on Pages.

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
