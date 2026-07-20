# Track Record Dashboard

A static, GitHub Pages dashboard showing closed trades, an equity curve,
sector/theme distribution, and research notes — no server, no database.

## What changed from the earlier "open positions" version

This is a restructure: instead of tracking live open positions, it tracks
your **closed trade history** — a track record rather than a live book.
Because entry/close prices are fixed once a trade is closed, there's no
need for live price fetching or a scheduled Action anymore — it only
rebuilds when you actually push a new trade or note.

## How it works

```
data/closed_positions.csv   <- you edit this: Ticker, Shares, EntryDate,
                                EntryPrice, CloseDate, ClosePrice, Theme
notes/*.md                  <- you write these: one markdown file per
                                research note (see notes/2026-03-10-nvda.md
                                for the format)
        │
        ▼
scripts/update_data.py      <- looks up Sector live (Yahoo Finance),
                                computes P&L/holding days, builds the
                                equity curve, parses + sorts notes
        │
        ▼
data/live.json               <- the dashboard reads this
        │
        ▼
index.html + app.js + style.css   <- renders everything, no build step
```

A GitHub Actions workflow (`.github/workflows/update.yml`) runs the
builder automatically whenever you push a change to
`data/closed_positions.csv` or `notes/`, then commits the refreshed
`data/live.json` back — which triggers Pages to redeploy.

## Adding a closed trade

Add a row to `data/closed_positions.csv`:

```csv
Ticker,Shares,EntryDate,EntryPrice,CloseDate,ClosePrice,Theme
AAPL,10,2025-11-04,185.20,2026-01-15,204.10,Momentum
```

You fill in: `Ticker`, `Shares`, `EntryDate`, `EntryPrice`, `CloseDate`,
`ClosePrice`, `Theme`. Everything else — Sector, Status, P&L $/%, holding
days, its place on the equity curve — is computed automatically.

**Why Theme isn't auto-generated**: Sector comes from Yahoo Finance, a
real data source. Theme is your own investment thesis/classification
("Momentum," "GARP," "AI Infrastructure," etc.) — there's no API that can
infer *why* you took a trade, so that one stays manual.

## Adding a research note

Create a new file in `notes/`, named however you like (e.g.
`2026-07-20-msft-thesis.md`), with this format:

```markdown
---
ticker: MSFT
date: 2026-07-20
title: Why I'm closing MSFT here
---

Your note content in **markdown** — bold, links, lists, paragraphs
all work.
```

Notes are sorted most-recent-first automatically based on the `date`
field. A leading underscore in the filename (e.g. `_template.md`) makes
the builder skip that file, if you want to keep a template around.

## Setup (same as before)

1. Push this folder to a new GitHub repo (public).
2. Settings → Pages → Deploy from branch `main`, folder `/ (root)`.
3. Settings → Actions → General → Workflow permissions → "Read and write
   permissions."
4. Edit `data/closed_positions.csv` and/or add a note, commit, push — the
   Action runs automatically and the site updates within a minute or two.
   (Or trigger it manually: Actions tab → "Rebuild Dashboard Data" → Run
   workflow.)

## Running locally

```bash
pip install -r requirements.txt
python scripts/update_data.py
python -m http.server 8080     # then open http://localhost:8080
```

## Notes

- The equity curve **compounds** each trade's return (as if fully
  reinvested each time) rather than summing P&L% additively. If you'd
  rather see simple additive cumulative P&L%, that's a one-line change
  in `build_equity_curve()` in `scripts/update_data.py`.
- "Portfolio distribution" (the two pie charts) is based on **capital
  deployed** (cost basis) per sector/theme across your closed trades —
  since nothing is currently open, this reflects historical allocation,
  not a live position.
- This is public by design — don't put account balances or anything
  sensitive in `Notes`/note files beyond what you're comfortable sharing.
