#!/usr/bin/env python3
"""
Portfolio Dashboard - Data Updater
===================================
Reads data/holdings.csv, pulls live prices + sector info via yfinance,
computes position-level and portfolio-level P&L, writes data/live.json
for the dashboard to render, and appends a snapshot to data/history.csv
(+ a matching data/history.json for the frontend) for the performance
chart.

Run manually:
    python scripts/update_data.py

Normally run on a schedule by .github/workflows/update.yml, which commits
the refreshed data files back to the repo so GitHub Pages picks them up.
"""
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
HOLDINGS_CSV = ROOT / "data" / "holdings.csv"
HISTORY_CSV = ROOT / "data" / "history.csv"
HISTORY_JSON = ROOT / "data" / "history.json"
LIVE_JSON = ROOT / "data" / "live.json"

HISTORY_FIELDS = ["Date", "TotalValue", "TotalCost", "TotalPL", "TotalPLPct"]


def load_holdings():
    if not HOLDINGS_CSV.exists():
        print(f"[fatal] {HOLDINGS_CSV} not found.", file=sys.stderr)
        sys.exit(1)
    rows = []
    with open(HOLDINGS_CSV, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ticker = (row.get("Ticker") or "").strip().upper()
            if not ticker:
                continue
            rows.append({
                "ticker": ticker,
                "shares": float(row["Shares"]),
                "entry_price": float(row["EntryPrice"]),
                "entry_date": (row.get("EntryDate") or "").strip(),
                "factor": (row.get("Factor") or "").strip() or "Unclassified",
                "notes": (row.get("Notes") or "").strip(),
            })
    return rows


def fetch_ticker_data(ticker: str):
    """Returns (current_price, sector). Falls back gracefully on failure
    so one bad ticker doesn't take down the whole update."""
    try:
        t = yf.Ticker(ticker)
        hist = t.history(period="5d")
        price = float(hist["Close"].iloc[-1]) if not hist.empty else None
        sector = None
        try:
            info = t.info
            sector = info.get("sector")
        except Exception:
            pass
        return price, (sector or "Unknown")
    except Exception as exc:
        print(f"  [warn] {ticker}: fetch failed ({exc})", file=sys.stderr)
        return None, "Unknown"


def build_snapshot(holdings):
    enriched = []
    total_value = 0.0
    total_cost = 0.0

    for h in holdings:
        print(f"  fetching {h['ticker']} ...")
        price, sector = fetch_ticker_data(h["ticker"])
        cost_basis = h["shares"] * h["entry_price"]

        if price is None:
            market_value = None
            pl = None
            pl_pct = None
        else:
            market_value = h["shares"] * price
            pl = market_value - cost_basis
            pl_pct = (pl / cost_basis * 100) if cost_basis else None
            total_value += market_value
            total_cost += cost_basis

        enriched.append({
            **h,
            "current_price": round(price, 2) if price is not None else None,
            "sector": sector,
            "cost_basis": round(cost_basis, 2),
            "market_value": round(market_value, 2) if market_value is not None else None,
            "pl": round(pl, 2) if pl is not None else None,
            "pl_pct": round(pl_pct, 2) if pl_pct is not None else None,
        })

    for h in enriched:
        h["weight_pct"] = (
            round(h["market_value"] / total_value * 100, 2)
            if (h.get("market_value") and total_value) else None
        )

    total_pl = total_value - total_cost
    total_pl_pct = (total_pl / total_cost * 100) if total_cost else None

    def breakdown_by(key):
        buckets = {}
        for h in enriched:
            if h.get("market_value") is None:
                continue
            k = h.get(key) or "Unknown"
            buckets[k] = buckets.get(k, 0.0) + h["market_value"]
        return [
            {"label": k, "value": round(v, 2),
             "pct": round(v / total_value * 100, 2) if total_value else 0}
            for k, v in sorted(buckets.items(), key=lambda kv: -kv[1])
        ]

    summary = {
        "total_value": round(total_value, 2),
        "total_cost": round(total_cost, 2),
        "total_pl": round(total_pl, 2),
        "total_pl_pct": round(total_pl_pct, 2) if total_pl_pct is not None else None,
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

    return summary, enriched, breakdown_by("sector"), breakdown_by("factor")


def append_history(summary):
    """Adds (or replaces, if already run today) today's snapshot in both
    history.csv (durable/human-readable) and history.json (frontend-friendly)."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = []
    if HISTORY_CSV.exists():
        with open(HISTORY_CSV, newline="") as f:
            rows = list(csv.DictReader(f))
    rows = [r for r in rows if r["Date"] != today]
    rows.append({
        "Date": today,
        "TotalValue": summary["total_value"],
        "TotalCost": summary["total_cost"],
        "TotalPL": summary["total_pl"],
        "TotalPLPct": summary["total_pl_pct"],
    })
    rows.sort(key=lambda r: r["Date"])

    with open(HISTORY_CSV, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=HISTORY_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    with open(HISTORY_JSON, "w") as f:
        json.dump(rows, f, indent=2)


def main():
    holdings = load_holdings()
    print(f"Loaded {len(holdings)} holdings from {HOLDINGS_CSV}")

    summary, enriched, sector_breakdown, factor_breakdown = build_snapshot(holdings)

    LIVE_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(LIVE_JSON, "w") as f:
        json.dump({
            "summary": summary,
            "holdings": enriched,
            "sector_breakdown": sector_breakdown,
            "factor_breakdown": factor_breakdown,
        }, f, indent=2)
    print(f"Wrote {LIVE_JSON}")

    append_history(summary)
    print(f"Appended snapshot to {HISTORY_CSV} and {HISTORY_JSON}")

    pl_pct_str = f"{summary['total_pl_pct']}%" if summary["total_pl_pct"] is not None else "n/a"
    print(f"\nTotal value: ${summary['total_value']:,.2f}  "
          f"P&L: ${summary['total_pl']:,.2f} ({pl_pct_str})")


if __name__ == "__main__":
    main()
