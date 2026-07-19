# Portfolio Dashboard

A static, GitHub Pages-hosted dashboard for a real stock portfolio. Prices
refresh automatically on a schedule via a GitHub Action — no server, no
database, no hosting cost.

**How it works**

```
data/holdings.csv   <- you edit this by hand (add/remove/adjust positions)
        │
        ▼
scripts/update_data.py   <- pulls live prices + sector via yfinance,
        │                    computes P&L, sector/factor breakdowns
        ▼
data/live.json            <- the dashboard reads this
data/history.csv/.json    <- one row appended per day, powers the
                              performance chart
        │
        ▼
index.html + app.js + style.css   <- renders it all, no build step
```

A GitHub Actions workflow (`.github/workflows/update.yml`) runs
`update_data.py` on a schedule, then commits the refreshed `data/*.json`
files back to the repo — which triggers GitHub Pages to redeploy with
fresh numbers.

## Setup

1. **Create a new GitHub repo** and push everything in this folder to it.

2. **Enable GitHub Pages**
   Repo → Settings → Pages → Source: "Deploy from a branch" → Branch:
   `main`, folder `/ (root)`. Save. Your site will be live at
   `https://<username>.github.io/<repo-name>/` within a minute or two.

3. **Enable Actions write permissions** (needed so the workflow can commit
   data back)
   Repo → Settings → Actions → General → Workflow permissions →
   "Read and write permissions". Save.

4. **Edit `data/holdings.csv`** with your real positions:

   ```csv
   Ticker,Shares,EntryPrice,EntryDate,Factor,Notes
   AAPL,10,185.20,2025-11-04,Momentum,
   ```

   `Factor` is a free-text tag — use whatever labels fit your own
   framework (Momentum, GARP, PEAD, Mean Reversion, Quant Factor, etc.);
   it's just grouped and charted as-is.

5. **Trigger the first update manually** so the site has data on day one
   Repo → Actions tab → "Update Portfolio Data" → Run workflow. After it
   finishes, refresh your Pages URL.

From then on it updates itself on the schedule set in
`.github/workflows/update.yml` (default: weekdays, ~5 min after US market
close). Edit the cron line to run more or less often.

## Running locally

```bash
pip install -r requirements.txt
python scripts/update_data.py       # writes data/live.json + history

python -m http.server 8080          # then open http://localhost:8080
```

## Notes

- yfinance is unofficial/free and can occasionally rate-limit or change —
  the updater logs a warning and skips a ticker gracefully rather than
  failing the whole run if one fetch fails.
- Sector is pulled live from Yahoo's `info` endpoint per ticker; if it's
  missing for a given stock, that position is grouped under "Unknown" in
  the sector chart rather than breaking the page.
- This is a public dashboard by design (per your setup) — don't put
  account numbers, balances beyond what you're comfortable sharing, or
  any other sensitive info in `holdings.csv`/`Notes`.
